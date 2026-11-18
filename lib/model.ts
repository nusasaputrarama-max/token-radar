// Token Radar's model, version radar-5: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol on the snapshot's watchlist (the floor) plus every
// rankable pre-token protocol below the watchlist floor (the early radar). It does not
// rank the 63 pre-token protocols at or above the floor that the watchlist leaves out:
// 44 of them are bridges, liquid-staking or restaked products by their own category
// (24 bridges, 18 liquid-staking, 2 restaked BTC). The other 19 are excluded by the
// supplied watchlist rule; the snapshot fields do not establish why, so no reason is
// claimed for them. The dashboard says so, with the counts.
//
// A protocol is pre-token when its record carries no token: no market cap, no CoinGecko
// id, no symbol. A zero market cap counts as no market cap (unpriced, not live).
// Rankable means pre-token, not a CEX, and not a versioned pool
// (a name ending in a release marker such as V2).
//
// Implied value is a snapshot-based comparable proxy, computed from the snapshot
// itself. It is not a token valuation, not a price, and not a prediction that a token
// will be issued. The snapshot carries no FDV, so the proxy uses circulating market
// cap; an FDV/TVL sensitivity cannot be computed from these fields, and the two
// measures are never mixed.
//
//   multiple   = the median market-cap / TVL of the live-token protocols in the same
//                category, shrunk toward the global median with a prior of 6 live
//                protocols; a category with fewer than two live comparables takes the
//                global median outright, because one observation cannot set a price.
//                Clamped to [0.02, 1.25]. A zero market cap counts as no market cap.
//                Each multiple carries its sample size and its dispersion (IQR), so
//                the dashboard can mark thin or highly dispersed comparables as low
//                confidence.
//   growth     = clamp(change_7d, -60, 120) per cent; a falling TVL discounts more
//                (0.70 per point) than a rising TVL adds (0.50 per point), because a
//                launch into a shrinking base is worth less than one into a growing one.
//                A missing 7-day change is an explicit state (growth_missing): the
//                proxy treats it as 0, and the dashboard says so.
//   maturity   = 0.70 + 0.30 x min(age_days, 1460) / 1460, where age is the time since
//                the protocol was first listed on DefiLlama. Unknown age: 365. The
//                listing date is not necessarily the launch date, so the dashboard
//                calls this "time since DefiLlama listing", never protocol maturity.
//   breadth    = 1 + 0.02 x min(distinct chains - 1, 10); each extra chain is
//                distribution surface for a launch, capped at ten. Chains are
//                deduplicated on a normalized key (trim + case-fold), so a
//                repeated or cosmetically different chain label cannot inflate it.
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row, and every
// factor is either a snapshot figure or a median computed from the snapshot's own live
// protocols. The dashboard recomputes each row from these figures, so the page and the
// board carry the same arithmetic. The board's slug, rank and implied value are the
// entry's stable output: disclosure fields may be added around them, but the numbers
// themselves do not move between revisions without a new submission.

/** One protocol of the sealed snapshot: exactly the ten fields the input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. The multiples are computed from the snapshot, not constants. */
export interface ModelConstants {
  shrink_prior: number;
  min_live_n: number;
  mult_min: number;
  mult_max: number;
  growth_floor: number;
  growth_cap: number;
  growth_up: number;
  growth_down: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 6,
  min_live_n: 2,
  mult_min: 0.02,
  mult_max: 1.25,
  growth_floor: -60,
  growth_cap: 120,
  growth_up: 0.5,
  growth_down: 0.7,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 10,
};

/** The model's version label: the dashboard names it. radar-5 keeps radar-4's valuation
 * arithmetic exactly (the same multiples, growth, maturity and breadth, so the board's
 * slug/rank/implied values do not move) and changes only what audit v2.5 asked for:
 * farm plans are verify-first and non-transactional throughout, the family
 * classifier normalizes labels and orders specific rules first, and chain labels
 * are deduplicated on a normalized key. Sensitivity diagnostics are separate and
 * never change the submitted model. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_live_n: number;
    /** Interquartile range of the category's live mcap/TVL ratios (0 when n < 2). */
    category_iqr: number;
    /** Median of the category's live mcap/TVL ratios (the global median when n < 2). */
    category_median: number;
    /** 'low' when the multiple rests on the global median or on highly dispersed comparables. */
    confidence: 'low' | 'standard';
    /** True when the snapshot reports no 7-day change: the proxy treats it as 0. */
    growth_missing: boolean;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row as the dashboard reads it (farm plan included, so page and board agree). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_live_n: number;
  category_iqr: number;
  category_median: number;
  confidence: 'low' | 'standard';
  growth_missing: boolean;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  excluded_above_floor: number;
  /** The 63 above the floor, by their own category: bridges, liquid-staking, restaked BTC, other. */
  excluded_breakdown: { bridges: number; liquid_staking: number; restaked_btc: number; other: number };
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** Token metadata present but no market price: not counted as trading, not a comparable. */
  live_unpriced: LiveRow[];
  live_unpriced_size: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Median of a non-empty array of finite numbers. */
