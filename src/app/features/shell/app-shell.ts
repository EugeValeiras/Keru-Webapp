import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { StepUpStore } from '../../core/auth/step-up.store';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { PushStore } from '../../core/notifications/push.store';
import { NotificationBell } from './notification-bell';
import { PushPromptBanner } from './push-prompt-banner';
import { StepUpModal } from './step-up-modal';
import { KrPatientPicker } from './patient-picker';
import { KrToastOutlet } from '../../shared/ui/kr-toast';

interface NavItem {
  label: string;
  path: string;
}

const FAMILY_NAV: NavItem[] = [
  { label: 'Buscar cuidadores', path: '/app/marketplace' },
  { label: 'Mis contrataciones', path: '/app/hiring' },
  { label: 'Mis pacientes', path: '/app/patients' },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  family: FAMILY_NAV,
  patient: FAMILY_NAV,
  caregiver: [
    { label: 'Mi perfil', path: '/caregiver/profile' },
    { label: 'Solicitudes', path: '/caregiver/requests' },
    { label: 'Mis servicios', path: '/caregiver/services' },
  ],
  admin: [
    { label: 'Pendientes', path: '/admin/pending' },
    { label: 'Cuidadores', path: '/admin/caregivers' },
    { label: 'Ops', path: '/admin/ops' },
  ],
};

@Component({
  selector: 'kr-app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBell, PushPromptBanner, StepUpModal, KrPatientPicker, KrToastOutlet],
  template: `
    @if (isFamily()) {
      <!-- UC-18 flujo 1: oferta de push en el primer inicio; A1 degrada a solo campana. -->
      <kr-push-prompt-banner />
    }
    <header class="bg-surface border-b border-ink-300/40 sticky top-0 z-10">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center gap-6">
        <img src="keru-logo.svg" alt="Keru" class="h-8 w-auto select-none" />

        <nav class="flex items-center gap-1 flex-1">
          @for (item of navItems(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-primary-100 text-primary-700"
              class="rounded-pill px-4 py-1.5 text-sm font-medium text-ink-700 hover:bg-primary-50 transition-colors"
            >
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="flex items-center gap-3">
          @if (isFamily()) {
            @if (patients.patients().length > 1) {
              <kr-patient-picker
                [patients]="patients.patients()"
                [activeId]="patients.activePatientId()"
                (select)="onPatientChange($event)"
              />
            }
            <kr-notification-bell />
          }
          <span class="text-sm text-ink-500 hidden sm:block">{{ store.displayName() }}</span>
          <button
            type="button"
            (click)="logout()"
            class="text-sm font-medium text-ink-500 hover:text-danger transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-8">
      <router-outlet />
    </main>

    <!-- KER-38 (NFR-33): re-confirmación de identidad para operaciones sensibles -->
    <kr-step-up-modal />

    <kr-toast-outlet />
  `,
})
export class AppShell {
  protected readonly store = inject(AuthStore);
  protected readonly patients = inject(ActivePatientStore);
  private readonly push = inject(PushStore);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApi);
  private readonly stepUp = inject(StepUpStore);

  protected readonly navItems = computed(() => NAV_BY_ROLE[this.store.role() ?? ''] ?? []);
  protected readonly isFamily = computed(() => {
    const role = this.store.role();
    return role === 'family' || role === 'patient';
  });

  constructor() {
    effect(() => {
      if (this.isFamily() && !this.patients.loaded()) {
        this.patients.load();
      }
    });
    effect(() => {
      // El push acompaña a la campana: solo cuentas de familia/paciente (UC-18).
      if (this.isFamily()) {
        void this.push.init();
      }
    });
  }

  onPatientChange(id: string): void {
    this.patients.setActive(id);
    if (this.router.url.includes('/app/patients/')) {
      void this.router.navigate(['/app/patients', id, 'dashboard']);
    }
  }

  /**
   * KER-38 (NFR-41) · Logout real: la API revoca el token (denylist jti) y la push subscription
   * de este device. Best-effort: si la API no responde, la sesión local se limpia igual —
   * el usuario nunca queda "atrapado" logueado.
   */
  async logout(): Promise<void> {
    try {
      const pushEndpoint = await this.push.currentEndpoint();
      await firstValueFrom(this.authApi.logout(pushEndpoint ?? undefined));
    } catch {
      // Sin red o token ya vencido: el logout local procede igual.
    }
    await this.push.forgetLocal();
    this.stepUp.clear();
    this.store.clear();
    void this.router.navigate(['/login']);
  }
}
