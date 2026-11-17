# Muse Handoff — Token Radar v2 Audit Remediation

**Repository:** nusasaputrarama-max/token-radar  
**Baseline audited:** e26f0af50ec6639099a39ec8a0da4d65370bdd75  
**Independent review:** docs/gpt-review-2026-11-15.md  
**Status:** IMPLEMENTATION REQUESTED — Muse owns code changes.

## Instruction

Read the complete independent review at `docs/gpt-review-2026-11-15.md`. Implement the findings in priority order, using small, reviewable commits. Do not merely acknowledge the report. For every finding, either fix it with tests or record a precise evidence-backed reason why it cannot safely be fixed.

## Required implementation order

1. Fix farm-plan entry-action dispatch. Make entry action selection use the same canonical family classification as weekly, claim, and log actions. Add explicit safe actions for all supported families. Where the snapshot cannot establish a valid product/action/asset, use a verify-first instruction rather than inventing a deposit.
2. Remove unsupported execution assumptions. Do not default unknown chains to ETH, infer bridge destination from array position, or claim fixed universal gas costs. Separate capital, collateral, insurance cover, premium, and transaction fees. Add appropriate risk warnings for leverage, prediction markets, borrowing, insurance, and RWA.
3. Strengthen snapshot and board invariants. Validate unique protocol slugs and watchlist entries, valid dates, positive TVL, normalized/deduplicated chains, valid watchlist membership, unique board rows, and exact eligible-set coverage. Make the board gate prove completeness rather than only checking that watchlist entries are present.
4. Improve valuation honesty and robustness. Describe market-cap/TVL as a comparable proxy, expose comparable sample size and dispersion, handle missing growth distinctly from zero, identify listing age accurately, and add sensitivity tests for growth/maturity assumptions.
5. Reproducibility. Use the exact sealed competition snapshot if available. Run the generator twice into fresh output directories and compare board.json, data.js, and dossier.json byte-for-byte. Record the snapshot SHA-256 and test evidence. Do not claim 226 rows or byte identity unless the run proves it.
6. Correct unsupported exclusion explanations. Remove parent-product/venue assertions unless the snapshot or an explicit source-backed relationship supports them.

## Engineering requirements

- Preserve the submitted baseline and avoid silently changing competition outputs without documenting the model-version impact.
- Add automated tests for every changed behavior, including each farm-plan family and malformed/duplicate input cases.
- Keep dashboard assets local. Do not introduce runtime network dependencies into the dashboard.
- Keep output deterministic. Add stable tie-breakers wherever sorting can otherwise inherit input order.
- Do not fabricate protocol-specific capabilities, supported assets, bridge routes, points programmes, rewards pages, or gas costs.
- Do not expose secrets, credentials, private keys, or API tokens in commits or logs.
- Do not deploy, publish, launch tokens, spend funds, or make production changes as part of this remediation.

## Required handback evidence

After implementation, commit:
- the code and tests;
- an updated `docs/MUSE_REMEDIATION_REPORT.md` mapping each finding to changed files/lines, commit hashes, test commands, and actual results;
- reproducibility evidence where the sealed input is available;
- an explicit list of unresolved findings and blockers.

If a required input or capability is unavailable, continue with safe independent tasks, record the blocker and attempted alternatives, and do not fabricate completion. Do not stop the remediation loop merely because one finding is blocked.

## Review loop

Treat `docs/gpt-review-2026-11-15.md` as the initial audit baseline. After each implementation batch, provide the diff and test evidence in GitHub for independent review. ChatGPT will review the new commit and return additional findings or a closure assessment. Repeat until all findings are either verified closed or explicitly documented as blocked. A finding is not closed merely because code was changed; it requires relevant test evidence and a reviewable diff.

**Authority boundary:** Muse may implement repository code changes within this task. ChatGPT's role is independent review and audit documentation; it must not silently implement application code or claim tests it did not run. Production/deployment and token-launch actions remain outside this authorization.

---

## Handback — implementation complete (2026-11-15)

**Implementation commit:** `234899af2795823d82c63882a6a3d15a6cb3c4e5` (model radar-4),
on top of `bee5190`. Author and committer
`nusasaputrarama-max <353745658+nusasaputrarama-max@users.noreply.github.com>`
(verified with `git log -1 --format='%ae %ce'` before push). Pushed to origin main.

**Full per-finding mapping:** `docs/MUSE_REMEDIATION_REPORT.md`.