export function median(values: number[]): number {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) throw new SnapshotError('median of no values');
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/** Whole days from `from` to `to`; null when either date is absent, malformed, or in the
 * future — a future listing date is an explicit invalid state, never clamped to zero. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b > a) return null;
  return Math.floor((a - b) / DAY_MS);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. A zero market cap counts as no market
 * cap, so it never makes a protocol look tokenized on its own. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return (p.mcap_usd === null || p.mcap_usd === 0) && p.gecko_id === null && p.symbol === null;
}

/** One token state for every protocol, used the same way by the board, the live tab
 * and the README: 'pre-token' carries no token at all; 'unpriced' carries token
 * metadata but no usable market price; 'live-priced' has a positive market cap and
 * is the only state the dashboard calls "already trades". */
export type TokenState = 'pre-token' | 'unpriced' | 'live-priced';

export function tokenState(p: SnapshotProtocol): TokenState {
  if (isPreToken(p)) return 'pre-token';
  if (p.mcap_usd !== null && p.mcap_usd > 0) return 'live-priced';
  return 'unpriced';
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not versioned. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isCexCategory(p.category) && !VERSIONED.test(p.name);
}

/** A category key for pooling comparables: trimmed and case-folded, so an inconsistent
 * spelling cannot split one category's pool. The display label stays untouched. */
export function normCategory(category: string | null): string {
  return (category ?? 'Other').trim().toLowerCase();
}

/** Whether a category is an exchange: one normalized predicate (trim + case-fold),
 * so 'CEX', 'cex' and ' CEX ' exclude alike. Every CEX check routes through
 * this; no call site compares the raw category string. */
export function isCexCategory(category: string | null): boolean {
  return normCategory(category) === 'cex';
}

/** Chain labels deduplicated on a normalized key (trim + case-fold), in input
 * order, preserving the first label as written (trimmed) as the display label:
 * 'Ethereum', 'ethereum' and ' Ethereum ' are one chain, not three. Blank and
 * non-string entries are dropped, and a non-array input deduplicates to []. */
export function dedupChains(chains: unknown): string[] {
  if (!Array.isArray(chains)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chains) {
    if (typeof c !== 'string' || c.trim() === '') continue;
    const key = c.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.trim());
  }
  return out;
}

/** A quartile of a sorted array, by linear interpolation. */
function quartile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** The interquartile range of a non-empty array of finite numbers. */
export function iqr(values: number[]): number {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) throw new SnapshotError('IQR of no values');
  if (a.length === 1) return 0;
  return quartile(a, 0.75) - quartile(a, 0.25);
}

/**
 * The valuation multiple for a category: the median market-cap / TVL of the live
 * protocols in that category, shrunk toward the global median. `live` holds the
 * snapshot's live-token protocols (not CEX) with a market cap and a positive TVL.
 * Each entry also carries its sample size, its median and its IQR, and a confidence
 * flag: 'low' when the multiple rests on the global median (fewer than two live
 * comparables) or on highly dispersed comparables (IQR above the median).
 */
