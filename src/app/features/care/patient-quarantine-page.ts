import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, Catalogs, MetricValue, QuarantinedRecord } from '../../core/api/api.types';
import { CatalogService } from '../../core/catalogs/catalog.service';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { KrModal } from '../../shared/ui/kr-modal';
import { formatDateTime, timeAgo } from '../../shared/utils/dates';

type Tab = 'pending' | 'resolved';

const ROLE_LABELS: Record<QuarantinedRecord['authorRole'], string> = {
  family: 'Familia',
  patient: 'Paciente',
  caregiver: 'Cuidador/a',
  admin: 'Admin',
};

const TYPE_ICONS: Record<QuarantinedRecord['type'], string> = {
  vitals: '🩺',
  medication: '💊',
  note: '📝',
};

const STATUS_LABELS: Record<QuarantinedRecord['status'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  discarded: 'Descartado',
};

const STATUS_TONES: Record<QuarantinedRecord['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  discarded: 'neutral',
};

/**
 * UC-12 A3 · Cuarentena de llegadas tardías no autorizadas (NFR-30). El círculo ve los items;
 * aprueban/descartan consent-holder o manager (la API rechaza a los viewers). Un aprobado entra
 * al historial con su tiempo de medición original (NFR-36); un descartado queda con traza.
 * Montado solo bajo /app (familia): los cuidadores no gestionan la cuarentena.
 */
