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

## Independent follow-up — v2.8 review of PR #5 (2026-11-18)

**Reviewed branch:** `muse/audit-v26-fixes`  
**Head:** `a3e7c1fb07a8df636372c03a75c0157e2d3b06ac`  
**Base:** `main` at `9e6d5bb07648d59ccd1258665037de52a4a303dd`  
**Review:** `docs/GPT_AUDIT_V28_2026-11-18.md`  
**PR:** #5, OPEN and not merged.

### v2.6 changes confirmed in source

- Future and non-string non-null `listed_at` values are rejected.
- Negative finite market caps normalize to `null` rather than hard-failing. This is a documented deviation because the PR/report says the sealed snapshot contains one negative-cap record with token metadata. The snapshot itself was not available for independent inspection.
- CEX exclusion now uses one normalized predicate across rankability, comparables, and live rows.
- `boardIssue()` binds rank to row position and enforces slug order for equal implied values.
- The output-path threat model now documents the residual TOCTOU interval and trusted-group assumption. The race is not fixed.

### Remaining findings and blockers

1. **Board gate residual (P2):** `buildBoard()` checks watchlist rankability and the TVL floor, but `boardIssue()` only checks that watchlist rows exist and are pre-token. Add the same rankability/floor invariants to the gate and direct negative tests.
2. **Farm-plan wording (P1/P2, carried from v2.7):** the chain entry and weekly steps still recommend keeping a small balance active. Step costs still state TVL-derived `$50/$100/$200` capital without an illustrative/non-prescriptive label. Existing tests do not catch these phrases.
3. **CI (BLOCKED):** `.github/workflows/ci.yml` and the synthetic-snapshot workflow helper are not in the branch. The PR/report records a rejected push because the OAuth token lacks `workflow` scope. PR-head status checks and workflow runs are empty.
4. **Independent verification (BLOCKED):** the sealed snapshot is not in the repository. A shallow clone attempt failed before checkout because `github.com` DNS could not be resolved. No tests or rebuild were run by the reviewer. The PR's 76/76 and byte-identity results remain implementer-reported.
5. **Growth/maturity (PARTIAL):** sensitivity analysis exists, but model constants remain uncalibrated; no owner decision authorizes a model change.
6. **Accessibility (NOT TESTED):** keyboard, screen-reader, and manual-device pass remains outstanding.
7. **Output-path security (PARTIAL):** residual check-then-use TOCTOU and group-trust assumptions are documented, not eliminated.
8. **Muse identity/access (BLOCKED):** PR #5 and the latest commit are attributed to `nusasaputrarama-max`; collaborator lookup reports `muse=read` and `muse-ai=none`. The branch prefix does not prove Muse authorship or write access.

### Review notes

- Dashboard static isolation passed: only local HTML assets are referenced; no runtime network primitives or external CSS URLs were found in static source scans. No browser runtime test was run.
- Source contains 66 model test cases (38 literal declarations plus 28 generated family-fixture cases) and 10 output-path cases. Six model tests are conditional on the sealed snapshot. The claimed 76/76 run was not independently reproduced.
- `scripts/rebuild.sh` performs two fresh runs and byte-compares the three generated artefacts, but its claimed 226-row sealed-snapshot result was not independently reproduced.

**Status:** ACCEPTANCE OPEN. Keep PR #5 unmerged pending the findings above. No deployment, resubmission, token launch, transaction, or spending is authorized by this review.


---

## Independent follow-up — v2.9 review of current PR #5 head (2026-11-18)

**Reviewed branch:** `muse/audit-v26-fixes`  
**Current head:** `830525b62ad893cfb40ca91111a79098e2f07daf`  
**Previously reviewed head:** `a3e7c1fb07a8df636372c03a75c0157e2d3b06ac`  
**Base:** `main` at `9e6d5bb07648d59ccd1258665037de52a4a303dd`  
**Audit:** `docs/GPT_AUDIT_V29_2026-11-18.md`  
**PR:** #5, OPEN and not merged.

### v2.8 findings updated

1. **Board gate watchlist eligibility — SOURCE FIX PRESENT.** `boardIssue()` now independently requires each watchlist member to exist, be pre-token, pass `isRankable()`, and meet the TVL floor. New direct negative tests cover CEX, versioned, and below-floor cases. Reviewer-side test execution remains outstanding.
2. **Farm-plan wording — SOURCE FIX PRESENT.** Chain entry and weekly steps no longer recommend keeping a small balance active. Dollar-denominated capital cost fields explicitly label the $50/$100/$200 bands illustrative and not recommendations. A new test checks all 28 family fixtures and all six rendered steps. Reviewer-side execution remains outstanding.

