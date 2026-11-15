// Focused unit tests for the radar-4 model. Run with: node --test tests/model.test.mjs
// No framework: node:test only. Snapshot-dependent tests read the sealed snapshot
// from MAKEFUN_SNAPSHOT (default: the kit's input/snapshot.json) and skip when absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ageDays,
  boardIssue,
  buildBoard,
  buildRadar,
  categoryMultiples,
  farmSteps,
  gasToken,
  impliedValue,
  iqr,
  isPreToken,
  liveRows,
  median,
  parseSnapshot,
  tokenState,
  SnapshotError,
  MODEL,
} from '../lib/model.ts';

const SNAPSHOT = process.env.MAKEFUN_SNAPSHOT ?? '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
const hasSnapshot = existsSync(SNAPSHOT);
const snapshot = () => parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));

/** A protocol fixture: only the fields a test needs differ from the defaults. */
function proto(over = {}) {
  return {
    slug: 'fixture',
    name: 'Fixture Protocol',
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 60_000_000,
    change_7d: 10,
    mcap_usd: null,
    listed_at: '2024-01-01',
    gecko_id: null,
    symbol: null,
    ...over,
  };
}

function snap(over = {}) {
  return {
    as_of: '2026-11-14',
    source: 'test',
    floor_usd: 50_000_000,
    protocols: [],
    watchlist: [],
    ...over,
  };
}

test('median: odd, even and single values', () => {
  assert.equal(median([3]), 3);
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.throws(() => median([]), SnapshotError);
});

test('iqr: single value is 0, spread is Q3-Q1 by linear interpolation', () => {
  assert.equal(iqr([5]), 0);
  assert.equal(iqr([0.1, 0.5]), 0.2);
  assert.throws(() => iqr([]), SnapshotError);
});

test('categoryMultiples: shrinkage toward the global median, thin categories take it outright', () => {
  const live = [
    proto({ slug: 'a1', category: 'Lending', mcap_usd: 10_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'a2', category: 'Lending', mcap_usd: 30_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'b1', category: 'Bridge', mcap_usd: 50_000_000, tvl_usd: 100_000_000 }),
  ];
  const { byCategory, global } = categoryMultiples(live);
  assert.equal(global, 0.3);
  // Lending: (2*0.20 + 6*0.30) / 8 = 0.275 (within float error).
  assert.ok(Math.abs(byCategory.get('lending').multiple - 0.275) < 1e-12);
  assert.equal(byCategory.get('lending').n, 2);
  // Bridge: one comparable cannot set a price, so it takes the global median.
  assert.equal(byCategory.get('bridge').multiple, 0.3);
  assert.equal(byCategory.get('bridge').n, 1);
  assert.equal(byCategory.get('bridge').confidence, 'low');
});

test('categoryMultiples: highly dispersed comparables are low confidence', () => {
  const live = [
    proto({ slug: 'a1', category: 'Lending', mcap_usd: 5_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'a2', category: 'Lending', mcap_usd: 10_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'a3', category: 'Lending', mcap_usd: 60_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'a4', category: 'Lending', mcap_usd: 65_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'b1', category: 'Bridge', mcap_usd: 20_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'b2', category: 'Bridge', mcap_usd: 22_000_000, tvl_usd: 100_000_000 }),
    proto({ slug: 'b3', category: 'Bridge', mcap_usd: 24_000_000, tvl_usd: 100_000_000 }),
  ];
  const { byCategory } = categoryMultiples(live);
  // Lending ratios 0.05/0.10/0.60/0.65: IQR 0.525 against median 0.35, dispersed.
  assert.equal(byCategory.get('lending').confidence, 'low');
  // Bridge ratios 0.20/0.22/0.24: IQR 0.02 against median 0.22, tight.
  assert.equal(byCategory.get('bridge').confidence, 'standard');
});

test('categoryMultiples: no usable comparables is an explicit error', () => {
  assert.throws(() => categoryMultiples([]), /no usable live-token comparables/);
  assert.throws(() => categoryMultiples([proto({ mcap_usd: null })]), /no usable live-token comparables/);
});

