const SAMPLE_TIMESTAMPS = [
  1727793000000,
  1727793060000,
  1727793120000,
  1727793180000,
  1727793240000,
  1727793300000
];

const SPY_PRICES = [
  { o: 430.1, h: 430.5, l: 429.9, c: 430.4, v: 1200000 },
  { o: 430.42, h: 430.6, l: 430.1, c: 430.2, v: 980000 },
  { o: 430.18, h: 430.55, l: 430.0, c: 430.48, v: 860000 },
  { o: 430.46, h: 430.8, l: 430.2, c: 430.7, v: 910000 },
  { o: 430.68, h: 431.0, l: 430.5, c: 430.95, v: 800000 },
  { o: 430.96, h: 431.1, l: 430.7, c: 430.85, v: 750000 }
];

const AAPL_PRICES = [
  { o: 170.0, h: 170.2, l: 169.8, c: 170.1, v: 2200000 },
  { o: 170.12, h: 170.3, l: 169.9, c: 170.05, v: 2100000 },
  { o: 170.04, h: 170.25, l: 169.95, c: 170.2, v: 1900000 },
  { o: 170.22, h: 170.4, l: 170.0, c: 170.1, v: 2000000 },
  { o: 170.08, h: 170.35, l: 169.98, c: 170.25, v: 1850000 },
  { o: 170.26, h: 170.5, l: 170.1, c: 170.45, v: 1750000 }
];

const MSFT_PRICES = [
  { o: 315.5, h: 315.9, l: 315.2, c: 315.7, v: 1500000 },
  { o: 315.72, h: 316.1, l: 315.4, c: 315.95, v: 1480000 },
  { o: 315.96, h: 316.3, l: 315.6, c: 316.18, v: 1420000 },
  { o: 316.2, h: 316.6, l: 315.9, c: 316.42, v: 1380000 },
  { o: 316.45, h: 316.9, l: 316.2, c: 316.75, v: 1330000 },
  { o: 316.78, h: 317.1, l: 316.5, c: 316.88, v: 1290000 }
];

const BASE_SERIES = {
  SPY: buildSeries('SPY', SPY_PRICES),
  AAPL: buildSeries('AAPL', AAPL_PRICES),
  MSFT: buildSeries('MSFT', MSFT_PRICES)
};

function last(arr) {
  return arr[arr.length - 1];
}

function buildSeries(symbol, prices) {
  return SAMPLE_TIMESTAMPS.map((t, index) => ({
    t,
    symbol,
    ...prices[index]
  }));
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function toMs(iso) {
  return iso ? new Date(iso).getTime() : null;
}

function filterRange(candles, startMs, endMs) {
  const subset = candles.filter((candle) => {
    const afterStart = startMs == null || candle.t >= startMs;
    const beforeEnd = endMs == null || candle.t <= endMs;
    return afterStart && beforeEnd;
  });
  return subset.length ? subset : candles;
}

function aggregateCandles(candles, target) {
  if (!candles.length || target === '1m' || !target) {
    return candles;
  }
  const sizeMinutes = target === '5m' ? 5 : target === '15m' ? 15 : 1;
  const bucketMs = sizeMinutes * 60 * 1000;
  const grouped = [];
  let bucket = null;

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
        v: candle.v
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
    v: bucket.v
  };
}

export function getOfflineCandles({ symbol, interval = '1m', start, end, aggregate }) {
  const key = (symbol || '').toUpperCase();
  const base = BASE_SERIES[key];
  if (!base) {
    return null;
  }
  const startMs = toMs(start);
  const endMs = toMs(end);
  const filtered = filterRange(base, startMs, endMs);
  const aggregated = aggregateCandles(filtered, aggregate || interval);
  return {
    symbol: key,
    interval,
    aggregate: aggregate || interval,
    candles: aggregated,
    offline: true,
    from: 'static-sample',
    rangeStart: filtered[0]?.t ?? SAMPLE_TIMESTAMPS[0],
    rangeEnd: filtered.length ? last(filtered).t : last(SAMPLE_TIMESTAMPS),
    updated: Date.now() - YEAR_MS
  };
}

export function hasOfflineSupport(symbol) {
  return Boolean(BASE_SERIES[(symbol || '').toUpperCase()]);
}
