# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nusasaputrarama-max/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nusasaputrarama-max/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols of the DefiLlama snapshot by a comparable-multiple implied value — every protocol on the watchlist plus the early ones below its floor — each with a farm plan, in a dashboard that runs with no network.

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

63 pre-token protocols at or above the floor are **not** ranked: the watchlist leaves them out as bridges, liquid-staking or restaked products, or products of a parent protocol, so they are not standalone launches. The dashboard says so, with the counts.

## The model (radar-3)

Implied value is a comparable-multiple valuation, computed from the snapshot itself — no protocol name is ever special-cased:

```
implied = round( tvl_usd x category_multiple x growth_mult x maturity_mult x breadth_mult )
```

- **Category multiple** — the median market-cap / TVL of the live-token protocols in the same category, shrunk toward the global median (0.24x) with a prior of 6 protocols, clamped to [0.02, 1.25]. A category with fewer than two live comparables takes the global median outright, because one observation cannot set a price. A zero market cap counts as no market cap.
- **Growth** — the 7-day TVL change, clamped to [-60%, +120%]. A falling TVL discounts more (0.70 per point) than a rising one adds (0.50 per point).
- **Maturity** — 0.70 + 0.30 × min(age, 1460 days) / 1460. A protocol that has run longer with no token carries more pent-up launch value. Unknown age counts as 365 days.
- **Breadth** — 1 + 0.02 per extra chain, to 1.20. Each additional chain is distribution surface for a launch.

Every row also carries a six-step farm plan derived from its own category, chains, TVL and age: the entry action, a weekly action, a hold, a rewards check and a log — each fitted to the protocol's category family (lending, DEX, bridge, staking, and so on), plus what it costs and how long it takes. The dashboard recomputes each row from the same figures, so the page and `board.json` carry the same arithmetic.

## The dashboard

`dashboard/` is a static page (no framework, no network): a sortable, filterable board, a detail view for every protocol with its model breakdown and farm plan, a live-token tab that shows the comparables at market value, and the model stated in full. Open `out/dashboard/index.html` after a run, or serve `out/` over any static server.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
