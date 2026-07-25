import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import { ApiError, RegisterPatientDto } from '../../core/api/api.types';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { newOperationId } from '../../core/idempotency/operation-id';
import { KrPhotoInput } from '../../shared/ui/kr-photo-input';
import { KrRequiredMark } from '../../shared/ui/kr-required-mark';
import { KrFieldError } from '../../shared/ui/kr-field-error';

@Component({
  selector: 'kr-patient-register-page',
  imports: [FormsModule, RouterLink, KrPhotoInput, KrRequiredMark, KrFieldError],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="/app/patients" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver a mis pacientes
      </a>
      <h1 class="mt-2 mb-6">Registrar paciente</h1>

      @if (duplicateBanner()) {
        <div class="bg-warning-50 text-warning rounded-card px-4 py-3 mb-4 text-sm">
          Registramos el perfil, pero puede existir un perfil duplicado de la misma persona. Más
          adelante vas a poder vincularlos. Te llevamos a tus pacientes…
        </div>
      }

      <form
        #formEl
        #f="ngForm"
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit(f)"
      >
        @if (error(); as err) {
          <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            <p>{{ err }}</p>
            @for (field of fields(); track field) {
              <p class="mt-1">• {{ field }}</p>
            }
          </div>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Nombre completo <kr-required-mark /></span>
          <input
            #fullNameCtrl="ngModel"
            type="text"
            name="fullName"
            required
            [(ngModel)]="fullName"
            placeholder="Rosa Díaz"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            [class.input-error]="fullNameCtrl.invalid && f.submitted"
            [attr.aria-invalid]="fullNameCtrl.invalid && f.submitted ? 'true' : null"
          />
          @if (fullNameCtrl.invalid && f.submitted) {
            <kr-field-error>Ingresá el nombre completo.</kr-field-error>
          }
        </label>

        <div class="grid sm:grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700"
              >Fecha de nacimiento <kr-required-mark /></span
            >
            <input
              #birthDateCtrl="ngModel"
              type="date"
              name="birthDate"
              required
              [max]="today"
              [(ngModel)]="birthDate"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              [class.input-error]="birthDateCtrl.invalid && f.submitted"
              [attr.aria-invalid]="birthDateCtrl.invalid && f.submitted ? 'true' : null"
            />
            @if (birthDateCtrl.invalid && f.submitted) {
              <kr-field-error>Ingresá la fecha de nacimiento.</kr-field-error>
            }
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Grupo sanguíneo (opcional)</span>
            <input
              type="text"
              name="bloodGroup"
              [(ngModel)]="bloodGroup"
              placeholder="0+"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700"
            >Condición principal <kr-required-mark /></span
          >
          <input
            #mainConditionCtrl="ngModel"
            type="text"
            name="mainCondition"
            required
            [(ngModel)]="mainCondition"
            placeholder="Hipertensión"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            [class.input-error]="mainConditionCtrl.invalid && f.submitted"
            [attr.aria-invalid]="mainConditionCtrl.invalid && f.submitted ? 'true' : null"
          />
          @if (mainConditionCtrl.invalid && f.submitted) {
            <kr-field-error>Ingresá la condición principal.</kr-field-error>
          }
        </label>

        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Foto (opcional)</span>
          <kr-photo-input [(url)]="photoUrl" />
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-ink-700">Alergias</span>
          <div class="flex gap-2">
            <input
              type="text"
              name="allergyInput"
              [(ngModel)]="allergyInput"
              (keydown.enter)="$event.preventDefault(); addAllergy()"
              placeholder="Penicilina"
              class="flex-1 rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
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
              <span class="text-sm font-medium text-ink-700">Nombre <kr-required-mark /></span>
              <input
                #contactNameCtrl="ngModel"
                type="text"
                name="contactName"
                required
                [(ngModel)]="contactName"
                placeholder="María Díaz"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                [class.input-error]="contactNameCtrl.invalid && f.submitted"
                [attr.aria-invalid]="contactNameCtrl.invalid && f.submitted ? 'true' : null"
              />
              @if (contactNameCtrl.invalid && f.submitted) {
                <kr-field-error>Ingresá el nombre del contacto.</kr-field-error>
              }
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Teléfono <kr-required-mark /></span>
              <input
                #contactPhoneCtrl="ngModel"
                type="tel"
                name="contactPhone"
                required
                [(ngModel)]="contactPhone"
                placeholder="+54 11 5555-5555"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                [class.input-error]="contactPhoneCtrl.invalid && f.submitted"
                [attr.aria-invalid]="contactPhoneCtrl.invalid && f.submitted ? 'true' : null"
              />
              @if (contactPhoneCtrl.invalid && f.submitted) {
                <kr-field-error>Ingresá el teléfono del contacto.</kr-field-error>
              }
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Vínculo (opcional)</span>
            <input
              type="text"
              name="contactRelationship"
              [(ngModel)]="contactRelationship"
              placeholder="hija"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
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

  private readonly formEl = viewChild<ElementRef<HTMLFormElement>>('formEl');

  /** NFR-34: un solo operationId por montaje del form; se reusa en reintentos. */
  private readonly operationId = newOperationId();

  protected readonly today = new Date().toISOString().slice(0, 10);

  fullName = '';
  birthDate = '';
  mainCondition = '';
  bloodGroup = '';
  readonly photoUrl = signal<string | null>(null);
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

  submit(form: NgForm): void {
    if (this.loading()) {
      return;
    }
    // KER-61: validación por-campo. Los `required` marcan cada control inválido; el borde rojo y el
    // mensaje inline los pinta el template sobre (ctrl.invalid && form.submitted), y el error se
    // auto-limpia cuando el usuario completa el campo (ctrl.invalid pasa a false). Acá solo frenamos
    // el envío y llevamos el foco al primer inválido en orden del DOM (WCAG 3.3.1 / 2.4.3).
    if (form.invalid) {
      this.focusFirstInvalid();
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
        ...(this.contactRelationship.trim()
          ? { relationship: this.contactRelationship.trim() }
          : {}),
      },
      ...(this.bloodGroup.trim() ? { bloodGroup: this.bloodGroup.trim() } : {}),
      ...(this.photoUrl() !== null ? { photoUrl: this.photoUrl()! } : {}),
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

  /** Enfoca el primer control inválido en orden del DOM tras un envío fallido. */
  private focusFirstInvalid(): void {
    const first = this.formEl()?.nativeElement.querySelector<HTMLElement>(
      'input:invalid, select:invalid, textarea:invalid',
    );
    first?.focus();
  }
}