test('token states: pre-token, unpriced and live-priced use one rule', () => {
  assert.equal(tokenState(proto()), 'pre-token');
  assert.equal(isPreToken(proto()), true);
  // A zero market cap counts as no market cap, but the metadata still marks it unpriced.
  assert.equal(tokenState(proto({ mcap_usd: 0, gecko_id: 'x', symbol: 'X' })), 'unpriced');
  assert.equal(isPreToken(proto({ mcap_usd: 0, gecko_id: 'x', symbol: 'X' })), false);
  assert.equal(tokenState(proto({ mcap_usd: null, gecko_id: 'x', symbol: 'X' })), 'unpriced');
  assert.equal(tokenState(proto({ mcap_usd: 1_000_000, gecko_id: 'x', symbol: 'X' })), 'live-priced');
  // A zero market cap with no other metadata is pre-token, not live.
  assert.equal(tokenState(proto({ mcap_usd: 0 })), 'pre-token');
  assert.equal(isPreToken(proto({ mcap_usd: 0 })), true);
});

test('missing growth is an explicit state, treated as 0', () => {
  const live = [proto({ slug: 'l1', category: 'Lending', mcap_usd: 10_000_000, tvl_usd: 100_000_000 })];
  const multiples = categoryMultiples(live);
  const v = impliedValue(proto({ change_7d: null }), '2026-11-14', multiples);
  assert.equal(v.growthMissing, true);
  assert.equal(v.growthPct, 0);
  assert.equal(v.growthMult, 1);
  const w = impliedValue(proto({ change_7d: 10 }), '2026-11-14', multiples);
  assert.equal(w.growthMissing, false);
  assert.equal(w.growthPct, 10);
});

test('ageDays: future and malformed dates are an explicit invalid state', () => {
  assert.equal(ageDays('2026-11-14', '2026-11-15'), null);
  assert.equal(ageDays('2026-11-14', 'not-a-date'), null);
  assert.equal(ageDays('2026-11-14', null), null);
  assert.equal(ageDays('2026-11-14', '2026-11-14'), 0);
  assert.equal(ageDays('2026-11-14', '2025-11-14'), 365);
});

test('parseSnapshot: duplicate slugs, duplicate watchlist and missing watchlist slugs fail', () => {
  const base = snap({ protocols: [proto({ slug: 'a' }), proto({ slug: 'b' })], watchlist: ['a', 'b'] });
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a' }), proto({ slug: 'a' })] })), /duplicate slug/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, watchlist: ['a', 'a'] })), /duplicate watchlist/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, watchlist: ['a', 'zzz'] })), /not in the snapshot/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a' }), proto({ slug: '', name: 'x' })] })), /lacks a slug/);
});

test('parseSnapshot: non-positive TVL and malformed listing dates fail', () => {
  const base = snap({ protocols: [proto({ slug: 'a' })], watchlist: ['a'] });
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', tvl_usd: 0 })] })), /non-positive TVL/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', tvl_usd: -5 })] })), /non-positive TVL/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: '2026-02-30' })] })), /malformed listed_at/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: '14-11-2026' })] })), /malformed listed_at/);
});

test('parseSnapshot: zero market cap becomes null, chains are deduplicated', () => {
  const s = parseSnapshot(JSON.stringify(snap({
    protocols: [proto({ slug: 'a', mcap_usd: 0, gecko_id: 'x', symbol: 'X', chains: ['Ethereum', 'Ethereum', 'Base'] })],
    watchlist: ['a'],
  })));
  assert.equal(s.protocols[0].mcap_usd, null);
  assert.deepEqual(s.protocols[0].chains, ['Ethereum', 'Base']);
});

test('gasToken: known chains resolve, unknown chains are explicit, never a silent ETH default', () => {
  assert.equal(gasToken('Ethereum'), 'ETH');
  assert.equal(gasToken('Arbitrum'), 'ETH');
  assert.equal(gasToken('Bitcoin'), 'BTC');
  assert.equal(gasToken('Solana'), 'SOL');
  assert.equal(gasToken('Polygon'), 'POL');
  assert.equal(gasToken('Mantle'), 'MNT');
  assert.equal(gasToken('SomeNewChain'), null);
  assert.equal(gasToken('Manta'), null);
  const unknown = farmSteps(proto({ chains: ['SomeNewChain'] }), 100);
  assert.match(unknown[0].cost, /fee asset/);
  assert.doesNotMatch(unknown[0].cost, /paid in ETH/);
  const known = farmSteps(proto({ chains: ['Ethereum'] }), 100);
  assert.match(known[0].cost, /paid in ETH/);
});

