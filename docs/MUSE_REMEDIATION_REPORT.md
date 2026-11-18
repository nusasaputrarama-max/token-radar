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

---

# Audit v2.5 Remediation — 2026-11-17

**Repository:** `nusasaputrarama-max/token-radar`
**Audited baseline:** `3b61c7d` (main after the guard-output-cleanup merge; model radar-4)
**Audit:** `docs/GPT_AUDIT_V25_2026-11-17.md` (preserved on main by `534cb68`; the
audit branch commit `1d3b964` is authored with the primary email, so it was copied,
not cherry-picked)
**Implementation commits (main, pushed together):**
`534cb68` docs: audit v2.5 preserved on main;
`1b64db0` P1-01 verify-first farm plans + P2-01 Yield Aggregator family fix;
`a885c93` P1-02 sensitivity analysis;
`5cd2ee2` P2-02 output-path trust check;
`27b92cb` P2-03 chain dedup;
`f14322d` README / dashboard verify-first wording;
`8d071f7` P2-02 group-trust calibration (see below); this report update is the
commit that adds this section.
**Identity:** author and committer `nusasaputrarama-max
<353745658+nusasaputrarama-max@users.noreply.github.com>` (verified with
`git config user.name` / `git config user.email` before every commit in this batch)
**Date:** 2026-11-17
**Status:** All 5 findings addressed. Model constants unchanged; no board slug, rank
or implied value moves (verified 0 mismatches over 226 rows against the 3b61c7d
baseline — see Verification). The submitted v3 entry (snapshot commit `b59e954`) is
not altered by any of this.

## Per-finding status (audit v2.5)

### P1-01 — Farm plans assert capabilities/rewards without evidence — FIXED

- `lib/model.ts:633-660` — every family entry action is now verify-first and
  non-transactional: it names what to check on the protocol's official app and
  forbids acting until the app shows an action is supported. No step instructs a
  deposit, trade, mint, borrow, bridge, stake, spend or claim anywhere. The weekly
  step re-checks what was verified; the hold applies only if a supported action was
  verified and a position taken; the rewards step asks whether a programme exists
  at all (`lib/model.ts:113` header comment states the design).
- `lib/model.ts:645-660` — all 16 families route through the single `familyFor()`
  classifier for entry, weekly, claim and log actions.
- `README.md` — model section now reads radar-5, states the verify-first design and
  the sensitivity diagnostic; `dashboard/app.js` farm panel rewritten to match
  (steps 2, 3 and 5 no longer describe supplying, providing liquidity, or claiming
  from a points page); `main.ts` header corrected radar-3 → radar-5
  (commit `f14322d`).
- Tests: `tests/model.test.mjs:241-248` (every family entry is verify-first),
  `:381` (sealed snapshot: every farm plan is verify-first).
- Verified on the final build: farm steps 2, 3, 4 and 5 changed on all 226 rows vs
  the 3b61c7d baseline; step 1 unchanged; step 6 changed on 9 rows (see P2-01).

### P2-01 — Yield Aggregator misclassified as DEX — FIXED

- `lib/model.ts` `familyFor` — the curator/aggregator rule now runs before the DEX
  rule, and matches on `normCategory` (trim + case-fold), so "Yield Aggregator",
  "Risk Curators" and whitespace/case variants all classify as `curator`.
- Tests: `tests/model.test.mjs:229-236` (fixtures assert `curator` for Yield
  Aggregator, Risk Curators, ` Yield Aggregator ` and `YIELD AGGREGATOR`).
- Verified on the final build: the 8 board rows in category Yield Aggregator now
  get curator-family steps. Example (`vfat.io`): baseline step 2 "Provide $50 of
  liquidity to vfat.io's main pool on Base and leave the position open." → new
  "Verify on vfat.io's official app which vaults exist on Base, what assets they
  take, and what the current share price is — the snapshot does not list vaults,
  so do not deposit until the app shows a vault that takes an asset you hold."
  The 9th step-6 change is one Indexes row (`defindex`).

