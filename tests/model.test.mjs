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
  dedupChains,
  familyFor,
  farmSteps,
  gasToken,
  impliedValue,
  iqr,
  isPreToken,
  isRankable,
  liveRows,
  median,
  neutralModel,
  parseSnapshot,
  sensitivityAnalysis,
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

test('parseSnapshot: future and non-string listing dates fail', () => {
  // snap() sets as_of to 2026-11-14, so 2026-11-15 is one day in the future.
  const base = snap({ protocols: [proto({ slug: 'a' })], watchlist: ['a'] });
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: '2026-11-15' })] })), /listed_at date after as_of/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: 20240101 })] })), /non-string listed_at/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: true })] })), /non-string listed_at/);
  // Null stays null: an unknown listing date is an explicit state, not an error.
  const s = parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: null })] }));
  assert.equal(s.protocols[0].listed_at, null);
  // A valid past date still parses.
  const t = parseSnapshot(JSON.stringify({ ...base, protocols: [proto({ slug: 'a', listed_at: '2024-01-01' })] }));
  assert.equal(t.protocols[0].listed_at, '2024-01-01');
});

test('parseSnapshot: a negative market cap normalizes to null, never a price', () => {
  // A hard reject would make the sealed snapshot itself unparseable: it carries
  // one such record (autofinance, mcap_usd -1 with token metadata, already
  // unpriced). The parser refuses the value as evidence instead of the whole
  // document; a negative cap can never enter a multiple or a live price.
  const s = parseSnapshot(JSON.stringify(snap({
    protocols: [proto({ slug: 'a', mcap_usd: -1, gecko_id: 'x', symbol: 'X' })],
    watchlist: [],
  })));
  assert.equal(s.protocols[0].mcap_usd, null);
  assert.equal(tokenState(s.protocols[0]), 'unpriced');
  // Without token metadata, a negative cap is no token evidence at all.
  const t = parseSnapshot(JSON.stringify(snap({
    protocols: [proto({ slug: 'b', mcap_usd: -100 })],
    watchlist: [],
  })));
  assert.equal(t.protocols[0].mcap_usd, null);
  assert.equal(isPreToken(t.protocols[0]), true);
});

test('parseSnapshot: zero market cap becomes null, chains are deduplicated', () => {
  const s = parseSnapshot(JSON.stringify(snap({
    protocols: [proto({ slug: 'a', mcap_usd: 0, gecko_id: 'x', symbol: 'X', chains: ['Ethereum', 'Ethereum', 'Base'] })],
    watchlist: ['a'],
  })));
  assert.equal(s.protocols[0].mcap_usd, null);
  assert.deepEqual(s.protocols[0].chains, ['Ethereum', 'Base']);
});

test('dedupChains: case and whitespace variants are one chain, first label wins', () => {
  assert.deepEqual(dedupChains(['Ethereum', 'ethereum', ' Ethereum ', 'Solana', 'solana']), ['Ethereum', 'Solana']);
  assert.deepEqual(dedupChains(['  Solana  ', 'solana']), ['Solana']);
  assert.deepEqual(dedupChains(['Ethereum', 'Base', 'base', 'BASE']), ['Ethereum', 'Base']);
  assert.deepEqual(dedupChains(['', '   ', 42, null, undefined]), []);
  assert.deepEqual(dedupChains('not-an-array'), []);
  assert.deepEqual(dedupChains(null), []);
});

test('parseSnapshot: chain case/whitespace variants deduplicate at parse time', () => {
  const s = parseSnapshot(JSON.stringify(snap({
    protocols: [proto({ slug: 'a', chains: ['Ethereum', 'ethereum', ' Ethereum ', 'Solana', 'solana', '', '  '] })],
    watchlist: ['a'],
  })));
  assert.deepEqual(s.protocols[0].chains, ['Ethereum', 'Solana']);
});