export function categoryMultiples(
  live: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): {
  byCategory: Map<string, { multiple: number; n: number; iqr: number; median: number; confidence: 'low' | 'standard' }>;
  global: number;
} {
  const ratios = live
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ category: normCategory(p.category), ratio: p.mcap_usd! / p.tvl_usd }));
  if (ratios.length === 0) {
    throw new SnapshotError('no usable live-token comparables: no live protocol has a positive market cap and a positive TVL');
  }
  const global = median(ratios.map((r) => r.ratio));
  const byCat = new Map<string, number[]>();
  for (const r of ratios) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r.ratio);
    byCat.set(r.category, arr);
  }
  const byCategory = new Map<string, { multiple: number; n: number; iqr: number; median: number; confidence: 'low' | 'standard' }>();
  for (const [category, values] of byCat) {
    const catMedian = median(values);
    const n = values.length;
    // Fewer than two comparables cannot set a price: take the global median.
    const shrunk =
      n < model.min_live_n ? global : (n * catMedian + model.shrink_prior * global) / (n + model.shrink_prior);
    const spread = iqr(values);
    byCategory.set(category, {
      multiple: Math.min(model.mult_max, Math.max(model.mult_min, shrunk)),
      n,
      iqr: round4(spread),
      median: round4(catMedian),
      confidence: n < model.min_live_n || (catMedian > 0 && spread / catMedian > 1) ? 'low' : 'standard',
    });
  }
  return { byCategory, global };
}

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, { multiple: number; n: number; iqr: number; median: number; confidence: 'low' | 'standard' }>; global: number },
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  categoryLiveN: number;
  categoryIqr: number;
  categoryMedian: number;
  confidence: 'low' | 'standard';
  growthMissing: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const entry = multiples.byCategory.get(normCategory(protocol.category));
  // The multiple is rounded to 4 decimals before use, so the value the board stores
  // is the value the model used: the dashboard recomputes the same number.
  const rawMultiple = entry !== undefined ? entry.multiple : Math.min(model.mult_max, Math.max(model.mult_min, multiples.global));
  const categoryMultiple = Math.round(rawMultiple * 1e4) / 1e4;
  const categoryLiveN = entry !== undefined ? entry.n : 0;
  const categoryIqr = entry !== undefined ? entry.iqr : 0;
  const categoryMedian = entry !== undefined ? entry.median : round4(multiples.global);
  // No entry means the category has no live comparables at all: the global median
  // prices the row, which is the lowest-confidence case.
  const confidence: 'low' | 'standard' = entry !== undefined ? entry.confidence : 'low';
  const growthMissing = protocol.change_7d === null || !Number.isFinite(protocol.change_7d);
  const rawGrowth = growthMissing ? 0 : protocol.change_7d!;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const weight = growthPct >= 0 ? model.growth_up : model.growth_down;
  const growthMult = 1 + (growthPct / 100) * weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  // Chains are deduplicated on a normalized key (trim + case-fold), so a
  // repeated or cosmetically different chain label cannot inflate breadth.
  const extraChains = Math.min(Math.max(dedupChains(protocol.chains).length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult));
  return { implied, categoryMultiple, categoryLiveN, categoryIqr, categoryMedian, confidence, growthMissing, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && !isCexCategory(p.category));
  const multiples = categoryMultiples(live, model);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p === undefined) throw new SnapshotError(`watchlist slug ${slug} is not in the snapshot`);
    if (!isPreToken(p)) throw new SnapshotError(`watchlist slug ${slug} is not pre-token`);
    if (!isRankable(p)) throw new SnapshotError(`watchlist slug ${slug} is not rankable (exchange or versioned pool)`);
    if (p.tvl_usd < snapshot.floor_usd) throw new SnapshotError(`watchlist slug ${slug} is below the $${snapshot.floor_usd} floor`);
    chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor.
  // Rankable protocols at or above the floor that the watchlist leaves out stay out:
  // the watchlist rule leaves them out. The snapshot fields do not establish why for
  // the 19 that are not bridges, liquid-staking or restaked BTC, so no reason is claimed.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.categoryMultiple),
      category_live_n: s.categoryLiveN,
      category_iqr: round4(s.categoryIqr),
      category_median: round4(s.categoryMedian),
      confidence: s.confidence,
      growth_missing: s.growthMissing,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/**
 * A neutralized copy of the model constants: the growth and/or maturity
 * multipliers pinned to 1.0. Growth is neutralized by zeroing both weights, so
 * `growthMult` is 1 for every row regardless of `change_7d`; maturity is
 * neutralized by a floor of 1.0 and a range of 0, so `maturityMult` is 1 for
 * every age. The returned object is a copy: MODEL itself is never mutated.
 */
export function neutralModel(options: { growth?: boolean; maturity?: boolean }): ModelConstants {
  return {
    ...MODEL,
    ...(options.growth ? { growth_up: 0, growth_down: 0 } : {}),
    ...(options.maturity ? { maturity_floor: 1, maturity_range: 0 } : {}),
  };
}

/** One sensitivity variant: how the ranking moves when a multiplier is neutralized. */
export interface SensitivityVariant {
  variant: 'growth-neutral' | 'maturity-neutral' | 'both-neutral';
  rows: number;
  /** Rows whose rank differs from the baseline ranking. */
  moved: number;
  /** Median absolute rank change (the codebase's median: the two middle values averaged for even counts). */
  medianAbsRankChange: number;
  /** 90th percentile absolute rank change (nearest-rank). */
  p90AbsRankChange: number;
  maxAbsRankChange: number;
  /** Top-N membership changes: slugs entering and leaving the baseline top N. */
  topN: { n: number; changed: number; entered: string[]; left: string[] }[];
}

/** The full sensitivity report: the baseline ranking against three neutralized variants. */
export interface SensitivityReport {
  baselineModel: string;
  rows: number;
  variants: SensitivityVariant[];
}

/** The p-th percentile of a sorted array, nearest-rank. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

/**
 * Deterministic rank-sensitivity analysis (audit v2.5 P1-02): the baseline
 * ranking against the same board with (a) the growth multiplier neutralized to
 * 1.0, (b) the maturity multiplier neutralized to 1.0, and (c) both
 * neutralized. Diagnostic only: it builds variant boards from copies of the
 * model constants and never changes MODEL, the submitted board, or any row's
 * stored value. Rank movement is reported as the median, p90 and max absolute
 * rank change plus top-10/25/50 membership changes, so the next reviewer can
 * see how much of the ranking the 7-day window and the listing-age curve
 * decide — without silently recalibrating anything.
 */
