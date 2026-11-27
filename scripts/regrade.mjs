// Re-grade a saved eval run with the current grader, without calling the model again.
//   node scripts/regrade.mjs evals/results/2026-11-27.json
// Prints, per prompt variant and case kind, the score recorded at run time and the score now.
// Use it when the grader changes, and say so wherever the numbers are quoted.

import { readFile } from 'node:fs/promises';
import { gradeCase, summarize } from '../js/grader.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/regrade.mjs <results.json>');
  process.exit(1);
}
const run = JSON.parse(await readFile(file, 'utf8'));
const regraded = run.rows.map((row) => ({ ...row, ...gradeCase(row, row) }));

const score = (s) =>
  s ? `${s.passed}/${s.passed + s.failed}${s.errors ? ` (+${s.errors} errors)` : ''}` : '–';
const casual = (rows) => summarize(rows.filter((r) => r.kind === 'reply' && r.expect === 'informal'));

console.log(`Run ${run.meta.ranAt}, prompt ${run.meta.promptVersion}, repeats ${run.meta.repeats}`);
for (const variant of Object.keys(run.byVariant)) {
  const before = summarize(run.rows.filter((r) => r.variant === variant));
  const now = summarize(regraded.filter((r) => r.variant === variant));
  console.log(`\n${variant}`);
  for (const kind of Object.keys(now.byKind)) {
    console.log(
      `  ${kind.padEnd(7)} as run ${score(before.byKind[kind]).padEnd(8)} regraded ${score(now.byKind[kind])}`,
    );
  }
  console.log(
    `  reply, 반말 only: as run ${score(casual(run.rows.filter((r) => r.variant === variant)))}, regraded ${score(casual(regraded.filter((r) => r.variant === variant)))}`,
  );
}
for (const r of regraded.filter((r) => r.status !== 'pass')) {
  console.log(`still failing: ${r.id} [${r.variant}] ${r.translation ?? r.judge} -> ${r.actual}`);
}
