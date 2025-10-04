const FEE_RATE = 0.0005;
const SPREAD_RATE = 0.0002;
const OVERNIGHT_RATE = 0.00005;

const applySpread = (price, side) => {
  if (!price) return price;
  if (side === 'buy') return price * (1 + SPREAD_RATE);
  if (side === 'sell') return price * (1 - SPREAD_RATE);
  return price;
};

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

const recordTrade = (context, entry) => {
  context.tradeLog.push(entry);
};

const executeAction = (action, context, timestamp, meta = {}) => {
  const { cash, positions, priceLookup, targetWeights, trades, costBasis } = context;
  switch (action.type) {
    case 'buy': {
      const symbol = action.payload.symbol;
      const price = priceLookup(symbol, timestamp);
      if (!price) return;
      let qty = action.payload.qty;
      if ((!qty || qty <= 0) && action.payload.notional) {
        qty = action.payload.notional / price;
      }
      if (action.payload.all) {
        const equity = context.equity();
        qty = equity > 0 ? (equity * 0.99) / price : 0;
      }
      if (!qty || qty <= 0) return;
      const execPrice = applySpread(price, 'buy');
      const cost = execPrice * qty;
      const fees = cost * FEE_RATE;
      if (cash.value < cost + fees) {
        return;
      }
      cash.value -= cost + fees;
      positions[symbol] = (positions[symbol] || 0) + qty;
      const basis = costBasis[symbol] || { qty: 0, total: 0 };
      basis.qty += qty;
      basis.total += cost + fees;
      costBasis[symbol] = basis;
      trades.count += 1;
      const tradeEntry = {
        t: timestamp,
        side: 'buy',
        symbol,
        qty,
        price: execPrice,
        fees,
        notional: cost,
        pnl: 0,
        cashAfter: cash.value,
        note: meta.note || null
      };
      recordTrade(context, tradeEntry);
      return tradeEntry;
      break;
    }
    case 'sell': {
      const symbol = action.payload.symbol;
      const price = priceLookup(symbol, timestamp);
      if (!price) return;
      const held = positions[symbol] || 0;
      const qty = action.payload.all ? held : Math.min(action.payload.qty || 0, held);
      if (!qty) return;
      const execPrice = applySpread(price, 'sell');
      const proceeds = execPrice * qty;
      const fees = proceeds * FEE_RATE;
      cash.value += proceeds - fees;
      positions[symbol] = held - qty;
      if (positions[symbol] <= 1e-6) delete positions[symbol];
      const basis = costBasis[symbol] || { qty: 0, total: 0 };
      const avgCost = basis.qty > 0 ? basis.total / basis.qty : 0;
      const realizedCost = Math.min(qty, basis.qty) * avgCost;
      basis.qty = Math.max(basis.qty - qty, 0);
      basis.total = Math.max(basis.total - realizedCost, 0);
      costBasis[symbol] = basis;
      const pnl = proceeds - fees - realizedCost;
      trades.count += 1;
      const tradeEntry = {
        t: timestamp,
        side: 'sell',
        symbol,
        qty,
        price: execPrice,
        fees,
        notional: proceeds,
        pnl,
        cashAfter: cash.value,
        note: meta.note || null
      };
      recordTrade(context, tradeEntry);
      return tradeEntry;
      break;
    }
    case 'allocate': {
      const symbol = action.payload.symbol;
      targetWeights[symbol] = action.payload.weight;
      rebalance(targetWeights, context, timestamp);
      break;
    }
    case 'rebalance': {
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
    case 'liquidate': {
      const symbols = Object.keys(positions);
      if (!symbols.length) return;
      symbols.forEach((symbol) => {
        if (!positions[symbol]) return;
        executeAction(
          { type: 'sell', payload: { symbol, all: true } },
          context,
          timestamp,
          { note: meta.note || 'Liquidation' }
        );
      });
      return;
    }
    default:
      break;
  }
};

const rebalance = (targetWeights, context, timestamp) => {
  const totalWeight = Object.values(targetWeights).reduce((acc, weight) => acc + weight, 0);
  if (totalWeight <= 0) return;
  const { cash, positions, priceLookup, trades, costBasis } = context;
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
      const execPrice = applySpread(price, 'buy');
      const cost = qty * execPrice;
      const fees = cost * FEE_RATE;
      if (cash.value < cost + fees) return;
      cash.value -= cost + fees;
      positions[symbol] = currentQty + qty;
      const basis = costBasis[symbol] || { qty: 0, total: 0 };
      basis.qty += qty;
      basis.total += cost + fees;
      costBasis[symbol] = basis;
      trades.count += 1;
      recordTrade(context, {
        t: timestamp,
        side: 'buy',
        symbol,
        qty,
        price: execPrice,
        fees,
        notional: cost,
        pnl: 0,
        cashAfter: cash.value,
        note: 'Rebalance'
      });
    } else {
      const sellQty = Math.min(-qty, currentQty);
      if (!sellQty) return;
      const execPrice = applySpread(price, 'sell');
      const proceeds = sellQty * execPrice;
      const fees = proceeds * FEE_RATE;
      cash.value += proceeds - fees;
      positions[symbol] = currentQty - sellQty;
      const basis = costBasis[symbol] || { qty: 0, total: 0 };
      const avgCost = basis.qty > 0 ? basis.total / basis.qty : 0;
      const realizedCost = Math.min(sellQty, basis.qty) * avgCost;
      basis.qty = Math.max(basis.qty - sellQty, 0);
      basis.total = Math.max(basis.total - realizedCost, 0);
      costBasis[symbol] = basis;
      const pnl = proceeds - fees - realizedCost;
      trades.count += 1;
      recordTrade(context, {
        t: timestamp,
        side: 'sell',
        symbol,
        qty: sellQty,
        price: execPrice,
        fees,
        notional: proceeds,
        pnl,
        cashAfter: cash.value,
        note: 'Rebalance'
      });
    }
  });
};

