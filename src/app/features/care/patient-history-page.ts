import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, Catalogs, HistoryItem, MetricValue } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { KrSkeleton } from '../../shared/ui/kr-skeleton';
import { formatDateTime } from '../../shared/utils/dates';

type Filter = 'all' | HistoryItem['type'];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'vitals', label: 'Vitales' },
  { key: 'medication', label: 'Medicación' },
  { key: 'note', label: 'Novedades' },
];

const ROLE_LABELS: Record<HistoryItem['authorRole'], string> = {
  family: 'Familia',
  patient: 'Paciente',
  caregiver: 'Cuidador/a',
  admin: 'Admin',
};

const ROLE_TONES: Record<HistoryItem['authorRole'], BadgeTone> = {
  family: 'primary',
  patient: 'neutral',
  caregiver: 'success',
  admin: 'warning',
};

const TYPE_ICONS: Record<HistoryItem['type'], string> = {
  vitals: '🩺',
  medication: '💊',
  note: '📝',
};

/** Historial clínico (DESC del server, filtro client-side). Montado bajo /app y /caregiver. */
@Component({
  selector: 'kr-patient-history-page',
  imports: [RouterLink, KrBadge, KrEmptyState, KrSkeleton],
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
      <h1 class="mt-2 mb-6">Historial clínico</h1>

      @if (quarantinePending() > 0) {
        <a
          routerLink="../quarantine"
          class="flex items-center gap-2 bg-warning-50 border border-warning-600/40 rounded-card px-4 py-3 mb-6 text-sm text-ink-700 hover:bg-warning-50 transition-colors"
        >
          <span>⏳</span>
          <span>
            <span class="font-semibold">{{ quarantinePending() }}</span>
            {{ quarantinePending() === 1 ? 'registro tardío espera' : 'registros tardíos esperan' }}
            revisión del círculo (cuarentena).
          </span>
          <span class="ml-auto font-medium text-primary-600">Revisar →</span>
        </a>
      }

      <div class="flex flex-wrap gap-2 mb-6">
        @for (f of filters; track f.key) {
          <button
            type="button"
            (click)="setFilter(f.key)"
            class="rounded-pill px-4 py-1.5 text-sm font-medium transition-colors"
            [class]="
              filter() === f.key
                ? 'bg-primary-600 text-white'
                : 'bg-surface border border-ink-300 text-ink-700 hover:bg-primary-50'
            "
          >
            {{ f.label }}
          </button>
        }
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">
          {{ err }}
        </p>
      }

      @if (!loaded()) {
        <kr-skeleton variant="list" [count]="4" />
      } @else if (filtered().length === 0) {
        <kr-empty-state
          icon="🗂️"
          title="No hay registros para mostrar"
          subtitle="Cuando se carguen vitales, medicación o novedades, van a aparecer acá."
        />
      } @else {
        <ol class="kr-stagger flex flex-col gap-3">
          @for (item of visible(); track item.id) {
            <li class="bg-surface rounded-card shadow-card p-6">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="text-lg">{{ typeIcon(item) }}</span>
                <span class="text-sm text-ink-500">{{ formatDateTime(item.measuredAt) }}</span>
                <kr-badge [tone]="roleTone(item)">{{ roleLabel(item) }}</kr-badge>
              </div>

              @switch (item.type) {
                @case ('vitals') {
                  <ul class="flex flex-col gap-1">
                    @for (v of vitalsOf(item); track v.metricKey) {
                      <li class="text-sm text-ink-700">
                        <span class="font-medium">{{ metricLabel(v.metricKey) }}:</span>
                        {{ v.value }} {{ metricUnit(v.metricKey) }}
                      </li>
                    }
                  </ul>
                }
                @case ('medication') {
                  <p class="font-medium text-ink-900">
                    {{ medicationOf(item).medication }} — {{ medicationOf(item).dose }}
                  </p>
                  @if (medicationOf(item).schedule) {
                    <p class="text-sm text-ink-500 mt-1">
                      Horario: {{ medicationOf(item).schedule }}
                    </p>
                  }
                  @if (medicationOf(item).observations) {
                    <p class="text-sm text-ink-700 mt-1">{{ medicationOf(item).observations }}</p>
                  }
                }
                @case ('note') {
                  <p class="text-ink-700 whitespace-pre-line">{{ noteOf(item).text }}</p>
                }
              }
            </li>
          }
        </ol>
        @if (filtered().length > showCount()) {
          <div class="text-center mt-6">
            <button
              type="button"
              (click)="showMore()"
              class="rounded-pill border border-primary-600 text-primary-600 font-semibold py-2 px-6 hover:bg-primary-50 transition-colors"
            >
              Mostrar más ({{ filtered().length - showCount() }} restantes)
            </button>
          </div>
        }
      }
    }
  `,
})
export class PatientHistoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CareApi);
  private readonly auth = inject(AuthStore);
  private readonly catalogService = inject(CatalogService);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly formatDateTime = formatDateTime;
  protected readonly filters = FILTERS;

  protected readonly filter = signal<Filter>('all');
  private readonly items = signal<HistoryItem[]>([]);
  protected readonly loaded = signal(false);
  protected readonly forbidden = signal(false);
  protected readonly error = signal<string | null>(null);
  /** UC-12 A3: items en cuarentena pendientes (solo familia; el cuidador no la gestiona). */
  protected readonly quarantinePending = signal(0);
  private readonly catalogs = signal<Catalogs | null>(null);

  protected readonly filtered = computed(() => {
    const f = this.filter();
    const list = this.items();
    return f === 'all' ? list : list.filter((i) => i.type === f);
  });

  /* La API no pagina el historial: render incremental de a 50 para que una
     historia clínica larga no cuelgue el DOM. Cambiar de filtro resetea. */
  private static readonly PAGE = 50;
  protected readonly showCount = signal(PatientHistoryPage.PAGE);
  protected readonly visible = computed(() => this.filtered().slice(0, this.showCount()));

  protected showMore(): void {
    this.showCount.update((n) => n + PatientHistoryPage.PAGE);
  }

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    this.showCount.set(PatientHistoryPage.PAGE);
  }

  constructor() {
    this.catalogService.catalogs$.subscribe((cat) => this.catalogs.set(cat));
    this.api.getHistory(this.patientId).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loaded.set(true);
      },
      error: (err: ApiError) => {
        this.loaded.set(true);
        if (err.statusCode === 403) {
          this.forbidden.set(true);
        } else {
          this.error.set(err.message);
        }
      },
    });
    // La cuarentena es del círculo: bajo /caregiver ni se consulta (la API devolvería 403).
    const role = this.auth.role();
    if (role === 'family' || role === 'patient') {
      this.api.getQuarantine(this.patientId).subscribe({
        next: (items) => this.quarantinePending.set(items.filter((i) => i.status === 'pending').length),
        error: () => this.quarantinePending.set(0),
      });
    }
  }

  protected roleLabel(item: HistoryItem): string {
    return ROLE_LABELS[item.authorRole] ?? item.authorRole;
  }

  protected roleTone(item: HistoryItem): BadgeTone {
    return ROLE_TONES[item.authorRole] ?? 'neutral';
  }

  protected typeIcon(item: HistoryItem): string {
    return TYPE_ICONS[item.type];
  }

  protected vitalsOf(item: HistoryItem): MetricValue[] {
    return (item.data as { values: MetricValue[] }).values ?? [];
  }

  protected medicationOf(item: HistoryItem): {
    medication: string;
    dose: string;
    schedule?: string;
    observations?: string;
  } {
    return item.data as {
      medication: string;
      dose: string;
      schedule?: string;
      observations?: string;
    };
  }

  protected noteOf(item: HistoryItem): { text: string } {
    return item.data as { text: string };
  }

  protected metricLabel(key: MetricValue['metricKey']): string {
    const cat = this.catalogs();
    return (cat && this.catalogService.metricFor(cat, key)?.label) || key;
  }

  protected metricUnit(key: MetricValue['metricKey']): string {
    const cat = this.catalogs();
    return (cat && this.catalogService.metricFor(cat, key)?.unit) || '';
  }
}
