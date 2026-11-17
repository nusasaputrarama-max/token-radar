# Rank-sensitivity report — Token Radar (audit v2.5 P1-02)

**Date:** 2026-11-17
**Baseline model:** radar-5 (valuation arithmetic identical to radar-4; see `lib/model.ts`)
**Snapshot:** the sealed competition snapshot, SHA-256
`42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`
(758 protocols, 40 watchlist, floor $50M, as of 2026-11-14)
**Command:** `node scripts/sensitivity.mjs <snapshot.json>`
**Code:** `sensitivityAnalysis()` in `lib/model.ts`; fixture tests in
`tests/model.test.mjs` ("sensitivity: ...").

## What this is

A diagnostic only. The baseline ranking is rebuilt three times with the same
snapshot and neutralized copies of the model constants: (a) the growth
multiplier pinned to 1.0, (b) the maturity multiplier pinned to 1.0, and (c)
both pinned to 1.0. No model constant is changed, no board row is rewritten,
and the submitted entry is untouched. The question it answers is how much of
the ranking the 7-day TVL window and the listing-age curve decide.

## Results (226 rows)

| Variant | Rows moved | Median \|Δrank\| | p90 \|Δrank\| | Max \|Δrank\| | Top-10 changed | Top-25 changed | Top-50 changed |
|---|---|---|---|---|---|---|---|
| growth-neutral | 182 | 2 | 8 | 41 | 0 | 0 | 3 |
| maturity-neutral | 203 | 3 | 10 | 20 | 0 | 1 | 2 |
| both-neutral | 187 | 3 | 13 | 39 | 0 | 1 | 3 |

Top-N membership changes:

- **growth-neutral, top-50:** entered `arrakis-modular`, `re7-labs`,
  `scroll-bridge`; left `liminal-basis`, `manta-cedefi`, `shift-defi`.
- **maturity-neutral, top-25:** entered `valos`; left `lofty`.
- **maturity-neutral, top-50:** entered `drakewell`, `scroll-bridge`; left
  `liminal-basis`, `manta-cedefi`.
- **both-neutral, top-25:** entered `valos`; left `lofty`.
- **both-neutral, top-50:** entered `drakewell`, `re7-labs`, `scroll-bridge`;
  left `liminal-basis`, `manta-cedefi`, `shift-defi`.

## Reading

- The head of the board is stable: the **top 10 does not change** under any
  neutralization, and the top 25 changes by at most one row. The growth and
  maturity multipliers do not decide who leads the board.
- The middle of the board moves a lot: 182–203 of 226 rows change rank, with
  a median move of 2–3 places and a maximum of 20–41 places. The ranking is
  therefore sensitive to one 7-day TVL window and to the uncalibrated
  listing-age curve below the top — exactly the audit's concern, now measured
  instead of asserted.
- No recalibration follows from this report. Changing the growth weights or
  the maturity curve would change implied values and break the submitted
  board's identity; that needs Rama's explicit decision, and the audit itself
  forbids changing the submitted model without it.
- The snapshot carries only `change_7d`, so no 30/90-day trend sensitivity can
  be computed from the sealed input.
