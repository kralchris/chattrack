const toNumber = (input) => Number(input.replace(/[$,%\s,]/g, ''));

const symbolMap = {
  spy: 'SPY',
  tesla: 'TSLA',
  tsla: 'TSLA',
  apple: 'AAPL',
  aapl: 'AAPL',
  amazon: 'AMZN',
  amzn: 'AMZN',
  microsoft: 'MSFT',
  msft: 'MSFT',
  google: 'GOOGL',
  googl: 'GOOGL',
  goog: 'GOOG',
  alphabet: 'GOOGL',
  meta: 'META',
  facebook: 'META',
  qqq: 'QQQ'
};

const techUniverse = ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'META', 'AMD', 'ORCL', 'ADBE'];

const dayMap = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  weekly: 'weekly',
  week: 'weekly',
  daily: 'daily',
  day: 'daily',
  monthly: 'monthly',
  month: 'monthly'
};

const resolveSymbol = (raw) => {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (symbolMap[cleaned]) return symbolMap[cleaned];
  if (/^[a-z]{1,5}$/.test(cleaned)) return cleaned.toUpperCase();
  return null;
};

const hashString = (input) => {
  let hash = 0;
  const str = String(input ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
};

const pickTechSymbol = (message) => {
  const seed = hashString(message);
  return techUniverse[seed % techUniverse.length];
};

const unitToMs = (amount, unit) => {
  const lower = unit.toLowerCase();
  if (lower.startsWith('day')) return amount * 24 * 60 * 60 * 1000;
  if (lower.startsWith('week')) return amount * 7 * 24 * 60 * 60 * 1000;
  if (lower.startsWith('month')) return amount * 30 * 24 * 60 * 60 * 1000;
  if (lower.startsWith('year')) return amount * 365 * 24 * 60 * 60 * 1000;
  return 0;
};

const detectCadence = (text) => {
  const cadenceMatch = text.match(/(every|each|per)\s+(monday|tuesday|wednesday|thursday|friday|day|daily|week|weekly|month|monthly)/);
  if (cadenceMatch) {
    const cadence = cadenceMatch[2];
    return dayMap[cadence] ?? null;
  }
  if (text.includes('rebalance monthly')) return 'monthly';
  return null;
};

const extractSchedule = (message, lower) => {
  const cadence = detectCadence(lower);
  if (!cadence) return null;

  const actionMatch = lower.match(/\b(buy|sell|invest)\b/);
  if (!actionMatch) return null;

  const actionWord = actionMatch[1];
  const action = actionWord === 'sell' ? 'sell' : 'buy';

  const tokens = lower
    .replace(/[,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const actionIndex = tokens.findIndex((token) => ['buy', 'sell', 'invest'].includes(token));
  if (actionIndex === -1) return null;

  let symbol = null;
  let qty;

  const filler = new Set([
    'of',
    'in',
    'into',
    'to',
    'the',
    'a',
    'an',
    'one',
    'some',
    'more',
    'additional',
    'stock',
    'stocks',
    'share',
    'shares',
    'unit',
    'units',
    'each',
    'every',
    'per',
    'for',
    'past',
    'over',
    'last',
    'this',
    'that',
    'daily',
    'day',
    'days',
    'weekly',
    'week',
    'weeks',
    'monthly',
    'month',
    'months',
    'year',
    'years',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'today',
    'tomorrow',
    'ago',
    'usd',
    'dollars',
    '$',
    'random',
    'choice',
    'tech',
    'technology',
    'sector'
  ]);

  const isFiller = (token) => filler.has(token);

  for (let i = actionIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (['every', 'each', 'per'].includes(token)) break;
    if (isFiller(token)) continue;

    if (/^\d+(?:\.\d+)?$/.test(token)) {
      const next = tokens[i + 1];
      const nextResolved = next && !isFiller(next) ? resolveSymbol(next) : null;
      const following = tokens[i + 1];
      const followingIsShare = following && ['share', 'shares', 'unit', 'units'].includes(following);
      if (followingIsShare) {
        qty = Number(token);
        i += 1;
        continue;
      }
      if (nextResolved) {
        qty = Number(token);
        symbol = symbol || nextResolved;
        i += 1;
        continue;
      }
      continue;
    }

    const resolved = resolveSymbol(token);
    if (resolved) {
      symbol = resolved;
      continue;
    }
  }

  if (!symbol) {
    const fallbackMatch = lower.match(/([a-z]{2,15})\s+(?:stock|stocks|shares?)/);
    if (fallbackMatch) {
      symbol = resolveSymbol(fallbackMatch[1]);
    }
  }

  if (!symbol) {
    const anyToken = tokens
      .map((token) => (isFiller(token) ? null : resolveSymbol(token)))
      .find((val) => val);
    if (anyToken) symbol = anyToken;
  }

  if ((symbol && (symbol === 'TECH' || symbol === 'TECHN')) || lower.includes('random tech') || lower.includes('random technology')) {
    symbol = pickTechSymbol(message);
  }

  if (!symbol) return null;

  const currencyPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:usd|dollars|\$)/,
    /\$(\d+(?:\.\d+)?)/
  ];
  let notional;
  for (const pattern of currencyPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const rawAmount = match[1] ?? match[2];
      if (rawAmount != null) {
        notional = toNumber(String(rawAmount));
        break;
      }
    }
  }

  const allFlag =
    action === 'sell' && (lower.includes('sell all') || lower.includes('sell everything') || lower.includes('liquidate'));

  const payload = {
    action,
    symbol,
    cadence,
    qty: qty ? Number(qty) : undefined,
    notional: notional || undefined,
    all: allFlag || undefined
  };

  if (payload.action === 'buy' && !payload.qty && !payload.notional && !payload.all) {
    payload.qty = 1;
  }

  if (payload.action === 'sell' && !payload.qty && !payload.notional && !payload.all) {
    payload.all = true;
  }

  if (lower.includes('buy or sell') || lower.includes('random choice')) {
    payload.randomAction = ['buy', 'sell'];
    payload.randomSeed = hashString(message);
    payload.note = 'Randomized direction';
  }

  const holdMatch = lower.match(/sell after\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (holdMatch) {
    const holdMs = unitToMs(Number(holdMatch[1]), holdMatch[2]);
    if (holdMs > 0) {
      payload.holdPeriodMs = holdMs;
      payload.note = payload.note ? `${payload.note}; exit after ${holdMatch[1]} ${holdMatch[2]}` : `Exit after ${holdMatch[1]} ${holdMatch[2]}`;
    }
  }

  const followUps = [];
  const wantsLiquidate =
    lower.includes('sell all stocks') ||
    lower.includes('sell all holdings') ||
    lower.includes('sell all positions') ||
    lower.includes('sell everything') ||
    lower.includes('liquidate');

  if (wantsLiquidate) {
    followUps.push({
      type: 'liquidate',
      payload: {
        when: lower.includes('today') || lower.includes('now') ? 'end' : 'immediate'
      }
    });
  }

  const result = {
    type: 'schedule',
    payload
  };

  if (followUps.length) {
    result.followUps = followUps;
  }

  return result;
};

export function parseMessage(text) {
  const message = text.trim();
  const lower = message.toLowerCase();

  const scheduleParsed = extractSchedule(message, lower);
  if (scheduleParsed) {
    return scheduleParsed;
  }

  const capitalMatch = message.match(/(?:start with|set capital|capital|bankroll)[^\d$]*([$]?\d[\d,]*(?:\.\d+)?)/i);
  if (capitalMatch) {
    return {
      type: 'set_capital',
      payload: { value: toNumber(capitalMatch[1]) }
    };
  }

  const liquidateMatch = lower.match(
    /(liquidate(?: all)?(?: positions| holdings| everything| portfolio)?)|(sell all (?:stocks|positions|holdings|everything))/
  );
  if (liquidateMatch) {
    return {
      type: 'liquidate',
      payload: {
        when: lower.includes('today') || lower.includes('now') ? 'end' : 'immediate'
      }
    };
  }

  const buyAllMatch = lower.match(/\b(buy|sell)\s+(all|everything)\s+([a-z]{1,10})/);
  if (buyAllMatch) {
    const symbol = resolveSymbol(buyAllMatch[3]);
    if (!symbol) {
      return { type: 'noop', payload: { message } };
    }
    return {
      type: buyAllMatch[1] === 'buy' ? 'buy' : 'sell',
      payload: { symbol, all: true }
    };
  }

  const qtyMatch = lower.match(/\b(buy|sell)\s+(\d+(?:\.\d+)?)\s*([a-z]{1,10})/);
  if (qtyMatch) {
    const symbol = resolveSymbol(qtyMatch[3]);
    if (!symbol) {
      return { type: 'noop', payload: { message } };
    }
    return {
      type: qtyMatch[1] === 'buy' ? 'buy' : 'sell',
      payload: { symbol, qty: Number(qtyMatch[2]) }
    };
  }

  const allocMatch = lower.match(/(allocate|weight|put)\s+(\d+)%\s+(?:to|into)\s+([a-z]{1,10})/);
  if (allocMatch) {
    const symbol = resolveSymbol(allocMatch[3]);
    if (!symbol) {
      return { type: 'noop', payload: { message } };
    }
    return {
      type: 'allocate',
      payload: { symbol, weight: Number(allocMatch[2]) / 100 }
    };
  }

  if (lower.includes('rebalance monthly')) {
    return {
      type: 'schedule',
      payload: { action: 'rebalance', cadence: 'monthly' }
    };
  }

  const dateRangeMatch = lower.match(
    /(backtest|test)\s+([0-9]{4}-[0-9]{2}-[0-9]{2})\s+(?:to|-)\s*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:.*?(\d+m))?/
  );
  if (dateRangeMatch) {
    return {
      type: 'set_dates',
      payload: {
        start: dateRangeMatch[2],
        end: dateRangeMatch[3],
        interval: dateRangeMatch[4] || '1h'
      }
    };
  }

  const maMatch = lower.match(/ma\s*(\d{2,3})/);
  if (maMatch) {
    return {
      type: 'rule',
      payload: { rule: `ma${maMatch[1]}` }
    };
  }

  const exitDropMatch = lower.match(/exit if (?:price )?drop(?:s)?\s*(\d+)%/);
  if (exitDropMatch) {
    return {
      type: 'rule',
      payload: { rule: 'trailing_stop', threshold: Number(exitDropMatch[1]) / 100 }
    };
  }

  const relativeRangeMatch = lower.match(/past\s+(\d+)?\s*(day|days|week|weeks|month|months|year|years)/);
  if (relativeRangeMatch) {
    return {
      type: 'set_dates_relative',
      payload: {
        amount: Number(relativeRangeMatch[1] || 1),
        unit: relativeRangeMatch[2]
      }
    };
  }

  return {
    type: 'noop',
    payload: { message }
  };
}