test('impliedValue: breadth counts distinct chains, not cosmetic variants', () => {
  const live = [proto({ slug: 'l1', category: 'Lending', mcap_usd: 10_000_000, tvl_usd: 100_000_000 })];
  const multiples = categoryMultiples(live);
  const one = impliedValue(proto({ chains: ['Ethereum'] }), '2026-11-14', multiples);
  const variants = impliedValue(proto({ chains: ['Ethereum', 'ethereum', ' Ethereum '] }), '2026-11-14', multiples);
  const two = impliedValue(proto({ chains: ['Ethereum', 'Solana'] }), '2026-11-14', multiples);
  assert.equal(one.breadthMult, 1);
  assert.equal(variants.breadthMult, one.breadthMult);
  assert.equal(two.breadthMult, 1.02);
  assert.equal(variants.implied, one.implied);
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
  ['lending', 'Lending', 'lending'], ['dex', 'Dexs', 'dex'], ['dex-farm', 'Farm', 'dex'],
  ['dex-liquidity-manager', 'Liquidity Manager', 'dex'],
  ['bridge', 'Bridge', 'bridge'], ['staking', 'Liquid Staking', 'staking'], ['derivatives', 'Derivatives', 'derivatives'],
  ['derivatives-basis', 'Basis Trading', 'derivatives'], ['prediction', 'Prediction Market', 'prediction'],
  ['curator', 'Yield Aggregator', 'curator'], ['curator-risk', 'Risk Curators', 'curator'],
  ['stable', 'Stablecoin Issuer', 'stable'], ['rwa', 'RWA', 'rwa'], ['rwa-anchor', 'Anchor BTC', 'rwa'],
  ['rwa-decentralized', 'Decentralized BTC', 'rwa'], ['insurance', 'Insurance', 'insurance'],
  ['governance', 'Governance Incentives', 'governance'], ['chain', 'Chain', 'chain'], ['payments', 'Payments', 'payments'],
  ['payments-card', 'Crypto Card Issuer', 'payments'], ['indexes', 'Indexes', 'indexes'], ['cedefi', 'CeDeFi', 'cedefi'],
  ['other', 'Launchpad', 'other'],
  // Whitespace and case variants must classify exactly like the clean label.
  ['curator-ws', ' Yield Aggregator ', 'curator'], ['curator-case', 'YIELD AGGREGATOR', 'curator'],
  ['chain-ws', ' Chain ', 'chain'], ['lending-case', 'LENDING', 'lending'], ['dex-ws', ' Dexs ', 'dex'],
];

for (const [label, category, family] of FAMILY_FIXTURES) {
  test(`farm family ${label} (${category}): familyFor is ${family}, entry is verify-first`, () => {
    const p = proto({ slug: `fix-${label}`, name: 'Fixture Protocol', category, chains: ['Ethereum'] });
    assert.equal(familyFor(p), family, label);
    const steps = farmSteps(p, 100).map((s) => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`);
    assert.equal(steps.length, 6);
    for (const s of steps) assert.ok(s.length >= 20 && s.length <= 600, `${label} step of ${s.length} chars`);
    assert.doesNotMatch(steps[1], /^Deposit \$\d+ of USDC into Fixture Protocol on Ethereum and leave the position open\./);
    // Entry is verify-first: it names what to check and forbids acting until supported.
    assert.match(steps[1], /^Verify/, label);
    assert.match(steps[1], /do not .* until the app shows/i, label);
    // Claim never asserts a rewards/points programme exists.
    assert.match(steps[4], /whether/, label);
    assert.match(steps[4], /do not assume a programme or a rewards page exists/, label);
    if (label === 'other') {
      assert.match(steps[1], /Verify supported actions and assets.*no deposit recommendation/i);
    }
  });
}

/** P1-01 negative test: with no evidence in the snapshot, no farm step may instruct
 * a deposit, trade, mint, borrow, bridge, stake, spend or rewards claim. */
test('farmSteps: missing evidence never produces a financial action or rewards claim', () => {
  const forbidden = [
    /Supply \$\d+ of .* to .* and leave the position open/,
    /Provide \$\d+ of liquidity/,
    /Deposit \$\d+ into/,
    /Bridge \$\d+ of .* through/,
    /Mint \$\d+ of/,
    /Buy \$\d+ of/,
    /Spend \$\d+ through/,
    /Stake \$\d+ of/,
    /borrow a small amount against/,
    /restake the staking rewards/,
    /place one .* position on a new market/,
    /Open .*'s own (points|rewards) page and check/,
    /collect the fees the \$\d+ liquidity position earned/,
  ];
  for (const [label, category] of FAMILY_FIXTURES) {
    const steps = farmSteps(proto({ slug: `fix-${label}`, category, chains: ['Ethereum'] }), 100)
      .map((s) => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`);
    for (const pattern of forbidden) assert.doesNotMatch(steps.join(' '), pattern, `${label}: ${pattern}`);
  }
});

/** v2.8 (carried from v2.7): the chain family must not recommend keeping a
 * balance active, and every dollar capital figure must be labelled an
 * illustrative example, never a prescription. */
test('farmSteps: no balance recommendation anywhere; capital is illustrative, never prescriptive', () => {
  for (const [label, category] of FAMILY_FIXTURES) {
    const steps = farmSteps(proto({ slug: `fix-${label}`, category, chains: ['Ethereum'] }), 100);
    const joined = steps.map((s) => `${s.text} Cost: ${s.cost}. Time: ${s.time}.`).join(' ');
    assert.doesNotMatch(joined, /keep a small balance active/i, `${label}: balance recommendation`);
    assert.doesNotMatch(joined, /small balance/i, `${label}: balance wording`);
    for (const s of steps) {
      if (/\$\d+/.test(s.cost)) assert.match(s.cost, /illustrative example.*not a recommendation/i, `${label}: ${s.cost}`);
    }
  }
  // The chain family specifically: entry and weekly are verify-first, with no
  // instruction to use an app or hold a balance.
  const chain = farmSteps(proto({ category: 'Chain', chains: ['Ethereum'] }), 100);
  assert.match(chain[1].text, /^Verify/, 'chain entry is verify-first');
  assert.match(chain[1].text, /do not .* until the app shows/i, 'chain entry');
  assert.match(chain[2].text, /re-check/i, 'chain weekly re-checks');
  assert.doesNotMatch(chain[2].text, /use one app/i, 'chain weekly');
  // Step 2 and the hold step still name the capital bands, labelled as examples.
  assert.match(chain[1].cost, /^\$50 illustrative example capital, not a recommendation/, 'chain step-2 cost');
  assert.match(chain[3].cost, /illustrative example, not a recommendation/, 'chain hold cost');
});

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

test('isRankable: CEX exclusion uses one normalized predicate', () => {
  for (const category of ['CEX', 'cex', ' CEX ', 'Cex', 'cEx']) {
    assert.equal(isRankable(proto({ category })), false, JSON.stringify(category));
  }
  assert.equal(isRankable(proto({ category: 'Lending' })), true);
  assert.equal(isRankable(proto({ category: null })), true);
});

test('liveRows: CEX case/whitespace variants never enter the live tab', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'a-live', name: 'A Live', mcap_usd: 5_000_000, gecko_id: 'a', symbol: 'A', tvl_usd: 10_000_000 }),
      proto({ slug: 'b-cex', name: 'B Cex', category: ' cex ', mcap_usd: 9_000_000, gecko_id: 'b', symbol: 'B', tvl_usd: 90_000_000 }),
    ],
  });
  assert.deepEqual(liveRows(s).map((r) => r.slug), ['a-live']);
});

