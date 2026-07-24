import { Component, computed, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DAY_FULL,
  DAY_SHORT,
  DaySlot,
  PRESET_DAYS,
  WEEK_ORDER,
  formatDuration,
  slotDurationMinutes,
  sortSlots,
  totalMinutes,
} from './availability';

/**
 * KER-53 · Editor de disponibilidad del cuidador, reutilizable en el onboarding (UC-02) y en la
 * edición del perfil aprobado (UC-02 A3). Reemplaza la lista de slots "de a uno" por un flujo ágil:
 * se eligen varios días (chips L→D o un preset) y se les aplica un mismo rango horario de una;
 * cada rango muestra su duración en vivo ("08:00–16:00 · 8 h") y rechaza rangos inválidos (to<=from).
 *
 * El modelo `slots` sigue el contrato `AvailabilityDto` sin cambios (la duración se deriva en el
 * cliente). Two-way: `[(slots)]="slots"`. Medianoche fuera de alcance (mismo día).
 */
@Component({
  selector: 'kr-availability-editor',
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-4">
      <!-- 1) Elegir días -->
      <div>
        <p id="avail-days-label" class="text-sm font-medium text-ink-700 mb-2">
          Elegí los días
        </p>
        <div role="group" aria-labelledby="avail-days-label" class="flex flex-wrap gap-2">
          @for (day of weekOrder; track day) {
            <button
              type="button"
              (click)="toggleDay(day)"
              [attr.aria-pressed]="isSelected(day)"
              [attr.aria-label]="dayFull[day] + (dayHasSlots(day) ? ' (ya tiene horarios)' : '')"
              class="relative rounded-pill border px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              [class.border-primary-600]="isSelected(day)"
              [class.bg-primary-100]="isSelected(day)"
              [class.text-primary-800]="isSelected(day)"
              [class.font-semibold]="isSelected(day)"
              [class.border-ink-300]="!isSelected(day)"
              [class.text-ink-700]="!isSelected(day)"
              [class.font-medium]="!isSelected(day)"
              [class.hover:bg-primary-50]="!isSelected(day)"
            >
              {{ dayShort[day] }}
              @if (dayHasSlots(day)) {
                <span
                  aria-hidden="true"
                  class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-500"
                ></span>
              }
            </button>
          }
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            (click)="applyPreset('weekdays')"
            class="rounded-tag text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 hover:bg-primary-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            Lun a Vie
          </button>
          <button
            type="button"
            (click)="applyPreset('weekend')"
            class="rounded-tag text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 hover:bg-primary-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            Fin de semana
          </button>
          <button
            type="button"
            (click)="applyPreset('all')"
            class="rounded-tag text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 hover:bg-primary-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            Todos
          </button>
        </div>
      </div>

      <!-- 2) Rango horario + duración en vivo -->
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Desde</span>
          <input
            type="time"
            name="avail-from"
            [ngModel]="rangeFrom()"
            (ngModelChange)="rangeFrom.set($event)"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Hasta</span>
          <input
            type="time"
            name="avail-to"
            [ngModel]="rangeTo()"
            (ngModelChange)="rangeTo.set($event)"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>
        <button
          type="button"
          (click)="apply()"
          [disabled]="!canApply()"
          class="rounded-pill bg-primary-600 text-white font-semibold text-sm py-2.5 px-5 hover:bg-primary-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          Agregar horario
        </button>
        <p class="text-sm pb-2.5" [class.text-ink-500]="!rangeError()" [class.text-danger]="rangeError()">
          @if (rangeDurationLabel(); as dur) {
            Duración: <span class="font-semibold text-ink-700">{{ dur }}</span>
          } @else if (rangeError()) {
            <span role="alert">El horario «Hasta» tiene que ser mayor que «Desde».</span>
          }
        </p>
      </div>

      <!-- 3) Horarios cargados -->
      <div>
        <div class="flex items-baseline justify-between mb-2">
          <p class="text-sm font-medium text-ink-700">Tus horarios</p>
          @if (slots().length > 0) {
            <p class="text-xs text-ink-500">Total: {{ weeklyTotalLabel() }} por semana</p>
          }
        </div>
        @if (sorted().length === 0) {
          <p class="text-sm text-ink-500 bg-sand-100 rounded-control px-3 py-2.5">
            Todavía no agregaste horarios. Elegí uno o más días, poné un rango y tocá «Agregar
            horario».
          </p>
        } @else {
          <ul class="flex flex-col gap-2">
            @for (slot of sorted(); track slot) {
              <li
                class="flex items-center justify-between gap-3 rounded-control border border-ink-200 bg-surface px-3 py-2"
              >
                <span class="text-sm text-ink-700">
                  <span class="font-medium">{{ dayFull[slot.dayOfWeek] }}</span>
                  · {{ slot.from }}–{{ slot.to }}
                  <span class="text-ink-500">· {{ durationLabel(slot) }}</span>
                </span>
                <button
                  type="button"
                  (click)="remove(slot)"
                  [attr.aria-label]="
                    'Quitar ' + dayFull[slot.dayOfWeek] + ' ' + slot.from + ' a ' + slot.to
                  "
                  class="text-danger text-sm font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                >
                  Quitar
                </button>
              </li>
            }
          </ul>
        }
        <!-- Feedback accesible de la última acción (aria-live). -->
        <p class="sr-only" role="status" aria-live="polite">{{ status() }}</p>
      </div>
    </div>
  `,
})
export class KrAvailabilityEditor {
  /** Two-way con el modelo de disponibilidad del formulario padre (contrato AvailabilityDto). */
  readonly slots = model<DaySlot[]>([]);

  protected readonly weekOrder = WEEK_ORDER;
  protected readonly dayShort = DAY_SHORT;
  protected readonly dayFull = DAY_FULL;

  protected readonly selectedDays = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly rangeFrom = signal('');
  protected readonly rangeTo = signal('');
  protected readonly status = signal('');

  /** Duración del rango en minutos; null si está incompleto o es inválido (to<=from). */
  private readonly rangeMinutes = computed(() =>
    slotDurationMinutes(this.rangeFrom(), this.rangeTo()),
  );

  protected readonly rangeDurationLabel = computed(() => {
    const mins = this.rangeMinutes();
    return mins === null ? null : formatDuration(mins);
  });

  /** Ambos campos cargados pero el rango no cierra (to<=from): mostramos el error. */
  protected readonly rangeError = computed(
    () => !!this.rangeFrom() && !!this.rangeTo() && this.rangeMinutes() === null,
  );

  protected readonly canApply = computed(
    () => this.selectedDays().size > 0 && this.rangeMinutes() !== null,
  );

  protected readonly sorted = computed(() => sortSlots(this.slots()));

  protected readonly weeklyTotalLabel = computed(() => formatDuration(totalMinutes(this.slots())));

  isSelected(day: number): boolean {
    return this.selectedDays().has(day);
  }

  dayHasSlots(day: number): boolean {
    return this.slots().some((s) => s.dayOfWeek === day);
  }

  durationLabel(slot: DaySlot): string {
    const mins = slotDurationMinutes(slot.from, slot.to);
    return mins === null ? '' : formatDuration(mins);
  }

  toggleDay(day: number): void {
    const next = new Set(this.selectedDays());
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    this.selectedDays.set(next);
  }

  applyPreset(preset: keyof typeof PRESET_DAYS): void {
    this.selectedDays.set(new Set(PRESET_DAYS[preset]));
  }

  /** Aplica el rango a todos los días elegidos, evitando duplicados exactos. */
  apply(): void {
    if (!this.canApply()) {
      return;
    }
    const from = this.rangeFrom();
    const to = this.rangeTo();
    const existing = this.slots();
    const additions: DaySlot[] = [];
    for (const day of WEEK_ORDER) {
      if (!this.selectedDays().has(day)) {
        continue;
      }
      const dup = existing.some(
        (s) => s.dayOfWeek === day && s.from === from && s.to === to,
      );
      if (!dup) {
        additions.push({ dayOfWeek: day, from, to });
      }
    }
    if (additions.length > 0) {
      this.slots.set([...existing, ...additions]);
    }
    const dayNames = additions.map((s) => this.dayFull[s.dayOfWeek]).join(', ');
    this.status.set(
      additions.length > 0
        ? `Agregaste ${dayNames} de ${from} a ${to}.`
        : 'Esos horarios ya estaban cargados.',
    );
    this.selectedDays.set(new Set<number>());
  }

  remove(slot: DaySlot): void {
    this.slots.set(this.slots().filter((s) => s !== slot));
    this.status.set(`Quitaste ${this.dayFull[slot.dayOfWeek]} de ${slot.from} a ${slot.to}.`);
  }
}
