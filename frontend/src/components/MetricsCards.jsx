import { useChatStore } from '../store.js';
import { formatCurrency } from '../utils/formatters.js';

const METRIC_CONFIG = [
  { key: 'totalReturnPct', label: 'Total Return', suffix: '%', accent: 'text-emerald-300' },
  { key: 'maxDDPct', label: 'Max Drawdown', suffix: '%', accent: 'text-rose-300' },
  { key: 'sharpe', label: 'Sharpe', suffix: '', accent: 'text-sky-300' },
  { key: 'cagr', label: 'CAGR', suffix: '%', accent: 'text-amber-300' }
];

export default function MetricsCards() {
  const { metrics, equitySeries, tradesCount, capital } = useChatStore();
  const latestEquity = equitySeries?.length ? equitySeries[equitySeries.length - 1].value : capital;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl bg-surface/70 p-4 shadow-lg shadow-black/30">
        <span className="text-xs uppercase tracking-widest text-white/50">Current Equity</span>
        <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(latestEquity)}</p>
        <p className="mt-4 text-xs text-white/50">Trades executed: {tradesCount}</p>
      </div>
      {METRIC_CONFIG.map(({ key, label, suffix, accent }) => (
        <div key={key} className="rounded-2xl bg-surface/60 p-4 shadow-inner shadow-black/40">
          <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
          <p className={`mt-2 text-2xl font-semibold ${accent}`}>
            {metrics ? metrics[key].toFixed(2) : '—'}
            {suffix}
          </p>
        </div>
      ))}
    </div>
  );
}
