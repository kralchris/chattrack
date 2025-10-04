import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  Scatter
} from 'recharts';
import { formatCurrency, formatDateTime } from '../utils/formatters.js';
import { useChatStore } from '../store.js';

const tooltipStyle = {
  background: '#0f172acc',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: '#f8fafc',
  padding: '10px 12px'
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const timestamp = formatDateTime(label);
  const equityRow = payload.find((item) => item.dataKey === 'value');
  const tradeRows = payload.filter((item) => item.dataKey === 'y' && item.payload?.symbol);

  return (
    <div style={tooltipStyle}>
      <div className="text-xs font-semibold text-white/70">{timestamp}</div>
      {equityRow ? (
        <div className="mt-1 text-sm font-semibold text-sky-100">
          Equity: {formatCurrency(equityRow.value)}
        </div>
      ) : null}
      {tradeRows.map((item, index) => (
        <div key={index} className="mt-2 rounded-lg bg-slate-900/60 p-2 text-xs text-white/80">
          <div className="font-semibold uppercase tracking-wide text-white/60">{item.name}</div>
          <div>{item.payload.symbol}</div>
          {item.payload.qty ? <div>Qty: {item.payload.qty.toFixed(3)}</div> : null}
          {item.payload.price ? <div>Fill: {formatCurrency(item.payload.price)}</div> : null}
        </div>
      ))}
    </div>
  );
}

const renderMarker = (color, label) => (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} stroke="#0f172a" strokeWidth={1.5} />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill="#0f172a" fontWeight="600">
        {label}
      </text>
    </g>
  );
};

const buyMarker = renderMarker('#22d3ee', 'B');
const sellMarker = renderMarker('#f97316', 'S');

export default function ChartPanel() {
  const { equitySeries, drawdownSeries, benchmark, comparingBenchmark, trades } = useChatStore();
  const chartData = useMemo(() => {
    if (!equitySeries?.length) return [];
    const benchmarkMap = new Map(benchmark?.map((b) => [b.t, b.value]));
    return equitySeries.map((point) => ({
      ...point,
      benchmark: benchmarkMap.get(point.t)
    }));
  }, [equitySeries, benchmark]);

  const markers = useMemo(() => {
    if (!equitySeries?.length || !trades?.length) {
      return { buys: [], sells: [] };
    }
    const equityMap = new Map(equitySeries.map((point) => [point.t, point.value]));
    const buys = [];
    const sells = [];
    trades.forEach((trade) => {
      if (trade.side !== 'buy' && trade.side !== 'sell') return;
      const y = equityMap.get(trade.t);
      if (y == null) return;
      const payload = {
        t: trade.t,
        x: trade.t,
        y,
        equity: y,
        symbol: trade.symbol,
        price: trade.price,
        qty: trade.qty
      };
      if (trade.side === 'buy') {
        buys.push(payload);
      } else {
        sells.push(payload);
      }
    });
    return { buys, sells };
  }, [equitySeries, trades]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl bg-surface/70 p-4 shadow-glow backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Equity Curve</h2>
          <p className="text-xs text-white/50">Track portfolio performance with every instruction you send.</p>
        </div>
      </div>
      <div className="h-[26rem] rounded-2xl bg-black/20 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.1)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tickFormatter={formatAxisTick}
              stroke="rgba(226,232,240,0.4)"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value)}
              stroke="rgba(226,232,240,0.4)"
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: 10 }} />
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
            {markers.buys.length ? (
              <Scatter
                data={markers.buys}
                xAxisId={0}
                yAxisId={0}
                dataKey="y"
                shape={buyMarker}
                name="Buy fills"
                legendType="circle"
                fill="#22d3ee"
              />
            ) : null}
            {markers.sells.length ? (
              <Scatter
                data={markers.sells}
                xAxisId={0}
                yAxisId={0}
                dataKey="y"
                shape={sellMarker}
                name="Sell fills"
                legendType="circle"
                fill="#f97316"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-32 rounded-2xl bg-black/20 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={drawdownSeries} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="drawdown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tickFormatter={formatAxisTick}
              stroke="rgba(226,232,240,0.3)"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(value) => `${value.toFixed(1)}%`}
              stroke="rgba(226,232,240,0.3)"
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => formatDateTime(label)}
              formatter={(value) => `${value.toFixed(2)}%`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#f87171"
              fillOpacity={1}
              fill="url(#drawdown)"
              isAnimationActive={false}
              name="Drawdown"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatAxisTick(value) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleString();
}
