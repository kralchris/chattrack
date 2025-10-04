import { useMemo } from 'react';
import { useChatStore } from '../store.js';
import { formatCurrency, formatDateTime } from '../utils/formatters.js';

const headers = [
  { key: 'time', label: 'Time' },
  { key: 'side', label: 'Side' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'qty', label: 'Quantity' },
  { key: 'price', label: 'Price' },
  { key: 'fees', label: 'Fees' },
  { key: 'pnl', label: 'Realized P&L' }
];

export default function TradeLog() {
  const { trades } = useChatStore();

  const displayTrades = useMemo(
    () =>
      (trades || [])
        .filter((trade) => trade.side === 'buy' || trade.side === 'sell' || trade.side === 'roll')
        .slice(-100)
        .reverse(),
    [trades]
  );

  return (
    <section className="rounded-2xl bg-surface/70 p-4 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h3 className="text-base font-semibold text-white">Trade Blotter</h3>
          <p className="text-xs text-white/50">Recent executions including fees, spread and overnight costs.</p>
        </div>
      </div>
      {displayTrades.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5 text-sm">
            <thead className="text-white/60">
              <tr>
                {headers.map((header) => (
                  <th key={header.key} className="px-3 py-2 text-left font-medium">
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayTrades.map((trade, index) => (
                <tr
                  key={`${trade.t}-${trade.side}-${index}`}
                  className="text-white/80"
                  title={trade.note || undefined}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(trade.t)}</td>
                  <td className="px-3 py-2 capitalize">
                    {trade.side === 'roll' ? 'Overnight roll' : trade.side}
                  </td>
                  <td className="px-3 py-2">{trade.symbol}</td>
                  <td className="px-3 py-2">{trade.qty != null ? trade.qty.toFixed(3) : '-'}</td>
                  <td className="px-3 py-2">{trade.price != null ? formatCurrency(trade.price) : '-'}</td>
                  <td className="px-3 py-2 text-rose-300">{trade.fees != null ? formatCurrency(trade.fees) : '-'}</td>
                  <td
                    className={`px-3 py-2 ${
                      trade.pnl > 0
                        ? 'text-emerald-300'
                        : trade.pnl < 0
                        ? 'text-rose-300'
                        : 'text-white/70'
                    }`}
                  >
                    {trade.pnl != null ? formatCurrency(trade.pnl) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">
          No trades yet. Send an instruction like “Buy 10 SPY” or schedule a plan to populate the blotter.
        </p>
      )}
    </section>
  );
}