### Evidence and blockers retained

- PR #5 current head is four commits ahead of the v2.8 reviewed head; only commit `3a7a413` changes application logic/tests in this delta. PR #5 is nine commits ahead of main and remains OPEN.
- The source contains 78 test cases (68 model, including 28 generated family fixtures, plus 10 output-path). The remediation report claims 78/78 pass; this reviewer did not run tests. A shallow clone failed before checkout because `github.com` DNS could not be resolved.
- The sealed snapshot is not in the repository. `scripts/rebuild.sh` is structured for two-run byte comparison and 226-row checks, but no sealed-snapshot rebuild or board/hash comparison was independently run.
- Dashboard static isolation remains PASS: local asset references only and no network primitives/external CSS URL found in static scans. Dashboard blob SHAs match main. No browser runtime/accessibility pass was run.
- CI remains BLOCKED: no workflow file, no synthetic-snapshot helper, no combined status checks, and no PR workflow runs. The documented missing `workflow` token scope remains unresolved.
- Growth/maturity calibration remains OPEN/PARTIAL; model constants are unchanged and no owner decision authorizes recalibration.
- Accessibility keyboard, screen-reader, and manual-device checks remain NOT TESTED.
- Output-path security remains PARTIAL: trusted-group assumption and residual check-then-use TOCTOU remain; current tests do not exercise a concurrent swap after the final per-entry check.
- Negative market-cap handling still normalizes a negative value to null rather than hard-rejecting it. The cited sealed-snapshot example was not independently inspected.
- PR #5 and its commits are authored/committed by `nusasaputrarama-max`; collaborator lookup remains `muse=read`, `muse-ai=none`. Do not attribute the batch to Muse without identity/permission evidence.
- PR #5 description and the v2.8 remediation-report head metadata are stale. PR #6 is based on the old `a3e7c1f` revision and has diverged from the current PR #5 branch; reconcile it rather than merging blindly.

**Status: ACCEPTANCE OPEN.** Keep PR #5 unmerged pending independent tests/rebuild evidence, CI, accessibility, the remaining security/calibration decisions, and attribution clarity. No deployment, resubmission, token launch, transaction, or spending is authorized.


---

## Administrative status refresh — 2026-11-18 22:19 Asia/Jakarta

This refresh records repository/PR metadata only. No application-code change has occurred since PR #5 head `830525b62ad893cfb40ca91111a79098e2f07daf`.

- **PR #5 description hygiene — RESOLVED:** the current PR body (updated 2026-11-18 04:15 UTC) now identifies head `830525b`, all nine commits, the v2.6/v2.8 implementation scope, the 78-test and rebuild claims, and the outstanding blockers. This supersedes the v2.9 note that the PR description was stale.
- **PR #6 retirement — RESOLVED:** PR #6 was closed without merge at 2026-11-18 12:49:54 UTC. Its stale/diverged branch must not be merged. The historical audit files remain evidence, not an active merge path.
- **v2.8 remediation-report metadata — OPEN:** `docs/MUSE_REMEDIATION_REPORT_V28_2026-11-18.md` still identifies `a3e7c1f` as its audited head even though it describes the later implementation commit `3a7a413`. The report should be corrected or explicitly labelled as a report of the pre-fix review plus subsequent handback; do not treat the stale header as exact-head provenance.
- **Implementation delta — NONE:** PR #5 remains OPEN and unmerged at `830525b`, nine commits ahead of main `9e6d5bb). The current PR #7 branch adds only `docs/GPT_AUDIT_V29_2026-11-18.md` and this handoff update; it contains no application-code, dashboard, test, model-constant, or generated-output changes.
- **Evidence status unchanged:** PR #5 has no combined status checks or PR workflow runs; PR #5/#7 have no review submissions, inline review threads, or new comments. Collaborator lookup remains `muse=read`, `muse-ai=none`. The 78/78 test and sealed-snapshot rebuild results remain implementer-reported; no test or rebuild was executed by this reviewer in this refresh.
- **Outstanding acceptance items:** CI/workflow permission, independent 78-test and sealed-snapshot reproduction, growth/maturity calibration decision, accessibility testing, residual output-path TOCTOU/trusted-group assumption, independent confirmation of the negative-market-cap snapshot exception, and implementer identity/access remain OPEN, PARTIAL, NOT TESTED, or BLOCKED as described in v2.9.

**Disposition remains ACCEPTANCE OPEN.** No merge, deployment, make.fun resubmission, token launch, transaction, purchase, funds movement, or spending is approved by this administrative refresh.
