#!/bin/sh
# Rebuild the board twice from the sealed snapshot and compare byte-for-byte.
# Usage: sh scripts/rebuild.sh /path/to/snapshot.json
# The snapshot itself is never committed to this repository.
set -e
cd "$(dirname "$0")/.."

SNAPSHOT="${1:-${MAKEFUN_SNAPSHOT:-}}"
if [ -z "$SNAPSHOT" ]; then
  echo "usage: sh scripts/rebuild.sh /path/to/snapshot.json" >&2
  exit 2
fi
if [ ! -f "$SNAPSHOT" ]; then
  echo "rebuild: no snapshot at $SNAPSHOT" >&2
  exit 2
fi

OUT1="$(mktemp -d)/run1"
OUT2="$(mktemp -d)/run2"
mkdir -p "$OUT1" "$OUT2"

MAKEFUN_OUTPUT_DIR="$OUT1" node main.ts --input "$SNAPSHOT"
MAKEFUN_OUTPUT_DIR="$OUT2" node main.ts --input "$SNAPSHOT"

for f in board.json data.js dossier.json; do
  cmp -s "$OUT1/$f" "$OUT2/$f" || { echo "rebuild: $f differs between runs" >&2; exit 1; }
done
echo "rebuild: board.json, data.js and dossier.json are byte-identical across two runs"

node - "$OUT1/board.json" "$SNAPSHOT" <<'EOF'
const fs = require('fs');
const board = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).rows;
const snap = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const fail = (m) => { console.error('rebuild: ' + m); process.exit(1); };
if (board.length !== 226) fail('board has ' + board.length + ' rows, expected 226');
const slugs = new Set(board.map((r) => r.slug));
if (slugs.size !== board.length) fail('board has duplicate slugs');
board.forEach((r, i) => { if (r.rank !== i + 1) fail('rank ' + (i + 1) + ' is ' + r.rank); });
for (let i = 1; i < board.length; i++) {
  if (board[i].implied_value_usd > board[i - 1].implied_value_usd) fail('row ' + (i + 1) + ' outranks row ' + i);
}
for (const s of snap.watchlist) if (!slugs.has(s)) fail('board misses watchlist slug ' + s);
const early = board.filter((r) => !snap.watchlist.includes(r.slug)).length;
if (early !== 186) fail('board has ' + early + ' early rows, expected 186');
for (const r of board) {
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) fail(r.slug + ' has ' + r.farm_steps.length + ' farm steps');
  for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) fail(r.slug + ' has a farm step of ' + s.length + ' characters');
}
console.log('rebuild: 226 rows, ranks 1-226, implied non-increasing, watchlist covered, 186 early, farm steps in range');
EOF
