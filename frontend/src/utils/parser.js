const toNumber = (input) => Number(input.replace(/[$,%\s,]/g, ''));

const dayMap = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday'
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

  const buyAllMatch = lower.match(/\b(buy|sell)\s+(all|everything)\s+([a-z]{1,5})/);
  if (buyAllMatch) {
    return {
      type: buyAllMatch[1] === 'buy' ? 'buy' : 'sell',
      payload: { symbol: buyAllMatch[3].toUpperCase(), all: true }
    };
  }

  const qtyMatch = lower.match(/\b(buy|sell)\s+(\d+(?:\.\d+)?)\s*([a-z]{1,5})/);
  if (qtyMatch) {
    return {
      type: qtyMatch[1] === 'buy' ? 'buy' : 'sell',
      payload: { symbol: qtyMatch[3].toUpperCase(), qty: Number(qtyMatch[2]) }
    };
  }

  const allocMatch = lower.match(/(allocate|weight|put)\s+(\d+)%\s+(?:to|into)\s+([a-z]{1,5})/);
  if (allocMatch) {
    return {
      type: 'allocate',
      payload: { symbol: allocMatch[3].toUpperCase(), weight: Number(allocMatch[2]) / 100 }
    };
  }

  const scheduleMatch = lower.match(/\b(buy|sell)\s+([a-z]{1,5})\s+every\s+([a-z]+)/);
  if (scheduleMatch && dayMap[scheduleMatch[3]]) {
    return {
      type: 'schedule',
      payload: {
        action: scheduleMatch[1],
        symbol: scheduleMatch[2].toUpperCase(),
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

  return {
    type: 'noop',
    payload: { message }
  };
}