test('farmSteps: no fixed gas dollar amounts anywhere', () => {
  for (const chain of ['Ethereum', 'Bitcoin', 'SomeNewChain']) {
    const steps = farmSteps(proto({ chains: [chain] }), 100).map((s) => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`);
    for (const s of steps) assert.doesNotMatch(s, /under \$3|about \$\d+ of gas/);
  }
});

const FAMILY_FIXTURES = [
  ['lending', 'Lending'], ['dex', 'Dexs'], ['dex-farm', 'Farm'], ['dex-liquidity-manager', 'Liquidity Manager'],
  ['bridge', 'Bridge'], ['staking', 'Liquid Staking'], ['derivatives', 'Derivatives'],
  ['derivatives-basis', 'Basis Trading'], ['prediction', 'Prediction Market'],
  ['curator', 'Yield Aggregator'], ['curator-risk', 'Risk Curators'],
  ['stable', 'Stablecoin Issuer'], ['rwa', 'RWA'], ['rwa-anchor', 'Anchor BTC'],
  ['rwa-decentralized', 'Decentralized BTC'], ['insurance', 'Insurance'],
  ['governance', 'Governance Incentives'], ['chain', 'Chain'], ['payments', 'Payments'],
  ['payments-card', 'Crypto Card Issuer'], ['indexes', 'Indexes'], ['cedefi', 'CeDeFi'],
  ['other', 'Launchpad'],
];

for (const [label, category] of FAMILY_FIXTURES) {
  test(`farm family ${label} (${category}): entry action is explicit, never the generic deposit`, () => {
    const p = proto({ slug: `fix-${label}`, name: 'Fixture Protocol', category, chains: ['Ethereum'] });
    const steps = farmSteps(p, 100).map((s) => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`);
    assert.equal(steps.length, 6);
    for (const s of steps) assert.ok(s.length >= 20 && s.length <= 600, `${label} step of ${s.length} chars`);
    assert.doesNotMatch(steps[1], /^Deposit \$\d+ of USDC into Fixture Protocol on Ethereum and leave the position open\./);
    if (label === 'other') {
      assert.match(steps[1], /Verify supported actions and assets.*no deposit recommendation/);
    }
  });
}

test('farm families: leveraged and speculative actions carry a risk note', () => {
  const risky = { derivatives: 'Derivatives', prediction: 'Prediction Market', insurance: 'Insurance', rwa: 'RWA' };
  for (const [label, category] of Object.entries(risky)) {
    const steps = farmSteps(proto({ category, chains: ['Ethereum'] }), 100);
    assert.match(steps[1].text, /not routine low-risk farming/, label);
  }
  const lending = farmSteps(proto({ category: 'Lending' }), 100);
  assert.match(lending[2].text, /liquidated/, 'lending weekly borrowing warns about liquidation');
});

test('liveRows: only positive market caps, ties break on slug', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'b-live', name: 'B Live', mcap_usd: 5_000_000, gecko_id: 'b', symbol: 'B', tvl_usd: 10_000_000 }),
      proto({ slug: 'a-live', name: 'A Live', mcap_usd: 5_000_000, gecko_id: 'a', symbol: 'A', tvl_usd: 10_000_000 }),
      proto({ slug: 'c-unpriced', name: 'C Unpriced', mcap_usd: null, gecko_id: 'c', symbol: 'C', tvl_usd: 99_000_000 }),
      proto({ slug: 'd-zero', name: 'D Zero', mcap_usd: 0, gecko_id: 'd', symbol: 'D', tvl_usd: 98_000_000 }),
    ],
  });
  const rows = liveRows(s);
  assert.deepEqual(rows.map((r) => r.slug), ['a-live', 'b-live']);
});

