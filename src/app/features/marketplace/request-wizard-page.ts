import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ApiError,
  CreateRequestDto,
  MODALITY_LABELS,
  MarketplaceProfile,
  Modality,
} from '../../core/api/api.types';
import { HiringApi } from '../../core/api/hiring-api.service';
import { newOperationId } from '../../core/idempotency/operation-id';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { formatDateTime } from '../../shared/utils/dates';

const STEP_TITLES = ['¿Para quién?', 'Modalidad y fechas', 'Detalles', 'Resumen'];

@Component({
  selector: 'kr-request-wizard-page',
  imports: [FormsModule, RouterLink, KrAvatar],
  template: `
    <div class="max-w-xl mx-auto">
      <a
        [routerLink]="['/app/marketplace', caregiverId]"
        class="text-sm text-primary-600 font-medium hover:underline"
      >
        ← Volver al perfil
      </a>

      <h1 class="mt-2 mb-1">Solicitar cuidado</h1>
      @if (profile(); as p) {
        <p class="text-ink-500 text-sm mb-4">Con {{ p.displayName }} · {{ p.zone }}</p>
      } @else {
        <p class="text-ink-500 text-sm mb-4">&nbsp;</p>
      }

      <!-- Progreso -->
      <div class="mb-1 flex justify-between text-xs text-ink-500">
        <span class="font-medium text-primary-700">Paso {{ step() }} de 4 · {{ stepTitle() }}</span>
      </div>
      <div class="h-2 rounded-pill bg-primary-100 mb-6 overflow-hidden" aria-hidden="true">
        <div
          class="h-full bg-primary-600 rounded-pill transition-all"
          [style.width.%]="step() * 25"
        ></div>
      </div>

      <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
        @if (validationError(); as msg) {
          <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ msg }}</p>
        }
        @if (submitError(); as msg) {
          <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ msg }}</p>
        }

        <!-- Paso 1: paciente -->
        @if (step() === 1) {
          @if (!store.loaded()) {
            <p class="text-ink-500 text-sm">Cargando pacientes…</p>
          } @else if (store.patients().length === 0) {
            <div class="text-center py-4">
              <p class="text-4xl mb-3">🫂</p>
              <p class="font-semibold mb-1">Todavía no registraste pacientes</p>
              <p class="text-ink-500 text-sm mb-4">
                Registrá a la persona que necesita cuidado para poder solicitar.
              </p>
              <a
                routerLink="/app/patients/new"
                class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
              >
                Registrar paciente
              </a>
            </div>
          } @else {
            <div class="flex flex-col gap-2">
              @for (p of store.patients(); track p.id) {
                <label
                  class="flex items-center gap-3 rounded-card border p-4 cursor-pointer transition-colors"
                  [class]="
                    patientId() === p.id
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-ink-300 hover:border-primary-600'
                  "
                >
                  <input
                    type="radio"
                    name="patient"
                    [value]="p.id"
                    [(ngModel)]="patientId"
                    class="accent-primary-600"
                  />
                  <kr-avatar [name]="p.fullName" [seed]="p.id" [size]="40" />
                  <span>
                    <span class="block font-medium text-ink-900">{{ p.fullName }}</span>
                    <span class="block text-sm text-ink-500">{{ p.age }} años</span>
                  </span>
                </label>
              }
            </div>
          }
        }

        <!-- Paso 2: modalidad y fechas -->
        @if (step() === 2) {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium text-ink-700 mb-2">Modalidad</legend>
            @for (opt of modalityOptions; track opt[0]) {
              <label
                class="flex items-center gap-3 rounded-card border p-4 cursor-pointer transition-colors"
                [class]="
                  modality === opt[0]
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-ink-300 hover:border-primary-600'
                "
              >
                <input
                  type="radio"
                  name="modality"
                  [value]="opt[0]"
                  [(ngModel)]="modality"
                  class="accent-primary-600"
                />
                <span class="font-medium text-ink-900">{{ opt[1] }}</span>
              </label>
            }
          </fieldset>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Desde</span>
            <input
              type="datetime-local"
              name="startDate"
              [(ngModel)]="startDate"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Hasta</span>
            <input
              type="datetime-local"
              name="endDate"
              [(ngModel)]="endDate"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
        }

        <!-- Paso 3: detalles -->
        @if (step() === 3) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700"
              >Requerimientos especiales (opcional)</span
            >
            <textarea
              name="specialRequirements"
              [(ngModel)]="specialRequirements"
              rows="4"
              maxlength="1000"
              placeholder="Ej.: movilidad reducida, dieta sin sal…"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            ></textarea>
            <span class="text-xs text-ink-500 self-end">{{ specialRequirements.length }}/1000</span>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Teléfono de contacto</span>
            <input
              type="tel"
              name="phone"
              required
              [(ngModel)]="phone"
              placeholder="+54 11 5555-5555"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
        }

        <!-- Paso 4: resumen -->
        @if (step() === 4) {
          <dl class="flex flex-col gap-3 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Paciente</dt>
              <dd class="font-medium text-ink-900 text-right">{{ selectedPatientName() }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Cuidador</dt>
              <dd class="font-medium text-ink-900 text-right">
                {{ profile()?.displayName ?? '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Modalidad</dt>
              <dd class="font-medium text-ink-900 text-right">{{ modalityLabel() }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Desde</dt>
              <dd class="font-medium text-ink-900 text-right">{{ formatLocal(startDate) }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Hasta</dt>
              <dd class="font-medium text-ink-900 text-right">{{ formatLocal(endDate) }}</dd>
            </div>
            @if (specialRequirements.trim()) {
              <div class="flex flex-col gap-1">
                <dt class="text-ink-500">Requerimientos especiales</dt>
                <dd class="font-medium text-ink-900">{{ specialRequirements }}</dd>
              </div>
            }
            <div class="flex justify-between gap-4">
              <dt class="text-ink-500">Teléfono</dt>
              <dd class="font-medium text-ink-900 text-right">{{ phone }}</dd>
            </div>
          </dl>

          @if (profile(); as p) {
            <p class="text-sm text-primary-700 bg-primary-50 rounded-control px-3 py-2">
              La tarifa vigente ($ {{ p.ratePerHour }}/hora) queda congelada para esta solicitud.
            </p>
          }
        }

        <!-- Navegación -->
        <div class="flex justify-between items-center pt-2">
          @if (step() > 1) {
            <button
              type="button"
              (click)="back()"
              class="rounded-pill border border-ink-300 text-ink-700 font-semibold py-2.5 px-6 hover:border-primary-600 transition-colors"
            >
              Atrás
            </button>
          } @else {
            <span></span>
          }

          @if (step() < 4) {
            <button
              type="button"
              (click)="next()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              Continuar
            </button>
          } @else {
            <button
              type="button"
              (click)="submit()"
              [disabled]="submitting()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {{ submitting() ? 'Enviando…' : 'Enviar solicitud' }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class RequestWizardPage {
  private readonly api = inject(HiringApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(ActivePatientStore);

  protected readonly modalityOptions = Object.entries(MODALITY_LABELS);
  protected readonly caregiverId = this.route.snapshot.paramMap.get('caregiverId')!;

  /** NFR-34: uno solo por montaje del wizard; se reusa en todos los reintentos. */
  private readonly operationId = newOperationId();

  readonly step = signal(1);
  readonly stepTitle = computed(() => STEP_TITLES[this.step() - 1]);
  readonly profile = signal<MarketplaceProfile | null>(null);
  readonly validationError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Signal para que la preselección desde el effect repinte en zoneless. */
  readonly patientId = signal<string | null>(null);
  modality: Modality | '' = '';
  startDate = '';
  endDate = '';
  specialRequirements = '';
  phone = '';

  readonly selectedPatientName = computed(
    () => this.store.patients().find((p) => p.id === this.patientId())?.fullName ?? '—',
  );

  constructor() {
    if (!this.store.loaded()) {
      this.store.load();
    }
    // Preseleccionar el paciente activo apenas está disponible.
    effect(() => {
      const active = this.store.activePatientId();
      if (!this.patientId() && active) {
        this.patientId.set(active);
      }
    });
    this.api.getCaregiverProfile(this.caregiverId).subscribe({
      next: (p) => this.profile.set(p),
      error: () => undefined,
    });
  }

  next(): void {
    this.validationError.set(null);
    if (this.step() === 1 && !this.patientId()) {
      this.validationError.set('Elegí para quién es el cuidado.');
      return;
    }
    if (this.step() === 2 && !this.validateDates()) {
      return;
    }
    if (this.step() === 3 && !this.phone.trim()) {
      this.validationError.set('Dejanos un teléfono de contacto.');
      return;
    }
    this.step.update((s) => s + 1);
  }

  back(): void {
    this.validationError.set(null);
    this.step.update((s) => Math.max(1, s - 1));
  }

  private validateDates(): boolean {
    if (!this.modality) {
      this.validationError.set('Elegí la modalidad del cuidado.');
      return false;
    }
    if (!this.startDate || !this.endDate) {
      this.validationError.set('Completá las fechas de inicio y fin.');
      return false;
    }
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    if (start.getTime() <= Date.now()) {
      this.validationError.set('La fecha de inicio tiene que ser futura.');
      return false;
    }
    if (end.getTime() <= start.getTime()) {
      this.validationError.set('La fecha de fin tiene que ser posterior a la de inicio.');
      return false;
    }
    return true;
  }

  submit(): void {
    const patientId = this.patientId();
    if (this.submitting() || !patientId || !this.modality) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    const dto: CreateRequestDto = {
      operationId: this.operationId,
      patientId,
      caregiverId: this.caregiverId,
      modality: this.modality,
      startDate: new Date(this.startDate).toISOString(),
      endDate: new Date(this.endDate).toISOString(),
      specialRequirements: this.specialRequirements.trim() || undefined,
      // El schema declara contactData como objeto vacío; el shape real es { phone }.
      contactData: { phone: this.phone.trim() } as unknown as CreateRequestDto['contactData'],
    };
    this.api.createRequest(dto).subscribe({
      next: () => void this.router.navigate(['/app/hiring']),
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.submitError.set(err.message);
      },
    });
  }

  modalityLabel(): string {
    return this.modality ? MODALITY_LABELS[this.modality] : '—';
  }

  formatLocal(value: string): string {
    return value ? formatDateTime(new Date(value).toISOString()) : '—';
  }
}