### P1-02 — Growth/maturity calibration untested — DIAGNOSTIC ONLY (no constants changed)

- `lib/model.ts:485` `neutralModel()` returns a copy of MODEL with the growth
  and/or maturity multiplier neutralized to 1.0; `lib/model.ts:532`
  `sensitivityAnalysis()` rebuilds the ranking under growth-neutral,
  maturity-neutral and both-neutral and reports rank movement (median, p90, max,
  top-10/25/50 membership changes). `scripts/sensitivity.mjs` runs it against a
  snapshot; results for the sealed snapshot are in `docs/sensitivity-2026-11-17.md`
  (55 lines).
- Sealed-snapshot results (commit `a885c93`): growth-neutral 182/226 moved, median
  2, p90 8, max 41, top-50 changed 3; maturity-neutral 203/226 moved, median 3,
  p90 10, max 20, top-25 changed 1 (valos in, lofty out), top-50 changed 2;
  both-neutral 187/226 moved, median 3, p90 13, max 39; **top 10 stable under all
  three neutralizations**.
- Tests: `tests/model.test.mjs:424` (growth-neutral), `:454` (maturity-neutral),
  `:472` (the analysis never mutates MODEL), `:488` (sealed snapshot: report is
  structural and diagnostic).
- The growth weights and maturity curve are **unchanged**. Any recalibration would
  change implied values and needs a deliberate decision to break v2 board identity
  (see Unresolved below).

### P2-02 — Output-path symlink race (check-then-use, not atomic) — FIXED (within the limits of path-based checks)

- `lib/output-path.ts:10-42` — threat model documented in the header comment:
  adversary is a local process with write access to a parent directory; defence is
  layered and fail-closed; residual risk stated plainly (see Unresolved below).
  The report does not overstate what the checks guarantee.
- `lib/output-path.ts:93` `verifyOutputDirTrusted()` — fails closed unless the
  directory is a real directory (not a symlink, realpath equals lexical path),
  owned by the current user, not writable by *others*, and under parents no
  *other* local user can swap a component in (other-writable without the sticky
  bit). Sticky-bit parents accepted. Group-writable paths accepted: the model
  trusts the current user's own group (see calibration note below).
- `lib/output-path.ts:141` `assertSafeCleanupTarget()` — re-validates each cleanup
  target immediately before its own deletion: symlink final component throws;
  resolved path must stay inside the resolved output dir.
- `main.ts:56` — newly-made output directories created private (`mkdirSync` mode
  0o700); `:63` explicit chmod 0o700 loop over directories this call created;
  `:69` `safeOutputPath` re-check after creation; `:72`
  `verifyOutputDirTrusted`; `:77` per-entry guard in the cleanup loop.
  `safeOutputPath()` itself is unchanged (first check).
- Tests: `tests/output-path.test.mjs` — 10 tests: `:8`, `:19`, `:31`, `:44`
  (safeOutputPath shapes), `:48`, `:62`, `:85` (trust: private owner dir accepted,
  0777 rejected, 0770 accepted, sticky ancestor accepted, other-writable ancestor
  without sticky rejected), `:110` (cleanup target: real accepted, missing ignored,
  symlink rejected), `:135` (adversarial race 1: `dashboard` swapped for a symlink
  after validation — per-entry check throws), `:164` (adversarial race 2: swapped
  ancestor component — re-validation throws).
