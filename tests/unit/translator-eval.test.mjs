import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateTurn } from '../../js/translator.js';
import { runCase, runEval } from '../../js/eval-runner.js';
import { CASES } from '../../evals/cases.js';

/** A fake `sample` that answers from a lookup keyed by the message text, and records prompts. */
function fakeModel(answers, { failFirst } = {}) {
  const prompts = [];
  let calls = 0;
  const sample = async (prompt, options = {}) => {
    calls++;
    prompts.push(prompt);
    if (failFirst && calls <= failFirst.times) throw { code: failFirst.code };
    const key = Object.keys(answers).find((k) => prompt.includes(k));
    const text = typeof answers[key] === 'string' ? answers[key] : JSON.stringify(answers[key] ?? {});
    for (const end of [Math.ceil(text.length / 2), text.length - 2])
      options.onText?.({ text: text.slice(0, end) });
    return { text, modelApplied: 'fake-model' };
  };
  return { sample, prompts };
}

test('translateTurn: Korean in, English out, register recorded and streamed', async () => {
  const { sample } = fakeModel({
    '"""야, 오랜만이야!"""': { target: 'en', register: 'informal', translation: 'Hey, long time no see!' },
  });
  const partials = [];
  const { entry, heard, turn } = await translateTurn({
    ask: sample,
    pair: 'koen',
    side: 'A',
    message: '야, 오랜만이야!',
    tone: 'auto',
    lastHeard: null,
    onPartial: (side, text) => partials.push([side, text]),
  });
  assert.equal(entry.translation, 'Hey, long time no see!');
  assert.equal(heard, 'informal');
  assert.deepEqual([turn.sourceSide, turn.targetSide], ['A', 'B']);
  assert.equal(entry.formality, '반말 heard');
  assert.ok(partials.length > 0 && partials.every(([side]) => side === 'B'));
});

test('translateTurn: the reply level follows what was heard, and the note checks the output', async () => {
  const { sample, prompts } = fakeModel({
    '"""Thanks!"""': { target: 'ko', translation: '감사합니다!' },
  });
  const { entry } = await translateTurn({
    ask: sample,
    pair: 'koen',
    side: 'B',
    message: 'Thanks!',
    tone: 'auto',
    lastHeard: 'informal',
  });
  assert.match(prompts[0], /반말 in 해체/);
  assert.equal(entry.formality, 'asked for 반말, reply used 존댓말');
});

test('translateTurn: a model label that contradicts clear endings is overruled', async () => {
  const { sample } = fakeModel({
    '"""밥 먹었어?"""': { target: 'en', register: 'formal', translation: 'Did you eat?' },
  });
  const { heard } = await translateTurn({
    ask: sample,
    pair: 'koen',
    side: 'A',
    message: '밥 먹었어?',
    tone: 'auto',
    lastHeard: null,
  });
  assert.equal(heard, 'informal');
});

test('translateTurn: rate limits reach the caller', async () => {
  const sample = async () => {
    throw { code: 'rate_limited' };
  };
  await assert.rejects(
    translateTurn({ ask: sample, pair: 'koen', side: 'A', message: '안녕', tone: 'auto', lastHeard: null }),
    (e) => e.code === 'rate_limited',
  );
});

test('runCase: mirror cases translate, then ask the judge', async () => {
  const testCase = CASES.find((c) => c.kind === 'mirror' && c.expect === 'tú');
  const { sample, prompts } = fakeModel({
    [`"""${testCase.text}"""`]: { target: 'es', register: 'informal', translation: '¿De dónde eres?' },
    'grading a Spanish sentence': 'tu',
  });
  const result = await runCase(sample, testCase, { wait: async () => {} });
  assert.equal(prompts.length, 2);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.models, ['fake-model', 'fake-model']);
});

test('runCase: backs off on rate limits, then reports an error instead of a failure', async () => {
  const testCase = CASES.find((c) => c.kind === 'detect');
  const waits = [];
  const flaky = fakeModel(
    { [`"""${testCase.text}"""`]: { target: 'en', register: testCase.expect, translation: 'x' } },
    { failFirst: { times: 2, code: 'rate_limited' } },
  );
  const recovered = await runCase(flaky.sample, testCase, { wait: async (ms) => waits.push(ms) });
  assert.equal(recovered.status, 'pass');
  assert.equal(waits.length, 2);

  const down = async () => {
    throw { code: 'rate_limited' };
  };
  const failed = await runCase(down, testCase, { wait: async () => {} });
  assert.equal(failed.status, 'error');
});

test('runEval: the baseline arm runs only the formality-dependent kinds, with repeats', async () => {
  const cases = [CASES.find((c) => c.kind === 'detect'), CASES.find((c) => c.kind === 'reply')];
  const { sample, prompts } = fakeModel({
    '"""': { target: 'ko', register: 'formal', translation: '네, 감사합니다.' },
  });
  const report = await runEval({ sample, cases, repeats: 2, ablation: true, wait: async () => {} });
  // detect ×2 + reply (full) ×2 + reply (baseline) ×2
  assert.equal(report.rows.length, 6);
  assert.deepEqual(Object.keys(report.byVariant).sort(), ['full', 'no-formality']);
  const baselinePrompts = prompts.filter((p) => !p.includes('Formality rules'));
  assert.equal(baselinePrompts.length, 2);
  assert.equal(report.meta.repeats, 2);
  assert.deepEqual(report.meta.modelsReported, ['fake-model']);
});
