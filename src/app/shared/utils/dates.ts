const RELATIVE_UNITS: [number, string, string][] = [
  [60, 'segundo', 'segundos'],
  [60, 'minuto', 'minutos'],
  [24, 'hora', 'horas'],
  [7, 'día', 'días'],
  [4.35, 'semana', 'semanas'],
  [12, 'mes', 'meses'],
];

/** "hace 5 minutos" — para sellos de frescura (asOf, NFR-24) y timestamps. */
export function timeAgo(iso: string): string {
  let diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) {
    return 'recién';
  }
  let unit = 'segundo';
  let plural = 'segundos';
  for (const [factor, singular, pluralName] of RELATIVE_UNITS) {
    if (diff < factor) {
      break;
    }
    diff /= factor;
    unit = singular;
    plural = pluralName;
  }
  const n = Math.floor(diff);
  return `hace ${n} ${n === 1 ? unit : plural}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