test('buildBoard: a CEX-variant watchlist row is refused', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 }),
      proto({ slug: 'alpha', category: ' cex ' }),
    ],
    watchlist: ['alpha'],
  });
  assert.throws(() => buildBoard(s), /not rankable/);
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

test('boardIssue: ranks are bound to row position, not just contiguous', () => {
  const s = snap({
    protocols: [
      proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 }),
      proto({ slug: 'alpha', name: 'Alpha', tvl_usd: 60_000_000 }),
      proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 }),
      proto({ slug: 'gamma', name: 'Gamma', tvl_usd: 10_000_000 }),
    ],
    watchlist: ['alpha', 'beta'],
  });
  const board = buildBoard(s);
  assert.equal(boardIssue(board, s), null);
  // Swap the rank fields of the first two rows: the set {1,2,3} is still
  // contiguous, so the old sorted-ranks check would have accepted this.
  const swapped = [{ ...board[0], rank: 2 }, { ...board[1], rank: 1 }, board[2]];
  assert.match(boardIssue(swapped, s), /row 1 has rank 2, expected 1/);
});

test('boardIssue: equal implied values tie-break on slug ascending', () => {
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
  assert.equal(board[1].slug, 'a-proto');
  assert.equal(board[2].slug, 'b-proto');
  assert.equal(board[1].implied_value_usd, board[2].implied_value_usd);
  assert.equal(boardIssue(board, s), null);
  // Reverse the tied rows, ranks matching their new positions: ranks are
  // contiguous and implied is non-increasing, so only the tie-break catches it.
  const reversed = [board[0], { ...board[2], rank: 2 }, { ...board[1], rank: 3 }];
  assert.match(boardIssue(reversed, s), /tie on implied value.*out of order/);
});