- **Calibration note (commit `8d071f7`).** The first P2-02 version required the
  output directory itself to be private (no group write). That broke the
  repository's own `scripts/rebuild.sh`: it pre-creates its run directories with
  `mkdir -p` under a group-writable umask (0007 → 0770), so `main.ts` failed
  closed with "unsafe output path: … is writable by group or others" and rebuild
  exited 1. A caller that pre-creates the output directory with default modes —
  including a future harness — must keep working, so the directory rule now
  matches the ancestor rule: reject only *other*-writable, accept group-writable.
  `main.ts` still creates newly-made output directories private (0700), and
  ownership, symlink, sticky-ancestor and per-entry checks are unchanged. The
  ancestor rule went through the same calibration earlier in the session (the
  repo's own parents are mode 2770). On a machine where the group is shared with
  untrusted users, run under a private parent and a private output directory.
- Verified: `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>` in the repo
  exits 0 and creates `out/` mode 0700; `sh scripts/rebuild.sh <snapshot>` passes
  after the calibration (see Verification).

### P2-03 — Chain dedup is case-sensitive — FIXED

- `lib/model.ts:289` `dedupChains()` — deduplicates on a normalized key (trim +
  case-fold), in input order, preserving the first label (trimmed) as the display
  label; blanks and non-strings dropped, non-array input → []. Used at parse time
  and again in `impliedValue()` (`lib/model.ts:407`), so the breadth multiplier
  counts distinct chains even if a caller bypasses the parser.
- Tests: `tests/model.test.mjs:172-178` (direct cases), `:181` (parse-time
  variants), `:189` (breadth invariance: `['Ethereum', 'ethereum', ' Ethereum ']`
  scores the same as `['Ethereum']`; a second distinct chain scores 1.02).
- Verified: the sealed snapshot carries 0 chain case/whitespace variants, so no
  board value moves (0 rank / 0 implied moves — see Verification).

## Verification (final tree, 2026-11-17, from `~/workspace/token-radar`)

| Check | Command / source | Result |
|---|---|---|
| Unit tests | `node --test tests/model.test.mjs tests/output-path.test.mjs` | **69/69 pass, 0 fail** (59 model + 10 output-path) |
| Determinism | `sh scripts/rebuild.sh <sealed snapshot>` | **board.json, data.js and dossier.json byte-identical across two fresh runs**; 226 rows, ranks 1–226, implied non-increasing, watchlist 40/40, 186 early, farm steps in range. (First attempt failed after the uncalibrated P2-02 — see calibration note; passes after `8d071f7`.) |
| Baseline regeneration | `git worktree add …/token-radar-baseline 3b61c7d`, `node main.ts --input <snapshot>` | Regenerated hashes match the recorded baseline exactly: board.json `e03d1bba0730deae11e45c5b0d71e0a3cb3445236e2ca1a3acf10261f6a39a8a`, data.js `b0450ccc118fb0746b2a8c08e57e37a903583c7c86f15283e2c893c94a7e6845`, dossier.json `a258b83189b42aaaead4291f6f0ac6aa897f8538f8452513dff61febd3adf146` |
| Board identity vs 3b61c7d | row-by-row comparison of `board.json` (`/tmp/board-diff.mjs`) | **0 rank moves, 0 implied moves over 226 rows**; 0 missing rows; top 3 unchanged: Steakhouse Financial $649,659,981, Gauntlet $388,645,622, Veda $275,126,621. Farm steps: steps 2, 3, 4, 5 changed on all 226 rows; step 6 on 9 rows (8 Yield Aggregator + 1 Indexes); step 1 unchanged. New board.json `437c7029…`, data.js `de1b4acd…` (farm steps embedded), dossier.json `3dff0a0d…` (changed only in the embedded dashboard source: app.js 27,386 → 27,979 bytes) |
| Sensitivity | `node scripts/sensitivity.mjs <snapshot>` | Growth-neutral 182/226 moved (median 2, p90 8, max 41); maturity-neutral 203/226 (median 3, p90 10, max 20); both-neutral 187/226 (median 3, p90 13, max 39); top 10 stable under all three |
| End-to-end output guard | `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>` in the repo (parents mode 2770) | Exit 0, `out/` created mode 0700, all 5 outputs written, then removed |
| Model constants | `tests/model.test.mjs` pins | unchanged from radar-4; radar-5 valuation arithmetic identical to radar-4 |
| Sealed snapshot | SHA-256 of the kit input | `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393` (758 protocols, 40 watchlist) — unchanged, never committed |

## Unresolved findings and remaining risks (audit v2.5)

1. **P1-02 calibration still diagnostic.** The sensitivity analysis measures how much
   the ranking swings on growth and maturity; it does not recalibrate either. The
   growth weights (`growth_up: 0.5`, `growth_down: 0.7`, clamp −60/+120) and the
   maturity curve (0.70 → 1.00 over 1460 days) are unchanged by design. A
   recalibration needs Rama's explicit decision, because it would change implied
   values and break v2 board identity. The sensitivity numbers are the evidence base
   for that decision: the top 10 is stable under all three neutralizations, but the
   mid-table moves (median 2–3 ranks, max 39–41).
2. **P2-02 residual race window.** Path-based checks cannot atomically close the
   window between the final per-entry check and its `rmSync`, and cannot defend
   against a privileged attacker or an owner of a parent directory. The design
   narrows the window to one entry at a time and fails closed on every checkable
   condition; it does not claim to eliminate all symlink-redirection races. Stated
   in `lib/output-path.ts:33-42`.
3. **Group-trust assumption.** Group-writable output directories and ancestors are
   accepted on the assumption that the current user's own group is trusted. On a
   machine where the group is shared with untrusted users, run under a private
   parent and a private output directory.
4. **Test-command quirk.** Literal `node --test tests/` FAILS on Node v24.22.1 (it
   treats the directory as a module path, MODULE_NOT_FOUND) — not a test failure.
   Working equivalents: `node --test tests/model.test.mjs tests/output-path.test.mjs`
   or bare `node --test`. Environment: Node v24.22.1, umask 0007, repo parents mode
   2770.
5. **No resubmission.** The v3 entry remains the live submission; the account
   reputation limit blocks any further submit, and no v4 resubmit is possible until
   it lifts. Nothing in this batch was submitted.

## Files changed (audit v2.5 batch)

- `lib/model.ts` — verify-first farm plans for all families (`a885c93` sensitivity
  helpers added in the same file: `neutralModel`, `sensitivityAnalysis`),
  curator/aggregator family rule before the DEX rule, `dedupChains()` at parse
  time and in `impliedValue()`.
- `lib/output-path.ts` — `verifyOutputDirTrusted()`, `assertSafeCleanupTarget()`,
  threat-model header comment; group-trust calibration (`8d071f7`).
- `main.ts` — private directory creation (mode 0700) + chmod loop, re-check,
  trust verification, per-entry cleanup guard; header corrected to radar-5.
- `scripts/sensitivity.mjs` (new), `docs/sensitivity-2026-11-17.md` (new).
- `tests/model.test.mjs` — sensitivity tests (4), chain-dedup tests (3), family
  fixtures; `tests/output-path.test.mjs` — trust tests (3) + adversarial race
  tests (2) + cleanup-target test.
- `README.md` — radar-5 wording, verify-first design, sensitivity diagnostic,
  both test suites. `dashboard/app.js` — farm panel rewritten verify-first.
- `docs/GPT_AUDIT_V25_2026-11-17.md` (new, `534cb68`), this report.

## What was NOT done (audit v2.5)

- No model constant changed; no recalibration of growth or maturity.
- No submission or resubmission to make.fun.
- The sealed snapshot was not committed, and no secret was added to the repo.

---

# Audit v2.6 — follow-up (branch `muse/audit-v26-fixes`, PR pending)

**Repository:** `nusasaputrarama-max/token-radar`
**Audited base:** `3b61c7d0d3515586ea7c6df9e07ce74007df50a0` (audit v2.6 reviewed the
guard-merge state, before the v2.5 implementation)
**Branch base:** `9e6d5bb07648d59ccd1258665037de52a4a303dd` (v2.5 implementation,
all 5 v2.5 findings done)
**Audit:** `docs/GPT_AUDIT_V26_2026-11-17.md` (branch `gpt/audit-v25`, head
`7aee7e0`; copied into this branch at the PR author's request — the audit doc
itself lives on the audit branch)
**Identity:** author and committer `nusasaputrarama-max
<353745658+nusasaputrarama-max@users.noreply.github.com>` (verified with
`git config user.name` / `git config user.email` before every commit)
**Date:** 2026-11-18
**Status:** the v2.6 items in scope are addressed on a feature branch; nothing
is merged. The v2.6 items already fixed by the v2.5 implementation (farm
verify-first, Yield Aggregator precedence, sensitivity diagnostic) were
verified present, not redone. The v2.7-only items (farm-plan balance
instruction and capital-band labelling, accessibility pass) are out of scope
for this branch — see "What was NOT done (audit v2.6)".

## Per-finding status

### P1 — Snapshot validation still accepts malformed values — FIXED (with one deliberate deviation)

- `lib/model.ts:988` — a non-string, non-null `listed_at` now fails closed
  (`has a non-string listed_at date`); `:991` — a string `listed_at` later
  than `as_of` fails closed (`has a listed_at date after as_of`). Null stays
  null: an unknown listing date is an explicit state, not an error.
- `lib/model.ts:1010` — a negative finite `mcap_usd` normalizes to `null` at
  the parser boundary instead of being retained as a price. **Deviation from
  the audit's literal request (hard reject), with evidence:** the sealed
  snapshot itself carries one such record — `autofinance`, `mcap_usd: -1`,
  with `gecko_id: "tokemak"` and `symbol: "TOKE"`, TVL $33,411,068, not on
  the watchlist — and a hard reject would make the sealed input unparseable,
  so the entry could never be reproduced from its own snapshot. The parser
  refuses the value as evidence instead of the whole document. The audit's
  intent is preserved either way: a negative cap can never enter a multiple
  (`categoryMultiples` requires a positive cap) or a live price
  (`tokenState` requires a positive cap), and the record stays `unpriced`
  exactly as before. Verified: the sealed snapshot parses, and the branch
  outputs are byte-identical to the 9e6d5bb baseline (see Verification) —
  the normalized value never reaches an output (autofinance is outside the
  top-24 live-unpriced rows the dashboard carries).
- `lib/model.ts:288` `isCexCategory()` — one normalized predicate
  (`normCategory(category) === 'cex'`), used by `isRankable` (`:276`), the
  live pool (`:428`), `liveRows` (`:840`), `liveUnpricedRows` (`:858`), the
  comparables filter (`:920`) and `live_unpriced_size` (`:945`). The
  excluded-breakdown filters (`:911-913`) use normalized keys too
  (`normCategory(...).includes('bridge')`, `=== 'liquid staking'`,
  `=== 'restaked btc'`). Display labels are untouched.
- Tests: `tests/model.test.mjs:164` (future and non-string `listed_at` fail;
  null stays null; a valid past date parses), `:178` (negative mcap
  normalizes to null; the record stays `unpriced` with token metadata),
  `:343` (CEX exclusion: `CEX`, `cex`, ` CEX `, `Cex`, `cEx` all excluded),
  `:351` (a ` cex ` live protocol never enters the live tab), `:361` (a
  ` cex ` watchlist row is refused as not rankable).

### P1 — Board gate does not bind row order to rank or enforce the tie-break — FIXED

- `lib/model.ts:1063` — the gate now reads each row's own rank in place
  (`board[i].rank` must equal `i + 1`); the old sorted-ranks check, which
  would have accepted two swapped rank fields, is gone. `:1070` — adjacent
  rows with equal implied values must be in ascending slug order, or the gate
  refuses the board as a different ranking.
- Tests: `tests/model.test.mjs:412` (swapped rank fields: the set {1,2,3} is
  still contiguous, so only the position binding catches it), `:430`
  (equal-value rows in reverse slug order with ranks matching their
  positions: only the tie-break catches it). Both fixtures build on the
  existing tied-board fixture, whose valid form still passes the gate.

### P2 — Output-path guard is useful but not atomic — DOCUMENTED (no code change)

- `docs/output-path-threat-model.md` (new) — states what the guard guarantees
  (static unsafe paths only), the adversary (a local process with write access
  to a parent directory; no remote attacker; a privileged attacker or a
  parent-directory owner is out of scope), the trusted-parent assumption
  (other-writable non-sticky parents fail closed; sticky-bit parents accepted;
  group-writable accepted on the trusted-group assumption, calibration
  `8d071f7`), and the residual check-then-use race: the window between the
  final per-entry check and its `rmSync` cannot be closed by path-based
  checks, and the existing adversarial tests swap a component *before* the
  final check, so they do not exercise a swap after it. No race elimination
  is claimed. Operational guidance and what a stronger guarantee would need
  (descriptor-relative cleanup, or a private directory created by the run)
  are recorded as future work.
- `lib/output-path.ts` header comment points at the document. No code changed:
  documentation is the required deliverable for this finding.

### P2 — Current output and CI evidence remain incomplete — PARTIAL (CI added; sealed snapshot still not in repo)

- `.github/workflows/ci.yml` + `scripts/synthetic-snapshot.mjs` were prepared
  as a separate final commit: non-deploy CI on push and pull_request —
  checkout, Node 24, run the full test suite
  (`node --test tests/model.test.mjs tests/output-path.test.mjs`), then a
  determinism check that generates a synthetic snapshot, runs `main.ts` twice
  into two directories and byte-compares `board.json`, `data.js` and
  `dossier.json`. The sealed snapshot is not in the repository and is not
  published by CI, so the CI determinism check runs on synthetic input; the
  sealed-snapshot determinism evidence remains the local `scripts/rebuild.sh`
  run recorded below. No deploy step, no secret, no submission. Verified
  locally before the drop: 76/76 tests pass; two synthetic runs byte-identical
  (4-row board).
- **CI push status: BLOCKED.** The push was rejected by GitHub on 2026-11-18:
  "refusing to allow an OAuth App to create or update workflow
  `.github/workflows/ci.yml` without `workflow` scope". The `gh` token has
  scopes `gist`, `read:org`, `repo` and no `workflow` scope. The CI commit
  (`4e3034a`) was dropped from the branch — it was never pushed — and the
  two files are preserved outside the repo at
  `~/workspace/token-radar-ci-blocked/` (with a README) so they can be
  applied once a token with `workflow` scope is available. No token refresh
  was requested.

### Already done in v2.5 — verified present, not redone

- P1 farm/rewards verify-first rewrite: `lib/model.ts` `actionFor` /
  `weeklyFor` / `claimFor` are verify-first and non-transactional; the
  sealed-snapshot tests pin this (`tests/model.test.mjs`, sealed snapshot:
  every farm plan is verify-first).
- P2 Yield Aggregator precedence: `familyFor` checks the curator/aggregator
  rule before the DEX `yield` rule, on `normCategory`; fixtures assert
  `curator` for Yield Aggregator and whitespace/case variants.
- P1-02 sensitivity diagnostic: `neutralModel()` / `sensitivityAnalysis()`
  and `docs/sensitivity-2026-11-17.md` exist; the growth weights and
  maturity curve are unchanged (see "What was NOT done").

## Verification (branch `muse/audit-v26-fixes`, 2026-11-18, from `~/workspace/token-radar`)

| Check | Command / source | Result |
|---|---|---|
| Unit tests | `node --test tests/model.test.mjs tests/output-path.test.mjs` | **76/76 pass, 0 fail** (66 model + 10 output-path; was 69/69 on main — 7 new: 5 snapshot-validation/CEX, 2 board-gate negatives) |
| Determinism | `sh scripts/rebuild.sh <sealed snapshot>` | **board.json, data.js and dossier.json byte-identical across two fresh runs**; 226 rows, ranks 1–226, implied non-increasing, watchlist 40/40, 186 early, farm steps in range |
| Baseline regeneration | `git worktree add /tmp/token-radar-baseline-9e6d5bb 9e6d5bb`, `MAKEFUN_OUTPUT_DIR=… node main.ts --input <snapshot>` | Regenerated hashes match the v2.5 recorded baseline exactly: board.json `437c7029f758521c63d9d871d65dbe8c95c07752a13327e2da90b09f8bd2896a`, data.js `de1b4acde26d09feee3fb30bea665e30111884072e74dd4b6024d008c6b6cc8e`, dossier.json `3dff0a0d8d84c66f39d1da606c2f6c529e3c62d998d91f8c60c30e22e2ccfbfb`; worktree removed afterwards |
| Board identity vs 9e6d5bb | row-by-row comparison of `board.json` | **0 rank moves, 0 implied moves over 226 rows**; 0 missing rows; top 3 unchanged: Steakhouse Financial $649,659,981, Gauntlet $388,645,622, Veda $275,126,621. **Branch outputs are byte-identical to the 9e6d5bb baseline on all three files** (board.json `437c7029…`, data.js `de1b4acd…`, dossier.json `3dff0a0d…`); the mcap normalization never reaches an output |
| Model constants | `tests/model.test.mjs` pins | unchanged from radar-4/radar-5; no recalibration |
| Sealed snapshot | SHA-256 of the kit input | `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393` (758 protocols, 40 watchlist) — unchanged, never committed |

## Unresolved findings and remaining risks (audit v2.6)

1. **Negative market cap: hard reject vs normalize (deliberate deviation).**
   The audit asks for a hard reject of negative finite `mcap_usd`. This branch
   normalizes to null instead, because the sealed snapshot carries
   `autofinance` (`mcap_usd: -1`) and a hard reject would make the sealed
   input unparseable. If the auditor or Rama prefers the hard reject, the
   sealed snapshot itself would need a corrected re-issue — that decision is
   not this branch's to make.
2. **P2-02 residual race window.** Unchanged from v2.5: path-based checks
   cannot atomically close the window between the final per-entry check and
   its `rmSync`. Now documented in `docs/output-path-threat-model.md`; not
   fixed, and not claimed fixed.
3. **Group-trust assumption.** Unchanged: group-writable output directories
   and ancestors are accepted on the assumption that the current user's own
   group is trusted. Documented in the threat-model doc.
4. **CI is BLOCKED on token scope.** The workflow was written and verified
   locally, but GitHub refused the push (no `workflow` scope on the OAuth App
   token), the commit was dropped, and the files live outside the repo at
   `~/workspace/token-radar-ci-blocked/`. No CI run has ever existed for this
   repository. Unblocking needs a token with `workflow` scope (or the owner
   account pushing the files) — not requested here.
5. **No resubmission.** The v3 entry remains the live submission; the account
   reputation limit blocks any further submit. Nothing in this branch was
   submitted, and this branch must not be merged without Rama's decision.

## Files changed (audit v2.6 batch)

- `lib/model.ts` — `isCexCategory()` + normalized CEX/breakdown predicates;
  `parseSnapshot` fails closed on future/non-string `listed_at`, normalizes
  negative `mcap_usd` to null; `boardIssue` binds rank to row position and
  enforces the slug tie-break.
- `tests/model.test.mjs` — 7 new tests (5 snapshot-validation/CEX, 2
  board-gate negatives).
- `docs/output-path-threat-model.md` (new) + one pointer line in
  `lib/output-path.ts` header comment.
- CI files prepared then dropped (push rejected, no `workflow` scope):
  `.github/workflows/ci.yml` + `scripts/synthetic-snapshot.mjs` are NOT in
  this branch; preserved at `~/workspace/token-radar-ci-blocked/` (see the
  CI section above).
- `docs/GPT_AUDIT_V26_2026-11-17.md` (new on this branch, copied from
  `gpt/audit-v25` so the PR is self-contained), this report.

## What was NOT done (audit v2.6)

- No model constant changed; no recalibration of growth or maturity.
- No submission or resubmission to make.fun. No merge (PR only).
- The sealed snapshot was not committed, and no secret was added to the repo.
- **v2.7-only items left pending (not approved for this branch):** removing
  the farm-plan `chain` balance instruction and labelling the $50/$100/$200
  capital bands as illustrative; the accessibility keyboard/screen-reader/
  device pass (still NOT TESTED).
- **Negative mcap hard reject:** implemented as normalize-to-null instead —
  see finding 1 above.

