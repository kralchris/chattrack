import { create } from 'zustand';

export const DEFAULT_SYMBOL = 'SPY';
export const DEFAULT_CAPITAL = 100000;

const createInitialMessages = () => [
  { role: 'system', content: 'Welcome to ChatTrack. Ask me to allocate capital, trade symbols, or set a date range.' },
  {
    role: 'assistant',
    content: 'Try typing instructions like "Start with 100k" or "Buy 10 SPY" below to kick off a backtest.'
  }
];

const createInitialState = () => ({
  messages: createInitialMessages(),
  actions: [],
  capital: DEFAULT_CAPITAL,
  dateRange: null,
  candles: {},
  activeSymbol: DEFAULT_SYMBOL,
  equitySeries: [],
  drawdownSeries: [],
  metrics: null,
  offline: false,
  benchmark: null,
  comparingBenchmark: false,
  tradesCount: 0,
  notes: [],
  trades: [],
});

export const useChatStore = create((set, get) => ({
  ...createInitialState(),
  setOffline: (offline) => set({ offline }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setCapital: (capital) => set({ capital }),
  setDateRange: (range) => set({ dateRange: range }),
  setCandles: (symbol, data) =>
    set((state) => ({
      candles: {
        ...state.candles,
        [symbol]: data,
      },
    })),
  setEquity: (equitySeries, drawdownSeries) => set({ equitySeries, drawdownSeries }),
  setMetrics: (metrics) => set({ metrics }),
  setNotes: (notes) => set({ notes }),
  setTrades: (trades) => set({ trades }),
  setBenchmark: (series) => set({ benchmark: series }),
  toggleBenchmark: () => set((state) => ({ comparingBenchmark: !state.comparingBenchmark })),
  setTradesCount: (count) => set({ tradesCount: count }),
  appendAction: (action) => set((state) => ({ actions: [...state.actions, action] })),
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),
  clearMessages: () => set({ messages: [] }),
  resetForPrompt: (range) =>
    set(() => ({
      actions: [],
      capital: DEFAULT_CAPITAL,
      equitySeries: [],
      drawdownSeries: [],
      metrics: null,
      trades: [],
      tradesCount: 0,
      notes: [],
      benchmark: null,
      comparingBenchmark: false,
      candles: {},
      offline: false,
      activeSymbol: DEFAULT_SYMBOL,
      dateRange: range ?? null,
    })),
  resetAll: () => set(createInitialState()),
  loadState: (partial) => set(partial),
  getState: () => get(),
}));
