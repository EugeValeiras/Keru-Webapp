import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Patient } from '../../core/api/api.types';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { InviteModal } from './invite-modal';

@Component({
  selector: 'kr-patients-page',
  imports: [RouterLink, KrAvatar, KrEmptyState, InviteModal],
  template: `
    <div class="flex items-center justify-between mb-6">
      <h1>Mis pacientes</h1>
      <a
        routerLink="/app/patients/new"
        class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
      >
        Registrar paciente
      </a>
    </div>

    @if (!store.loaded()) {
      <p class="text-ink-500 text-sm">Cargando pacientes…</p>
    } @else if (store.patients().length === 0) {
      <kr-empty-state
        icon="🫂"
        title="Todavía no registraste pacientes"
        subtitle="Registrá a la persona que querés cuidar para empezar a llevar su historia clínica."
      >
        <a
          routerLink="/app/patients/new"
          class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
        >
          Registrar paciente
        </a>
      </kr-empty-state>
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (p of store.patients(); track p.id) {
          <a
            [routerLink]="['/app/patients', p.id, 'dashboard']"
            (click)="store.setActive(p.id)"
            class="bg-surface rounded-card shadow-card p-6 flex items-center gap-4 hover:shadow-card-hover transition-shadow"
          >
            <kr-avatar [name]="p.fullName" [seed]="p.id" [size]="56" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-ink-900 truncate">{{ p.fullName }}</p>
              <p class="text-sm text-ink-500">{{ p.age }} años</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  (click)="openInvite($event, p)"
                  class="rounded-pill border border-primary-600 text-primary-600 text-sm font-semibold py-1 px-3 hover:bg-primary-50 transition-colors"
                >
                  Invitar familiar
                </button>
                <button
                  type="button"
                  (click)="goToCaregivers($event, p)"
                  class="rounded-pill border border-ink-300 text-ink-700 text-sm font-semibold py-1 px-3 hover:bg-primary-50 transition-colors"
                >
                  Cuidadores
                </button>
                <button
                  type="button"
                  (click)="goToRecord($event, p)"
                  class="rounded-pill border border-ink-300 text-ink-700 text-sm font-semibold py-1 px-3 hover:bg-primary-50 transition-colors"
                >
                  Ficha
                </button>
              </div>
            </div>
          </a>
        }
      </div>
    }

    @if (inviting(); as p) {
      <kr-invite-modal
        [patientId]="p.id"
        [patientName]="p.fullName"
        (closed)="inviting.set(null)"
      />
    }
  `,
})
export class PatientsPage {
  protected readonly store = inject(ActivePatientStore);
  private readonly router = inject(Router);
  readonly inviting = signal<Patient | null>(null);

  constructor() {
    if (!this.store.loaded()) {
      this.store.load();
    }
  }

  openInvite(event: Event, patient: Patient): void {
    // El botón vive dentro del <a> de la card: frenar navegación y setActive.
    event.preventDefault();
    event.stopPropagation();
    this.inviting.set(patient);
  }

  goToCaregivers(event: Event, patient: Patient): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.setActive(patient.id);
    void this.router.navigate(['/app/patients', patient.id, 'caregivers']);
  }

  goToRecord(event: Event, patient: Patient): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.setActive(patient.id);
    void this.router.navigate(['/app/patients', patient.id, 'record']);
  }
}
