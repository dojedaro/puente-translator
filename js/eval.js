// Formality eval panel. Opens at index.html#eval inside claude.ai, where it calls Claude through
// the artifact `sample` capability, on the viewer's own Claude plan.

import { ABLATION_KINDS, CASES } from '../evals/cases.js';
import { escapeHtml } from './html.js';
import { runEval } from './eval-runner.js';

const KIND_LABEL = {
  detect: 'Hears 존댓말 vs 반말',
  reply: 'Replies in the right Korean level',
  mirror: 'Picks usted vs tú',
  judge: 'Spanish judge vs hand labels',
  inject: 'Translates instructions instead of obeying',
};

function countRequests(repeats, ablation) {
  const one = (c) => (c.kind === 'mirror' ? 2 : 1);
  const base = CASES.reduce((n, c) => n + one(c), 0);
  const extra = ablation
    ? CASES.filter((c) => ABLATION_KINDS.includes(c.kind)).reduce((n, c) => n + one(c), 0)
    : 0;
  return (base + extra) * repeats;
}

function summaryTable(report) {
  const variants = Object.keys(report.byVariant);
  const kinds = Object.keys(KIND_LABEL).filter((k) => report.byVariant.full?.byKind[k]);
  const cell = (s) =>
    s ? `${s.passed}/${s.passed + s.failed}${s.errors ? ` <small>(${s.errors} errors)</small>` : ''}` : '–';
  return `<table class="eval-table">
    <thead><tr><th>What is measured</th>${variants.map((v) => `<th>${v === 'full' ? 'App prompt' : 'Without formality rules'}</th>`).join('')}</tr></thead>
    <tbody>${kinds
      .map(
        (k) =>
          `<tr><td>${KIND_LABEL[k]}</td>${variants.map((v) => `<td>${cell(report.byVariant[v].byKind[k])}</td>`).join('')}</tr>`,
      )
      .join('')}</tbody></table>
    ${report.flaky.length ? `<p class="note">Changed between repeats: ${escapeHtml(report.flaky.join(', '))}</p>` : ''}`;
}

/** Mount the eval panel into `root`. */
export function mountEval(root, getSample) {
  root.innerHTML = `
    <div class="lh">
      <div>
        <h2>Formality eval</h2>
        <p class="note">${CASES.length} hand-written cases. Runs on your Claude plan.</p>
      </div>
    </div>
    <p class="eval-limits">
      Small and single-author: ${Object.keys(KIND_LABEL)
        .map((k) => `${CASES.filter((c) => c.kind === k).length} ${k}`)
        .join(', ')} cases.
      Korean is graded by a rule on sentence endings (a heuristic); Spanish tú/usted is graded by Claude itself,
      so the judge is checked against hand labels first. Treat the numbers as a regression check, not a benchmark.
    </p>
    <div class="eval-controls">
      <label><input type="checkbox" id="eval-ablation" checked> Also run without the formality rules (baseline)</label>
      <label>Repeats <select id="eval-repeats"><option selected>1</option><option>3</option></select></label>
      <span id="eval-cost" class="note"></span>
    </div>
    <div class="lh-actions">
      <button type="button" class="chip" id="eval-run">Run eval</button>
      <button type="button" class="chip" id="eval-copy" disabled>Copy results (JSON)</button>
    </div>
    <p class="eval-summary" id="eval-status" role="status" aria-live="polite"></p>
    <div id="eval-summary"></div>
    <details><summary>Every run</summary><div class="scroll"><table class="eval-table">
      <thead><tr><th>Case</th><th>Prompt</th><th>Input</th><th>Output</th><th>Expected</th><th>Got</th></tr></thead>
      <tbody id="eval-rows"></tbody></table></div></details>`;

  const $ = (sel) => root.querySelector(sel);
  const settings = () => ({
    repeats: Number($('#eval-repeats').value),
    ablation: $('#eval-ablation').checked,
  });
  const showCost = () => {
    const { repeats, ablation } = settings();
    $('#eval-cost').textContent = `about ${countRequests(repeats, ablation)} short requests`;
  };
  $('#eval-repeats').addEventListener('change', showCost);
  $('#eval-ablation').addEventListener('change', showCost);
  showCost();

  let lastReport = null;
  let running = false;

  $('#eval-run').addEventListener('click', async () => {
    if (running) {
      running = false;
      return;
    }
    const sample = getSample();
    if (!sample) {
      $('#eval-status').textContent = 'The eval needs Claude: open this page on claude.ai.';
      return;
    }
    running = true;
    $('#eval-run').textContent = 'Stop';
    $('#eval-rows').innerHTML = '';
    const { repeats, ablation } = settings();
    const total = countRequests(repeats, ablation);
    let done = 0;
    try {
      lastReport = await runEval({
        sample,
        repeats,
        ablation,
        isStopped: () => !running,
        onResult(row) {
          done += row.kind === 'mirror' ? 2 : 1;
          $('#eval-status').textContent = `Running… ${done} of ${total} requests`;
          $('#eval-rows').insertAdjacentHTML(
            'beforeend',
            `<tr class="${row.status}"><td>${escapeHtml(row.id)} #${row.run}</td><td>${row.variant === 'full' ? 'app' : 'baseline'}</td>
             <td>${escapeHtml(row.text)}</td><td>${escapeHtml(row.translation ?? row.judge ?? '')}</td>
             <td>${escapeHtml(row.expect)}</td><td>${row.status === 'pass' ? '✓' : row.status === 'fail' ? '✗' : '!'} ${escapeHtml(row.actual)}</td></tr>`,
          );
        },
      });
      $('#eval-summary').innerHTML = summaryTable(lastReport);
      $('#eval-status').textContent = lastReport.meta.stopped ? 'Stopped early. Partial results:' : 'Done.';
      $('#eval-copy').disabled = false;
    } catch (error) {
      $('#eval-status').textContent = `The eval stopped: ${error?.message ?? error}`;
    } finally {
      running = false;
      $('#eval-run').textContent = 'Run eval';
    }
  });

  $('#eval-copy').addEventListener('click', () => {
    const json = JSON.stringify(lastReport, null, 2);
    if (!navigator.clipboard) {
      $('#eval-status').textContent = 'Copy is not available here.';
      return;
    }
    navigator.clipboard.writeText(json).then(
      () => ($('#eval-status').textContent = 'Results copied. Paste them into evals/results/.'),
      () => ($('#eval-status').textContent = 'Copy was blocked.'),
    );
  });
}
