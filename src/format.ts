/** "1:05"; com `compact`, abaixo de 1 minuto mostra só os segundos ("45"). */
export function formatClock(seconds: number, compact = false): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (compact && m === 0) return `${sec}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** "45s", "2min", "2min 30s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return sec > 0 ? `${m}min ${sec}s` : `${m}min`;
}

/** Duração aproximada para resumos: "≈ 12 min". */
export function formatApproxMinutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
