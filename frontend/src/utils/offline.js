const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL = '1h';
const DEFAULT_LOOKBACK_YEARS = 10;

const STATIC_KEYS = new Set(['SPY', 'AAPL', 'MSFT']);
const BASE_SAMPLES = buildBaseSamples();

function buildBaseSamples() {
  const now = Date.now();
  const stepMs = intervalToMs(DEFAULT_INTERVAL);
  const pointsPerYear = Math.round(YEAR_MS / stepMs);
  const totalPoints = DEFAULT_LOOKBACK_YEARS * pointsPerYear;
  const seeds = {
    SPY: { base: 430, spread: 1.2 },
    AAPL: { base: 170, spread: 0.9 },
    MSFT: { base: 315, spread: 1.1 },
  };

  return Object.fromEntries(
    Object.entries(seeds).map(([symbol, { base, spread }]) => [
      symbol,
      buildSeededSeries({
        symbol,
        basePrice: base,
        spread,
        startMs: now - totalPoints * stepMs,
        points: totalPoints,
        interval: DEFAULT_INTERVAL,
      }),
    ]),
  );
}

function buildSeededSeries({ symbol, basePrice, spread, startMs, points, interval = DEFAULT_INTERVAL }) {
  const stepMs = intervalToMs(interval);
  const candles = [];
  let price = basePrice;
  for (let i = 0; i < points; i += 1) {
    const t = startMs + i * stepMs;
    const drift = Math.sin(i / 48) * spread;
    const shock = ((hashCode(`${symbol}-${i}`) % 23) - 11) * spread * 0.05;
    const open = price;
    const close = Math.max(0.5, open + drift + shock);
    const high = Math.max(open, close) + Math.abs(drift) * 0.6 + spread * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.6 - spread * 0.3;
    const volume = 400000 + ((hashCode(`${symbol}-v-${i}`) >>> 0) % 800000);
    candles.push({ t, symbol, o: open, h: high, l: low, c: close, v: volume });
    price = close;
  }
  return candles;
}

function pseudoRandom(seed) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSyntheticSeries(symbol, startMs, endMs, interval = DEFAULT_INTERVAL) {
  const stepMs = intervalToMs(interval);
  const now = Date.now();
  const defaultSpan = DEFAULT_LOOKBACK_YEARS * YEAR_MS;
  const start = startMs ?? (endMs ? endMs - defaultSpan : now - defaultSpan);
  const end = endMs ?? start + defaultSpan;
  const total = Math.max(1, Math.floor((end - start) / stepMs));
  const seed = Math.abs(hashCode(`${symbol}-${start}-${end}-${interval}`));
  const rand = pseudoRandom(seed);
  const base = 40 + (Math.abs(hashCode(symbol)) % 400);
  let price = base;
  const candles = [];

  for (let i = 0; i <= total; i += 1) {
    const t = start + i * stepMs;
    const drift = (rand() - 0.5) * (base * 0.004);
    const shock = (rand() - 0.5) * (base * 0.006);
    const spread = base * 0.0015 * rand();
    const open = price;
    const close = Math.max(0.5, open + drift + shock);
    const high = Math.max(open, close) + spread;
    const low = Math.max(0.1, Math.min(open, close) - spread);
    const volume = 250000 + Math.floor(rand() * 1_200_000);
    candles.push({ t, symbol, o: open, h: high, l: low, c: close, v: volume });
    price = close;
  }

  return candles;
}

function hashCode(input) {
  const str = String(input ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function intervalToMs(interval) {
  if (!interval) return 60 * 60 * 1000;
  const lower = interval.toLowerCase();
  if (lower.endsWith('m')) return Number(lower.slice(0, -1) || '1') * 60 * 1000;
  if (lower.endsWith('h')) return Number(lower.slice(0, -1) || '1') * 60 * 60 * 1000;
  if (lower.endsWith('d')) return Number(lower.slice(0, -1) || '1') * 24 * 60 * 60 * 1000;
  if (lower.endsWith('w')) return Number(lower.slice(0, -1) || '1') * 7 * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function toMs(iso) {
  return iso ? new Date(iso).getTime() : null;
}

function filterRange(candles, startMs, endMs) {
  const subset = candles.filter((candle) => {
    const afterStart = startMs == null || candle.t >= startMs;
    const beforeEnd = endMs == null || candle.t <= endMs;
    return afterStart && beforeEnd;
  });
  if (subset.length) return subset;
  return candles;
}

function aggregateCandles(candles, target, baseInterval = DEFAULT_INTERVAL) {
  if (!candles.length || !target) {
    return candles;
  }
  const targetMs = intervalToMs(target);
  const baseMs = intervalToMs(baseInterval);
  if (!targetMs || !baseMs || targetMs <= baseMs) {
    return candles;
  }

  const grouped = [];
  let bucket = null;
  const bucketMs = targetMs;

  candles.forEach((candle) => {
    const bucketStart = Math.floor(candle.t / bucketMs) * bucketMs;
    if (!bucket || bucket.start !== bucketStart) {
      if (bucket) {
        grouped.push(finaliseBucket(bucket));
      }
      bucket = {
        start: bucketStart,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v: candle.v,
      };
    } else {
      bucket.h = Math.max(bucket.h, candle.h);
      bucket.l = Math.min(bucket.l, candle.l);
      bucket.c = candle.c;
      bucket.v += candle.v;
    }
  });

  if (bucket) {
    grouped.push(finaliseBucket(bucket));
  }

  return grouped;
}

function finaliseBucket(bucket) {
  return {
    t: bucket.start,
    o: bucket.o,
    h: bucket.h,
    l: bucket.l,
    c: bucket.c,
    v: bucket.v,
  };
}

function resolveSeries(symbol, startMs, endMs, interval) {
  if (!symbol) return { series: [], synthetic: true };
  const upper = symbol.toUpperCase();
  const existing = BASE_SAMPLES[upper];
  if (existing && coversRange(existing, startMs, endMs)) {
    return { series: existing, synthetic: !STATIC_KEYS.has(upper) };
  }
  const generated = generateSyntheticSeries(upper, startMs, endMs, interval);
  BASE_SAMPLES[upper] = generated;
  STATIC_KEYS.delete(upper);
  return { series: generated, synthetic: true };
}

function coversRange(series, startMs, endMs) {
  if (!series?.length) return false;
  const first = series[0].t;
  const last = series[series.length - 1].t;
  const afterStart = startMs == null || startMs >= first;
  const beforeEnd = endMs == null || endMs <= last;
  return afterStart && beforeEnd;
}

export function getOfflineCandles({ symbol, interval = DEFAULT_INTERVAL, start, end, aggregate }) {
  const key = (symbol || 'SPY').toUpperCase();
  const startMs = toMs(start);
  const endMs = toMs(end);
  const { series: base, synthetic } = resolveSeries(key, startMs, endMs, interval);
  const filtered = filterRange(base, startMs, endMs);
  const aggregated = aggregateCandles(filtered, aggregate || interval, interval);
  return {
    symbol: key,
    interval,
    aggregate: aggregate || interval,
    candles: aggregated,
    offline: true,
    from: synthetic ? 'synthetic-sample' : 'static-sample',
    rangeStart: filtered[0]?.t ?? aggregated[0]?.t ?? Date.now() - YEAR_MS,
    rangeEnd: filtered.length ? filtered[filtered.length - 1].t : aggregated.length ? aggregated[aggregated.length - 1].t : Date.now(),
    updated: Date.now() - YEAR_MS,
  };
}

export function hasOfflineSupport() {
  return true;
}