test('buildBoard: implied ties break on slug, ranks are contiguous', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 }),
      proto({ slug: 'c-proto', name: 'Bigger', tvl_usd: 80_000_000 }),
      proto({ slug: 'b-proto', name: 'Same', tvl_usd: 60_000_000 }),
      proto({ slug: 'a-proto', name: 'Same', tvl_usd: 60_000_000 }),
    ],
    watchlist: ['c-proto', 'b-proto', 'a-proto'],
  });
  const board = buildBoard(s);
  assert.equal(board.length, 3);
  assert.equal(board[0].slug, 'c-proto');
  assert.equal(board[1].slug, 'a-proto');
  assert.equal(board[2].slug, 'b-proto');
  assert.equal(board[1].implied_value_usd, board[2].implied_value_usd);
  assert.equal(boardIssue(board, s), null);
});

test('boardIssue: exact eligible-set coverage, missing and extra rows fail', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 }),
      proto({ slug: 'alpha', name: 'Alpha', tvl_usd: 60_000_000 }),
      proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 }),
      proto({ slug: 'gamma', name: 'Gamma', tvl_usd: 10_000_000 }),
      proto({ slug: 'delta', name: 'Delta', category: 'Bridge', tvl_usd: 60_000_000 }),
    ],
    watchlist: ['alpha', 'beta'],
  });
  const board = buildBoard(s);
  assert.equal(board.length, 3);
  assert.equal(boardIssue(board, s), null);
  assert.match(boardIssue(board.slice(0, 2), s), /misses 1 eligible slug/);
  const extra = [...board, { ...board[0], slug: 'delta', rank: 4 }];
  assert.match(boardIssue(extra, s), /outside the eligible set/);
  const dup = [...board, { ...board[0], rank: 4 }];
  assert.match(boardIssue(dup, s), /duplicate slugs/);
});

test('buildBoard: a non-pre-token watchlist row is refused', () => {
  const s = snap({
    protocols: [proto({ slug: 'alpha', mcap_usd: 1_000_000, gecko_id: 'a', symbol: 'A' })],
    watchlist: ['alpha'],
  });
  assert.throws(() => buildBoard(s), /not pre-token/);
});

test('sealed snapshot: 226 rows, exact coverage, exclusion buckets sum', { skip: !hasSnapshot }, () => {
  const s = snapshot();
  const { board, radar } = buildRadar(s);
  assert.equal(board.length, 226);
  assert.equal(boardIssue(board, s), null);
  assert.equal(radar.excluded_above_floor, 63);
  assert.deepEqual(radar.excluded_breakdown, { bridges: 24, liquid_staking: 18, restaked_btc: 2, other: 19 });
  assert.equal(radar.live_size, 24);
  assert.equal(radar.live_unpriced_size, 283);
  assert.ok(radar.live.every((r) => (r.mcap_usd ?? 0) > 0));
  assert.ok(radar.live_unpriced.every((r) => (r.mcap_usd ?? 0) <= 0));
});

test('sealed snapshot: no board row reaches the generic deposit fallback', { skip: !hasSnapshot }, () => {
  const s = snapshot();
  const { board } = buildRadar(s);
  for (const r of board) {
    assert.doesNotMatch(
      r.farm_steps[1],
      /^Deposit \$\d+ of USDC into .* and leave the position open\./,
      r.slug,
    );
  }
});

test('sealed snapshot: every board row resolves its gas or names it unverified', { skip: !hasSnapshot }, () => {
  const s = snapshot();
  const { board } = buildRadar(s);
  for (const r of board) {
    const cost = r.farm_steps[0];
    assert.match(cost, /variable/);
    assert.doesNotMatch(cost, /under \$3/);
  }
});

test('sealed snapshot: model constants are unchanged from radar-3', { skip: !hasSnapshot }, () => {
  assert.deepEqual(MODEL, {
    shrink_prior: 6, min_live_n: 2, mult_min: 0.02, mult_max: 1.25,
    growth_floor: -60, growth_cap: 120, growth_up: 0.5, growth_down: 0.7,
    maturity_floor: 0.7, maturity_range: 0.3, maturity_days: 1460,
    unknown_age_days: 365, breadth_per_chain: 0.02, breadth_max_chains: 10,
  });
});
