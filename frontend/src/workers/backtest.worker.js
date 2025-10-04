const FEE_RATE = 0.0005;

const buildTimeline = (candlesBySymbol) => {
  const timeSet = new Set();
  const perSymbol = {};
  Object.entries(candlesBySymbol).forEach(([symbol, candles]) => {
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    perSymbol[symbol] = sorted;
    sorted.forEach((candle) => timeSet.add(candle.t));
  });
  const timeline = Array.from(timeSet).sort((a, b) => a - b);
  return { timeline, perSymbol };
};

const findPriceAt = (series, timestamp) => {
  if (!series || !series.length) return null;
  let price = series[0].c;
  for (let i = 0; i < series.length; i += 1) {
    const candle = series[i];
    if (candle.t > timestamp) break;
    price = candle.c;
  }
  return price;
};

const executeAction = (action, context, timestamp) => {
  const { cash, positions, priceLookup, targetWeights, trades } = context;
  switch (action.type) {
    case 'buy': {
      const symbol = action.payload.symbol;
      const price = priceLookup(symbol, timestamp);
      if (!price) return;
      let qty = action.payload.qty;
      if (action.payload.all) {
        const equity = context.equity();
        qty = equity > 0 ? (equity * 0.99) / price : 0;
      }
      if (!qty || qty <= 0) return;
      const cost = price * qty;
      const fees = cost * FEE_RATE;
      if (cash.value < cost + fees) {
        return;
      }
      cash.value -= cost + fees;
      positions[symbol] = (positions[symbol] || 0) + qty;
      trades.count += 1;
      break;
    }
    case 'sell': {
      const symbol = action.payload.symbol;
      const price = priceLookup(symbol, timestamp);
      if (!price) return;
      const held = positions[symbol] || 0;
      const qty = action.payload.all ? held : Math.min(action.payload.qty || 0, held);
      if (!qty) return;
      const proceeds = price * qty;
      const fees = proceeds * FEE_RATE;
      cash.value += proceeds - fees;
      positions[symbol] = held - qty;
      if (positions[symbol] <= 1e-6) delete positions[symbol];
      trades.count += 1;
      break;
    }
    case 'allocate': {
      const symbol = action.payload.symbol;
      targetWeights[symbol] = action.payload.weight;
      rebalance(targetWeights, context, timestamp);
      break;
    }
    case 'schedule': {
      context.notes.push(`Scheduled ${action.payload.action} ${action.payload.symbol ?? ''} ${action.payload.cadence}`.trim());
      break;
    }
    case 'rule': {
      context.notes.push(`Rule applied: ${JSON.stringify(action.payload)}`);
      break;
    }
    default:
      break;
  }
};

const rebalance = (targetWeights, context, timestamp) => {
  const totalWeight = Object.values(targetWeights).reduce((acc, weight) => acc + weight, 0);
  if (totalWeight <= 0) return;
  const { cash, positions, priceLookup, trades } = context;
  const equity = context.equity(timestamp);
  if (!equity) return;
  Object.entries(targetWeights).forEach(([symbol, weight]) => {
    const price = priceLookup(symbol, timestamp);
    if (!price) return;
    const targetValue = (equity * weight) / totalWeight;
    const currentQty = positions[symbol] || 0;
    const currentValue = currentQty * price;
    const diffValue = targetValue - currentValue;
    if (Math.abs(diffValue) / equity < 0.005) return;
    const qty = diffValue / price;
    if (qty > 0) {
      const cost = qty * price;
      const fees = cost * FEE_RATE;
      if (cash.value < cost + fees) return;
      cash.value -= cost + fees;
      positions[symbol] = currentQty + qty;
      trades.count += 1;
    } else {
      const sellQty = Math.min(-qty, currentQty);
      if (!sellQty) return;
      const proceeds = sellQty * price;
      const fees = proceeds * FEE_RATE;
      cash.value += proceeds - fees;
      positions[symbol] = currentQty - sellQty;
      trades.count += 1;
    }
  });
};

const computeEquitySeries = ({ timeline, perSymbol }, context) => {
  const equitySeries = [];
  const positionsSeries = [];
  const executed = new Set();

  timeline.forEach((timestamp) => {
    context.actions.forEach((action, index) => {
      if (executed.has(index)) return;
      if (action.ts && action.ts > timestamp) return;
      executeAction(action, context, timestamp);
      executed.add(index);
    });

    let equity = context.cash.value;
    Object.entries(context.positions).forEach(([symbol, qty]) => {
      const price = context.priceLookup(symbol, timestamp);
      if (!price) return;
      equity += qty * price;
    });

    equitySeries.push({ t: timestamp, value: equity });
    positionsSeries.push({ t: timestamp, positions: { ...context.positions } });
  });

  return { equitySeries, positionsSeries };
};

self.onmessage = (event) => {
  const { candlesBySymbol, actions = [], startCapital = 100000 } = event.data || {};
  const { timeline, perSymbol } = buildTimeline(candlesBySymbol);
  const priceLookup = (symbol, timestamp) => findPriceAt(perSymbol[symbol], timestamp);
  const cash = { value: startCapital };
  const positions = {};
  const targetWeights = {};
  const trades = { count: 0 };
  const notes = [];

  const context = {
    cash,
    positions,
    actions,
    priceLookup,
    targetWeights,
    trades,
    notes,
    equity: (timestamp) => {
      let total = cash.value;
      Object.entries(positions).forEach(([symbol, qty]) => {
        const price = priceLookup(symbol, timestamp ?? timeline[0]);
        if (price) total += qty * price;
      });
      return total;
    }
  };

  const { equitySeries, positionsSeries } = computeEquitySeries({ timeline, perSymbol }, context);
  const drawdownSeries = computeDrawdown(equitySeries);

  self.postMessage({
    equitySeries,
    drawdownSeries,
    positionsSeries,
    tradesCount: trades.count,
    notes
  });
};

const computeDrawdown = (equitySeries) => {
  let peak = equitySeries.length ? equitySeries[0].value : 0;
  return equitySeries.map((point) => {
    peak = Math.max(peak, point.value);
    const dd = peak === 0 ? 0 : (point.value - peak) / peak;
    return { t: point.t, value: dd * 100 };
  });
};
