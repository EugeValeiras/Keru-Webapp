import { Injectable, computed, inject, signal } from '@angular/core';
import { MembershipApi } from '../api/membership-api.service';
import { Patient } from '../api/api.types';
import { AuthStore } from '../auth/auth-store';

/**
 * UC-22: una cuenta administra 1..n pacientes; toda operación por-paciente lleva
 * el patientId explícito. Este store mantiene la lista y el "paciente activo"
 * (persistido por cuenta). La URL es la fuente de verdad; esto es el default.
 */
@Injectable({ providedIn: 'root' })
export class ActivePatientStore {
  private readonly api = inject(MembershipApi);
  private readonly auth = inject(AuthStore);

  readonly patients = signal<Patient[]>([]);
  readonly loaded = signal(false);
  private loading = false;
  private readonly activeId = signal<string | null>(null);

  readonly activePatientId = computed(() => {
    const id = this.activeId();
    const list = this.patients();
    if (id && list.some((p) => p.id === id)) {
      return id;
    }
    return list[0]?.id ?? null;
  });

  readonly activePatient = computed(
    () => this.patients().find((p) => p.id === this.activePatientId()) ?? null,
  );

  private get storageKey(): string {
    return `keru.activePatient.${this.auth.accountId() ?? 'anon'}`;
  }

  load(): void {
    // Dedup de llamadas concurrentes EN VUELO (el shell y las páginas
    // por-paciente pueden pedir la carga a la vez). No corta si ya está
    // cargado: load() también refresca tras registrar un paciente (UC-01).
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.api.getPatients().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.loaded.set(true);
        this.loading = false;
        if (!this.activeId()) {
          this.activeId.set(localStorage.getItem(this.storageKey));
        }
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  setActive(patientId: string): void {
    this.activeId.set(patientId);
    localStorage.setItem(this.storageKey, patientId);
  }
}
