# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nusasaputrarama-max/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nusasaputrarama-max/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols of the DefiLlama snapshot by a snapshot-based comparable proxy — every protocol on the watchlist plus the early ones below its floor — each with a farm plan, in a dashboard that runs with no network. The proxy is not a token valuation, not a price, and not a prediction that a token will be issued.

## Run it

```sh
curl -sSL "https://make.fun/c/token-radar-01/kit" | tar xz
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

`main.ts` reads the sealed snapshot, writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Node 22 or later, standard library only, nothing to install. Run it twice and the outputs are byte-identical.

## What it ranks

The snapshot holds 758 protocols at or above $5M TVL, as of 2026-11-14. The board ranks 226 of them:

- **40 watchlist protocols** — at or above the $50M floor with no token on record.
- **186 early protocols** — every rankable pre-token protocol below the floor, not just the largest few.

63 pre-token protocols at or above the floor are **not** ranked: the watchlist leaves them out. By their own category, 44 of the 63 are bridges, liquid-staking or restaked products — 24 bridges, 18 liquid-staking and 2 restaked BTC — among them Base Bridge, Binance staked ETH and CCIP. The other 19 are excluded by the supplied watchlist rule; the snapshot fields do not establish why, so no reason is claimed for them. The dashboard says so, with the counts.

## The model (radar-5)

Implied value is a snapshot-based comparable proxy, computed from the snapshot itself — no protocol name is ever special-cased. Market cap is not enterprise value, and TVL measures assets deposited, not value accruing to a token; the number is a proxy for ranking, not a valuation. The snapshot carries no FDV, so the proxy uses circulating market cap; an FDV/TVL sensitivity cannot be computed from these fields, and the two measures are never mixed. A zero market cap counts as no market cap (unpriced, not live). Radar-5 keeps radar-4's valuation arithmetic exactly — the same multiples, growth, maturity and breadth, so the board's slug, rank and implied value do not move — and changes only the farm plans, the family classifier, chain deduplication and the output-path guard.

```
implied = round( tvl_usd x category_multiple x growth_mult x maturity_mult x breadth_mult )
```

- **Category multiple** — the median market-cap / TVL of the live-token protocols in the same category, shrunk toward the global median (0.24x) with a prior of 6 protocols, clamped to [0.02, 1.25]. A category with fewer than two live comparables takes the global median outright, because one observation cannot set a price. A zero market cap counts as no market cap. Each multiple carries its sample size, its median and its interquartile range; the dashboard marks multiples that rest on the global median or on highly dispersed comparables (IQR above the median) as low confidence.
- **Growth** — the 7-day TVL change, clamped to [-60%, +120%]. A falling TVL discounts more (0.70 per point) than a rising one adds (0.50 per point). A missing 7-day change is an explicit state: the proxy treats it as 0, and the dashboard says so.
- **Time since listing** — 0.70 + 0.30 × min(age, 1460 days) / 1460, where age is the time since the protocol was first listed on DefiLlama. A listing date is not necessarily the launch date. Unknown age counts as 365 days.
- **Breadth** — 1 + 0.02 per extra chain, to 1.20. Each additional chain is distribution surface for a launch. Chain labels are deduplicated on a normalized key (trim + case-fold), so a cosmetic variant cannot inflate it.
- **Sensitivity** — `node scripts/sensitivity.mjs <snapshot.json>` rebuilds the ranking with the growth and/or maturity multiplier neutralized to 1.0 and reports rank movement (median, p90, max, top-10/25/50 membership changes); the numbers for the sealed snapshot are in `docs/sensitivity-2026-11-17.md`. Diagnostic only: the submitted model is unchanged.

Every row also carries a six-step farm plan derived from its own category, chains, TVL and age: a fresh wallet, a verify-first entry action, a weekly re-check, a hold, a rewards check and a log — each fitted to the protocol's category family (lending, DEX, bridge, staking, and so on), plus what it costs and how long it takes. No step instructs a deposit, trade, mint, borrow, bridge, stake, spend or claim: the snapshot lists no supported assets, pools, vaults, routes or rewards programmes for any protocol, so every plan starts by verifying on the official app and says plainly not to act until the app shows an action is supported; the rewards step only asks whether a programme exists at all. Entry actions route through one family classifier, so no family falls through to a deposit its product cannot take. Network fees are variable — no step states a fixed gas dollar amount, and an unknown fee asset is named as unverified, never guessed. The dashboard recomputes each row from the same figures, so the page and `board.json` carry the same arithmetic.

## Reproducibility

The sealed snapshot is not committed to this repository. The build that produced the submitted board ran from the competition kit's `input/snapshot.json`, SHA-256 `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`. To reproduce it:

```sh
sh scripts/rebuild.sh /path/to/snapshot.json
```

The script runs `main.ts` twice into two fresh output directories and compares `board.json`, `data.js` and `dossier.json` byte-for-byte, then checks the board: 226 rows, ranks 1–226, implied values non-increasing, unique slugs, and the exact eligible set (watchlist plus every rankable pre-token protocol below the floor). The board's slug, rank and implied value are the entry's stable output across revisions.

## Tests

```sh
node --test tests/model.test.mjs tests/output-path.test.mjs
```

Focused unit tests for the model (medians and shrinkage, zero and missing market cap, missing growth, future and malformed dates, duplicate slugs and chains, every farm family, stable tie-breaking, growth/maturity sensitivity) and for the output-path guard (unsafe shapes, ownership/mode fail-closed checks, adversarial race simulations). The snapshot-dependent tests read the sealed snapshot from `MAKEFUN_SNAPSHOT` (default: the kit's `input/snapshot.json`) and skip when it is absent. `node scripts/sensitivity.mjs <snapshot.json>` prints the growth/maturity rank-sensitivity report.

## The dashboard

`dashboard/` is a static page (no framework, no network): a sortable, filterable board, a detail view for every protocol with its model breakdown and farm plan, a live-token tab that shows the comparables at market value, and the model stated in full. Open `out/dashboard/index.html` after a run, or serve `out/` over any static server.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