export function sensitivityAnalysis(snapshot: Snapshot): SensitivityReport {
  const baseline = buildBoard(snapshot, MODEL);
  const baseRank = new Map(baseline.map((r) => [r.slug, r.rank]));
  const baseSlugs = new Set(baseline.map((r) => r.slug));
  const variants = (
    [
      ['growth-neutral', neutralModel({ growth: true })],
      ['maturity-neutral', neutralModel({ maturity: true })],
      ['both-neutral', neutralModel({ growth: true, maturity: true })],
    ] as const
  ).map(([variant, model]) => {
    const board = buildBoard(snapshot, model);
    if (board.length !== baseline.length) throw new SnapshotError(`sensitivity ${variant}: ${board.length} rows, expected ${baseline.length}`);
    for (const r of board) if (!baseSlugs.has(r.slug)) throw new SnapshotError(`sensitivity ${variant}: unexpected slug ${r.slug}`);
    const deltas = board.map((r) => Math.abs(r.rank - baseRank.get(r.slug)!)).sort((a, b) => a - b);
    const topN = [10, 25, 50].map((n) => {
      const baseTop = new Set(baseline.slice(0, n).map((r) => r.slug));
      const varTop = new Set(board.slice(0, n).map((r) => r.slug));
      const entered = [...varTop].filter((s) => !baseTop.has(s)).sort();
      const left = [...baseTop].filter((s) => !varTop.has(s)).sort();
      return { n, changed: entered.length, entered, left };
    });
    return {
      variant,
      rows: board.length,
      moved: deltas.filter((d) => d > 0).length,
      medianAbsRankChange: deltas.length === 0 ? 0 : median(deltas),
      p90AbsRankChange: percentile(deltas, 0.9),
      maxAbsRankChange: deltas[deltas.length - 1] ?? 0,
      topN,
    };
  });
  return { baselineModel: MODEL_VERSION, rows: baseline.length, variants };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: action, then cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * The gas token a chain settles fees in — only for chains whose fee asset is
 * established. Unknown chains return null: the farm plan must say the fee asset is
 * unverified, never guess ETH. (The map covers the chains the sealed snapshot names
 * most; a new chain falls through to null by design.)
 */
export function gasToken(chain: string): string | null {
  const c = chain.toLowerCase().trim();
  const map: Record<string, string> = {
    ethereum: 'ETH', arbitrum: 'ETH', base: 'ETH', 'zksync era': 'ETH', linea: 'ETH',
    scroll: 'ETH', blast: 'ETH', mode: 'ETH', ink: 'ETH', optimism: 'ETH',
    'world chain': 'ETH', 'x layer': 'ETH', unichain: 'ETH', bob: 'ETH', soneium: 'ETH',
    morph: 'ETH', 'reya network': 'ETH', 'robinhood chain': 'ETH', lisk: 'ETH', rise: 'ETH',
    solana: 'SOL', polygon: 'POL', 'polygon zkevm': 'POL',
    bsc: 'BNB', bnb: 'BNB', binance: 'BNB', 'op_bnb': 'BNB', 'boba_bnb': 'BNB',
    avalanche: 'AVAX', tron: 'TRX', sui: 'SUI', aptos: 'APT', near: 'NEAR',
    cosmos: 'ATOM', osmosis: 'ATOM', bitcoin: 'BTC', 'bsquared': 'BTC', mezo: 'BTC',
    bitlayer: 'BTC', merlin: 'BTC',
    fantom: 'FTM', cronos: 'CRO', 'gnosis': 'xDAI', xdai: 'xDAI', celo: 'CELO',
    cardano: 'ADA', polkadot: 'DOT', kusama: 'KSM', tezos: 'XTZ', algorand: 'ALGO',
    hedera: 'HBAR', stellar: 'XLM', ripple: 'XRP', 'xrpl evm': 'XRP', litecoin: 'LTC',
    doge: 'DOGE', dogechain: 'DOGE', kaspa: 'KAS', ton: 'TON', sei: 'SEI',
    injective: 'INJ', mantle: 'MNT', metis: 'METIS', kava: 'KAVA', klaytn: 'KLAY',
    chiliz: 'CHZ', ronin: 'RON', starknet: 'STRK', hyperliquid: 'HYPE', 'hyperliquid l1': 'HYPE',
    berachain: 'BERA', monad: 'MON', plasma: 'XPL', 'plume mainnet': 'PLUME',
    plume: 'PLUME', proton: 'XPR', provenance: 'HASH', qubic: 'QUBIC', rsk: 'RBTC',
    wemix: 'WEMIX', xdc: 'XDC', xion: 'XION', zigchain: 'ZIG', bittensor: 'TAO',
    canton: 'CC', 'bifrost network': 'BNC', bifrost: 'BNC',
    flare: 'FLR', songbird: 'SGB', zetachain: 'ZETA', stacks: 'STX', story: 'IP',
    mixin: 'XIN', arc: 'USDC', celestia: 'TIA',
  };
  return map[c] ?? null;
}

/** Capital for one farm position, from the protocol's own TVL. The bands are
 * illustrative example amounts only, not a recommendation: the farm steps label
 * them as such, and no step instructs spending them. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 540) return 60;
  return 45;
}

/**
 * The category's one action, in the words a farmer can follow. The action routes
 * through familyFor(), the same classifier the weekly action, the rewards check and
 * the log use. Every action is verify-first and non-transactional: the snapshot
 * carries no evidence of supported assets, pools, vaults, routes, rewards pages or
 * points programmes for any protocol, so no step instructs a deposit, trade, mint,
 * borrow, bridge, stake or claim. Each family names exactly what to verify on the
 * official app before any funds move, and says plainly not to act until the app
 * shows the action is supported. Leveraged or speculative families (derivatives,
 * prediction, insurance, RWA) carry an explicit risk note: they are not routine
 * low-risk farming.
 */
export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (familyFor(p)) {
    case 'lending': return `Verify on ${name}'s official app which assets it accepts as supply and which borrow markets exist, and what the current rates are — the snapshot does not list supported assets, so do not supply anything until the app shows it is supported.`;
    case 'dex': return `Verify on ${name}'s official app which pools exist on ${chain} and what assets they take — the snapshot does not list pools, so do not provide liquidity until the app shows a pool that takes an asset you hold.`;
    case 'bridge': return `Verify on ${name}'s official app which routes it supports from ${chain} and what the destination accepts — the snapshot does not list routes, so do not bridge anything until the app shows the route is supported.`;
    case 'staking': return `Verify on ${name}'s official app which staking asset it takes on ${chain} and what receipt token it issues — the snapshot does not name a staking asset, so do not stake anything until the app shows it is supported.`;
    case 'derivatives': return `Verify on ${name}'s official app whether it offers a hedged or margin product you can use with a small size, and read its liquidation terms — the snapshot does not establish a supported product, so do not deposit margin until the app shows one. Leveraged activity is not routine low-risk farming: if the app shows a product, size any position small and keep margin well above the liquidation level.`;
    case 'prediction': return `Verify on ${name}'s official app which markets are open and what the settlement rules are — the snapshot does not list markets, so do not fund a position until the app shows an open market. Prediction markets are speculative, not routine low-risk farming: only ever stake what you can lose.`;
    case 'curator': return `Verify on ${name}'s official app which vaults exist on ${chain}, what assets they take, and what the current share price is — the snapshot does not list vaults, so do not deposit until the app shows a vault that takes an asset you hold.`;
    case 'stable': return `Verify on ${name}'s official app which stable asset it mints or accepts on ${chain} and what backs it — the snapshot does not name the asset, so do not mint or deposit until the app shows it is supported.`;
    case 'rwa': return `Verify on ${name}'s official app which yield-bearing asset it offers on ${chain}, what backs it, and what the redemption terms are — the snapshot does not name the asset, so do not mint anything until the app shows it. RWA assets carry issuer and redemption risk, not routine low-risk farming: check the redemption terms first.`;
    case 'insurance': return `Verify on ${name}'s official app which cover it sells on ${chain}, what it covers, and what the premium and expiry are — the snapshot does not list cover products, so do not buy anything until the app shows a product that fits. Cover is not routine low-risk farming: read the policy terms and expiry before paying.`;
    case 'governance': return `Verify on ${name}'s official app whether it has an open governance round on ${chain} and what voting requires — the snapshot does not establish a round, so do not deposit or vote until the app shows one is open.`;
    case 'chain': return `Verify what one app built on ${name} supports on its own page; a chain itself takes no deposits. Do not move funds until the app shows what it supports.`;
    case 'payments': return `Verify on ${name}'s official app which payment methods it supports on ${chain} — the snapshot does not list them, so do not top up or spend until the app shows a supported method.`;
    case 'indexes': return `Verify on ${name}'s official app which index it tracks on ${chain} and what its current composition is — the snapshot does not name the index, so do not buy anything until the app shows it.`;
    case 'cedefi': return `Verify on ${name}'s official app which CeDeFi product it offers and what moves between its on-chain and off-chain legs — the snapshot does not name a product, so do not move anything until the app shows one.`;
    default: return `Verify supported actions and assets for ${name} on the official app before doing anything; do not move any funds until the app shows an action is supported. No deposit recommendation.`;
  }
}