test('boardIssue: a CEX, versioned or below-floor watchlist member fails the gate directly', () => {
  const live = proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 });
  const base = snap({
    protocols: [
      live,
      proto({ slug: 'alpha', name: 'Alpha', tvl_usd: 60_000_000 }),
      proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 }),
    ],
    watchlist: ['alpha', 'beta'],
  });
  const board = buildBoard(base);
  assert.equal(boardIssue(board, base), null);
  // buildBoard refuses these, and the gate must too when handed the board
  // directly: a crafted board/snapshot pair must not pass on coverage alone.
  const cex = snap({
    protocols: [live, proto({ slug: 'alpha', name: 'Alpha', category: 'CEX', tvl_usd: 60_000_000 }), proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 })],
    watchlist: ['alpha', 'beta'],
  });
  assert.match(boardIssue(board, cex), /not rankable/);
  const versioned = snap({
    protocols: [live, proto({ slug: 'alpha', name: 'Alpha V2', tvl_usd: 60_000_000 }), proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 })],
    watchlist: ['alpha', 'beta'],
  });
  assert.match(boardIssue(board, versioned), /not rankable/);
  const belowFloor = snap({
    protocols: [live, proto({ slug: 'alpha', name: 'Alpha', tvl_usd: 10_000_000 }), proto({ slug: 'beta', name: 'Beta', tvl_usd: 70_000_000 })],
    watchlist: ['alpha', 'beta'],
  });
  assert.match(boardIssue(board, belowFloor), /below the \$50000000 floor/);
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

