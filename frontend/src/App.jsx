import { useEffect, useMemo, useRef, useState } from 'react';
import ChatBox from './components/ChatBox.jsx';
import ChartPanel from './components/ChartPanel.jsx';
import MetricsCards from './components/MetricsCards.jsx';
import AllocRibbon from './components/AllocRibbon.jsx';
import TradeLog from './components/TradeLog.jsx';
import { useChatStore } from './store.js';
import { parseMessage } from './utils/parser.js';
import { getCandles, postMetrics } from './utils/api.js';
import { computePerformanceMetrics } from './utils/metrics.js';

const DEFAULT_SYMBOL = 'SPY';
const DEFAULT_INTERVAL = '1m';

const isoString = (date) => date.toISOString();

const formatHorizon = (amount, unit) => {
  const base = unit.toLowerCase().replace(/s$/, '');
  return `${amount} ${base}${amount > 1 ? 's' : ''}`;
};

const computeRelativeRange = (amount, unit) => {
  const end = new Date();
  const start = new Date(end);
  const normalized = unit.toLowerCase();
  if (normalized.startsWith('day')) {
    start.setUTCDate(start.getUTCDate() - amount);
  } else if (normalized.startsWith('week')) {
    start.setUTCDate(start.getUTCDate() - amount * 7);
  } else if (normalized.startsWith('month')) {
    start.setUTCMonth(start.getUTCMonth() - amount);
  } else if (normalized.startsWith('year')) {
    start.setUTCFullYear(start.getUTCFullYear() - amount);
  }
  return { start: isoString(start), end: isoString(end), interval: DEFAULT_INTERVAL };
};

const extractRelativeRange = (text) => {
  const match = text.toLowerCase().match(/past\s+(\d+)?\s*(day|days|week|weeks|month|months|year|years)/);
  if (!match) return null;
  return { amount: Number(match[1] || 1), unit: match[2] };
};

