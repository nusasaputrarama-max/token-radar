# Independent Audit — Fleet Horizon / Token Radar v2

**Repository:** `nusasaputrarama-max/token-radar`  
**Audited revision:** `e26f0af50ec6639099a39ec8a0da4d65370bdd75` (15 November 2026)  
**Scope:** `lib/model.ts`, `main.ts`, `dashboard/app.js`, `dashboard/index.html`, `README.md`, vendored dossier builder, and repository tree.  
**Review mode:** Read-only review. No application code was changed.

## Executive assessment

Fleet Horizon v2 is materially stronger than a simple token watchlist: the ranking is reproducible in structure, the dashboard is self-contained, and the farm-plan generator now distinguishes category families. The main weakness is not presentation. It is the evidentiary quality of the valuation assumptions and the gap between category labels and executable protocol-specific instructions.

The highest-impact risks for judging are:

1. The implied-value number looks more precise than its inputs justify. Market-cap/TVL is a proxy, not a directly comparable protocol valuation; the growth and maturity multipliers introduce discretionary assumptions without calibration or uncertainty ranges.
2. Farm plans are family-aware but not consistently executable. Several families receive a generic USDC deposit as their entry action, and fixed gas/cost estimates are not chain- or action-aware.
3. The code trusts the supplied watchlist and snapshot too much. It does not validate unique slugs, watchlist uniqueness, positive TVL, valid dates, or exact early-radar coverage. A malformed or internally inconsistent snapshot can still produce a plausible-looking board.
4. The submitted/generated artefacts cannot be independently reproduced from this repository alone: the sealed snapshot, generated `board.json`, `data.js`, and `dossier.json` are not tracked in the audited tree.

The static dashboard inspection is positive: the page loads local assets and its JavaScript contains no apparent network-fetch mechanism. The generator is deterministic for a fixed, byte-identical input in the normal clean-output case, but the claimed two-run result and the 226-row board were not independently rerun because the required snapshot is absent.

## Findings, ordered by likely judging impact

### P1 — Valuation proxy is presented as an implied protocol value without enough qualification

**Files:** `lib/model.ts:239-267`, `lib/model.ts:269-307`; `README.md:25-37`; `dashboard/app.js:265-290`.

The category multiple is the median of live-token market-cap / TVL ratios, shrunk toward the global median with a prior of six observations. This is transparent and avoids using a single comparable, but market cap is not equivalent to enterprise value, FDV, protocol revenue, or tokenholder value. A circulating market cap can be distorted by float, emissions, unlocks, treasury ownership, token utility, and whether the token actually captures protocol economics. TVL also measures assets deposited, not revenue or value accruing to a token. Two protocols in the same broad DefiLlama category can have very different business models.

The model then multiplies this proxy by discretionary growth, maturity, and breadth factors. The output is denominated in USD and ranked to the dollar, which can imply a degree of valuation precision that the method does not establish. The disclaimer that this is not a price helps, but does not resolve the conceptual mismatch.

**Concrete change:** Keep the current calculation if preserving the submitted ranking is important, but label it consistently as a **snapshot-based comparable proxy**, not a token valuation. In `lib/model.ts`, expose the comparable count and a dispersion statistic (at minimum category IQR or median absolute deviation) alongside the multiple. In the dashboard detail, show the multiple's sample size and dispersion, and mark categories with low or highly dispersed comparables as low confidence. Add a second sensitivity column using FDV/TVL where FDV exists, or explicitly state that FDV is unavailable and why market cap is used. Do not silently mix the two measures. Add a short methodology note explaining that token market cap/TVL is not a direct measure of protocol value.

### P1 — Growth and maturity multipliers are uncalibrated and can dominate the ranking

**Files:** `lib/model.ts:269-307`; `README.md:29-36`; `dashboard/app.js:42-55`.

The 7-day TVL change is clamped to -60%/+120%, then weighted asymmetrically: a -60% move produces a 0.58 multiplier, while +120% produces 1.60. That is a large ranking swing driven by one short observation window. A transient incentive campaign, bridge inflow, market move, or temporary withdrawal can materially change the implied value. Missing growth is silently treated as zero, so missing data is numerically indistinguishable from a genuinely flat week.

Maturity is a monotonic premium from 0.70 to 1.00 based on `listed_at`. The narrative interprets time since listing as time the protocol has operated without a token and as "pent-up launch value". A directory/index listing date is not necessarily the protocol launch date, and older operation does not logically imply a higher probability or value of a future token. This is an untested hypothesis, not a fact derived from the snapshot.

