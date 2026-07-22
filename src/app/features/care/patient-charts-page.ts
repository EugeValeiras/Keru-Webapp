import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CareApi } from '../../core/api/care-api.service';
import {
  ApiError,
  CatalogMetric,
  Catalogs,
  MetricKey,
  SeriesPoint,
} from '../../core/api/api.types';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { ChartLine, KrLineChart } from '../../shared/ui/kr-line-chart';

const BP_SYS: MetricKey = 'blood-pressure-systolic';
const BP_DIA: MetricKey = 'blood-pressure-diastolic';

/** Chip "pressure" combina sistólica + diastólica en un solo gráfico. */
type ChipId = 'pressure' | MetricKey;

interface MetricChip {
  id: ChipId;
  label: string;
}

const PERIODS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: null, label: 'Todo' },
];

const DAY_MS = 86_400_000;

/** UC-16: evolución de métricas del paciente. Montada bajo /app y /caregiver → links relativos. */
@Component({
  selector: 'kr-patient-charts-page',
  imports: [RouterLink, KrEmptyState, KrLineChart],
  template: `
    @if (forbidden()) {
      <kr-empty-state
        icon="🔒"
        title="Sin acceso a este paciente"
        subtitle="Tu vínculo o asignación con este paciente pudo haber vencido. Si creés que es un error, hablá con la familia o con soporte."
      />
    } @else {
      <a routerLink="../dashboard" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver al estado actual
      </a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Evolución</h1>

      <div class="flex flex-wrap gap-2 mb-4">
        @for (chip of chips(); track chip.id) {
          <button
            type="button"
            (click)="select(chip.id)"
            class="rounded-pill px-4 py-1.5 text-sm font-medium transition-colors"
            [class]="
              selected() === chip.id
                ? 'bg-primary-600 text-white'
                : 'bg-surface border border-ink-300 text-ink-700 hover:bg-primary-50'
            "
          >
            {{ chip.label }}
          </button>
        }
      </div>

      <div class="flex flex-wrap gap-2 mb-6">
        @for (p of periods; track p.label) {
          <button
            type="button"
            (click)="period.set(p.days)"
            class="rounded-pill px-3 py-1 text-xs font-medium transition-colors"
            [class]="
              period() === p.days
                ? 'bg-primary-100 text-primary-700'
                : 'bg-surface border border-ink-300 text-ink-500 hover:bg-primary-50'
            "
          >
            {{ p.label }}
          </button>
        }
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-4">
          {{ err }}
        </p>
      }

      @if (loading()) {
        <p class="text-ink-500 text-sm">Cargando serie…</p>
      } @else if (selectedInfo(); as info) {
        @if (!hasData()) {
          <kr-empty-state
            icon="📈"
            title="Sin datos en este período"
            subtitle="Probá con un período más amplio o registrá nuevos signos vitales."
          />
        } @else {
          <div class="bg-surface rounded-card shadow-card p-6">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 class="font-semibold text-ink-900">{{ info.label }}</h2>
              @if (info.unit) {
                <span class="text-sm text-ink-500">{{ info.unit }}</span>
              }
            </div>
            <kr-line-chart [datasets]="chartLines()" [band]="band()" [unit]="info.unit" />
          </div>
        }
      }
    }
  `,
})
export class PatientChartsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CareApi);
  private readonly catalogService = inject(CatalogService);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly periods = PERIODS;

  protected readonly selected = signal<ChipId | null>(null);
  protected readonly period = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly forbidden = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly catalogs = signal<Catalogs | null>(null);
  /** Series crudas del server, alineadas con las keys de la chip seleccionada. */
  private readonly series = signal<{ key: MetricKey; points: SeriesPoint[] }[]>([]);

  protected readonly chips = computed<MetricChip[]>(() => {
    const cat = this.catalogs();
    if (!cat) {
      return [];
    }
    const others = cat.metrics.filter((m) => m.key !== BP_SYS && m.key !== BP_DIA);
    return [
      { id: 'pressure' as const, label: 'Presión arterial' },
      ...others.map((m) => ({ id: m.key, label: m.label })),
    ];
  });

  /** Label y unit del header de la card. */
  protected readonly selectedInfo = computed<{ label: string; unit: string } | null>(() => {
    const sel = this.selected();
    const cat = this.catalogs();
    if (!sel || !cat) {
      return null;
    }
    if (sel === 'pressure') {
      return { label: 'Presión arterial', unit: this.metricFor(BP_SYS)?.unit ?? 'mmHg' };
    }
    const info = this.metricFor(sel);
    return { label: info?.label ?? sel, unit: info?.unit ?? '' };
  });

  protected readonly band = computed<{ min: number; max: number } | null>(() => {
    const sel = this.selected();
    if (!sel) {
      return null;
    }
    const info = this.metricFor(sel === 'pressure' ? BP_SYS : sel);
    return info ? { min: info.defaultRange.min, max: info.defaultRange.max } : null;
  });

  protected readonly chartLines = computed<ChartLine[]>(() => {
    const days = this.period();
    const cutoff = days === null ? null : Date.now() - days * DAY_MS;
    return this.series().map((s) => ({
      label: this.lineLabel(s.key),
      color: s.key === BP_DIA ? '#A78BFA' : '#7C3AED',
      points: s.points
        .filter((p) => cutoff === null || new Date(p.measuredAt).getTime() >= cutoff)
        .map((p) => ({ x: p.measuredAt, y: p.value })),
    }));
  });

  protected readonly hasData = computed(() => this.chartLines().some((l) => l.points.length > 0));

  constructor() {
    this.catalogService.catalogs$.subscribe({
      next: (cat) => {
        this.catalogs.set(cat);
        if (!this.selected()) {
          this.select('pressure');
        }
      },
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  protected select(id: ChipId): void {
    this.selected.set(id);
    this.loadSeries(id);
  }

  private loadSeries(id: ChipId): void {
    const keys: MetricKey[] = id === 'pressure' ? [BP_SYS, BP_DIA] : [id];
    this.loading.set(true);
    this.error.set(null);
    forkJoin(keys.map((k) => this.api.getSeries(this.patientId, k))).subscribe({
      next: (results) => {
        this.series.set(keys.map((key, i) => ({ key, points: results[i] })));
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

  private lineLabel(key: MetricKey): string {
    if (this.selected() === 'pressure') {
      return key === BP_SYS ? 'Sistólica' : 'Diastólica';
    }
    return this.metricFor(key)?.label ?? key;
  }

  private metricFor(key: MetricKey): CatalogMetric | undefined {
    const cat = this.catalogs();
    return cat ? this.catalogService.metricFor(cat, key) : undefined;
  }
}
