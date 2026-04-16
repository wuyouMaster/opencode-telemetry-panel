export function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

export function formatMs(value: number) {
  if (!Number.isFinite(value)) return "—"
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 10_000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 1000)}s`
}

export function formatTimestamp(value: number) {
  if (!Number.isFinite(value)) return "—"
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value)
}
