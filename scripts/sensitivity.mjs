// Deterministic rank-sensitivity report for the radar model (audit v2.5 P1-02).
//
// Diagnostic only: it builds variant boards from neutralized copies of the
// model constants and never changes a constant, the submitted board, or any
// stored row. The sealed snapshot is read, never written or committed.
//
// Usage: node scripts/sensitivity.mjs [snapshot.json]
//   (default: $MAKEFUN_SNAPSHOT, else the kit's input/snapshot.json)
//   --json prints the raw report object instead of the human-readable summary.
import { existsSync, readFileSync } from 'node:fs';
import { parseSnapshot, sensitivityAnalysis } from '../lib/model.ts';

const SNAPSHOT =
  process.argv.find((a) => !a.startsWith('-') && a.endsWith('.json')) ??
  process.env.MAKEFUN_SNAPSHOT ??
  '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
const asJson = process.argv.includes('--json');

if (!existsSync(SNAPSHOT)) {
  process.stderr.write(`sensitivity: no snapshot at ${SNAPSHOT}: pass snapshot.json or set MAKEFUN_SNAPSHOT\n`);
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const report = sensitivityAnalysis(snapshot);

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const lines = [
  `sensitivity: baseline model ${report.baselineModel}, ${report.rows} rows`,
  'sensitivity: growth and maturity multipliers neutralized to 1.0, one at a time and together; the submitted model is unchanged',
];
for (const v of report.variants) {
  lines.push('');
  lines.push(`sensitivity: ${v.variant} — ${v.moved}/${v.rows} rows moved, median |Δrank| ${v.medianAbsRankChange}, p90 ${v.p90AbsRankChange}, max ${v.maxAbsRankChange}`);
  for (const t of v.topN) {
    lines.push(
      `sensitivity:   top-${t.n}: ${t.changed} changed` +
        (t.entered.length > 0 ? `, entered: ${t.entered.join(', ')}` : '') +
        (t.left.length > 0 ? `, left: ${t.left.join(', ')}` : ''),
    );
  }
}
process.stdout.write(`${lines.join('\n')}\n`);
