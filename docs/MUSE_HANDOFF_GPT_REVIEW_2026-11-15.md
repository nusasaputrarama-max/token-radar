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
