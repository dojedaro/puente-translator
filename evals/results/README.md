# Eval results

Each file is the JSON exported by the eval panel (`index.html#eval`, inside claude.ai): run metadata (prompt version, model tiers, repeats), a summary per prompt variant, and every row with the model's output and its grade.

Grades inside a file are the ones recorded at run time. To score a file with the current grader, without calling the model again:

```bash
node scripts/regrade.mjs evals/results/2026-11-27.json
```

| File                      | Prompt version | Notes                                                                                                                                                                              |
| ------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-11-27.json`         | 2026-11-27.2   | First run. k = 1, with the baseline arm. One reply was mis-graded at run time (-자 flagged as written style); after the grader fix: app 60/60, baseline replies 11/14.             |
| `2026-11-27.regraded.txt` | 2026-11-27.2   | Output of `regrade.mjs` on `2026-11-27.json`: scores as run and with the current grader, side by side. The quoted 14/14 and 7/7 (app) and 11/14 and 4/7 (baseline) come from here. |
