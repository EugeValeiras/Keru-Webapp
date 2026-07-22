import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import {
  ApiError,
  CaregiverProfile,
  DAY_LABELS,
  MODALITY_LABELS,
  Modality,
  RegisterCaregiverDto,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { newOperationId } from '../../core/idempotency/operation-id';
import { KrPhotoInput } from '../../shared/ui/kr-photo-input';

interface CertRow {
  type: string;
  institution: string;
  year: number | null;
}

interface SlotRow {
  dayOfWeek: number;
  from: string;
  to: string;
}

const STEP_TITLES = [
  'Datos',
  'Especialidades',
  'Certificaciones',
  'Disponibilidad',
  'Tarifa y zona',
];

@Component({
  selector: 'kr-caregiver-onboarding-page',
  imports: [FormsModule, KrPhotoInput],
  template: `
    <div class="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold">
          {{ resubmitMode() ? 'Corregí tu postulación' : 'Convertite en cuidador/a' }}
        </h1>
        <p class="text-ink-500 mt-1">
          {{
            resubmitMode()
              ? 'Actualizá los datos observados y re-enviá: tu perfil vuelve a revisión.'
              : 'Completá tu postulación y la revisamos a la brevedad.'
          }}
        </p>
      </div>

      @if (checking()) {
        <p class="text-ink-500">Verificando tu perfil…</p>
      } @else {
        <!-- Barra de progreso -->
        <div>
          <div class="flex justify-between text-xs text-ink-500 mb-1">
            <span>Paso {{ step() }} de 5 — {{ stepTitles[step() - 1] }}</span>
            <span>{{ step() * 20 }}%</span>
          </div>
          <div class="h-2 rounded-pill bg-primary-100 overflow-hidden" aria-hidden="true">
            <div
              class="h-full bg-primary-600 rounded-pill transition-all"
              [style.width.%]="step() * 20"
            ></div>
          </div>
        </div>

        <form
          class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4"
          (ngSubmit)="next()"
        >
          @if (error(); as err) {
            <div role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
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

          <!-- Paso 1: Datos -->
          @if (step() === 1) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Nombre a mostrar</span>
              <input
                type="text"
                name="displayName"
                required
                [(ngModel)]="displayName"
                placeholder="Ej: Laura Gómez"
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <span class="text-xs text-ink-500"
                >Así te van a ver las familias en el marketplace.</span
              >
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Foto de perfil</span>
              <kr-photo-input [(url)]="photoUrl" />
            </div>
          }

          <!-- Paso 2: Especialidades -->
          @if (step() === 2) {
            <p class="text-sm text-ink-700">Elegí al menos una especialidad.</p>
            <div class="grid grid-cols-2 gap-3">
              @for (opt of specialtyOptions; track opt[0]) {
                <label
                  class="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors"
                  [class.border-primary-600]="specialtySel[opt[0]]"
                  [class.bg-primary-50]="specialtySel[opt[0]]"
                  [class.border-ink-300]="!specialtySel[opt[0]]"
                >
                  <input
                    type="checkbox"
                    [name]="'spec-' + opt[0]"
                    [(ngModel)]="specialtySel[opt[0]]"
                    class="accent-primary-600"
                  />
                  <span class="text-sm">{{ opt[1] }}</span>
                </label>
              }
            </div>
          }

          <!-- Paso 3: Certificaciones -->
          @if (step() === 3) {
            <p class="text-sm text-ink-700">
              Sumá tus certificaciones (opcional). Si agregás una, completá institución y año.
            </p>
            @for (cert of certs; track $index) {
              <div class="rounded-lg border border-ink-300 p-4 flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                  <label class="flex flex-col gap-1 flex-1">
                    <span class="text-sm font-medium text-ink-700">Título / certificación</span>
                    <input
                      type="text"
                      [name]="'cert-type-' + $index"
                      [(ngModel)]="cert.type"
                      placeholder="Ej: Enfermería"
                      class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </label>
                  <button
                    type="button"
                    (click)="removeCert($index)"
                    class="text-danger text-sm font-medium hover:underline mt-1"
                  >
                    Quitar
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <label class="flex flex-col gap-1">
                    <span class="text-sm font-medium text-ink-700">Institución</span>
                    <input
                      type="text"
                      [name]="'cert-inst-' + $index"
                      [(ngModel)]="cert.institution"
                      placeholder="Ej: UBA"
                      class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-sm font-medium text-ink-700">Año</span>
                    <input
                      type="number"
                      [name]="'cert-year-' + $index"
                      [(ngModel)]="cert.year"
                      placeholder="Ej: 2015"
                      class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </label>
                </div>
              </div>
            }
            <button
              type="button"
              (click)="addCert()"
              class="self-start text-primary-600 font-medium text-sm hover:underline"
            >
              + Agregar certificación
            </button>
          }

          <!-- Paso 4: Disponibilidad -->
          @if (step() === 4) {
            <p class="text-sm text-ink-700">¿Qué días y horarios podés trabajar? (mínimo uno)</p>
            @for (slot of slots; track $index) {
              <div class="flex items-end gap-3 rounded-lg border border-ink-300 p-3">
                <label class="flex flex-col gap-1 flex-1">
                  <span class="text-sm font-medium text-ink-700">Día</span>
                  <select
                    [name]="'slot-day-' + $index"
                    [(ngModel)]="slot.dayOfWeek"
                    class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  >
                    @for (day of dayLabels; track $index; let i = $index) {
                      <option [ngValue]="i">{{ day }}</option>
                    }
                  </select>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-sm font-medium text-ink-700">Desde</span>
                  <input
                    type="time"
                    [name]="'slot-from-' + $index"
                    [(ngModel)]="slot.from"
                    class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-sm font-medium text-ink-700">Hasta</span>
                  <input
                    type="time"
                    [name]="'slot-to-' + $index"
                    [(ngModel)]="slot.to"
                    class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </label>
                <button
                  type="button"
                  (click)="removeSlot($index)"
                  [disabled]="slots.length === 1"
                  class="text-danger text-sm font-medium hover:underline disabled:opacity-40 pb-2.5"
                >
                  Quitar
                </button>
              </div>
            }
            <button
              type="button"
              (click)="addSlot()"
              class="self-start text-primary-600 font-medium text-sm hover:underline"
            >
              + Agregar horario
            </button>
          }

          <!-- Paso 5: Tarifa y zona -->
          @if (step() === 5) {
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-ink-700">Tarifa por hora</span>
                <input
                  type="number"
                  name="ratePerHour"
                  min="1"
                  [(ngModel)]="ratePerHour"
                  placeholder="Ej: 3500"
                  class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-ink-700">Moneda</span>
                <input
                  type="text"
                  name="currency"
                  [(ngModel)]="currency"
                  class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700"
                >Descripción de la tarifa (opcional)</span
              >
              <input
                type="text"
                name="rateDescription"
                [(ngModel)]="rateDescription"
                placeholder="Ej: Incluye acompañamiento nocturno"
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Zona</span>
              <input
                type="text"
                name="zone"
                [(ngModel)]="zone"
                placeholder="Ej: Palermo, CABA"
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
            <div>
              <p class="text-sm font-medium text-ink-700 mb-2">Modalidades (mínimo una)</p>
              <div class="flex gap-3">
                @for (opt of modalityOptions; track opt[0]) {
                  <label
                    class="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors"
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

            <!-- Resumen -->
            <div class="rounded-lg bg-primary-50 p-4 text-sm flex flex-col gap-1">
              <p class="font-semibold text-primary-700 mb-1">Resumen de tu postulación</p>
              <p><span class="text-ink-500">Nombre:</span> {{ displayName }}</p>
              <p>
                <span class="text-ink-500">Especialidades:</span> {{ selectedSpecialtyLabels() }}
              </p>
              <p><span class="text-ink-500">Certificaciones:</span> {{ certs.length }}</p>
              <p><span class="text-ink-500">Horarios:</span> {{ slots.length }}</p>
              <p>
                <span class="text-ink-500">Tarifa:</span>
                @if (ratePerHour) {
                  $ {{ ratePerHour }}/hora ({{ currency }})
                } @else {
                  —
                }
              </p>
              <p><span class="text-ink-500">Zona:</span> {{ zone || '—' }}</p>
            </div>
          }

          <!-- Navegación -->
          <div class="flex justify-between mt-2">
            <button
              type="button"
              (click)="back()"
              [disabled]="step() === 1 || submitting()"
              class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-primary-50 disabled:opacity-50 transition-colors"
            >
              Atrás
            </button>
            <button
              type="submit"
              [disabled]="!stepValid() || submitting()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              @if (step() < 5) {
                Siguiente
              } @else {
                {{
                  submitting()
                    ? 'Enviando…'
                    : resubmitMode()
                      ? 'Re-enviar postulación'
                      : 'Enviar postulación'
                }}
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class CaregiverOnboardingPage {
  private readonly api = inject(MembershipApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Un solo operationId por alta/re-envío: los reintentos del submit no duplican el efecto. */
  private readonly operationId = newOperationId();

  /** ?mode=resubmit: corregir y re-enviar una postulación rechazada (PUT /caregivers/me). */
  private readonly resubmitRequested = this.route.snapshot.queryParamMap.get('mode') === 'resubmit';
  readonly resubmitMode = signal(false);

  readonly step = signal(1);
  readonly checking = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  readonly stepTitles = STEP_TITLES;
  readonly dayLabels = DAY_LABELS;
  readonly specialtyOptions = Object.entries(SPECIALTY_LABELS) as [Specialty, string][];
  readonly modalityOptions = Object.entries(MODALITY_LABELS) as [Modality, string][];

  // Estado del formulario (ngModel)
  displayName = this.auth.displayName();
  readonly photoUrl = signal<string | null>(null);
  specialtySel: Record<string, boolean> = {};
  certs: CertRow[] = [];
  slots: SlotRow[] = [{ dayOfWeek: 1, from: '', to: '' }];
  ratePerHour: number | null = null;
  currency = 'ARS';
  rateDescription = '';
  zone = '';
  modalitySel: Record<string, boolean> = {};

  constructor() {
    // Sin perfil → alta normal. Con perfil: solo se admite quedarse si es un
    // re-envío pedido explícitamente (?mode=resubmit) sobre un perfil rechazado.
    this.api.getMyCaregiverProfile().subscribe({
      next: (profile) => {
        if (profile === null) {
          this.checking.set(false);
          return;
        }
        if (this.resubmitRequested && profile.status === 'rejected') {
          this.prefill(profile);
          this.resubmitMode.set(true);
          this.checking.set(false);
          return;
        }
        void this.router.navigate(['/caregiver/profile']);
      },
      error: () => this.checking.set(false),
    });
  }

  /** Prellena el wizard completo con la ficha que devuelve GET /caregivers/me. */
  private prefill(profile: CaregiverProfile): void {
    this.displayName = profile.displayName;
    this.photoUrl.set(profile.photoUrl ?? null);
    for (const s of profile.specialties) {
      this.specialtySel[s] = true;
    }
    this.certs = profile.certifications.map((c) => ({
      type: c.type,
      institution: c.institution,
      year: c.year,
    }));
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

  private selectedSpecialties(): Specialty[] {
    return this.specialtyOptions.map(([key]) => key).filter((key) => this.specialtySel[key]);
  }

  private selectedModalities(): Modality[] {
    return this.modalityOptions.map(([key]) => key).filter((key) => this.modalitySel[key]);
  }

  selectedSpecialtyLabels(): string {
    return this.selectedSpecialties()
      .map((s) => SPECIALTY_LABELS[s])
      .join(', ');
  }

  stepValid(): boolean {
    switch (this.step()) {
      case 1:
        return this.displayName.trim().length > 0;
      case 2:
        return this.selectedSpecialties().length > 0;
      case 3:
        return this.certs.every(
          (c) => c.type.trim().length > 0 && c.institution.trim().length > 0 && !!c.year,
        );
      case 4:
        return this.slots.length > 0 && this.slots.every((s) => !!s.from && !!s.to);
      case 5:
        return (
          !!this.ratePerHour &&
          this.ratePerHour > 0 &&
          this.currency.trim().length > 0 &&
          this.zone.trim().length > 0 &&
          this.selectedModalities().length > 0
        );
      default:
        return false;
    }
  }

  addCert(): void {
    this.certs.push({ type: '', institution: '', year: null });
  }

  removeCert(index: number): void {
    this.certs.splice(index, 1);
  }

  addSlot(): void {
    this.slots.push({ dayOfWeek: 1, from: '', to: '' });
  }

  removeSlot(index: number): void {
    if (this.slots.length > 1) {
      this.slots.splice(index, 1);
    }
  }

  back(): void {
    if (this.step() > 1) {
      this.step.update((s) => s - 1);
    }
  }

  next(): void {
    if (!this.stepValid() || this.submitting()) {
      return;
    }
    if (this.step() < 5) {
      this.step.update((s) => s + 1);
      return;
    }
    this.submit();
  }

  private submit(): void {
    const dto: RegisterCaregiverDto = {
      operationId: this.operationId,
      displayName: this.displayName.trim(),
      ...(this.photoUrl() !== null ? { photoUrl: this.photoUrl()! } : {}),
      specialties: this.selectedSpecialties(),
      certifications: this.certs.map((c) => ({
        type: c.type.trim(),
        institution: c.institution.trim(),
        year: Number(c.year),
      })),
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
    const request = this.resubmitMode()
      ? this.api.resubmitCaregiver(dto)
      : this.api.registerCaregiver(dto);
    request.subscribe({
      next: () => void this.router.navigate(['/caregiver/profile']),
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.error.set(err.message);
        this.fieldErrors.set(err.fields);
      },
    });
  }
}
