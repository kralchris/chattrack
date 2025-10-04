import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
} from 'recharts';
import { formatCurrency, formatDateTime } from '../utils/formatters.js';
import { useChatStore } from '../store.js';

const tooltipStyle = {
  background: '#0f172acc',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: '#f8fafc',
  padding: '10px 12px',
};

function EquityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const timestamp = formatDateTime(label);
  const equityRow = payload.find((item) => item.dataKey === 'value');
  const benchmarkRow = payload.find((item) => item.dataKey === 'benchmark');

  return (
    <div style={tooltipStyle}>
      <div className="text-xs font-semibold text-white/70">{timestamp}</div>
      {equityRow ? (
        <div className="mt-1 text-sm font-semibold text-sky-100">Strategy: {formatCurrency(equityRow.value)}</div>
      ) : null}
      {benchmarkRow ? (
        <div className="text-xs text-white/60">Benchmark: {formatCurrency(benchmarkRow.value)}</div>
      ) : null}
    </div>
  );
}

function TradeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const color = point.side === 'buy' ? '#22c55e' : '#f87171';
  return (
    <div style={{ ...tooltipStyle, borderColor: color }}>
      <div className="text-xs font-semibold text-white/70">{formatDateTime(label)}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color }}>
        {point.side === 'buy' ? 'Buy' : 'Sell'} {point.symbol || 'Portfolio'}
      </div>
      <div className="text-xs text-white/70">Price: {formatCurrency(point.price)}</div>
      {point.qty != null ? <div className="text-xs text-white/70">Qty: {point.qty.toFixed(3)}</div> : null}
    </div>
  );
}

const createDot = (color) => (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#0f172a" strokeWidth={1.25} />;
};

const buyDot = createDot('#22c55e');
const sellDot = createDot('#f87171');

export default function ChartPanel() {
  const { equitySeries, benchmark, comparingBenchmark, trades } = useChatStore();

  const chartData = useMemo(() => {
    if (!equitySeries?.length) return [];
    const benchmarkMap = new Map(benchmark?.map((b) => [b.t, b.value]));
    return equitySeries.map((point) => ({
      ...point,
      benchmark: benchmarkMap.get(point.t),
    }));
  }, [equitySeries, benchmark]);

  const tradePoints = useMemo(() => {
    if (!trades?.length) {
      return { buys: [], sells: [] };
    }
    return trades.reduce(
      (acc, trade) => {
        if (trade.side !== 'buy' && trade.side !== 'sell') {
          return acc;
        }
        const qty = trade.qty ?? (trade.notional && trade.price ? trade.notional / trade.price : null);
        const price = trade.price ?? (trade.notional && trade.qty ? trade.notional / trade.qty : null);
        if (price == null) {
          return acc;
        }
        const payload = {
          t: trade.t,
          price,
          qty,
          symbol: trade.symbol,
          side: trade.side,
        };
        if (trade.side === 'buy') {
          acc.buys.push(payload);
        } else {
          acc.sells.push(payload);
        }
        return acc;
      },
      { buys: [], sells: [] },
    );
  }, [trades]);

  const hasTrades = tradePoints.buys.length > 0 || tradePoints.sells.length > 0;

  return (
    <div className="flex h-full flex-col gap-6 rounded-3xl bg-surface/70 p-4 shadow-glow backdrop-blur">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Portfolio Value</h2>
          <p className="text-xs text-white/50">Hourly equity progression for the active strategy.</p>
        </div>
        <div className="h-[26rem] rounded-2xl bg-black/20 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <defs>
                <linearGradient id="equityStroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.1)" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatAxisTick}
                stroke="rgba(226,232,240,0.4)"
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={(value) => formatCurrency(value)} stroke="rgba(226,232,240,0.4)" tick={{ fontSize: 12 }} />
              <Tooltip content={<EquityTooltip />} />
              <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 12 }} iconType="circle" />
              <Line
                type="monotone"
                dataKey="value"
                stroke="url(#equityStroke)"
                strokeWidth={2.5}
                dot={false}
                name="Strategy"
                isAnimationActive={false}
              />
              {comparingBenchmark && benchmark?.length ? (
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  stroke="#94a3b8"
                  strokeWidth={1.8}
                  dot={false}
                  name="Benchmark"
                  isAnimationActive={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Trade Markers</h2>
            <p className="text-xs text-white/50">Green dots mark buys, red dots mark sells at execution price.</p>
          </div>
        </div>
        <div className="h-60 rounded-2xl bg-black/20 p-3">
          {hasTrades ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 24, left: 0 }}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.1)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatAxisTick}
                  stroke="rgba(226,232,240,0.4)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  dataKey="price"
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="rgba(226,232,240,0.4)"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip content={<TradeTooltip />} cursor={{ stroke: 'rgba(148, 163, 184, 0.2)' }} />
                <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 12 }} iconType="circle" />
                {tradePoints.buys.length ? (
                  <Scatter data={tradePoints.buys} shape={buyDot} name="Buy" fill="#22c55e" />
                ) : null}
                {tradePoints.sells.length ? (
                  <Scatter data={tradePoints.sells} shape={sellDot} name="Sell" fill="#f87171" />
                ) : null}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/50">
              Execute a trade to see markers plotted here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatAxisTick(value) {
  const date = new Date(value);
  return date.toLocaleString();
}
