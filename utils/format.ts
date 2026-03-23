/**
 * Formata duracao em minutos para exibicao de ETA.
 * Ex: 45 → "45 min", 90 → "1h 30m"
 */
export function formatETA(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

/**
 * Formata distancia em metros para exibicao.
 * Ex: 500 → "500 m", 2300 → "2.3 km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