**Concrete change:** In `lib/model.ts`, retain raw `change_7d` and add an explicit missing-data state; do not silently represent missing growth as 0. Prefer a smoothed 30/90-day trend or a capped 7-day contribution with a lower maximum weight. Add a sensitivity test showing the rank movement when growth is removed. Rename the maturity input in the UI to "time since DefiLlama listing" unless the snapshot contract proves it is a launch date. Remove the "pent-up launch value" assertion from the model comment and README, or support it with independent evidence and calibration. Consider shrinking maturity toward 1.0 rather than rewarding age as a one-way token-launch signal.

### P1 — Farm entry actions do not cover all of the families that the model claims to support

**Files:** `lib/model.ts:406-445`, especially `actionFor()` and `familyFor()`; `dashboard/app.js:292-306).

The category-family classifier recognizes lending, DEX, bridge, staking, derivatives, prediction, curator, stablecoin, RWA, insurance, governance, chain, payments, indexes, CeDeFi, and other. However, `actionFor()` has explicit entry actions for only a subset. Several family classifications therefore fall through to the generic instruction to "Deposit ... USDC into [protocol]". This is not a valid general action for a chain, payment/card product, index protocol, CeDeFi product, aggregator/curator category, or basis-trading category. RWA labels such as "anchor BTC" or "decentralized BTC" are classified as RWA by `familyFor()`, but do not necessarily match the narrower `c.includes('rwa')` test in `actionFor()`. Aggregator and basis-trading labels are similar mismatches.

This conflicts with the dashboard's claim that step two follows the protocol's category family. A farm plan that tells a user to deposit USDC into an app that does not accept deposits is worse than a generic plan: it is an actionable false instruction.

**Concrete change:** Replace the separate substring checks in `actionFor()` with a switch on `familyFor(p)`, so the entry action and weekly/claim/log steps share one classification source. Add explicit safe entry actions for `chain`, `payments`, `indexes`, `cedefi`, `curator`, and the RWA/derivatives subfamilies. If the snapshot does not contain the exact product or supported asset needed to make an action safe, emit "Verify supported action/assets on the official app; no deposit recommendation" rather than inventing a deposit. Add one fixture per family and assert that no family unexpectedly reaches the generic fallback.

### P1 — Farm-plan costs, gas token, and destination chain are not grounded in the snapshot

**Files:** `lib/model.ts:376-396`, `lib/model.ts:522-558`; `dashboard/app.js:292-306`.

The gas-token helper defaults every unrecognized chain to ETH. That is unsafe for chains whose fee asset is not ETH. The first chain in the snapshot is treated as the main chain, even though array order does not prove it is the primary deployment or the destination supported by a bridge. The bridge instruction uses that same chain as its destination, which may describe the source chain or may not be a supported route at all.

Costs are hard-coded: under $3 for the first transaction, $4/$6/$10 for setup, and about $2 per week, independent of chain, congestion, transaction count, pool type, or protocol. The fixed cost is especially misleading for Ethereum mainnet and can also be wrong for non-EVM chains. The insurance action prices the amount of cover as though it were the user's capital, although cover amount and premium are different quantities.

**Concrete change:** In `lib/model.ts`, make gas token resolution an explicit chain map with an "unknown — verify fee asset" fallback; never default an unknown chain to ETH. Do not infer a bridge destination from the first chain entry: require a verified route/destination or remove the destination claim. Replace fixed gas dollar amounts with "variable; check current network fee" unless the snapshot contains a defensible fee source. Distinguish position size, premium, collateral, and transaction fees in the step schema. Add a risk note for derivatives, prediction markets, borrowing, insurance, and RWA actions; do not describe leveraged or speculative activity as routine low-risk farming.

### P1 — Snapshot and board validation do not enforce the coverage contract

**Files:** `lib/model.ts:225-231`, `lib/model.ts:644-685`, `lib/model.ts:687-710`; `main.ts:42-58`.

`parseSnapshot()` validates basic JSON shape but does not reject duplicate protocol slugs, duplicate watchlist entries, invalid calendar dates, negative/zero TVL, malformed `listed_at` values, or duplicate chain labels. `bySlug()` and the `chosen` map silently collapse duplicate slugs. `boardIssue()` checks that each watchlist slug appears, ranks are contiguous, implied values are non-increasing, and farm-step lengths are in range. It does not check that board slugs are unique, that every eligible below-floor protocol is present exactly once, that every watchlist row is actually pre-token, or that watchlist entries satisfy the floor/category rules. A watchlist row is inserted without a rankability check and then hard-coded as `token_status: 'pre-token'`.

As a result, a bad or changed input can silently undercount rows or label a tokenized/non-eligible watchlist entry as pre-token while still passing the current board gate.

**Concrete change:** Add input validation in `parseSnapshot()` for unique non-empty slugs, unique watchlist values, valid ISO calendar dates, finite positive TVL, and normalized/deduplicated chain names. In `buildBoard()`, explicitly validate each watchlist member exists, is pre-token, and meets the intended watchlist rule. Extend `boardIssue()` to compare the produced slug set against the exact expected set (watchlist union all eligible pre-token rows below the floor), reject duplicates, and verify row count/early count. Add an explicit error when there are no usable live-token comparables instead of allowing `median([])` to throw a generic error.

### P2 — "Live token" classification and zero-market-cap semantics need one consistent rule

**Files:** `lib/model.ts:225-231`, `lib/model.ts:239-267`, `lib/model.ts:568-585`.

`isPreToken()` requires all three token fields to be exactly null. Consequently, a row with a symbol or Gecko ID but no usable market cap is considered non-pre-token and can appear in `liveRows()`, where the dashboard calls it "already trades" despite a null market cap. A row with `mcap_usd = 0` is also treated as non-pre-token, while the comparable filter excludes zero market cap. The code may be intentionally conservative about metadata, but the UI's binary "pre-token/live" wording overstates what these fields prove.

**Concrete change:** Define explicit states such as `pre-token`, `token-metadata-present / market-cap-unavailable`, and `live-priced`. Use a positive market cap for the "already trades at market value" tab, and display incomplete metadata separately. Document whether a zero market cap means an unpriced token or no token; make `isPreToken()`, `liveRows()`, and the README use the same definition. Add fixtures for null, zero, and partially populated token fields.

### P2 — Exclusion narrative overstates what the snapshot and implementation establish

**Files:** `lib/model.ts:1-8`, `lib/model.ts:602-641`; `dashboard/app.js:308-320`; `README.md:18-23`.

The code computes the 63 excluded rows from "rankable, not on watchlist, and at/above floor", then counts bridge/liquid-staking/restaked categories. It does not contain a parent-protocol field or a rule that determines whether a protocol is a child product, a venue product, or a standalone launch. Therefore the statement that the remaining 19 are products of an existing protocol/venue is not demonstrated by this snapshot schema or by the exclusion algorithm. Likewise, "not standalone launches" is a judgement about product structure, not a fact derived from the fields shown here.

The category arithmetic for 44 = 24 bridges + 18 liquid staking + 2 restaked BTC is implemented, but cannot be independently checked without the sealed input snapshot.

**Concrete change:** Reword the remaining 19 as "excluded by the supplied watchlist rule; the snapshot fields do not establish why" unless a source-backed parent/product relationship is added. If retaining the parent-product claim, add a documented field/source per protocol and show the evidence. Keep the category breakdown, but add an assertion that the four buckets sum to the excluded count and test it against the exact sealed snapshot.

### P2 — Reproducibility claims are plausible but not independently demonstrated by this repository

**Files:** `main.ts:1-78`, `lib/model.ts:602-641`, `vendor/makefun-board.ts`; repository tree at the audited commit.

For a fixed snapshot byte sequence, the ranking path is largely deterministic: the board sorts by implied value and slug; the dossier builder canonicalizes JSON; and the dashboard data is serialized from the same in-memory radar object. The dashboard is also genuinely local by inspection: `dashboard/index.html` references local `app.css`, `data.js`, and `app.js`; `app.js` contains no apparent `fetch`, XHR, WebSocket, or external resource request.

However, the repository does not contain the sealed `snapshot.json` or generated `board.json`, `data.js`, or `dossier.json`. The claimed 226 rows, two-run byte identity, dashboard recompute mismatch count, dossier size, and screenshot dimensions/byte sizes therefore remain claims from the commit message rather than independently reproduced results. `liveRows()` also has no slug tie-break when market cap and TVL are equal; it relies on stable preservation of snapshot input order. `main.ts` does not clean an existing output directory before copying files, so stale files can survive if the output directory is reused after the source dashboard or screenshots change.

**Concrete change:** Add a reproducibility script or CI job that receives the exact sealed snapshot, runs `main.ts` twice into two fresh directories, and compares `board.json`, `data.js`, and `dossier.json` byte-for-byte. Assert exactly 226 rows (or derive the expected count from the input contract), unique slugs, ranks 1–N, exact eligible-set coverage, descending implied value, and zero dashboard recompute mismatches. Add a slug tie-break to `liveRows()`. Either clean the output directory before writing or document that the output directory must be empty. Preserve the exact input snapshot and its SHA-256 in the submission evidence so the judge can reproduce the run.

### P3 — Minor model/data hygiene issues

**Files:** `lib/model.ts:239-267`, `lib/model.ts:269-307`, `lib/model.ts:376-400`, `lib/model.ts:644-685`.

- Category keys are compared as exact strings in `categoryMultiples()`, while farm-family matching is case-insensitive substring matching. Normalize categories once (trim/case-fold) and retain the original display label separately; otherwise inconsistent category spelling splits the comparable pool.
- `ageDays()` clamps future listing dates to zero and returns null for malformed dates. The parser accepts any string for `listed_at`; reject malformed/future dates or expose an explicit invalid-data status.
- Chain breadth counts array entries, not distinct verified deployments. Deduplicate chains before calculating the breadth multiplier; otherwise duplicate entries can inflate implied value.
- The model comments say "a zero market cap counts as no market cap", but token classification does not implement that same rule. Clarify the intended meaning and cover it with tests.
- There is no test suite in the tracked repository tree. Add focused unit tests for medians/shrinkage, zero and missing market cap, missing growth, future/malformed dates, duplicate slugs/chains, every farm family, and stable tie-breaking.

## Determinism, coverage, and dashboard checklist

| Check | Independent assessment |
|---|---|
| Board ordering | Deterministic for a fixed snapshot: implied value descending, slug ascending as tie-break. |
| 226-row completeness | Not independently verifiable: the sealed input and generated board are absent from the repository. The code gate does not prove exact eligible-set coverage. |
| Two-run byte identity | Plausible for a fixed input and clean output; not independently rerun without the snapshot. |
| Dashboard recomputation | The formula mirrors the TypeScript arithmetic and uses the row's stored category multiple; the claimed 0 mismatches was not independently executed. |
| Dashboard network references | Pass by static inspection: local script/style references only; no apparent network API calls in `app.js`. |
| Dossier | The vendored builder canonicalizes JSON and enforces caps. The actual generated dossier and screenshot bytes are absent, so the submitted dossier cannot be compared. |
| Farm plan specificity | Category-family variation exists, but entry-action dispatch is incomplete and rewards/cost claims are not evidenced per protocol. |
| README/dossier claims | Several numeric claims are code-derived but depend on the absent snapshot; the parent-product explanation for the remaining 19 is not established by the code/schema. |

## Recommended implementation order for Muse

1. **Fix family/action dispatch and unsafe fallbacks** (`lib/model.ts:406-445`): route entry actions through `familyFor()`; add explicit family actions or a verify-first fallback. This is the clearest direct farm-plan quality defect.
2. **Remove unsupported cost/chain assumptions** (`lib/model.ts:376-396`, `522-558`): no ETH fallback, no invented bridge destination, no fixed universal gas estimate, and distinguish insurance cover from premium.
3. **Strengthen snapshot and board invariants** (`lib/model.ts:644-710`): unique slugs/watchlist, valid dates and TVL, exact eligible-set coverage, and pre-token watchlist validation.
4. **Improve valuation disclosure and robustness** (`lib/model.ts:239-307`, `README.md:25-37`, `dashboard/app.js:265-290`): describe market-cap/TVL as a proxy, show sample size/dispersion, expose missing growth, and stop calling listing age protocol maturity without evidence.
5. **Reproduce the submitted artefacts** (`main.ts` plus CI/evidence): run from the exact sealed snapshot into two clean output directories; archive input hash and compare all generated bytes.
6. **Correct unsupported exclusion narrative** (`lib/model.ts:1-8`, `dashboard/app.js:308-320`, `README.md:18-23`): do not claim the other 19 are parent products unless source evidence is added.

## Audit boundary and temporal note

This review is against the GitHub source at the stated commit, not against the private/competition-side submission payload. No source code was modified. The user-supplied "final result: 28 December 2026" date is later than this audit date (15 November 2026); it should be described as a scheduled/future result date, not as an already-finalized result, unless the competition record establishes otherwise.

**Bottom line:** the submission has a coherent, deterministic architecture and a genuinely offline dashboard. Its strongest remaining weaknesses are the mismatch between family classification and entry actions, ungrounded execution costs/chain assumptions, and an implied-value model whose precision exceeds the evidence behind its proxies. Address those before polishing the presentation further.
