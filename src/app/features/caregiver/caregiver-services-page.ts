import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HiringApi } from '../../core/api/hiring-api.service';
import {
  ApiError,
  HIRING_STATUS_LABELS,
  HiringRequest,
  MODALITY_LABELS,
  Modality,
} from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { formatDate } from '../../shared/utils/dates';
import { ReviewModal } from '../reputation/review-modal';

/** KER-57 · Fase del servicio según su ventana temporal. */
type ServicePhase = 'upcoming' | 'active' | 'ended';

@Component({
  selector: 'kr-caregiver-services-page',
  imports: [RouterLink, KrAvatar, KrBadge, KrEmptyState, ReviewModal],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <h1>Mis servicios</h1>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      }

      @if (loading()) {
        <p class="text-ink-500">Cargando servicios…</p>
      } @else {
        @if (active().length === 0) {
          <kr-empty-state
            icon="🩺"
            title="Sin servicios activos"
            subtitle="Cuando aceptes una solicitud, la vas a ver acá."
          />
        } @else {
          @for (r of active(); track r.id) {
            <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <kr-avatar [seed]="r.patientId" [name]="r.patientName ?? 'Paciente'" [size]="44" />
                <div class="flex-1">
                  <p class="font-semibold">{{ r.patientName ?? 'Paciente' }}</p>
                  <p class="text-sm text-ink-500">
                    {{ formatDate(r.startDate) }} → {{ formatDate(r.endDate) }} ·
                    {{ modalityLabel(r.modality) }}
                  </p>
                </div>
                <kr-badge [tone]="r.status === 'in-progress' ? 'success' : 'primary'">
                  {{ statusLabels[r.status] }}
                </kr-badge>
              </div>

              @if (contactPairs(r).length > 0) {
                <p class="text-sm text-ink-700">
                  Contacto para coordinar:
                  @for (pair of contactPairs(r); track pair[0]; let last = $last) {
                    <span class="font-medium">{{ pair[1] }}</span>
                    @if (!last) {
                      <span> · </span>
                    }
                  }
                </p>
              }

              <!--
                KER-57 · La affordance se alinea a la autorización de la API (constitution §3.7):
                LEER (Ver estado / Historial) va por la VIDA del servicio → siempre disponible
                mientras esté vivo (aceptado/en curso); REGISTRAR (vitales/medicación/novedad) va
                por la VENTANA (NFR-30) → solo dentro del período. Fuera de ventana no se ofrece un
                botón que la API rechazaría/pondría en cuarentena: se comunica el estado.
              -->
              @switch (phase(r)) {
                @case ('upcoming') {
                  <p class="text-sm text-ink-500 bg-primary-50 rounded-control px-3 py-2">
                    📅 Comienza el {{ formatDate(r.startDate) }}. Vas a poder registrar datos del
                    paciente cuando arranque el servicio.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'dashboard']"
                      class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-5 hover:bg-primary-700 transition-colors text-sm"
                    >
                      Ver estado
                    </a>
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'history']"
                      class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 transition-colors text-sm"
                    >
                      Historial
                    </a>
                  </div>
                }
                @case ('ended') {
                  <p class="text-sm text-ink-500 bg-ink-50 rounded-control px-3 py-2">
                    ✅ Finalizó el {{ formatDate(r.endDate) }}. El servicio terminó; ya no podés
                    ver ni registrar datos de este paciente.
                  </p>
                }
                @default {
                  <div class="flex flex-wrap gap-2">
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'dashboard']"
                      class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-5 hover:bg-primary-700 transition-colors text-sm"
                    >
                      Ver estado
                    </a>
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'history']"
                      class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 transition-colors text-sm"
                    >
                      Historial
                    </a>
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'record', 'vitals']"
                      class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 transition-colors text-sm"
                    >
                      Registrar vitales
                    </a>
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'record', 'medication']"
                      class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 transition-colors text-sm"
                    >
                      Medicación
                    </a>
                    <a
                      [routerLink]="['/caregiver/patients', r.patientId, 'record', 'note']"
                      class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 transition-colors text-sm"
                    >
                      Novedad
                    </a>
                  </div>
                }
              }
            </div>
          }
        }

        <!-- Finalizados -->
        @if (finished().length > 0) {
          <h2 class="text-lg font-semibold mt-2">Finalizados</h2>
          @for (r of finished(); track r.id) {
            <div class="bg-surface rounded-card shadow-card p-6 flex items-center gap-3">
              <kr-avatar [seed]="r.patientId" [name]="r.patientName ?? 'Paciente'" [size]="44" />
              <div class="flex-1">
                <p class="font-semibold">{{ r.patientName ?? 'Paciente' }}</p>
                <p class="text-sm text-ink-500">
                  {{ formatDate(r.startDate) }} → {{ formatDate(r.endDate) }} ·
                  {{ modalityLabel(r.modality) }}
                </p>
              </div>
              <button
                type="button"
                (click)="reviewing.set(r.id)"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-5 hover:bg-primary-700 transition-colors text-sm"
              >
                Calificar paciente
              </button>
            </div>
          }
        }
      }

      @if (reviewing(); as requestId) {
        <kr-review-modal [requestId]="requestId" mode="patient" (closed)="reviewing.set(null)" />
      }
    </div>
  `,
})
export class CaregiverServicesPage {
  private readonly api = inject(HiringApi);

  readonly requests = signal<HiringRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly reviewing = signal<string | null>(null);

  readonly statusLabels = HIRING_STATUS_LABELS;
  readonly formatDate = formatDate;

  readonly active = computed(() =>
    this.requests().filter((r) => r.status === 'accepted' || r.status === 'in-progress'),
  );
  readonly finished = computed(() => this.requests().filter((r) => r.status === 'completed'));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getCaregiverInbox().subscribe({
      next: (items) => {
        this.loading.set(false);
        this.requests.set(items);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }

  /**
   * KER-57 · Fase del servicio derivada de la ventana (startDate/endDate), para alinear la
   * affordance a la autorización de la API (constitution §3.7):
   *   - `upcoming` (aún no arrancó): la lectura ya está disponible por vida del servicio, pero la
   *     escritura no (queda para cuando arranque) → solo botones de lectura + "Comienza el {fecha}".
   *   - `active` (dentro de ventana): lectura + escritura → todos los botones.
   *   - `ended` (ya venció): el servicio terminó (se cerrará/venció la asignación) → sin botones,
   *     estado coherente "Finalizó el {fecha}", así ningún botón cae en un 403 garantizado.
   */
  phase(r: HiringRequest): ServicePhase {
    const now = Date.now();
    if (now < new Date(r.startDate).getTime()) return 'upcoming';
    if (now > new Date(r.endDate).getTime()) return 'ended';
    return 'active';
  }

  /** Pares clave→valor de contactData; la API solo lo manda en accepted/in-progress. */
  contactPairs(r: HiringRequest): [string, string][] {
    if (r.status !== 'accepted' && r.status !== 'in-progress') {
      return [];
    }
    return Object.entries((r.contactData ?? {}) as Record<string, unknown>).map(([k, v]) => [
      k,
      String(v),
    ]);
  }
}