test('sealed snapshot: every farm plan is verify-first', { skip: !hasSnapshot }, () => {
  const s = snapshot();
  const { board } = buildRadar(s);
  for (const r of board) {
    assert.match(r.farm_steps[1], /^Verify/, r.slug);
    assert.match(r.farm_steps[1], /do not .* until the app shows/i, r.slug);
    assert.match(r.farm_steps[4], /whether/, r.slug);
    assert.match(r.farm_steps[4], /do not assume a programme or a rewards page exists/, r.slug);
    assert.doesNotMatch(r.farm_steps.join(' '), /Open .*'s own (points|rewards) page and check/, r.slug);
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

/** One live comparable pins the Lending multiple to 0.10x, so fixture implied
 * values are hand-computable: TVL x 0.1 x growth x maturity. */
function sensitivitySnap(rows) {
  return snap({
    protocols: [
      proto({ slug: 'live-one', name: 'Live One', mcap_usd: 10_000_000, gecko_id: 'live', symbol: 'LIVE', tvl_usd: 100_000_000 }),
      ...rows,
    ],
    watchlist: rows.map((r) => r.slug),
  });
}

test('sensitivity: neutralizing growth moves ranks and top-10 membership', () => {
  const fillers = Array.from({ length: 10 }, (_, i) =>
    proto({ slug: `f${String(i + 1).padStart(2, '0')}`, name: `Filler ${i + 1}`, tvl_usd: 100_000_000, change_7d: 0, listed_at: '2026-11-14' }));
  const s = sensitivitySnap([
    proto({ slug: 'a-proto', name: 'A', tvl_usd: 100_000_000, change_7d: 120, listed_at: '2026-11-14' }),
    proto({ slug: 'b-proto', name: 'B', tvl_usd: 100_000_000, change_7d: -60, listed_at: '2022-11-14' }),
    ...fillers,
  ]);
  const report = sensitivityAnalysis(s);
  assert.equal(report.baselineModel, 'radar-5');
  assert.equal(report.rows, 12);
  // Baseline: A 11.2M first, ten 7.0M fillers, B 5.8M last.
  const growth = report.variants.find((v) => v.variant === 'growth-neutral');
  assert.equal(growth.moved, 12);
  assert.equal(growth.medianAbsRankChange, 1);
  assert.equal(growth.p90AbsRankChange, 1);
  assert.equal(growth.maxAbsRankChange, 11);
  assert.deepEqual(growth.topN[0], { n: 10, changed: 1, entered: ['b-proto'], left: ['f09'] });
  assert.equal(growth.topN[1].changed, 0);
  assert.equal(growth.topN[2].changed, 0);
  // Same fixture under maturity neutralization: A 16M first, fillers 10M, B last — ranks unchanged.
  const maturity = report.variants.find((v) => v.variant === 'maturity-neutral');
  assert.equal(maturity.moved, 0);
  // Both neutralized: everything ties at 10M except B, which rises to rank 2.
  const both = report.variants.find((v) => v.variant === 'both-neutral');
  assert.equal(both.moved, 11);
  assert.equal(both.maxAbsRankChange, 10);
  assert.deepEqual(both.topN[0], { n: 10, changed: 1, entered: ['b-proto'], left: ['f09'] });
});

test('sensitivity: neutralizing maturity moves ranks', () => {
  const s = sensitivitySnap([
    proto({ slug: 'c-old', name: 'Old', tvl_usd: 140_000_000, change_7d: 0, listed_at: '2022-11-14' }),
    proto({ slug: 'a-new', name: 'New', tvl_usd: 100_000_000, change_7d: 120, listed_at: '2026-11-14' }),
  ]);
  const report = sensitivityAnalysis(s);
  assert.equal(report.rows, 2);
  // Baseline: C 14M first, A 11.2M second. Maturity-neutral: A 16M first, C 14M second.
  const maturity = report.variants.find((v) => v.variant === 'maturity-neutral');
  assert.equal(maturity.moved, 2);
  assert.equal(maturity.medianAbsRankChange, 1);
  assert.equal(maturity.p90AbsRankChange, 1);
  assert.equal(maturity.maxAbsRankChange, 1);
  // Growth-neutral and both-neutral leave this pair's order alone.
  assert.equal(report.variants.find((v) => v.variant === 'growth-neutral').moved, 0);
  assert.equal(report.variants.find((v) => v.variant === 'both-neutral').moved, 0);
});

test('sensitivity: the analysis never mutates MODEL', () => {
  const before = JSON.stringify(MODEL);
  const neutral = neutralModel({ growth: true, maturity: true });
  assert.equal(neutral.growth_up, 0);
  assert.equal(neutral.growth_down, 0);
  assert.equal(neutral.maturity_floor, 1);
  assert.equal(neutral.maturity_range, 0);
  neutral.growth_up = 9;
  neutral.maturity_floor = 9;
  assert.equal(JSON.stringify(MODEL), before);
  const s = sensitivitySnap([
    proto({ slug: 'a-proto', name: 'A', tvl_usd: 100_000_000, change_7d: 120, listed_at: '2026-11-14' }),
  ]);
  sensitivityAnalysis(s);
  assert.equal(JSON.stringify(MODEL), before);
});

test('sealed snapshot: sensitivity report is structural and diagnostic', { skip: !hasSnapshot }, () => {
  const s = snapshot();
  const before = JSON.stringify(MODEL);
  const report = sensitivityAnalysis(s);
  assert.equal(report.rows, 226);
  assert.equal(report.variants.length, 3);
  for (const v of report.variants) {
    assert.equal(v.rows, 226);
    assert.ok(v.moved >= 0 && v.moved <= 226, `${v.variant} moved ${v.moved}`);
    assert.ok(Number.isFinite(v.medianAbsRankChange) && Number.isFinite(v.p90AbsRankChange));
    assert.ok(v.maxAbsRankChange >= 0 && v.maxAbsRankChange <= 225, `${v.variant} max ${v.maxAbsRankChange}`);
    for (const t of v.topN) {
      assert.equal(t.changed, t.entered.length);
      assert.equal(t.changed, t.left.length);
    }
  }
  assert.equal(JSON.stringify(MODEL), before);
});
