/**
 * KER-53 · Utilidades de disponibilidad del cuidador (días + rango horario).
 *
 * Fuente única de la lógica de parseo/duración/validación de los slots, compartida entre
 * `kr-availability-editor` y la validación de los formularios que lo usan (onboarding y
 * edición del perfil). El contrato `AvailabilityDto {dayOfWeek 0..6, from 'HH:mm', to 'HH:mm'}`
 * no cambia: la duración se deriva en el cliente. Medianoche fuera de alcance: `to` debe ser
 * mayor que `from` dentro del mismo día (no se permite cruzar las 24 h).
 */

/** Un slot de disponibilidad: mismo shape que `AvailabilityDto`. */
export interface DaySlot {
  dayOfWeek: number;
  from: string;
  to: string;
}

/** 0=domingo .. 6=sábado (coincide con `DAY_LABELS` de api.types). */
export const DAY_FULL = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** Etiqueta corta para los chips de día, indexada por dayOfWeek. */
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Orden de presentación: la semana arranca en lunes y termina en domingo. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Días de cada preset rápido. */
export const PRESET_DAYS: Record<'weekdays' | 'weekend' | 'all', number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  weekend: [6, 0],
  all: [1, 2, 3, 4, 5, 6, 0],
};

/** 'HH:mm' → minutos desde medianoche, o null si el string no es una hora válida. */
export function parseMinutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Duración de un rango en minutos, o null si el rango es incompleto o inválido
 * (`to` <= `from`). Mismo día: no se permite cruzar medianoche.
 */
export function slotDurationMinutes(from: string, to: string): number | null {
  const start = parseMinutes(from);
  const end = parseMinutes(to);
  if (start === null || end === null) {
    return null;
  }
  const diff = end - start;
  return diff > 0 ? diff : null;
}

/** Minutos → texto humano: "8 h", "30 min", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${mins} min`;
}

/** Un slot es válido si su rango tiene duración positiva (to > from, mismo día). */
export function isSlotValid(slot: { from: string; to: string }): boolean {
  return slotDurationMinutes(slot.from, slot.to) !== null;
}

/** Total de minutos de una lista de slots (ignora los inválidos). */
export function totalMinutes(slots: DaySlot[]): number {
  return slots.reduce((sum, s) => sum + (slotDurationMinutes(s.from, s.to) ?? 0), 0);
}

/** Orden estable para mostrar los slots: por día (semana lun→dom) y luego por hora de inicio. */
export function sortSlots(slots: DaySlot[]): DaySlot[] {
  return [...slots].sort((a, b) => {
    const dayDiff = WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek);
    if (dayDiff !== 0) {
      return dayDiff;
    }
    return (parseMinutes(a.from) ?? 0) - (parseMinutes(b.from) ?? 0);
  });
}
