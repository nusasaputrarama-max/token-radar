# Muse Remediation Report — Token Radar v2 Audit

**Repository:** `nusasaputrarama-max/token-radar`
**Audited baseline:** `e26f0af50ec6639099a39ec8a0da4d65370bdd75` (v2, model radar-3)
**Audit:** `docs/gpt-review-2026-11-15.md`
**Implementation commit:** `234899af2795823d82c63882a6a3d15a6cb3c4e5` (model radar-4)
**Identity:** author and committer `nusasaputrarama-max <353745658+nusasaputrarama-max@users.noreply.github.com>` (verified with `git log -1 --format='%ae %ce'` before push)
**Date:** 2026-11-15
**Status:** All 5 P1, all 3 P2 and the P3 hygiene items addressed except the two
explicit partials below (P1-2 weights/sensitivity test). Nothing in this commit
changes a board slug, rank or implied value: verified 0 mismatches over 226 rows
against the v2 baseline (see Verification).

## Per-finding status

### P1 — Valuation proxy presented as an implied protocol value without enough qualification — FIXED

- `lib/model.ts:17-20` — header comment: the number is a snapshot-based comparable
  proxy, not a token valuation, not a price, not a prediction that a token will be
  issued. The snapshot carries no FDV, so an FDV/TVL sensitivity cannot be computed
  from these fields and the two measures are never mixed.
- `lib/model.ts:306-345` (`categoryMultiples`) — each multiple now carries its sample
  size (`categoryLiveN`), median (`categoryMedian`), dispersion (`categoryIqr`) and a
  `confidence` flag (`low` when thin or highly dispersed).
- `lib/model.ts:346-390` (`impliedValue`) — returns the disclosure fields on every row
  (`categoryMultiple`, `categoryLiveN`, `categoryIqr`, `categoryMedian`, `confidence`,
  `growthMissing`, `growthPct`, `growthMultiplier`, `maturityMultiplier`,
  `breadthMultiplier`, `age`).
- `dashboard/app.js:302`, `:360-361` — detail dialog shows "Comparable median / IQR"
  and "Comparable confidence" ("low — thin or highly dispersed comparables" or
  "standard"), plus the FDV-unavailable note and the "listing date is not necessarily
  the launch date" note.
- `README.md:29` — same proxy wording, FDV statement, and "a zero market cap counts
  as no market cap (unpriced, not live)".
- Tests: `tests/model.test.mjs:71-88` (shrinkage, thin categories take the global
  median outright, highly dispersed comparables are low confidence).

### P1 — Growth and maturity multipliers are uncalibrated and can dominate the ranking — PARTIAL

Done:

