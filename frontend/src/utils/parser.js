const toNumber = (input) => Number(input.replace(/[$,%\s,]/g, ''));

const symbolMap = {
  spy: 'SPY',
  tesla: 'TSLA',
  tsla: 'TSLA',
  apple: 'AAPL',
  aapl: 'AAPL',
  microsoft: 'MSFT',
  msft: 'MSFT',
  qqq: 'QQQ'
};

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

const detectCadence = (text) => {
  const cadenceMatch = text.match(/(every|each|per)\s+(monday|tuesday|wednesday|thursday|friday|day|daily|week|weekly|month|monthly)/);
  if (cadenceMatch) {
    const cadence = cadenceMatch[2];
    return dayMap[cadence] ?? null;
  }
  if (text.includes('rebalance monthly')) return 'monthly';
  return null;
};

export function parseMessage(text) {
  const message = text.trim();
  const lower = message.toLowerCase();

  const capitalMatch = lower.match(/(start with|set capital|capital)\s+([$\d,\.]+)/);
  if (capitalMatch) {
    return {
      type: 'set_capital',
      payload: { value: toNumber(capitalMatch[2]) }
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

  const scheduleMatch = lower.match(/\b(buy|sell)\s+([a-z]{1,10})\s+every\s+([a-z]+)/);
  if (scheduleMatch && dayMap[scheduleMatch[3]]) {
    const symbol = resolveSymbol(scheduleMatch[2]);
    if (!symbol) {
      return { type: 'noop', payload: { message } };
    }
    return {
      type: 'schedule',
      payload: {
        action: scheduleMatch[1],
        symbol,
        cadence: dayMap[scheduleMatch[3]]
      }
    };
  }

  if (lower.includes('rebalance monthly')) {
    return {
      type: 'schedule',
      payload: { action: 'rebalance', cadence: 'monthly' }
    };
  }

  const dcaMatch = lower.match(
    /(buy|buying)\s+(?:a|an|one|\d+)?\s*([a-z]{2,15})\s+(?:stock|shares?).*?(\d+(?:\.\d+)?)\s*(?:usd|dollars|\$).*?(each|every)\s+(monday|tuesday|wednesday|thursday|friday|month|monthly|week|weekly)/
  );
  if (dcaMatch) {
    const symbol = resolveSymbol(dcaMatch[2]);
    const cadence = dayMap[dcaMatch[5]];
    if (symbol && cadence) {
      return {
        type: 'schedule',
        payload: {
          action: 'buy',
          symbol,
          cadence,
          notional: Number(dcaMatch[3])
        }
      };
    }
  }

  const cadence = detectCadence(lower);
  if (cadence) {
    const genericMatch = lower.match(/\b(buy|sell)\s+([a-z]{1,15})/);
    if (genericMatch) {
      const symbol = resolveSymbol(genericMatch[2]);
      if (symbol) {
        const notionalMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:usd|dollars|\$)/);
        return {
          type: 'schedule',
          payload: {
            action: genericMatch[1],
            symbol,
            cadence,
            notional: notionalMatch ? Number(notionalMatch[1]) : undefined
          }
        };
      }
    }
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
        interval: dateRangeMatch[4] || '1m'
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
