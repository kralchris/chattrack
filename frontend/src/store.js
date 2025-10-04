import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  messages: [
    { role: 'system', content: 'Welcome to ChatTrack. Ask me to allocate capital, trade symbols, or set a date range.' },
    {
      role: 'assistant',
      content: 'Try typing instructions like "Start with 100k" or "Buy 10 SPY" below to kick off a backtest.'
    }
  ],
  actions: [],
  capital: 100000,
  dateRange: null,
  candles: {},
  activeSymbol: 'SPY',
  equitySeries: [],
  drawdownSeries: [],
  metrics: null,
  offline: false,
  benchmark: null,
  comparingBenchmark: false,
  tradesCount: 0,
  notes: [],
  trades: [],
  setOffline: (offline) => set({ offline }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setCapital: (capital) => set({ capital }),
  setDateRange: (range) => set({ dateRange: range }),
  setCandles: (symbol, data) =>
    set((state) => ({
      candles: {
        ...state.candles,
        [symbol]: data
      }
    })),
  setEquity: (equitySeries, drawdownSeries) => set({ equitySeries, drawdownSeries }),
  setMetrics: (metrics) => set({ metrics }),
  setNotes: (notes) => set({ notes }),
  setTrades: (trades) => set({ trades }),
  setBenchmark: (series) => set({ benchmark: series }),
  toggleBenchmark: () => set((state) => ({ comparingBenchmark: !state.comparingBenchmark })),
  setTradesCount: (count) => set({ tradesCount: count }),
  appendAction: (action) => set((state) => ({ actions: [...state.actions, action] })),
  resetActions: () => set({ actions: [] }),
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),
  clearMessages: () => set({ messages: [] }),
  loadState: (partial) => set(partial),
  getState: () => get()
}));
