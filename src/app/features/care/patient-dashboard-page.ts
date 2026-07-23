import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, CatalogMetric, Catalogs, PatientState } from '../../core/api/api.types';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { KrSkeleton } from '../../shared/ui/kr-skeleton';
import { timeAgo } from '../../shared/utils/dates';

interface MetricCard {
  key: string;
  label: string;
  unit: string;
  value: number;
  measuredAt: string;
  inRange: boolean;
}

const POLL_MS = 45_000;

/** UC-14: estado actual del paciente. Se monta bajo /app y /caregiver → links SIEMPRE relativos. */
@Component({
  selector: 'kr-patient-dashboard-page',
  imports: [RouterLink, KrEmptyState, KrSkeleton],
  template: `
    @if (forbidden()) {
      <kr-empty-state
        icon="🔒"
        title="Sin acceso a este paciente"
        subtitle="Tu vínculo o asignación con este paciente pudo haber vencido. Si creés que es un error, hablá con la familia o con soporte."
      />
    } @else {
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1>Estado actual</h1>
          @if (state(); as st) {
            <p class="text-sm text-ink-500 mt-1">Datos al {{ timeAgo(st.asOf) }}</p>
          }
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            (click)="refresh()"
            [disabled]="loading()"
            class="rounded-pill border border-ink-300 bg-surface text-ink-700 font-medium py-2 px-4 text-sm hover:bg-primary-50 disabled:opacity-50 transition-colors"
          >
            {{ loading() ? 'Actualizando…' : 'Actualizar' }}
          </button>
          <a
            routerLink="../history"
            class="rounded-pill border border-ink-300 bg-surface text-ink-700 font-medium py-2 px-4 text-sm hover:bg-primary-50 transition-colors"
          >
            Ver historial
          </a>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mb-6">
        <a
          routerLink="../record/vitals"
          class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
        >
          Registrar vitales
        </a>
        <a
          routerLink="../record/medication"
          class="rounded-pill bg-primary-100 text-primary-700 font-semibold py-2.5 px-6 hover:bg-primary-200 transition-colors"
        >
          Medicación
        </a>
        <a
          routerLink="../record/note"
          class="rounded-pill bg-primary-100 text-primary-700 font-semibold py-2.5 px-6 hover:bg-primary-200 transition-colors"
        >
          Novedad
        </a>
        <a
          routerLink="../charts"
          class="rounded-pill bg-primary-100 text-primary-700 font-semibold py-2.5 px-6 hover:bg-primary-200 transition-colors"
        >
          Evolución
        </a>
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">
          {{ err }}
        </p>
      }

      @if (state(); as st) {
        @if (st.metrics.length === 0) {
          <kr-empty-state
            icon="🩺"
            title="Todavía no hay registros"
            subtitle="Cuando se carguen los primeros signos vitales, vas a ver acá el estado actual."
          >
            <a
              routerLink="../record/vitals"
              class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
            >
              Registrar vitales
            </a>
          </kr-empty-state>
        } @else {
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (card of cards(); track card.key) {
              <div
                class="bg-surface rounded-card shadow-card p-6 border-l-4"
                [class]="card.inRange ? 'border-success' : 'border-danger'"
              >
                <p class="text-sm font-medium text-ink-500">{{ card.label }}</p>
                <p class="mt-1 text-2xl font-bold" [class.text-danger]="!card.inRange">
                  {{ card.value }}
                  <span class="text-sm font-medium text-ink-500">{{ card.unit }}</span>
                </p>
                <p class="text-xs text-ink-500 mt-2">{{ timeAgo(card.measuredAt) }}</p>
              </div>
            }
          </div>
        }
      } @else if (loading()) {
        <kr-skeleton variant="metrics" [count]="3" />
      }
    }
  `,
})
export class PatientDashboardPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CareApi);
  private readonly catalogService = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly timeAgo = timeAgo;

  protected readonly state = signal<PatientState | null>(null);
  protected readonly loading = signal(false);
  protected readonly forbidden = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly catalogs = signal<Catalogs | null>(null);

  protected readonly cards = computed<MetricCard[]>(() => {
    const st = this.state();
    const cat = this.catalogs();
    if (!st) {
      return [];
    }
    return st.metrics.map((m) => {
      const info: CatalogMetric | undefined = cat
        ? this.catalogService.metricFor(cat, m.metricKey)
        : undefined;
      const inRange = info
        ? m.value >= info.defaultRange.min && m.value <= info.defaultRange.max
        : true;
      return {
        key: m.metricKey,
        label: info?.label ?? m.metricKey,
        unit: info?.unit ?? '',
        value: m.value,
        measuredAt: m.measuredAt,
        inRange,
      };
    });
  });

  constructor() {
    this.catalogService.catalogs$.subscribe((cat) => this.catalogs.set(cat));
    this.refresh();

    const handle = setInterval(() => {
      if (!document.hidden && !this.forbidden()) {
        this.refresh();
      }
    }, POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(handle));
  }

  refresh(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.api.getState(this.patientId).subscribe({
      next: (state) => {
        this.state.set(state);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        if (err.statusCode === 403) {
          this.forbidden.set(true);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