/** The farm-plan family a category belongs to, so the weekly action, the rewards
 * check and the log all follow what the protocol actually does. No protocol name
 * is ever special-cased: the family comes from the snapshot's own category.
 * Labels are normalized the same way as for comparable pooling (trimmed and
 * case-folded), so whitespace or case cannot change the family. Specific rules
 * run before broad substrings: 'Yield Aggregator' contains 'yield', so the
 * curator/aggregator rule must be checked before the DEX rule's 'yield' match,
 * or the protocol would be routed to a liquidity-pool plan instead of a vault plan. */
export function familyFor(p: SnapshotProtocol): string {
  const c = normCategory(p.category);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('curator') || c.includes('allocator') || c.includes('aggregator')) return 'curator';
  // 'dex' is matched word-aware: 'Indexes' contains 'dex' as a substring but is an
  // index product, not a DEX. 'Dexs' starts with 'dex'; anything else needs ' dex'.
  if (c === 'dex' || c.startsWith('dex') || c.includes(' dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm') || c.includes('liquidity manager')) return 'dex';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('derivative') || c.includes('basis trading')) return 'derivatives';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('stablecoin')) return 'stable';
  if (c.includes('rwa') || c.includes('anchor btc') || c.includes('decentralized btc')) return 'rwa';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('governance')) return 'governance';
  if (c === 'chain') return 'chain';
  if (c.includes('payment') || c.includes('card issuer')) return 'payments';
  if (c.includes('index')) return 'indexes';
  if (c.includes('cedefi')) return 'cedefi';
  return 'other';
}

