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
    this.api.getPatients().subscribe((patients) => {
      this.patients.set(patients);
      this.loaded.set(true);
      if (!this.activeId()) {
        this.activeId.set(localStorage.getItem(this.storageKey));
      }
    });
  }

  setActive(patientId: string): void {
    this.activeId.set(patientId);
    localStorage.setItem(this.storageKey, patientId);
  }
}
