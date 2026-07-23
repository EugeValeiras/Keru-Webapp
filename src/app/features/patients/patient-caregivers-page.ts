import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HiringApi } from '../../core/api/hiring-api.service';
import { ApiError, CaregiverHistoryItem } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { formatDate } from '../../shared/utils/dates';

type Tab = 'active' | 'historical';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Vigentes' },
  { key: 'historical', label: 'Históricos' },
];

/** Cuidadores vigentes e históricos de un paciente (solo lado familia). */
@Component({
  selector: 'kr-patient-caregivers-page',
  imports: [RouterLink, KrAvatar, KrBadge, KrEmptyState],
  template: `
    <a routerLink="/app/patients" class="text-sm text-primary-600 font-medium hover:underline">
      ← Volver a pacientes
    </a>
    <h1 class="mt-2 mb-6">Cuidadores del paciente</h1>

    <div class="flex flex-wrap gap-2 mb-6">
      @for (t of tabs; track t.key) {
        <button
          type="button"
          (click)="tab.set(t.key)"
          class="rounded-pill px-4 py-1.5 text-sm font-medium transition-colors"
          [class]="
            tab() === t.key
              ? 'bg-primary-600 text-white'
              : 'bg-surface border border-ink-300 text-ink-700 hover:bg-primary-50'
          "
        >
          {{ t.label }}
        </button>
      }
    </div>

    @if (error(); as err) {
      <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">{{ err }}</p>
    }

    @if (!loaded()) {
      <p class="text-ink-500 text-sm">Cargando cuidadores…</p>
    } @else if (filtered().length === 0) {
      <kr-empty-state
        icon="🤝"
        title="{{
          tab() === 'active' ? 'No hay cuidadores vigentes' : 'No hay cuidadores históricos'
        }}"
        subtitle="Cuando contrates a alguien desde el marketplace, va a aparecer acá."
      >
        <a
          routerLink="/app/marketplace"
          class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
        >
          Buscar cuidadores
        </a>
      </kr-empty-state>
    } @else {
      <div class="flex flex-col gap-3">
        @for (item of filtered(); track item.assignmentId) {
          <div class="bg-surface rounded-card shadow-card p-6">
            <div class="flex flex-wrap items-center gap-4">
              <kr-avatar [name]="nameOf(item)" [seed]="item.caregiverId" [size]="48" />
              <div class="flex-1 min-w-40">
                <p class="font-semibold text-ink-900">{{ nameOf(item) }}</p>
                <p class="text-sm text-ink-500">
                  {{ formatDate(item.periodStart) }} – {{ formatDate(item.periodEnd) }}
                </p>
              </div>
              <kr-badge [tone]="item.status === 'active' ? 'success' : 'neutral'">
                {{ item.status === 'active' ? 'Vigente' : 'Histórico' }}
              </kr-badge>
              <div class="flex items-center gap-2">
                <a
                  [routerLink]="['/app/marketplace', item.caregiverId]"
                  class="rounded-pill border border-ink-300 bg-surface text-ink-700 font-medium py-2 px-4 text-sm hover:bg-primary-50 transition-colors"
                >
                  Ver ficha
                </a>
                <button
                  type="button"
                  (click)="rehire(item)"
                  [disabled]="checking() !== null || unavailable().has(item.caregiverId)"
                  class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-4 text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {{ checking() === item.caregiverId ? 'Verificando…' : 'Recontratar' }}
                </button>
              </div>
            </div>
            @if (unavailable().has(item.caregiverId)) {
              <p class="text-sm text-warning mt-3">Ya no está disponible en el marketplace</p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class PatientCaregiversPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(HiringApi);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly formatDate = formatDate;
  protected readonly tabs = TABS;

  protected readonly tab = signal<Tab>('active');
  private readonly items = signal<CaregiverHistoryItem[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  /** caregiverIds que ya no existen en el marketplace (404 al recontratar). */
  protected readonly unavailable = signal<ReadonlySet<string>>(new Set());
  /** caregiverId cuya ficha se está verificando antes de navegar. */
  protected readonly checking = signal<string | null>(null);

  protected readonly filtered = computed(() => this.items().filter((i) => i.status === this.tab()));

  constructor() {
    this.api.getPatientCaregivers(this.patientId).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loaded.set(true);
      },
      error: (err: ApiError) => {
        this.loaded.set(true);
        this.error.set(err.message);
      },
    });
  }

  protected nameOf(item: CaregiverHistoryItem): string {
    return item.caregiverName || 'Cuidador/a';
  }

  protected rehire(item: CaregiverHistoryItem): void {
    if (this.checking() !== null || this.unavailable().has(item.caregiverId)) {
      return;
    }
    this.checking.set(item.caregiverId);
    this.api.getCaregiverProfile(item.caregiverId).subscribe({
      next: () => {
        this.checking.set(null);
        this.router.navigate(['/app/marketplace', item.caregiverId, 'request']);
      },
      error: (err: ApiError) => {
        this.checking.set(null);
        if (err.statusCode === 404) {
          this.unavailable.update((s) => new Set(s).add(item.caregiverId));
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
