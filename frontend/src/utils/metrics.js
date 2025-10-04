export function computeDrawdown(equitySeries) {
  let peak = equitySeries.length ? equitySeries[0].value : 0;
  return equitySeries.map((point) => {
    peak = Math.max(peak, point.value);
    const dd = peak === 0 ? 0 : (point.value - peak) / peak;
    return { t: point.t, value: dd * 100 };
  });
}

export function computePerformanceMetrics(equitySeries, { rfRateAnnual = 0.02, tradesCount = 0 } = {}) {
  if (!equitySeries?.length) {
    return {
      totalReturnPct: 0,
      cagr: 0,
      sharpe: 0,
      maxDDPct: 0,
      volAnnualized: 0,
      tradesCount
    };
  }

  const sorted = [...equitySeries].sort((a, b) => a.t - b.t);
  const values = sorted.map((point) => point.value);
  const timestamps = sorted.map((point) => point.t);
  const returns = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev > 0) {
      returns.push(curr / prev - 1);
    }
  }

  const totalReturn = values.length > 1 ? values[values.length - 1] / values[0] - 1 : 0;
  const durationSeconds = Math.max((timestamps[timestamps.length - 1] - timestamps[0]) / 1000, 1);
  const periodSeconds = durationSeconds / Math.max(values.length - 1, 1);
  const annualFactor = (365 * 24 * 60 * 60) / periodSeconds;

  const rfPerPeriod = rfRateAnnual / annualFactor;
  const excessReturns = returns.map((r) => r - rfPerPeriod);
  const volatility = returns.length ? standardDeviation(returns) * Math.sqrt(annualFactor) : 0;
  const meanExcess = excessReturns.length ? average(excessReturns) : 0;
  const sharpe = volatility ? (meanExcess * annualFactor) / volatility : 0;

  const maxDrawdown = computeMaxDrawdown(values);
  const cagr = computeCagr(values, durationSeconds);

  return {
    totalReturnPct: totalReturn * 100,
    cagr: cagr * 100,
    sharpe,
    maxDDPct: maxDrawdown * 100,
    volAnnualized: volatility * 100,
    tradesCount
  };
}

export function formatNumber(value, options = {}) {
  const { style = 'decimal', maximumFractionDigits = 2, minimumFractionDigits } = options;
  return new Intl.NumberFormat('en-US', {
    style,
    maximumFractionDigits,
    minimumFractionDigits
  }).format(value);
}

export function formatPercent(value, digits = 2) {
  const number = typeof value === 'number' ? value : Number(value || 0);
  return `${number.toFixed(digits)}%`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function computeMaxDrawdown(values) {
  let peak = values.length ? values[0] : 0;
  let maxDd = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    if (peak > 0) {
      const dd = value / peak - 1;
      maxDd = Math.min(maxDd, dd);
    }
  });
  return Math.abs(maxDd);
}

function computeCagr(values, durationSeconds) {
  if (values.length < 2) return 0;
  const totalReturn = values[values.length - 1] / values[0];
  const durationYears = durationSeconds / (365 * 24 * 60 * 60);
  if (durationYears <= 1 / 365) {
    return totalReturn - 1;
  }
  return totalReturn ** (1 / durationYears) - 1;
}
