# Muse Remediation Report — GPT Audit v2.8 Follow-up (PR #5)

**Repository:** `nusasaputrarama-max/token-radar`
**Audited change:** PR #5, branch `muse/audit-v26-fixes`, head `a3e7c1fb07a8df636372c03a75c0157e2d3b06ac`
**Audit:** `docs/GPT_AUDIT_V28_2026-11-18.md` (ChatGPT, 2026-11-18)
**Implementation branch:** `muse/audit-v26-fixes` (same PR #5 branch; the audit reviews
this PR, so its fixes land on the PR, not on main)
**Identity:** author and committer `nusasaputrarama-max <353745658+nusasaputrarama-max@users.noreply.github.com>`
(verified with `git log -1 --format='%ae %ce'` before push)
**Date:** 2026-11-18
**Status:** The two code findings are FIXED. CI, independent reproduction, calibration
and accessibility remain BLOCKED / OPEN as the audit records them — none of those is
claimed fixed here. Nothing in this batch changes a board slug, rank or implied value:
verified 0 moves over 226 rows against the `main` baseline (see Verification).

## Per-finding status

### P2 — Board gate still delegates watchlist eligibility to the builder — FIXED

- `lib/model.ts` (`boardIssue`) — the watchlist loop now independently requires
  `isRankable(p)` and `p.tvl_usd >= snapshot.floor_usd`, with the same messages
  `buildBoard()` uses. A crafted board/snapshot pair can no longer pass the gate
  with a CEX/versioned or below-floor watchlist member.
- Tests: `tests/model.test.mjs` — `boardIssue: a CEX, versioned or below-floor
  watchlist member fails the gate directly`. Builds a valid board, then presents
  the same board against three crafted snapshots (CEX category, `Alpha V2`
  versioned name, TVL below the $50,000,000 floor); each fails the gate with the
  expected message, and the unmodified snapshot still passes.

### P1/P2 — v2.7 farm-plan wording remains unresolved — FIXED

- `lib/model.ts` (`actionFor`, chain case) — the "then use it and keep a small
  balance active on its chain" instruction is removed. The step is now
  verification-only: verify what one app built on the chain supports, a chain
  itself takes no deposits, do not move funds until the app shows support.
- `lib/model.ts` (`weeklyFor`, chain case) — the "use one app … and keep a small
  balance active" instruction is removed; the weekly step now re-checks the app
  and confirms what it supports before doing anything.
- `lib/model.ts` (`farmSteps`) — the TVL-derived capital bands ($50/$100/$200) are
  now labelled in both cost fields that state them: step 2 costs
  "$N illustrative example capital, not a recommendation", the hold step costs
  "the $N figure is an illustrative example, not a recommendation". The numbers
  are unchanged; only the label is added, so no board rank or value moves.
  `capitalFor` carries the same "illustrative example amounts only, not a
  recommendation" note.
- Tests: `tests/model.test.mjs` — `farmSteps: no balance recommendation anywhere;
  capital is illustrative, never prescriptive`. Asserts across all 28 family
  fixtures that no rendered step or cost mentions keeping a small balance, that
  every cost field stating a dollar figure labels it illustrative and
  non-prescriptive, and that the chain family's entry/weekly steps are
  verify-first with no balance instruction.

### P1 — CI is blocked; no GitHub CI evidence exists — BLOCKED (not fixed here)

The workflow push was rejected because the OAuth token lacks `workflow` scope
(recorded in `a3e7c1f`). No credential with that scope is available to this
implementation run, so `.github/workflows/ci.yml` is still absent from the branch
and the PR head still has no workflow run. An authorized owner/credential path
must add the workflow; do not treat the CI item as complete before a real PR
workflow run exists.

### P1 — Test and sealed-snapshot results not independently reproduced — PARTIAL

The sealed snapshot is not in the repository and was not available to the v2.8
reviewer. What this run did reproduce locally, from the kit's sealed snapshot:
`node --test tests/model.test.mjs tests/output-path.test.mjs` passes 78/78
(76 baseline + 2 new), and `sh scripts/rebuild.sh` runs `main.ts` twice with
byte-identical `board.json`, `data.js` and `dossier.json`, 226 rows, ranks 1–226,
implied values non-increasing, watchlist covered, 186 early rows. The v2.8
reviewer's non-reproduction stands as an independent-verification gap: a
reviewer-side run is still outstanding.

### P2 — Growth/maturity calibration and accessibility remain open — OPEN

- Model constants are UNCHANGED; the test asserting `MODEL` equals the radar-3
  constants still passes. No calibration decision is evidenced and none is made
  here — changing constants would move implied values and break the submitted
  board's identity.
- Keyboard, screen-reader and manual-device pass remains NOT TESTED; it needs a
  manual pass, not a code change.

### P2 — Output-path security remains partial — PARTIAL (documented, unchanged)

The residual check-then-use TOCTOU window and trusted-group assumption are
documented in `docs/output-path-threat-model.md` (v2.6). No redesign is attempted
in this batch; the status stays PARTIAL/BLOCKED as the audit records it.

### Attribution and access blocker — noted

PR #5 is opened under `nusasaputrarama-max` and this batch is committed under the
same noreply identity. The audit's collaborator lookup (`muse` read,
`muse-ai` none) is unchanged by this batch; write access runs through the
owner's token as before. Do not attribute the batch to Muse or assume Muse can
push until the actual account and write permission are verified.

## Verification

- `node --test tests/model.test.mjs tests/output-path.test.mjs`: 78/78 pass
  (76 baseline + 2 new: the board-gate test and the farm-plan wording test).
- `sh scripts/rebuild.sh <sealed snapshot>`: two runs byte-identical for
  `board.json`, `data.js`, `dossier.json`; 226 rows, ranks 1–226, implied
  non-increasing, watchlist covered, 186 early, farm steps in range.
- Board diff against `main` (`9e6d5bb`) build: 0 rank/order moves, 0 implied-value
  moves, `dossier.json` identical. 457 of 1,356 farm-step strings changed, all
  confined to wording: step-2 and hold cost labels on all 226 rows, plus the
  chain-family entry/weekly text on the chain rows. Longest rendered step is 529
  characters — no `stepText` truncation.
- `node cli/makefun.mjs check --kit . --repo <repo> --transcripts
  token-radar-bundle-v3.tar.gz`: 12 passed, 0 failed, 6 skipped, 5 checked at
  submission (repo-public / repo-owner / repo-created-after-open /
  commit-in-repo / duplicate-snapshot — server-side at submission time, and the
  checked commit is not yet pushed at check time).

## Not authorized by this batch

No merge of PR #5, no deployment, no make.fun resubmission, no token launch, no
signing, transaction, purchase, funds movement or spending. Merge and any
resubmission still need Rama's explicit approval of the exact commit.
