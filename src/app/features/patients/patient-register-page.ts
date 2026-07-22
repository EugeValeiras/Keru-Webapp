import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import { ApiError, RegisterPatientDto } from '../../core/api/api.types';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { newOperationId } from '../../core/idempotency/operation-id';

@Component({
  selector: 'kr-patient-register-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="/app/patients" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver a mis pacientes
      </a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Registrar paciente</h1>

      @if (duplicateBanner()) {
        <div class="bg-amber-50 text-warning rounded-card px-4 py-3 mb-4 text-sm">
          Registramos el perfil, pero puede existir un perfil duplicado de la misma persona.
          Más adelante vas a poder vincularlos. Te llevamos a tus pacientes…
        </div>
      }

      <form class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4" (ngSubmit)="submit()">
        @if (error(); as err) {
          <div class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
            <p>{{ err }}</p>
            @for (f of fields(); track f) {
              <p class="mt-1">• {{ f }}</p>
            }
          </div>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Nombre completo</span>
          <input
            type="text"
            name="fullName"
            required
            [(ngModel)]="fullName"
            placeholder="Rosa Díaz"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <div class="grid sm:grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Fecha de nacimiento</span>
            <input
              type="date"
              name="birthDate"
              required
              [max]="today"
              [(ngModel)]="birthDate"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Grupo sanguíneo (opcional)</span>
            <input
              type="text"
              name="bloodGroup"
              [(ngModel)]="bloodGroup"
              placeholder="0+"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Condición principal</span>
          <input
            type="text"
            name="mainCondition"
            required
            [(ngModel)]="mainCondition"
            placeholder="Hipertensión"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Foto (URL, opcional)</span>
          <input
            type="url"
            name="photoUrl"
            [(ngModel)]="photoUrl"
            placeholder="https://…"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-ink-700">Alergias</span>
          <div class="flex gap-2">
            <input
              type="text"
              name="allergyInput"
              [(ngModel)]="allergyInput"
              (keydown.enter)="$event.preventDefault(); addAllergy()"
              placeholder="Penicilina"
              class="flex-1 rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button
              type="button"
              (click)="addAllergy()"
              class="rounded-pill bg-primary-100 text-primary-700 font-semibold px-5 hover:bg-primary-200 transition-colors"
            >
              Agregar
            </button>
          </div>
          @if (allergies().length > 0) {
            <div class="flex flex-wrap gap-2">
              @for (a of allergies(); track a) {
                <span
                  class="inline-flex items-center gap-1.5 rounded-pill bg-primary-50 text-primary-700 px-3 py-1 text-sm"
                >
                  {{ a }}
                  <button
                    type="button"
                    (click)="removeAllergy(a)"
                    class="text-primary-600 hover:text-primary-700 leading-none"
                    [attr.aria-label]="'Quitar ' + a"
                  >
                    ✕
                  </button>
                </span>
              }
            </div>
          } @else {
            <p class="text-xs text-ink-500">Podés dejarlo vacío si no tiene alergias conocidas.</p>
          }
        </div>

        <fieldset class="border-t border-ink-300/60 pt-4 flex flex-col gap-4">
          <legend class="text-sm font-semibold text-ink-900 pr-3">Contacto de emergencia</legend>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Nombre</span>
              <input
                type="text"
                name="contactName"
                required
                [(ngModel)]="contactName"
                placeholder="María Díaz"
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Teléfono</span>
              <input
                type="tel"
                name="contactPhone"
                required
                [(ngModel)]="contactPhone"
                placeholder="+54 11 5555-5555"
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Vínculo (opcional)</span>
            <input
              type="text"
              name="contactRelationship"
              [(ngModel)]="contactRelationship"
              placeholder="hija"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
        </fieldset>

        <button
          type="submit"
          [disabled]="loading()"
          class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Registrando…' : 'Registrar paciente' }}
        </button>
      </form>
    </div>
  `,
})
export class PatientRegisterPage {
  private readonly api = inject(MembershipApi);
  private readonly store = inject(ActivePatientStore);
  private readonly router = inject(Router);

  /** NFR-34: un solo operationId por montaje del form; se reusa en reintentos. */
  private readonly operationId = newOperationId();

  protected readonly today = new Date().toISOString().slice(0, 10);

  fullName = '';
  birthDate = '';
  mainCondition = '';
  bloodGroup = '';
  photoUrl = '';
  allergyInput = '';
  contactName = '';
  contactPhone = '';
  contactRelationship = '';

  protected readonly allergies = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<string[]>([]);
  protected readonly duplicateBanner = signal(false);

  addAllergy(): void {
    const value = this.allergyInput.trim();
    if (value && !this.allergies().includes(value)) {
      this.allergies.update((list) => [...list, value]);
    }
    this.allergyInput = '';
  }

  removeAllergy(allergy: string): void {
    this.allergies.update((list) => list.filter((a) => a !== allergy));
  }

  submit(): void {
    if (this.loading()) {
      return;
    }
    if (!this.fullName.trim() || !this.birthDate || !this.mainCondition.trim()) {
      this.error.set('Completá nombre, fecha de nacimiento y condición principal.');
      this.fields.set([]);
      return;
    }
    if (!this.contactName.trim() || !this.contactPhone.trim()) {
      this.error.set('Completá el contacto de emergencia (nombre y teléfono).');
      this.fields.set([]);
      return;
    }

    const dto: RegisterPatientDto = {
      operationId: this.operationId,
      fullName: this.fullName.trim(),
      birthDate: this.birthDate,
      mainCondition: this.mainCondition.trim(),
      allergies: this.allergies(),
      emergencyContact: {
        name: this.contactName.trim(),
        phone: this.contactPhone.trim(),
        ...(this.contactRelationship.trim() ? { relationship: this.contactRelationship.trim() } : {}),
      },
      ...(this.bloodGroup.trim() ? { bloodGroup: this.bloodGroup.trim() } : {}),
      ...(this.photoUrl.trim() ? { photoUrl: this.photoUrl.trim() } : {}),
    };

    this.loading.set(true);
    this.error.set(null);
    this.fields.set([]);

    this.api.registerPatient(dto).subscribe({
      next: (patient) => {
        this.store.load();
        if (patient.duplicateCandidateId) {
          // No bloquea: avisamos y navegamos igual, con una pausa para que se lea.
          this.duplicateBanner.set(true);
          setTimeout(() => void this.router.navigateByUrl('/app/patients'), 3000);
        } else {
          void this.router.navigateByUrl('/app/patients');
        }
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
        this.fields.set(err.fields);
      },
    });
  }
}
