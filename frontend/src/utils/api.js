import { getOfflineCandles } from './offline.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const withQuery = (url, params) => {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    q.append(key, value);
  });
  return `${url}?${q.toString()}`;
};

export async function getCandles({ symbol, interval = '1m', start, end, aggregate }) {
  try {
    const response = await fetch(withQuery(`${API_BASE}/api/candles`, { symbol, interval, start, end, aggregate }));
    if (!response.ok) {
      throw new Error(`Failed to load candles: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.warn('Primary candle API failed, falling back to offline data', error);
    const offline = getOfflineCandles({ symbol, interval, start, end, aggregate });
    if (offline) {
      return offline;
    }
    throw error;
  }
}

export async function postMetrics({ equity, rf_rate_annual, tradesCount }) {
  const response = await fetch(`${API_BASE}/api/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ equity, rf_rate_annual, trades_count: tradesCount })
  });
  if (!response.ok) {
    throw new Error('Failed to compute metrics');
  }
  return response.json();
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/api/health`);
  return response.ok;
}
