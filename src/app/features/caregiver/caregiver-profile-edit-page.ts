import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import {
  ApiError,
  CaregiverProfile,
  MODALITY_LABELS,
  Modality,
  UpdateCaregiverProfileDto,
} from '../../core/api/api.types';
import { newOperationId } from '../../core/idempotency/operation-id';
import { KrAvailabilityEditor } from '../../shared/ui/kr-availability-editor';
import { isSlotValid } from '../../shared/ui/availability';

interface SlotRow {
  dayOfWeek: number;
  from: string;
  to: string;
}

/**
 * UC-02 A3 · Edición del perfil aprobado, sin re-aprobación: foto, disponibilidad, tarifa
 * (efectivo-fechada, NFR-03/23), zona y modalidades. Nombre, especialidades y certificaciones
 * no se editan por esta vía (requieren re-verificación — decisión de producto pendiente).
 */
@Component({
  selector: 'kr-caregiver-profile-edit-page',
  imports: [FormsModule, KrAvailabilityEditor, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1>Editar mi perfil</h1>
        <p class="text-ink-500 mt-1">
          Los cambios se publican al instante: tu perfil sigue aprobado y visible.
        </p>
      </div>

      @if (checking()) {
        <p class="text-ink-500">Cargando tu perfil…</p>
      } @else {
        <form class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4" (ngSubmit)="save()">
          @if (error(); as err) {
            <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
              <p>{{ err }}</p>
              @if (fieldErrors().length > 0) {
                <ul class="list-disc list-inside mt-1">
                  @for (f of fieldErrors(); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              }
            </div>
          }

          <div class="rounded-control bg-ink-50 px-3 py-2 text-sm text-ink-600">
            Tu <strong>nombre</strong> y tu <strong>foto</strong> son los de tu cuenta y se ven igual
            en el buscador. Para cambiarlos, andá a
            <a routerLink="/perfil" class="text-primary-600 underline">Mi perfil</a>.
          </div>

          <div>
            <p class="text-sm font-medium text-ink-700 mb-2">Disponibilidad (mínimo un horario)</p>
            <kr-availability-editor [(slots)]="slots" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Tarifa por hora</span>
              <input
                type="number"
                name="ratePerHour"
                min="1"
                [(ngModel)]="ratePerHour"
                placeholder="Ej: 3500"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <span class="text-xs text-ink-500">
                El cambio rige desde ahora: las solicitudes que ya recibiste conservan la tarifa
                con la que se hicieron.
              </span>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Moneda</span>
              <input
                type="text"
                name="currency"
                [(ngModel)]="currency"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Descripción de la tarifa (opcional)</span>
            <input
              type="text"
              name="rateDescription"
              [(ngModel)]="rateDescription"
              placeholder="Ej: Incluye acompañamiento nocturno"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Zona</span>
            <input
              type="text"
              name="zone"
              [(ngModel)]="zone"
              placeholder="Ej: Palermo, CABA"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
          <div>
            <p class="text-sm font-medium text-ink-700 mb-2">Modalidades (mínimo una)</p>
            <div class="flex gap-3">
              @for (opt of modalityOptions; track opt[0]) {
                <label
                  class="flex items-center gap-2 rounded-control border px-3 py-2 cursor-pointer transition-colors"
                  [class.border-primary-600]="modalitySel[opt[0]]"
                  [class.bg-primary-50]="modalitySel[opt[0]]"
                  [class.border-ink-300]="!modalitySel[opt[0]]"
                >
                  <input
                    type="checkbox"
                    [name]="'mod-' + opt[0]"
                    [(ngModel)]="modalitySel[opt[0]]"
                    class="accent-primary-600"
                  />
                  <span class="text-sm">{{ opt[1] }}</span>
                </label>
              }
            </div>
          </div>

          <p class="text-xs text-ink-500 bg-primary-50 rounded-control px-3 py-2">
            Para cambiar tu nombre, especialidades o certificaciones escribinos: requieren una
            nueva verificación.
          </p>

          <div class="flex justify-between mt-2">
            <a
              routerLink="/caregiver/profile"
              class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-primary-50 transition-colors"
            >
              Cancelar
            </a>
            <button
              type="submit"
              [disabled]="!formValid() || submitting()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {{ submitting() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class CaregiverProfileEditPage {
  private readonly api = inject(MembershipApi);
  private readonly router = inject(Router);

  /** Un solo operationId por edición: los reintentos del submit no duplican la versión de tarifa. */
  private readonly operationId = newOperationId();

  readonly checking = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  readonly modalityOptions = Object.entries(MODALITY_LABELS) as [Modality, string][];

  // Estado del formulario (ngModel). La foto/nombre no están acá: son identidad de la cuenta (ADR-0003).
  slots: SlotRow[] = [];
  ratePerHour: number | null = null;
  currency = 'ARS';
  rateDescription = '';
  zone = '';
  modalitySel: Record<string, boolean> = {};

  constructor() {
    // Solo un perfil aprobado se edita por esta vía (UC-02 A3).
    this.api.getMyCaregiverProfile().subscribe({
      next: (profile) => {
        if (profile === null) {
          void this.router.navigate(['/caregiver/onboarding']);
          return;
        }
        if (profile.status !== 'approved') {
          void this.router.navigate(['/caregiver/profile']);
          return;
        }
        this.prefill(profile);
        this.checking.set(false);
      },
      error: (err: ApiError) => {
        this.checking.set(false);
        this.error.set(err.message);
      },
    });
  }

  private prefill(profile: CaregiverProfile): void {
    if (profile.availability.length > 0) {
      this.slots = profile.availability.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        from: a.from,
        to: a.to,
      }));
    }
    this.ratePerHour = profile.rates?.ratePerHour ?? null;
    this.currency = profile.rates?.currency ?? 'ARS';
    this.rateDescription = profile.rates?.description ?? '';
    this.zone = profile.zone;
    for (const m of profile.modalities) {
      this.modalitySel[m] = true;
    }
  }

  private selectedModalities(): Modality[] {
    return this.modalityOptions.map(([key]) => key).filter((key) => this.modalitySel[key]);
  }

  formValid(): boolean {
    return (
      this.slots.length > 0 &&
      this.slots.every(isSlotValid) &&
      !!this.ratePerHour &&
      this.ratePerHour > 0 &&
      this.currency.trim().length > 0 &&
      this.zone.trim().length > 0 &&
      this.selectedModalities().length > 0
    );
  }

  save(): void {
    if (!this.formValid() || this.submitting()) {
      return;
    }

    const dto: UpdateCaregiverProfileDto = {
      operationId: this.operationId,
      availability: this.slots.map((s) => ({
        dayOfWeek: Number(s.dayOfWeek),
        from: s.from,
        to: s.to,
      })),
      rates: {
        ratePerHour: Number(this.ratePerHour),
        currency: this.currency.trim(),
        ...(this.rateDescription.trim() ? { description: this.rateDescription.trim() } : {}),
      },
      zone: this.zone.trim(),
      modalities: this.selectedModalities(),
    };

    this.submitting.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    this.api.updateCaregiverProfile(dto).subscribe({
      next: () => void this.router.navigate(['/caregiver/profile']),
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.error.set(err.message);
        this.fieldErrors.set(err.fields);
      },
    });
  }
}