**Per-finding status (summary):** P1 valuation-proxy qualification — FIXED.
P1 growth/maturity calibration — PARTIAL (missing-growth explicit state, listing-age
wording, "pent-up" removed; weights unchanged by the board-identity constraint, no
growth-removal sensitivity test). P1 farm entry dispatch — FIXED (single `familyFor()`
source, explicit actions or verify-first; 24 verify-first rows; no row reaches the
generic fallback). P1 costs/gas/destination — FIXED (explicit gas map, no silent ETH
default, no inferred bridge destination, no fixed gas dollars). P1 snapshot/board
validation — FIXED (unique slugs/watchlist, valid dates, positive TVL, chain dedup,
exact eligible-set coverage, pre-token watchlist check). P2 live/unpriced semantics —
FIXED (live tab 24 priced rows only; 283 unpriced shown separately). P2 exclusion
narrative — FIXED (no parent-product claim; buckets asserted to sum to 63). P2
reproducibility — FIXED (`scripts/rebuild.sh`, `docs/reproducibility.md`, output dir
cleaned, slug tie-break). P3 hygiene — FIXED (category normalization, age/date states,
chain dedup, zero-mcap rule, 45-test suite).

**Verification results (final tree):**

- Unit tests: `node --test tests/model.test.mjs` → 45/45 pass.
- Determinism: `scripts/rebuild.sh` → board.json, data.js, dossier.json byte-identical
  across two fresh runs; 226 rows, ranks 1–226, implied non-increasing, watchlist
  40/40, 186 early.
- Board identity vs v2 baseline (sha256
  `43a80608cc169ca15b8805e6f5b9dc8701b4e60e4f21891aa64f51bbed872730`):
  slug/rank/`implied_value_usd` **0 mismatches over 226 rows**.
- Farm distinct counts steps 1–6: 48 / 226 / 226 / 7 / 226 / 14; every row 6 steps.
- Dossier text 37,455 chars (cap 65,536); dashboard 0 `http://` refs.
- Dashboard recompute (`impliedOf` from `app.js` vs `data.js`): 0 mismatches, 226 rows.
- Screenshots: 4 real headless-Chrome renders at 1440×900, all ≤512 KiB, visually checked.
- Sealed snapshot SHA-256:
  `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`
  (758 protocols, 40 watchlist).

**Remaining risks:** (1) growth/maturity weights uncalibrated by design — recalibration
would break v2 board identity and needs a deliberate decision; no growth-removal
sensitivity test exists. (2) FDV sensitivity cannot be computed — the snapshot carries
no FDV. (3) Farm actions are family-level, not protocol-verified against live sources.
(4) The sealed snapshot is not in the repo; reproduction needs the kit input above.
(5) No screen-reader or manual device pass on the dashboard changes.

**Not done (out of scope for this commit):** no make.fun submission — v2 remains the
live entry and resubmission needs Rama's approval of this exact commit; no transcript
bundle (main agent bundles later). The already-pushed `bee5190` commit was not
rewritten or force-pushed.



---

## Independent follow-up — 2026-11-17 (GPT audit v2.7)

**Audited main:** `9e6d5bb07648d59ccd1258665037de52a4a303dd`  
**Compare from prior reviewed main:** `3b61c7d` → main, 8 commits ahead / 0 behind.  
**Audit:** `docs/GPT_AUDIT_V27_2026-11-17.md`.

The new batch materially improves verify-first farm wording, Yield Aggregator classification, normalized chain deduplication, growth/maturity sensitivity diagnostics and output-path protection. The diagnostic is not a model recalibration; constants and the submitted board remain unchanged.

**Acceptance remains OPEN. Concrete unresolved items:**

1. `parseSnapshot()` still accepts future `listed_at` values, silently maps non-string dates to null, and retains finite negative market caps. Reject future dates relative to `as_of`, invalid non-null date types and negative market caps with parser-level tests.
2. `boardIssue()` checks that sorted rank values are contiguous, but does not bind `board[i].rank` to `i + 1` or enforce ascending slug for equal implied values. Add both invariants and negative fixtures.
3. CEX exclusion still compares raw category strings in `isRankable()` and live-comparable selection. Normalize category before excluding CEX; add case/whitespace tests.
4. Farm plans are only partially non-transactional: the chain entry/weekly wording still recommends keeping a small balance active, and step costs still show TVL-derived $50/$100/$200 capital amounts without an explicit illustrative/non-prescriptive label. Extend tests to inspect all six steps and cost fields.
5. Output cleanup is materially safer but not atomic: the interval between `assertSafeCleanupTarget()` and `rmSync()` remains. Group-writable directories are accepted only under a trusted-group assumption. Keep this limitation explicit and run under a private/exclusively controlled parent.
6. Growth/maturity sensitivity is implemented and reported, but calibration remains a separate owner decision. Do not alter constants or the submitted ranking without explicit approval.
7. The remediation report claims 69/69 tests and sealed-snapshot rebuild evidence; this audit could not independently rerun tests because GitHub clone failed DNS, and the sealed input is not in the public repository. CI is still absent, main is unprotected, and manual accessibility testing is not done.

**Attribution/access blocker:** GitHub lists `nusasaputrarama-max` as author and committer for all eight commits in the new range. Muse's repository permission remains `read`. Do not attribute this batch to Muse or assume Muse can push until identity and write access are independently resolved.

See the v2.7 audit for exact source-level evidence and verification limits. No application code was changed by this audit. No deployment, resubmission, token launch, transaction, signing, purchase, funds movement or spending is authorized.