const hashString = (input) => {
  let hash = 0;
  const str = String(input ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
};

const deterministicPick = (seed, options) => {
  if (!options?.length) return null;
  const index = seed % options.length;
  return options[index];
};

const scheduleAutoExit = (context, baseTimestamp, tradeResult, schedulePayload) => {
  if (!tradeResult || !schedulePayload?.holdPeriodMs) return;
  const exitTimestamp = baseTimestamp + schedulePayload.holdPeriodMs;
  context.pendingEvents.push({
    t: exitTimestamp,
    action: {
      type: 'sell',
      payload: {
        symbol: tradeResult.symbol,
        qty: tradeResult.qty
      }
    },
    note: `Auto exit after hold (${Math.round(schedulePayload.holdPeriodMs / (24 * 3600 * 1000))} days)`
  });
};

const applyOvernightRoll = (context, timestamp) => {
  let exposure = 0;
  Object.entries(context.positions).forEach(([symbol, qty]) => {
    const price = context.priceLookup(symbol, timestamp);
    if (!price) return;
    exposure += qty * price;
  });
  if (exposure <= 0) return;
  const charge = exposure * OVERNIGHT_RATE;
  if (!charge) return;
  context.cash.value -= charge;
  recordTrade(context, {
    t: timestamp,
    side: 'roll',
    symbol: 'PORT',
    qty: 0,
    price: 0,
    fees: 0,
    notional: exposure,
    pnl: -charge,
    cashAfter: context.cash.value,
    note: 'Overnight financing cost'
  });
};

const computeEquitySeries = ({ timeline, perSymbol }, context) => {
  const equitySeries = [];
  const positionsSeries = [];
  const executed = new Set();
  const schedules = [];
  const lastTimestamp = timeline[timeline.length - 1];
  let lastDateKey = null;

  context.actions.forEach((action, index) => {
    if (action.type === 'schedule') {
      schedules.push({ action, index, state: {} });
    }
  });

  timeline.forEach((timestamp) => {
    const currentDateKey = new Date(timestamp).toISOString().slice(0, 10);
    if (lastDateKey && currentDateKey !== lastDateKey) {
      applyOvernightRoll(context, timestamp);
    }
    lastDateKey = currentDateKey;

    // process pending exits
    if (context.pendingEvents.length) {
      const remaining = [];
      context.pendingEvents.forEach((event) => {
        if (event.t <= timestamp) {
          executeAction(event.action, context, timestamp, { note: event.note });
        } else {
          remaining.push(event);
        }
      });
      context.pendingEvents = remaining;
    }

    context.actions.forEach((action, index) => {
      if (action.type === 'schedule') return;
      if (executed.has(index)) return;
      if (action.ts && action.ts > timestamp) return;
      if (action.at === 'end' && timestamp !== lastTimestamp) return;
      executeAction(action, context, timestamp);
      executed.add(index);
    });

    schedules.forEach((entry) => {
      if (shouldTriggerSchedule(entry.action, timestamp, entry.state)) {
        const payload = entry.action.payload;
        const scheduledPayload = {
          symbol: payload.symbol,
          qty: payload.qty,
          notional: payload.notional,
          all: payload.all,
          weight: payload.weight
        };

        let resolvedAction = payload.action;
        if (payload.randomAction?.length) {
          const seed = hashString(`${payload.randomSeed ?? entry.index}-${timestamp}`);
          const randomPicked = deterministicPick(seed, payload.randomAction);
          if (randomPicked) {
            resolvedAction = randomPicked;
          }
        }

        if (
          resolvedAction === 'buy' &&
          scheduledPayload.qty == null &&
          scheduledPayload.notional == null &&
          !scheduledPayload.all
        ) {
          scheduledPayload.qty = 1;
        }

        if (resolvedAction === 'sell' && scheduledPayload.qty == null && !scheduledPayload.all && !scheduledPayload.notional) {
          scheduledPayload.all = true;
        }

        const tradeResult = executeAction(
          { type: resolvedAction, payload: scheduledPayload },
          context,
          timestamp,
          { note: payload.note || `Scheduled ${resolvedAction}` }
        );

        if (resolvedAction === 'buy') {
          scheduleAutoExit(context, timestamp, tradeResult, payload);
        }
      }
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
  const tradeLog = [];
  const costBasis = {};
  const pendingEvents = [];

  const context = {
    cash,
    positions,
    actions,
    priceLookup,
    targetWeights,
    trades,
    notes,
    tradeLog,
    costBasis,
    pendingEvents,
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
    notes,
    trades: tradeLog
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

const shouldTriggerSchedule = (action, timestamp, state) => {
  const payload = action.payload || {};
  const cadence = payload.cadence;
  if (!cadence) return false;
  const date = new Date(timestamp);
  const utcDay = date.getUTCDay();
  const isoDate = date.toISOString().slice(0, 10);

  if (cadence === 'daily') {
    if (state.last === isoDate) return false;
    state.last = isoDate;
    return true;
  }

  if (cadence === 'monthly') {
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (state.last === key) return false;
    state.last = key;
    return true;
  }

  if (cadence === 'weekly') {
    const weekKey = getWeekKey(date);
    if (state.last === weekKey) return false;
    state.last = weekKey;
    return true;
  }

  const dayIndex = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };

  if (dayIndex[cadence] != null) {
    if (utcDay !== dayIndex[cadence]) return false;
    const weekKey = getWeekKey(date);
    if (state.last === weekKey) return false;
    state.last = weekKey;
    return true;
  }

  return false;
};

const getWeekKey = (date) => {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date - firstDay) / 86400000);
  const week = Math.floor((dayOfYear + firstDay.getUTCDay()) / 7);
  return `${date.getUTCFullYear()}-${week}`;
};
