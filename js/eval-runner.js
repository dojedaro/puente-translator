// Formality eval runner, independent of the DOM so it can be tested with a fake model.

import { ABLATION_KINDS, CASES } from '../evals/cases.js';
import { langOf, otherSide } from './config.js';
import { PROMPT_VERSION, buildPrompt, parseReply } from './prompt.js';
import { buildJudgePrompt, gradeCase, summarize } from './grader.js';
import { MODEL_TIER } from './translator.js';

export const JUDGE_TIER = 'default'; // a stronger tier than the one being graded
const RATE_LIMIT_BACKOFF_MS = [5000, 15000];

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Call the model, backing off on rate limits. Other errors propagate. */
async function ask(sample, prompt, modelTier, wait) {
  for (let attempt = 0; ; attempt++) {
    try {
      const reply = await sample(prompt, { modelTier, cache: false });
      return { text: reply.text, model: reply.modelApplied ?? null };
    } catch (error) {
      if (error?.code !== 'rate_limited' || attempt >= RATE_LIMIT_BACKOFF_MS.length) throw error;
      await wait(RATE_LIMIT_BACKOFF_MS[attempt]);
    }
  }
}

/**
 * Run one case once.
 * @param {Function} sample  the `sample` capability (or a fake)
 * @param {object} testCase  from evals/cases.js
 * @param {{variant?: 'full'|'no-formality', wait?: Function}} [options]
 */
export async function runCase(sample, testCase, { variant = 'full', wait = defaultWait } = {}) {
  const started = Date.now();
  const result = { models: [] };
  try {
    if (testCase.kind === 'judge') {
      const judged = await ask(sample, buildJudgePrompt(testCase.text), JUDGE_TIER, wait);
      result.judge = judged.text;
      result.models.push(judged.model);
    } else {
      const prompt = buildPrompt({
        from: langOf(testCase.pair, testCase.side),
        to: langOf(testCase.pair, otherSide(testCase.side)),
        koreanReply: testCase.kind === 'reply' ? testCase.expect : 'formal',
        message: testCase.text,
        variant,
      });
      const reply = await ask(sample, prompt, MODEL_TIER, wait);
      result.models.push(reply.model);
      const parsed = parseReply(reply.text);
      Object.assign(result, {
        register: parsed.register,
        translation: parsed.translation,
        recovered: parsed.recovered,
      });
      if (testCase.kind === 'mirror') {
        const judged = await ask(sample, buildJudgePrompt(parsed.translation), JUDGE_TIER, wait);
        result.judge = judged.text;
        result.models.push(judged.model);
      }
    }
  } catch (error) {
    result.error = error?.code || error?.message || 'failed';
  }
  result.ms = Date.now() - started;
  return { ...result, ...gradeCase(testCase, result) };
}

/**
 * Run the whole set.
 * @param {{sample: Function, repeats?: number, ablation?: boolean, cases?: object[],
 *          onResult?: (row: object) => void, isStopped?: () => boolean, wait?: Function}} options
 */
export async function runEval({
  sample,
  repeats = 1,
  ablation = false,
  cases = CASES,
  onResult,
  isStopped = () => false,
  wait,
}) {
  const plan = [];
  for (const testCase of cases) {
    plan.push({ testCase, variant: 'full' });
    if (ablation && ABLATION_KINDS.includes(testCase.kind)) plan.push({ testCase, variant: 'no-formality' });
  }

  const rows = [];
  for (const { testCase, variant } of plan) {
    for (let run = 1; run <= repeats; run++) {
      if (isStopped()) return report(rows, { repeats, ablation, stopped: true });
      const outcome = await runCase(sample, testCase, { variant, wait });
      const row = { ...testCase, variant, run, ...outcome };
      rows.push(row);
      onResult?.(row);
    }
  }
  return report(rows, { repeats, ablation, stopped: false });
}

/** Summary per prompt variant, plus cases whose result changed between repeats. */
export function report(rows, { repeats, ablation, stopped }) {
  const byVariant = {};
  for (const variant of new Set(rows.map((r) => r.variant))) {
    byVariant[variant] = summarize(rows.filter((r) => r.variant === variant));
  }
  const outcomes = new Map();
  for (const r of rows) {
    if (r.status === 'error') continue;
    const key = `${r.id}/${r.variant}`;
    outcomes.set(key, (outcomes.get(key) ?? new Set()).add(r.status));
  }
  const flaky = [...outcomes].filter(([, statuses]) => statuses.size > 1).map(([key]) => key);
  const models = [...new Set(rows.flatMap((r) => r.models ?? []).filter(Boolean))];
  return {
    meta: {
      ranAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      translateTier: MODEL_TIER,
      judgeTier: JUDGE_TIER,
      modelsReported: models,
      repeats,
      ablation,
      stopped,
    },
    byVariant,
    flaky,
    rows,
  };
}
