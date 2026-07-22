import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import { ApiError, PatientLinkRole, PatientRecord, UpdatePatientDto } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { KrPhotoInput } from '../../shared/ui/kr-photo-input';
import { formatDate } from '../../shared/utils/dates';

const LINK_ROLE_LABELS: Record<PatientLinkRole, string> = {
  'consent-holder': 'Titular',
  manager: 'Gestor',
  viewer: 'Solo lectura',
};

const LINK_ROLE_TONES: Record<PatientLinkRole, BadgeTone> = {
  'consent-holder': 'primary',
  manager: 'primary',
  viewer: 'neutral',
};

/** UC-22 · Ficha del paciente: vista para cualquier vinculado, edición solo titular/gestor. */
@Component({
  selector: 'kr-patient-record-page',
  imports: [FormsModule, RouterLink, KrAvatar, KrBadge, KrEmptyState, KrPhotoInput],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="/app/patients" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver a mis pacientes
      </a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Ficha del paciente</h1>

      @if (saved()) {
        <div class="bg-emerald-50 text-success rounded-card px-4 py-3 mb-4 text-sm">
          Ficha actualizada.
        </div>
      }

      @if (forbidden()) {
        <kr-empty-state
          icon="🔒"
          title="Sin acceso a este paciente"
          subtitle="Tu cuenta no está vinculada a esta persona. Pedile una invitación a quien administra su círculo."
        />
      } @else if (loading()) {
        <p class="text-ink-500 text-sm">Cargando ficha…</p>
      } @else if (record(); as r) {
        @if (error(); as err) {
          <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-4">{{ err }}</p>
        }

        @if (!editing()) {
          <!-- Vista -->
          <div class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-6">
            <div class="flex items-center gap-5">
              <kr-avatar [name]="r.fullName" [seed]="r.id" [size]="96" [photoUrl]="r.photoUrl" />
              <div class="min-w-0">
                <p class="text-xl font-bold text-ink-900 truncate">{{ r.fullName }}</p>
                <p class="text-sm text-ink-500 mt-0.5">
                  {{ formatBirth(r.birthDate) }} · {{ r.age }} años
                </p>
                <div class="mt-2">
                  <kr-badge [tone]="roleTone(r.linkRole)">{{ roleLabel(r.linkRole) }}</kr-badge>
                </div>
              </div>
            </div>

            <div class="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p class="text-sm font-medium text-ink-700 mb-1">Condición principal</p>
                <p class="text-ink-900">{{ r.mainCondition }}</p>
              </div>
              <div>
                <p class="text-sm font-medium text-ink-700 mb-1">Grupo sanguíneo</p>
                <p class="text-ink-900">{{ r.bloodGroup || '—' }}</p>
              </div>
            </div>

            <div>
              <p class="text-sm font-medium text-ink-700 mb-2">Alergias</p>
              @if (r.allergies.length > 0) {
                <div class="flex flex-wrap gap-2">
                  @for (a of r.allergies; track a) {
                    <span class="inline-flex items-center rounded-pill bg-primary-50 text-primary-700 px-3 py-1 text-sm">
                      {{ a }}
                    </span>
                  }
                </div>
              } @else {
                <p class="text-sm text-ink-500">Sin alergias conocidas.</p>
              }
            </div>

            <div class="border-t border-ink-300/60 pt-4">
              <p class="text-sm font-semibold text-ink-900 mb-1">Contacto de emergencia</p>
              <p class="text-ink-900">
                {{ r.emergencyContact.name }}
                @if (r.emergencyContact.relationship) {
                  <span class="text-ink-500">({{ r.emergencyContact.relationship }})</span>
                }
              </p>
              <p class="text-sm text-ink-500">{{ r.emergencyContact.phone }}</p>
            </div>

            @if (r.linkRole !== 'viewer') {
              <div>
                <button
                  type="button"
                  (click)="startEdit()"
                  class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
                >
                  Editar ficha
                </button>
              </div>
            }
          </div>
        } @else {
          <!-- Edición -->
          <form class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4" (ngSubmit)="save()">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Nombre completo</span>
              <input
                type="text"
                name="fullName"
                required
                [(ngModel)]="fullName"
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
                class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
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

            <div class="flex gap-3 mt-2">
              <button
                type="submit"
                [disabled]="saving()"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {{ saving() ? 'Guardando…' : 'Guardar' }}
              </button>
              <button
                type="button"
                (click)="cancelEdit()"
                [disabled]="saving()"
                class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-primary-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class PatientRecordPage {
  private readonly api = inject(MembershipApi);
  private readonly route = inject(ActivatedRoute);
  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  protected readonly today = new Date().toISOString().slice(0, 10);

  readonly record = signal<PatientRecord | null>(null);
  readonly loading = signal(true);
  readonly forbidden = signal(false);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  // Estado del form de edición (ngModel)
  fullName = '';
  birthDate = '';
  mainCondition = '';
  bloodGroup = '';
  readonly photoUrl = signal<string | null>(null);
  allergyInput = '';
  protected readonly allergies = signal<string[]>([]);
  contactName = '';
  contactPhone = '';
  contactRelationship = '';

  constructor() {
    this.api.getPatientRecord(this.patientId).subscribe({
      next: (record) => {
        this.loading.set(false);
        this.record.set(record);
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

  roleLabel(role: PatientLinkRole): string {
    return LINK_ROLE_LABELS[role];
  }

  roleTone(role: PatientLinkRole): BadgeTone {
    return LINK_ROLE_TONES[role];
  }

  /** birthDate llega como fecha-solo (YYYY-MM-DD): anclarla a hora local evita el corrimiento de día. */
  formatBirth(birthDate: string): string {
    return formatDate(birthDate.slice(0, 10) + 'T00:00:00');
  }

  startEdit(): void {
    const r = this.record();
    if (!r) {
      return;
    }
    this.fullName = r.fullName;
    this.birthDate = r.birthDate.slice(0, 10);
    this.mainCondition = r.mainCondition;
    this.bloodGroup = r.bloodGroup ?? '';
    this.photoUrl.set(r.photoUrl ?? null);
    this.allergies.set([...r.allergies]);
    this.allergyInput = '';
    this.contactName = r.emergencyContact.name;
    this.contactPhone = r.emergencyContact.phone;
    this.contactRelationship = r.emergencyContact.relationship ?? '';
    this.saved.set(false);
    this.error.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.error.set(null);
    this.editing.set(false);
  }

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

  /** Solo los campos que difieren de lo cargado (set parcial del PATCH). */
  private buildDiff(r: PatientRecord): UpdatePatientDto {
    const dto: UpdatePatientDto = {};
    const fullName = this.fullName.trim();
    if (fullName !== r.fullName) {
      dto.fullName = fullName;
    }
    if (this.birthDate !== r.birthDate.slice(0, 10)) {
      dto.birthDate = this.birthDate;
    }
    const mainCondition = this.mainCondition.trim();
    if (mainCondition !== r.mainCondition) {
      dto.mainCondition = mainCondition;
    }
    const bloodGroup = this.bloodGroup.trim();
    if (bloodGroup !== (r.bloodGroup ?? '')) {
      dto.bloodGroup = bloodGroup;
    }
    const photo = this.photoUrl() ?? '';
    if (photo !== (r.photoUrl ?? '')) {
      dto.photoUrl = photo;
    }
    const allergies = this.allergies();
    if (allergies.length !== r.allergies.length || allergies.some((a, i) => a !== r.allergies[i])) {
      dto.allergies = allergies;
    }
    const name = this.contactName.trim();
    const phone = this.contactPhone.trim();
    const relationship = this.contactRelationship.trim();
    if (
      name !== r.emergencyContact.name ||
      phone !== r.emergencyContact.phone ||
      relationship !== (r.emergencyContact.relationship ?? '')
    ) {
      dto.emergencyContact = { name, phone, ...(relationship ? { relationship } : {}) };
    }
    return dto;
  }

  save(): void {
    const r = this.record();
    if (!r || this.saving()) {
      return;
    }
    if (!this.fullName.trim() || !this.birthDate || !this.mainCondition.trim()) {
      this.error.set('Completá nombre, fecha de nacimiento y condición principal.');
      return;
    }
    if (!this.contactName.trim() || !this.contactPhone.trim()) {
      this.error.set('Completá el contacto de emergencia (nombre y teléfono).');
      return;
    }

    const dto = this.buildDiff(r);
    if (Object.keys(dto).length === 0) {
      // Nada cambió: volver a vista sin llamar a la API.
      this.cancelEdit();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.api.updatePatient(this.patientId, dto).subscribe({
      next: (record) => {
        this.saving.set(false);
        this.record.set(record);
        this.editing.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 4000);
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
