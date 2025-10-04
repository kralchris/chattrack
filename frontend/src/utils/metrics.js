export function computeDrawdown(equitySeries) {
  let peak = equitySeries.length ? equitySeries[0].value : 0;
  return equitySeries.map((point) => {
    peak = Math.max(peak, point.value);
    const dd = peak === 0 ? 0 : (point.value - peak) / peak;
    return { t: point.t, value: dd * 100 };
  });
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