/** The weekly qualifying action, specific to the protocol's family. Like the entry
 * action it is verify-first: re-check what was verified on the official app and
 * confirm it still holds before doing anything. It never instructs a borrow,
 * bridge, restake, mint, trade or vote. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (familyFor(p)) {
    case 'lending': return `Each week, re-check ${name}'s official app for the supply and borrow markets you verified, and confirm the rates and collateral terms still hold before doing anything. Borrowing can be liquidated: never borrow against a position you cannot afford to top up.`;
    case 'dex': return `Each week, re-check ${name}'s official app for the pools you verified on ${chain} and confirm they still accept the asset before doing anything.`;
    case 'bridge': return `Each week, re-check ${name}'s official app for the bridge routes you verified and confirm the route is still supported before sending anything.`;
    case 'staking': return `Each week, re-check ${name}'s official app for the staking terms you verified on ${chain} and confirm the receipt token still matches before doing anything.`;
    case 'derivatives': return `Each week, re-check ${name}'s official app for the product you verified and confirm its terms still hold; do not open a new position on an unverified change.`;
    case 'prediction': return `Each week, re-check ${name}'s official app for newly opened markets and confirm the settlement rules before funding anything.`;
    case 'curator': return `Each week, re-check ${name}'s official app for the vaults you verified and confirm the allocation and share price before doing anything.`;
    case 'stable': return `Each week, re-check ${name}'s official app for the stable asset you verified on ${chain} and confirm the peg still holds before doing anything.`;
    case 'rwa': return `Each week, re-check ${name}'s official app for the asset you verified on ${chain} and confirm the yield and redemption terms before doing anything.`;
    case 'insurance': return `Each week, re-check ${name}'s official app that the cover you verified on ${chain} is still active and confirm the expiry before doing anything.`;
    case 'governance': return `Each week, re-check ${name}'s official app for a new governance round on ${name} and confirm what voting requires before doing anything.`;
    case 'chain': return `Each week, re-check one app built on ${chain} through ${name} and confirm what it supports on its own page before doing anything.`;
    case 'payments': return `Each week, re-check ${name}'s official app for the payment methods you verified on ${chain} and confirm they are still supported before spending.`;
    case 'indexes': return `Each week, re-check ${name}'s official app for the index you verified on ${chain} and confirm its composition before doing anything.`;
    case 'cedefi': return `Each week, re-check ${name}'s official app for the CeDeFi product you verified and confirm it is still offered before moving anything.`;
    default: return `Each week, check the official app for a supported qualifying action for ${name} and do only what it supports; do not deposit on a guess.`;
  }
}

/** Where the rewards for this family are checked, before any withdrawal. No step
 * asserts that a rewards or points programme exists: the snapshot does not
 * establish one for any protocol, so each family only asks whether the official
 * app and docs show one at all, and what it actually rewards. */
function claimFor(p: SnapshotProtocol): string {
  const name = p.name;
  switch (familyFor(p)) {
    case 'lending': return `Check ${name}'s official app and docs for whether it runs any points or borrow-rewards programme, and what activity it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'dex': return `Check ${name}'s official app and docs for whether it runs any points or trading-rewards programme, and what activity it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'bridge': return `Check ${name}'s official app and docs for whether it runs any points programme for bridge volume, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'staking': return `Check ${name}'s official app and docs for whether it runs any points programme for staking, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'derivatives': return `Check ${name}'s official app and docs for whether it runs any trading-rewards programme, and what volume it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'prediction': return `Check ${name}'s official app and docs for whether it runs any points programme for settled markets, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'curator': return `Check ${name}'s official app and docs for whether it runs any points programme for vault shares, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'stable': return `Check ${name}'s official app and docs for whether it runs any points programme for minting and holding, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'rwa': return `Check ${name}'s official app and docs for whether it runs any points or yield-rewards programme, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'insurance': return `Check ${name}'s official app and docs for whether it runs any points programme for cover, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'governance': return `Check ${name}'s official app and docs for whether it runs any voting-points or incentives programme, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'chain': return `Check ${name}'s official app and docs for whether it runs any activity-rewards programme on its chain, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'payments': return `Check ${name}'s official app and docs for whether it runs any cashback or points programme for spending, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'indexes': return `Check ${name}'s official app and docs for whether it runs any points programme for holding the index, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    case 'cedefi': return `Check ${name}'s official app and docs for whether it runs any points programme for CeDeFi activity, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
    default: return `Check ${name}'s official app and docs for whether it has any rewards or points programme at all, and what it actually rewards — the snapshot does not establish one, so do not assume a programme or a rewards page exists.`;
  }
}