- `lib/model.ts:346-390` — missing 7-day growth is an explicit state (`growthMissing:
  true`, `growthPct: 0`, `growthMult: 1`); it is no longer silently indistinguishable
  from a flat week. The dashboard says so in the detail dialog
  (`dashboard/app.js:369`: "Seven-day growth was not reported for this protocol in
  the snapshot, so the proxy treats it as 0").
- `lib/model.ts:35-38` — age is documented as "time since DefiLlama listing", never
  protocol maturity; the "pent-up launch value" assertion is removed from the model
  comment and the README.
- `dashboard/app.js:302` — "Age is the time since the protocol was first listed on
  DefiLlama; a listing date is not necessarily the launch date."
- Test: `tests/model.test.mjs:123-132` (missing growth is an explicit state).

NOT done, and why:

- The growth weights (`growth_up: 0.5`, `growth_down: 0.7`, clamp −60/+120) and the
  maturity curve (0.70 → 1.00 over 1460 days) are **unchanged**. Changing either
  would change implied values, which the v3 brief forbids: the board must stay
  byte-identical to v2 on slug/rank/implied value. Model constants are asserted
  unchanged by `tests/model.test.mjs:322-328`.
- No 30/90-day trend: the snapshot carries only `change_7d`; no smoothed trend can be
  computed from the sealed input.
- No growth-removal rank-sensitivity test was added. This is the one concrete audit
  request with no corresponding test; it is recorded as a remaining risk below.
- Maturity is not shrunk toward 1.0, for the same hard-constraint reason.

### P1 — Farm entry actions do not cover all of the families that the model claims to support — FIXED

- `lib/model.ts:553` (`familyFor`) is now the single classification source; entry,
  weekly, claim and log actions all route through it.
- `lib/model.ts:528-600` (`actionFor`) is a switch on `familyFor(p)` with explicit
  safe actions for `chain`, `payments`, `indexes`, `cedefi`, `curator`, RWA and
  derivatives/basis-trading subfamilies. RWA labels such as "anchor BTC" /
  "decentralized BTC" are classified by `familyFor`, not by a narrower substring test.
- Where the snapshot cannot establish a valid product/action/asset, the plan says to
  verify first and never invents a deposit (`lib/model.ts:524-527`, `:533`, `:543`,
  `:545`). 24 of 226 rows use a verify-first step in the final build.
- The 18 derivatives/basis-trading rows that deposit USDC do so as **margin** with the
  protocol named, a small size, and a leverage warning — an explicit family action,
  not the v2 generic fallback.
- Test: `tests/model.test.mjs:300-310` (sealed snapshot: no board row reaches the
  generic deposit fallback), `:184-215` (no fixed gas dollar amounts; leveraged and
  speculative actions carry a risk note).
- Verified on the final build: farm-step distinct counts 48 / 226 / 226 / 7 / 226 / 14
  for steps 1–6; every row has exactly 6 steps.

### P1 — Farm-plan costs, gas token, and destination chain are not grounded in the snapshot — FIXED

- `lib/model.ts:477-504` (`gasToken`) — explicit per-chain map with an "unknown —
  verify fee asset" fallback (`null`); an unknown chain is never silently defaulted
  to ETH. Test: `tests/model.test.mjs:168-183`.
- No bridge destination is inferred from array position: the bridge action names the
  protocol and tells the user to verify the supported route on the official app
  before sending (`lib/model.ts:533`).
- No fixed gas dollar amounts anywhere: costs read "network fee, variable — check the
  current fee" (test `tests/model.test.mjs:184-195` asserts no `$`-fixed gas text).
- Capital, collateral, insurance cover, premium and transaction fees are
  distinguished (`lib/model.ts:506-527` `capitalFor`, step text separates "of
  capital" from "network fee, variable").
- Risk notes for derivatives, prediction markets, borrowing, insurance and RWA actions
  (test `tests/model.test.mjs:216-225`).
- Test: `tests/model.test.mjs:312-320` (sealed snapshot: every board row resolves its
  gas or names it unverified).

### P1 — Snapshot and board validation do not enforce the coverage contract — FIXED

- `lib/model.ts:823-884` (`parseSnapshot`) — rejects duplicate protocol slugs,
  duplicate watchlist entries, watchlist slugs missing from the snapshot, invalid or
  future `listed_at` dates, non-finite or non-positive TVL, and normalizes /
  deduplicates chain names. Zero market cap becomes null (unpriced, not live).
- `lib/model.ts:397-410` (`buildBoard`) — every watchlist member is validated to exist,
  be pre-token, be rankable (not a CEX, not a versioned pool) and sit at or above the
  floor before it is ranked.
- `lib/model.ts:885-924` (`boardIssue`) — compares the produced slug set against the
  exact expected set (watchlist ∪ all eligible pre-token rows below the floor),
  rejects duplicates, verifies row count / early count / contiguous ranks /
  non-increasing implied values.
- `lib/model.ts:317` — an explicit `SnapshotError` when no usable live-token
  comparables exist, instead of a generic `median([])` failure.
- Tests: `tests/model.test.mjs:143-166` (duplicate slugs/watchlist, non-positive TVL,
  malformed dates, zero market cap, chain dedup), `:239-286` (ties break on slug,
  exact eligible-set coverage, non-pre-token watchlist row refused), `:287-298`
  (sealed snapshot: 226 rows, exact coverage, exclusion buckets sum).

### P2 — "Live token" classification and zero-market-cap semantics need one consistent rule — FIXED

- `lib/model.ts:255-270` — one rule, three states: `tokenState()` returns
  `pre-token` (no mcap, no gecko id, no symbol), `unpriced` (token metadata present
  but no positive market cap), `live-priced` (positive market cap). `isPreToken()`
  uses the same definition.
- `lib/model.ts:700-730` (`liveRows`, `liveUnpricedRows`) — the live tab shows only
  `live-priced` rows (24 in the final build); the 283 unpriced rows are shown
  separately and are never called "already trades" and never used as comparables.
- `dashboard/app.js:263`, `:280-283` — live table badges read "already trades" only
  for priced rows; the unpriced section states "Token metadata present, no market
  price … so they are not counted as trading".
- Test: `tests/model.test.mjs:110-121` (one rule for null / zero / partially populated
  token fields), `:226-237` (liveRows: only positive market caps, ties break on slug).

### P2 — Exclusion narrative overstates what the snapshot and implementation establish — FIXED

- `lib/model.ts:7-9` header comment, `lib/model.ts:410-413`, `README.md:25` and the
  dashboard notes now say: the other 19 are excluded by the supplied watchlist rule;
  the snapshot fields do not establish why, so no reason is claimed for them. The
  parent-product / "not standalone launches" claim is removed everywhere, including
  a stale code comment found during final review (amended into the implementation
  commit before push).
- `lib/model.ts:767-778` (`buildRadar`) — the four exclusion buckets (bridges 24,
  liquid-staking 18, restaked BTC 2, other 19) are asserted to sum to the excluded
  count (63), throwing otherwise.
- Test: `tests/model.test.mjs:287-298` (sealed snapshot: exclusion buckets sum).

### P2 — Reproducibility claims are plausible but not independently demonstrated by this repository — FIXED

- `scripts/rebuild.sh` — receives the sealed snapshot path, runs `main.ts` twice into
  two fresh output directories, and compares `board.json`, `data.js` and
  `dossier.json` byte-for-byte; then asserts 226 rows, unique slugs, ranks 1–226,
  non-increasing implied values, full watchlist coverage, 186 early rows and farm
  steps in range.
- `docs/reproducibility.md` — records the sealed snapshot SHA-256
  (`42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`, 758
  protocols, 40 watchlist, floor $50M, as_of 2026-11-14) and the exact commands.
  The snapshot itself is not committed (competition input, kept in the kit).
- `main.ts:55-67` — the output directory is cleaned before writing, so stale files
  cannot survive a re-run.
- `lib/model.ts:700-703` — `liveRows()` has a slug tie-break (mcap desc, TVL desc,
  slug asc); `liveUnpricedRows()` likewise.
- Verified by running `scripts/rebuild.sh` on the final tree (see Verification).

### P3 — Minor model/data hygiene issues — FIXED

- Categories are normalized once (`lib/model.ts:278` `normCategory`: trim / case-fold)
  and the original display label is retained separately.
- `ageDays()` (`lib/model.ts:241-253`) returns an explicit invalid state for future or
  malformed dates; the parser rejects them (test `tests/model.test.mjs:135-141`).
- Chains are deduplicated before the breadth multiplier is computed
  (`parseSnapshot`, test `tests/model.test.mjs:159-166`).
- Zero market cap means "no market cap" in classification, multiples and UI alike
  (test `tests/model.test.mjs:159-166`).
- Test suite added: `tests/model.test.mjs`, 45 tests, all passing (see Verification).
  Coverage includes medians/shrinkage, zero and missing market cap, missing growth,
  future/malformed dates, duplicate slugs/chains, every farm family, and stable
  tie-breaking.

## Verification (final tree, commit 234899a)

All commands run 2026-11-15 from `~/workspace/token-radar` unless noted.

| Check | Command / source | Result |
|---|---|---|
| Unit tests | `node --test tests/model.test.mjs` | **45/45 pass, 0 fail** |
| Determinism | `bash scripts/rebuild.sh <sealed snapshot>` | **board.json, data.js, dossier.json byte-identical across two fresh runs**; 226 rows, ranks 1–226, implied non-increasing, watchlist 40/40, 186 early, farm steps in range |
| Board identity vs v2 | slug/rank/`implied_value_usd` compared row-by-row against the v2 baseline `~/workspace/token-radar/out/board.json` (sha256 `43a80608cc169ca15b8805e6f5b9dc8701b4e60e4f21891aa64f51bbed872730`) | **0 mismatches over 226 rows**; top 3 unchanged: Steakhouse Financial $649,659,981, Gauntlet $388,645,622, Veda $275,126,621 |
| Farm specificity | distinct step text per step over 226 rows | **48 / 226 / 226 / 7 / 226 / 14**; every row exactly 6 steps; 24 verify-first rows |
| Dossier size | `dossier.json` text length | **37,455 chars** (cap 65,536) |
| Dashboard network refs | `http://` occurrences in generated `dashboard/index.html` | **0** |
| Dashboard recompute | `impliedOf()` extracted verbatim from `dashboard/app.js`, run against generated `data.js` | **0 mismatches over 226 rows** |
| Screenshots | headless Chrome 1440×900 renders of the final dashboard (`#p=steakhouse-financial`, `#category=Lending`, `#tab=live`) | **4 real renders, all ≤512 KiB** (163,930 / 220,560 / 156,623 / 165,045 bytes), visually checked |
| Sealed snapshot | SHA-256 of the kit input | `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393` (758 protocols, 40 watchlist) |
| Model constants | `tests/model.test.mjs:322-328` | unchanged from radar-3 (required: implied values must not move) |

## Unresolved findings and remaining risks

1. **P1-2, growth/maturity calibration (partial).** The growth weights and maturity
   curve are unchanged by design (see above); no growth-removal rank-sensitivity test
   exists. The ranking therefore still swings on one 7-day TVL window, and the
   maturity premium remains an untested hypothesis — now disclosed as "time since
   DefiLlama listing", not presented as proven. Any recalibration would change implied
   values and needs a deliberate decision to break v2 board identity.
2. **FDV sensitivity cannot be computed.** The snapshot carries no FDV; the report
   states this instead of inventing a column. If a future snapshot adds FDV, the
   sensitivity the audit asked for becomes possible.
3. **Farm actions are family-level, not protocol-verified.** Entry actions name the
   protocol and its family product, but supported assets, routes and points pages are
   not verified per protocol against a live source — the snapshot cannot establish
   them. Where that matters the plan says "verify … on the official app first".
4. **Sealed snapshot is not in the repo.** Reproduction requires the kit input
   (`~/workspace/makefun/token-radar-01-kit/input/snapshot.json`, SHA-256 above). The
   judge can reproduce from the submission bundle; the public repo alone cannot.
5. **No screen-reader or manual device pass** on the dashboard changes; contrast and
   layout were checked only via headless renders.

## Files changed (implementation commit 234899a)

- `lib/model.ts` — family-routed farm actions, explicit gas map + unknown fallback,
  validation gates, valuation disclosure fields, live/unpriced token states,
  exclusion-bucket assertion.
- `main.ts` — cleans the output directory before writing.
- `dashboard/app.js`, `dashboard/app.css` — proxy wording, comparables/confidence
  display, live/unpriced split, model panel.
- `README.md` — proxy wording, FDV statement, corrected exclusion narrative.
- `docs/reproducibility.md` (new), `scripts/rebuild.sh` (new),
  `tests/model.test.mjs` (new, 45 tests).
- `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png`, `4-live.png` —
  re-taken as real renders of the final dashboard.

## What was NOT done

- No submission to make.fun (v2 remains the live entry; resubmission needs Rama's
  approval of this exact commit).
- No transcript bundle (the main agent bundles later).
- The already-pushed `bee5190` handoff commit (primary-email identity) was **not**
  rewritten or force-pushed; this work is based on top of it.
