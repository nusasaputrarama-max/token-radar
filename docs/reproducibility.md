# Reproducing the submitted board

The sealed snapshot is **not** committed to this repository. The board this entry
submits was built from the competition kit's `input/snapshot.json`:

- SHA-256: `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`
- 758 protocols, 40 on the watchlist, floor $50,000,000, as of 2026-11-14
- Source: the DefiLlama protocol index, as sealed in the competition snapshot

## Rebuild

```sh
sh scripts/rebuild.sh /path/to/snapshot.json
```

The script runs `main.ts` twice into two fresh output directories and compares
`board.json`, `data.js` and `dossier.json` byte-for-byte. It then checks the board:

- 226 rows: 40 watchlist + 186 early (every rankable pre-token protocol below the floor)
- ranks exactly 1–226, implied values non-increasing, slugs unique
- the exact eligible set: watchlist plus every rankable pre-token protocol below
  the floor, each exactly once — no missing rows, no extra rows
- farm steps 3–12 per row, each 20–600 characters
- 63 pre-token protocols at or above the floor set aside: 24 bridges, 18
  liquid-staking, 2 restaked BTC, 19 excluded by the watchlist rule
- 24 live-token protocols shown at market value; token metadata present but
  unpriced is listed separately, never called "already trades"

## What is stable across revisions

The board's slug, rank and implied value per row are the entry's stable output:
revisions may add disclosure fields and rewrite farm-plan text, but the numbers
do not move without a new submission. Verify a rebuild against the previous
board with:

```sh
node -e "
const a = JSON.parse(require('fs').readFileSync('old/board.json', 'utf8')).rows;
const b = JSON.parse(require('fs').readFileSync('new/board.json', 'utf8')).rows;
let n = 0;
for (let i = 0; i < a.length; i++) {
  if (a[i].slug !== b[i].slug || a[i].rank !== b[i].rank || a[i].implied_value_usd !== b[i].implied_value_usd) n++;
}
console.log(a.length === b.length ? 'rows: ' + a.length : 'ROW COUNT DIFFERS', 'slug/rank/implied mismatches:', n);
"
```

## Notes

- `main.ts` cleans its generated paths (`board.json`, `data.js`, `dossier.json`,
  `dashboard/`, `screenshots/`) inside the output directory before writing, so a
  stale file can never survive into a run's output.
- The dossier text is capped at 65,536 UTF-8 bytes by the vendored builder; the
  cap shapes the text, the other caps only refuse.
- Node 22 or later, standard library only, nothing to install.