@Component({
  selector: 'kr-patient-quarantine-page',
  imports: [RouterLink, KrBadge, KrEmptyState, KrModal],
  template: `
    @if (forbidden()) {
      <kr-empty-state
        scene="locked"
        title="Sin acceso a este paciente"
        subtitle="Solo el círculo del paciente puede ver los registros en cuarentena."
      />
    } @else {
      <a routerLink="../history" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver al historial
      </a>
      <h1 class="mt-2 mb-1">Registros en cuarentena</h1>
      <p class="text-sm text-ink-500 mb-6 max-w-2xl">
        Registros que llegaron tarde, sin una asignación que cubriera su momento de medición.
        No se descartan solos: el círculo decide si entran al historial (con su fecha original) o
        se descartan. Todo queda con traza.
      </p>

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
            {{ t.label }} ({{ t.key === 'pending' ? pending().length : resolved().length }})
          </button>
        }
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">
          {{ err }}
        </p>
      }
      @if (success(); as msg) {
        <p role="status" class="text-sm text-success bg-success-50 rounded-control px-3 py-2 mb-4">
          {{ msg }}
        </p>
      }

      @if (!loaded()) {
        <p class="text-ink-500 text-sm">Cargando cuarentena…</p>
      } @else if (shown().length === 0) {
        <kr-empty-state
          icon="✅"
          title="{{ tab() === 'pending' ? 'No hay registros esperando revisión' : 'Todavía no se resolvió ningún registro' }}"
          subtitle="{{
            tab() === 'pending'
              ? 'Cuando llegue un registro tardío sin autorización vigente, va a aparecer acá.'
              : 'Los registros aprobados o descartados van a quedar listados acá, con su traza.'
          }}"
        />
      } @else {
        <ol class="flex flex-col gap-3">
          @for (item of shown(); track item.id) {
            <li class="bg-surface rounded-card shadow-card p-6">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="text-lg">{{ typeIcon(item) }}</span>
                <span class="text-sm text-ink-700 font-medium">
                  Medido: {{ formatDateTime(item.measuredAt) }}
                </span>
                <span class="text-sm text-ink-500">· llegó {{ timeAgo(item.receivedAt) }}</span>
                <kr-badge tone="primary">{{ roleLabel(item) }}</kr-badge>
                <kr-badge [tone]="statusTone(item)">{{ statusLabel(item) }}</kr-badge>
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
                  @if (medicationOf(item).observations) {
                    <p class="text-sm text-ink-700 mt-1">{{ medicationOf(item).observations }}</p>
                  }
                }
                @case ('note') {
                  <p class="text-ink-700 whitespace-pre-line">{{ noteOf(item).text }}</p>
                }
              }

              @if (item.status === 'pending') {
                <div class="flex flex-wrap gap-3 mt-4">
                  <button
                    type="button"
                    (click)="approve(item)"
                    [disabled]="busy() !== null"
                    class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {{ busy() === item.id ? 'Aprobando…' : 'Aprobar' }}
                  </button>
                  <button
                    type="button"
                    (click)="discardTarget.set(item)"
                    [disabled]="busy() !== null"
                    class="rounded-pill border border-ink-300 text-ink-700 font-semibold py-2 px-5 hover:bg-danger-50 hover:text-danger disabled:opacity-50 transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              } @else if (item.resolvedAt) {
                <p class="text-xs text-ink-500 mt-3">
                  Resuelto {{ timeAgo(item.resolvedAt) }}
                </p>
              }
            </li>
          }
        </ol>
      }

      @if (discardTarget(); as target) {
        <kr-modal title="Descartar registro" (closed)="discardTarget.set(null)">
          <p class="text-sm text-ink-700 mb-4">
            El registro no va a entrar al historial. Queda marcado como descartado, con traza de
            quién lo decidió — no se borra.
          </p>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              (click)="discardTarget.set(null)"
              class="rounded-pill border border-ink-300 text-ink-700 font-semibold py-2 px-5 hover:bg-primary-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              (click)="discard(target)"
              [disabled]="busy() !== null"
              class="rounded-pill bg-danger text-white font-semibold py-2 px-5 hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {{ busy() === target.id ? 'Descartando…' : 'Confirmar descarte' }}
            </button>
          </div>
        </kr-modal>
      }
    }
  `,
})
export class PatientQuarantinePage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CareApi);
  private readonly catalogService = inject(CatalogService);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly formatDateTime = formatDateTime;
  protected readonly timeAgo = timeAgo;
  protected readonly tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'resolved', label: 'Resueltos' },
  ];

  protected readonly tab = signal<Tab>('pending');
  private readonly items = signal<QuarantinedRecord[]>([]);
  protected readonly loaded = signal(false);
  protected readonly forbidden = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  /** id del item con acción en vuelo (una a la vez). */
  protected readonly busy = signal<string | null>(null);
  protected readonly discardTarget = signal<QuarantinedRecord | null>(null);
  private readonly catalogs = signal<Catalogs | null>(null);

  protected readonly pending = computed(() => this.items().filter((i) => i.status === 'pending'));
  protected readonly resolved = computed(() => this.items().filter((i) => i.status !== 'pending'));
  protected readonly shown = computed(() => (this.tab() === 'pending' ? this.pending() : this.resolved()));

  constructor() {
    this.catalogService.catalogs$.subscribe((cat) => this.catalogs.set(cat));
    this.load();
  }

  private load(): void {
    this.api.getQuarantine(this.patientId).subscribe({
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
  }

  protected approve(item: QuarantinedRecord): void {
    this.run(item, () => this.api.approveQuarantined(this.patientId, item.id), 'Registro aprobado: ya está en el historial con su fecha de medición original.');
  }

  protected discard(item: QuarantinedRecord): void {
    this.run(item, () => this.api.discardQuarantined(this.patientId, item.id), 'Registro descartado. Queda la traza de la decisión.');
  }

  private run(
    item: QuarantinedRecord,
    action: () => ReturnType<CareApi['approveQuarantined']>,
    successMsg: string,
  ): void {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(item.id);
    this.error.set(null);
    this.success.set(null);
    action().subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.discardTarget.set(null);
        this.success.set(successMsg);
        this.items.update((list) => list.map((i) => (i.id === updated.id ? updated : i)));
      },
      error: (err: ApiError) => {
        this.busy.set(null);
        this.discardTarget.set(null);
        this.error.set(err.message);
      },
    });
  }

  protected roleLabel(item: QuarantinedRecord): string {
    return ROLE_LABELS[item.authorRole] ?? item.authorRole;
  }

  protected statusLabel(item: QuarantinedRecord): string {
    return STATUS_LABELS[item.status];
  }

  protected statusTone(item: QuarantinedRecord): BadgeTone {
    return STATUS_TONES[item.status];
  }

  protected typeIcon(item: QuarantinedRecord): string {
    return TYPE_ICONS[item.type];
  }

  protected vitalsOf(item: QuarantinedRecord): MetricValue[] {
    return (item.data as { values: MetricValue[] }).values ?? [];
  }

  protected medicationOf(item: QuarantinedRecord): {
    medication: string;
    dose: string;
    schedule?: string;
    observations?: string;
  } {
    return item.data as { medication: string; dose: string; schedule?: string; observations?: string };
  }

  protected noteOf(item: QuarantinedRecord): { text: string } {
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
