import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, CatalogMetric, MetricValue, RecordVitalsDto } from '../../core/api/api.types';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { newOperationId } from '../../core/idempotency/operation-id';

type MetricStatus = 'empty' | 'implausible' | 'alert' | 'ok';

/** Registro de vitales: form dinámico desde el catálogo. Montado bajo /app y /caregiver. */
@Component({
  selector: 'kr-record-vitals-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="../../dashboard" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver al estado actual
      </a>
      <h1 class="mt-2 mb-1">Registrar vitales</h1>
      <p class="text-sm text-ink-500 mb-6">
        Cargá al menos una medición; el resto puede quedar vacío.
      </p>

      @if (quarantined()) {
        <div role="status" class="bg-warning-50 border border-warning-600/40 rounded-card p-6 text-sm text-ink-700">
          <p class="font-semibold mb-1">⏳ El registro quedó en cuarentena</p>
          <p>
            Llegó sin una asignación vigente que cubriera su momento de medición. No se descartó
            (NFR-30): el círculo del paciente lo va a revisar para aprobarlo o descartarlo.
          </p>
        </div>
      } @else {
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-5"
        (ngSubmit)="submit()"
      >
        @if (error(); as err) {
          <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            <p>{{ err }}</p>
            @for (f of fields(); track f) {
              <p class="mt-1">• {{ f }}</p>
            }
          </div>
        }

        @if (metrics().length === 0) {
          <p class="text-ink-500 text-sm">Cargando métricas…</p>
        }

        @for (m of metrics(); track m.key) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">{{ m.label }}</span>
            <input
              type="number"
              step="any"
              [name]="m.key"
              [ngModel]="values()[m.key] ?? null"
              (ngModelChange)="setValue(m.key, $event)"
              [placeholder]="m.unit"
              class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              [class]="
                statusFor(m) === 'implausible'
                  ? 'border-danger'
                  : statusFor(m) === 'alert'
                    ? 'border-warning'
                    : 'border-ink-300'
              "
            />
            @switch (statusFor(m)) {
              @case ('implausible') {
                <span class="text-xs text-danger">
                  Valor no plausible ({{ m.plausible.min }}–{{ m.plausible.max }} {{ m.unit }}).
                </span>
              }
              @case ('alert') {
                <span class="text-xs text-warning">Este valor va a generar una alerta.</span>
              }
              @default {
                <span class="text-xs text-ink-500">
                  Rango normal: {{ m.defaultRange.min }}–{{ m.defaultRange.max }} {{ m.unit }}
                </span>
              }
            }
          </label>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Momento de la medición (opcional)</span>
          <input
            type="datetime-local"
            name="measuredAt"
            [(ngModel)]="measuredAt"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <span class="text-xs text-ink-500">Si lo dejás vacío, se registra ahora.</span>
        </label>

        <button
          type="submit"
          [disabled]="loading() || !canSubmit()"
          class="mt-1 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Guardando…' : 'Guardar vitales' }}
        </button>
      </form>
      }
    </div>
  `,
})
export class RecordVitalsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CareApi);
  private readonly catalogService = inject(CatalogService);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  /** NFR-34: un solo operationId por montaje del form; se reusa en reintentos. */
  private readonly operationId = newOperationId();

  protected readonly metrics = signal<CatalogMetric[]>([]);
  protected readonly values = signal<Record<string, number | null>>({});
  measuredAt = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<string[]>([]);
  /** UC-12 A3 (NFR-30): llegada tardía no autorizada — quedó en cuarentena, no en el historial. */
  protected readonly quarantined = signal(false);

  protected readonly canSubmit = computed(() => {
    const vals = this.values();
    const loaded = this.metrics().filter((m) => vals[m.key] != null);
    if (loaded.length === 0) {
      return false;
    }
    return loaded.every((m) => {
      const v = vals[m.key]!;
      return v >= m.plausible.min && v <= m.plausible.max;
    });
  });

  constructor() {
    this.catalogService.catalogs$.subscribe((cat) => this.metrics.set(cat.metrics));
  }

  setValue(key: string, value: number | null): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  /** Espejo client-side de la validación del server. */
  protected statusFor(m: CatalogMetric): MetricStatus {
    const v = this.values()[m.key];
    if (v == null) {
      return 'empty';
    }
    if (v < m.plausible.min || v > m.plausible.max) {
      return 'implausible';
    }
    if (v < m.defaultRange.min || v > m.defaultRange.max) {
      return 'alert';
    }
    return 'ok';
  }

  submit(): void {
    if (this.loading() || !this.canSubmit()) {
      return;
    }
    const vals = this.values();
    const metricValues: MetricValue[] = this.metrics()
      .filter((m) => vals[m.key] != null)
      .map((m) => ({ metricKey: m.key, value: vals[m.key]! }));

    const dto: RecordVitalsDto = {
      operationId: this.operationId,
      values: metricValues,
      ...(this.measuredAt ? { measuredAt: new Date(this.measuredAt).toISOString() } : {}),
    };

    this.loading.set(true);
    this.error.set(null);
    this.fields.set([]);

    this.api.recordVitals(this.patientId, dto).subscribe({
      next: (res) => {
        if (res.status === 'quarantined') {
          this.loading.set(false);
          this.quarantined.set(true);
          return;
        }
        void this.router.navigate(['../../dashboard'], { relativeTo: this.route });
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
        this.fields.set(err.fields);
      },
    });
  }
}