/** What this family's farm log must record, so the position can be repeated or unwound. */
function logFor(p: SnapshotProtocol, capital: number): string {
  const name = p.name;
  switch (familyFor(p)) {
    case 'lending': return `Log the wallet, the supplied amount, each borrow and repayment, and the collateral ratio at each step, so the position can be unwound safely.`;
    case 'dex': return `Log the wallet, the pool, the deposit dates, and the fees collected, so the position's return can be compared with its impermanent loss.`;
    case 'bridge': return `Log the wallet, every bridge transaction hash, the amounts, and the destination chain, so a stuck bridge can be traced.`;
    case 'staking': return `Log the wallet, the staked amount, the receipt token balance, and each restake, so the yield can be checked against the receipt token's value.`;
    case 'derivatives': return `Log the wallet, the margin, the entry and exit prices, and the funding paid, so the trade's cost is known before the next round.`;
    case 'prediction': return `Log the wallet, each market, the stake, and the outcome, so winning and losing markets can be compared.`;
    case 'curator': return `Log the wallet, the vault, the share price at each deposit, and every top-up, so the return can be checked against the share price.`;
    case 'stable': return `Log the wallet, the minted amount, the collateral behind it, and the peg at each step, so a depeg can be spotted early.`;
    case 'rwa': return `Log the wallet, the amount minted, the yield accrued, and the redemption terms, so the position can be exited on schedule.`;
    case 'insurance': return `Log the wallet, the cover amount, the premium paid, and the expiry date, so the policy is never left to lapse unnoticed.`;
    case 'governance': return `Log the wallet, each proposal voted on, the deposit, and the incentives received, so the next round can be repeated.`;
    case 'chain': return `Log the wallet, the apps used, and the dates, so the on-chain activity can be shown in one place.`;
    case 'payments': return `Log the wallet, each payment, and the rewards earned, so the spending can be matched to the points.`;
    case 'indexes': return `Log the wallet, the index composition, and each rebalance, so the holding can be compared with the index.`;
    case 'cedefi': return `Log the wallet, each product used, and the amounts, so the CeDeFi activity can be shown in one place.`;
    default: return `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`;
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names. Step 2 is the category's verify-first entry action;
 * steps 3 and 5 are the same family's weekly re-check and rewards check, so every
 * step fits what the protocol actually does — and no step instructs a transaction
 * the snapshot cannot support. The hold step applies only if an action was verified
 * and taken; if nothing was supported, no position is opened on a guess. Network
 * fees are variable: no step states a fixed gas dollar amount, and an unknown fee
 * asset is named as unverified, never guessed.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasToken(chain);
  const gasCost =
    gas !== null
      ? `network fee, variable — check the current fee before sending, paid in ${gas}`
      : `network fee, variable — check the current fee and the fee asset for ${chain} before sending`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gasCost,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} illustrative example capital, not a recommendation; network fee, variable — check the current fee`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, capital, chain),
      cost: 'network fee, variable — check the current fee',
      time: '10 minutes a week',
    },
    {
      text: `If you verified a supported action and took a position, hold it for at least ${hold} days so the activity is counted in more than one snapshot. If nothing was supported, do not open a position on a guess.`,
      cost: `the $${capital} figure is an illustrative example, not a recommendation; it stays in the position only if one was opened`,
      time: `${hold} days`,
    },
    {
      text: claimFor(p),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: logFor(p, capital),
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** How many unpriced live-token protocols the Live tab lists separately. */
export const LIVE_UNPRICED_ROWS = 24;

/** The live-token protocols, by market cap, for the dashboard's Live tab: only
 * protocols with a positive market cap, so "already trades" means a price exists.
 * Ties on market cap and TVL break on slug, so the order does not depend on the
 * snapshot's input order. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => tokenState(p) === 'live-priced' && !isCexCategory(p.category))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Token metadata present but no market price: shown separately from "already trades",
 * largest TVL first, so the dashboard never calls an unpriced token live. */
export function liveUnpricedRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => tokenState(p) === 'unpriced' && !isCexCategory(p.category))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_UNPRICED_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's form for data.js, farm plan included so page and board agree. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_live_n: row.model.category_live_n,
    category_iqr: row.model.category_iqr,
    category_median: row.model.category_median,
    confidence: row.model.confidence,
    growth_missing: row.model.growth_missing,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const liveUnpriced = liveUnpricedRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const excluded = snapshot.protocols.filter(
    (p) => isRankable(p) && !snapshot.watchlist.includes(p.slug) && p.tvl_usd >= snapshot.floor_usd,
  );
  // The excluded, by their own category, on normalized keys: a bridge by name is a
  // bridge, liquid-staking and restaked BTC are their own categories. The rest are
  // excluded by the supplied watchlist rule; the snapshot fields do not establish
  // why, so no reason is claimed.
  const bridges = excluded.filter((p) => normCategory(p.category).includes('bridge')).length;
  const liquidStaking = excluded.filter((p) => normCategory(p.category) === 'liquid staking').length;
  const restakedBtc = excluded.filter((p) => normCategory(p.category) === 'restaked btc').length;
  const other = excluded.length - bridges - liquidStaking - restakedBtc;
  if (bridges + liquidStaking + restakedBtc + other !== excluded.length) {
    throw new SnapshotError('excluded breakdown does not sum to the excluded count');
  }
  const multiples = categoryMultiples(
    snapshot.protocols.filter((p) => !isPreToken(p) && !isCexCategory(p.category)),
    model,
  );
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(multiples.global),
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    excluded_above_floor: excluded.length,
    excluded_breakdown: {
      bridges,
      liquid_staking: liquidStaking,
      restaked_btc: restakedBtc,
      other,
    },
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    live_unpriced: liveUnpriced,
    live_unpriced_size: snapshot.protocols.filter((p) => tokenState(p) === 'unpriced' && !isCexCategory(p.category)).length,
  };
  return { board, radar };
}

/** A real calendar date in YYYY-MM-DD form: the shape check alone would accept 2026-02-30. */
function isValidCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m === null) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores.
 * The checks are strict on purpose: a duplicate slug, a watchlist slug the snapshot
 * does not hold, a non-positive TVL, a malformed listing date, or a zero market cap
 * passed off as a price all fail here, before any row is scored. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !isValidCalendarDate(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  if (new Set(o.watchlist as string[]).size !== (o.watchlist as string[]).length) throw new SnapshotError('snapshot.json has duplicate watchlist slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.trim() === '' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    if (p.tvl_usd <= 0) throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has a non-positive TVL`);
    if (typeof p.listed_at === 'string' && !isValidCalendarDate(p.listed_at)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has a malformed listed_at date`);
    }
    if (p.listed_at !== null && p.listed_at !== undefined && typeof p.listed_at !== 'string') {
      throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has a non-string listed_at date`);
    }
    if (typeof p.listed_at === 'string' && Date.parse(`${p.listed_at}T00:00:00Z`) > Date.parse(`${o.as_of}T00:00:00Z`)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} (${p.slug}) has a listed_at date after as_of`);
    }
    // A zero market cap counts as no market cap: it is unpriced, never a price of $0.
    // A negative market cap is not a price either, so it normalizes to null here at
    // the parser boundary. A hard reject would make the sealed snapshot itself
    // unparseable — it carries one such record (autofinance, mcap_usd -1 with token
    // metadata, already treated as unpriced) — so the parser refuses the value as
    // evidence instead of the whole document. Either way a negative cap can never
    // enter a multiple or a live price: both require a positive market cap.
    const mcap = typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null;
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      // Chains are deduplicated on a normalized key in input order, so a
      // repeated or cosmetically different label cannot inflate breadth.
      chains: dedupChains(p.chains),
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: mcap === null || mcap <= 0 ? null : mcap,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  const seen = new Set<string>();
  for (const p of protocols) {
    if (seen.has(p.slug)) throw new SnapshotError(`snapshot.json has a duplicate slug: ${p.slug}`);
    seen.add(p.slug);
  }
  for (const slug of o.watchlist as string[]) {
    if (!seen.has(slug)) throw new SnapshotError(`watchlist slug ${slug} is not in the snapshot`);
  }
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: exact eligible-set coverage,
 * unique slugs, watchlist members present and pre-token, ranks bound to row
 * position, order with the slug tie-break on equal implied values, one shared
 * implied value, and farm steps. The expected set is the watchlist plus every
 * rankable pre-token protocol below the floor, each exactly once. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const boardSlugs = board.map((r) => r.slug);
  if (new Set(boardSlugs).size !== boardSlugs.length) return 'the board has duplicate slugs';
  const index = bySlug(snapshot.protocols);
  const expected = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (!expected.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) expected.add(p.slug);
  }
  const boardSet = new Set(boardSlugs);
  const missing = [...expected].filter((s) => !boardSet.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} eligible slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const extra = boardSlugs.filter((s) => !expected.has(s));
  if (extra.length > 0) return `the board has ${extra.length} slug${extra.length === 1 ? '' : 's'} outside the eligible set: ${extra.slice(0, 5).join(', ')}`;
  const earlyExpected = [...expected].filter((s) => !snapshot.watchlist.includes(s)).length;
  const earlyActual = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  if (earlyActual !== earlyExpected) return `the board has ${earlyActual} early rows, expected ${earlyExpected}`;
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p === undefined) return `watchlist slug ${slug} is not in the snapshot`;
    if (!isPreToken(p)) return `watchlist slug ${slug} is not pre-token`;
    // The gate enforces the full watchlist contract itself: buildBoard() also
    // rejects these, but a board handed to this gate directly must not pass
    // with a CEX/versioned or below-floor watchlist member.
    if (!isRankable(p)) return `watchlist slug ${slug} is not rankable (exchange or versioned pool)`;
    if (p.tvl_usd < snapshot.floor_usd) return `watchlist slug ${slug} is below the $${snapshot.floor_usd} floor`;
  }
  // Rank is bound to row position: row i+1 must carry rank i+1. Sorting the
  // rank values first (the old check) would accept a board whose ranks were
  // swapped between rows, so the gate reads each row's own rank in place.
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `row ${i + 1} has rank ${board[i]!.rank}, expected ${i + 1}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
    // Equal implied values tie-break on slug ascending: a reordered tie is a
    // different board, not the same ranking.
    if (board[i]!.implied_value_usd === board[i - 1]!.implied_value_usd && board[i - 1]!.slug > board[i]!.slug) {
      return `rows ${i} and ${i + 1} tie on implied value $${board[i]!.implied_value_usd} but slugs are out of order (${board[i - 1]!.slug} before ${board[i]!.slug})`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
