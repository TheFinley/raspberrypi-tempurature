export function formatTemp(value, decimals = 2) {
  return `${Number(value).toFixed(decimals)} °C`
}

export function formatTimestamp(isoString) {
  return new Date(isoString).toLocaleString()
}