export default function App() {
  const workerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const liveDataRef = useRef(false);
  const {
    addMessage,
    actions,
    appendAction,
    candles,
    setCandles,
    capital,
    setCapital,
    setEquity,
    setMetrics,
    setBenchmark,
    benchmark,
    setTradesCount,
    setOffline,
    setNotes,
    setTrades,
    dateRange,
    setDateRange,
    activeSymbol,
    setActiveSymbol,
    comparingBenchmark,
    toggleBenchmark,
    offline
  } = useChatStore();

  const candlesBySymbol = useMemo(() => {
    const map = {};
    Object.entries(candles || {}).forEach(([symbol, data]) => {
      if (data?.candles?.length) {
        map[symbol] = data.candles;
      }
    });
    return map;
  }, [candles]);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/backtest.worker.js', import.meta.url));
    workerRef.current = worker;
    worker.onmessage = async (event) => {
      const { equitySeries, drawdownSeries, tradesCount, notes: workerNotes, trades: tradeLog } = event.data;
      setEquity(equitySeries, drawdownSeries);
      setTradesCount(tradesCount);
      setNotes(workerNotes);
      setTrades(tradeLog || []);
      if (equitySeries?.length) {
        let metrics = null;
        try {
          metrics = await postMetrics({ equity: equitySeries, tradesCount });
        } catch (error) {
          console.warn('Metrics API unavailable, computing locally', error);
          metrics = computePerformanceMetrics(equitySeries, { tradesCount });
        }
        if (metrics) {
          setMetrics(metrics);
        }
      }
    };
    return () => {
      worker.terminate();
    };
  }, [setEquity, setMetrics, setTradesCount, setNotes]);

  useEffect(() => {
    if (!Object.keys(candlesBySymbol).length) return;
    workerRef.current?.postMessage({ candlesBySymbol, actions, startCapital: capital });
    if (candlesBySymbol[DEFAULT_SYMBOL]) {
      const base = buildBenchmarkSeries(candlesBySymbol[DEFAULT_SYMBOL], capital);
      setBenchmark(base);
    }
  }, [candlesBySymbol, actions, capital, setBenchmark]);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000);
    const range = { start: isoString(start), end: isoString(end), interval: DEFAULT_INTERVAL };
    if (!dateRange) {
      setDateRange(range);
    }
    loadSymbol(DEFAULT_SYMBOL, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSymbol = async (symbol, range = dateRange || {}) => {
    setIsLoading(true);
    const wasOffline = offline;
    try {
      const response = await getCandles({ symbol, interval: range.interval || DEFAULT_INTERVAL, start: range.start, end: range.end });
      setCandles(symbol, response);
      const offlineNow = Boolean(response.offline);
      setOffline(offlineNow);
      setActiveSymbol(symbol);
      if (offlineNow && !wasOffline) {
        addMessage({
          role: 'assistant',
          content: `Loaded ${symbol.toUpperCase()} using built-in sample data. Start the FastAPI backend for live market candles.`
        });
      } else if (!offlineNow && (wasOffline || !liveDataRef.current)) {
        const last = response.candles?.[response.candles.length - 1];
        if (last?.t) {
          const latest = new Date(last.t).toLocaleString();
          addMessage({
            role: 'assistant',
            content: `Streaming live Yahoo Finance data for ${symbol.toUpperCase()}. Latest 1m candle captured at ${latest}.`
          });
        }
        liveDataRef.current = true;
      }
      if (symbol === DEFAULT_SYMBOL) {
        const base = buildBenchmarkSeries(response.candles, capital);
        setBenchmark(base);
      }
    } catch (error) {
      console.error(error);
      addMessage({ role: 'assistant', content: `Unable to load ${symbol} data. Please try again.` });
    } finally {
      setIsLoading(false);
    }
  };

  const ensureSymbolLoaded = async (symbol) => {
    if (candlesBySymbol[symbol]) return;
    await loadSymbol(symbol, dateRange);
  };

  const handleSend = async (text) => {
    addMessage({ role: 'user', content: text });
    const action = parseMessage(text);
    const relativeInstruction = extractRelativeRange(text);
    let relativeHandled = false;

    if (relativeInstruction && action.type !== 'set_dates') {
      const { amount, unit } = relativeInstruction;
      const range = computeRelativeRange(amount, unit);
      setDateRange(range);
      await loadSymbol(activeSymbol, range);
      addMessage({ role: 'assistant', content: `Backtesting the last ${formatHorizon(amount, unit)} for ${activeSymbol}.` });
      relativeHandled = true;
    }

    switch (action.type) {
      case 'set_capital': {
        const value = action.payload.value || 0;
        setCapital(value);
        addMessage({ role: 'assistant', content: `Starting capital set to $${value.toLocaleString()}.` });
        break;
      }
      case 'set_dates_relative': {
        if (relativeHandled) break;
        const { amount, unit } = action.payload;
        const range = computeRelativeRange(amount, unit);
        setDateRange(range);
        await loadSymbol(activeSymbol, range);
        addMessage({ role: 'assistant', content: `Backtesting the last ${formatHorizon(amount, unit)} for ${activeSymbol}.` });
        break;
      }
      case 'set_dates': {
        const range = {
          start: `${action.payload.start}T09:30:00Z`,
          end: `${action.payload.end}T21:00:00Z`,
          interval: action.payload.interval || DEFAULT_INTERVAL
        };
        setDateRange(range);
        await loadSymbol(activeSymbol, range);
        addMessage({ role: 'assistant', content: `Backtesting ${activeSymbol} from ${action.payload.start} to ${action.payload.end}.` });
        break;
      }
      case 'buy':
      case 'sell':
      case 'allocate':
      case 'schedule':
      case 'rule': {
        const symbol = action.payload.symbol || activeSymbol;
        await ensureSymbolLoaded(symbol);
        appendAction({ ...action, ts: null });
        addMessage({ role: 'assistant', content: describeAction(action) });
        break;
      }
      case 'noop':
      default:
        addMessage({ role: 'assistant', content: `Echoing back: ${action.payload.message}.` });
        break;
    }
  };

  const benchmarkToggle = () => {
    if (!benchmark?.length) return;
    toggleBenchmark();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 text-white">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface/60 px-6 py-4 shadow-lg shadow-black/40">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">ChatTrack</h1>
            <p className="text-sm text-white/60">Chat-driven backtests with minute-level precision.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadSymbol(DEFAULT_SYMBOL, dateRange)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accentMuted"
            >
              Load SPY (1m, last 2 days)
            </button>
            {isLoading ? <span className="text-xs text-white/60">Loading...</span> : null}
          </div>
        </header>
        <AllocRibbon onToggleBenchmark={benchmarkToggle} />
        <main className="flex flex-1 flex-col gap-4 overflow-hidden">
          <ChartPanel />
          <MetricsCards />
          <div className="flex flex-col gap-4">
            <ChatBox onSend={handleSend} />
            <TradeLog />
          </div>
        </main>
      </div>
    </div>
  );
}

function buildBenchmarkSeries(candles, capital) {
  if (!candles?.length) return [];
  const first = candles[0].c || 1;
  return candles.map((candle) => ({ t: candle.t, value: (candle.c / first) * capital }));
}

function describeAction(action) {
  switch (action.type) {
    case 'buy':
      return action.payload.all
        ? `Buying full allocation of ${action.payload.symbol || ''}.`
        : `Queued buy of ${action.payload.qty} ${action.payload.symbol}.`;
    case 'sell':
      return action.payload.all
        ? `Selling all holdings of ${action.payload.symbol || ''}.`
        : `Queued sell of ${action.payload.qty} ${action.payload.symbol}.`;
    case 'allocate':
      return `Targeting ${(action.payload.weight * 100).toFixed(0)}% allocation to ${action.payload.symbol}.`;
    case 'schedule':
      if (action.payload.notional) {
        const amount = Number(action.payload.notional).toLocaleString();
        return `Scheduled ${action.payload.action} $${amount} for ${action.payload.symbol ?? 'portfolio'} ${
          action.payload.cadence
        }.`;
      }
      return `Scheduled ${action.payload.action} for ${action.payload.symbol ?? 'portfolio'} ${action.payload.cadence}.`;
    case 'rule':
      return `Applying rule: ${JSON.stringify(action.payload)}.`;
    default:
      return 'Instruction acknowledged.';
  }
}
