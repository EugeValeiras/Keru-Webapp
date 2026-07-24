import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, SignupDto, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { AuthShell } from './auth-shell';
import { KrPasswordInput } from '../../shared/ui/kr-password-input';

type SignupRole = SignupDto['role'];
type LinkRoleToGrant = 'manager' | 'viewer';

/** KER-67 · Etiquetas del rol del vínculo, coherentes con el modal de invitar (invite-modal.ts). */
const LINK_ROLE_LABELS: Record<LinkRoleToGrant, string> = {
  manager: 'Gestor',
  viewer: 'Solo ver',
};

@Component({
  selector: 'kr-signup-page',
  imports: [FormsModule, RouterLink, AuthShell, KrPasswordInput],
  template: `
    <kr-auth-shell
      tagline="Sumate al círculo: acá el cuidado se acompaña de cerca."
      subline="Creá tu cuenta en un minuto."
    >
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit()"
      >
        <div>
          <h1 class="text-[1.375rem]">Creá tu cuenta</h1>
          <p class="text-sm text-ink-700 mt-1">Unos datos y arrancamos.</p>
        </div>

        @if (error(); as err) {
          <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            {{ err }}
          </p>
        }
        @for (fieldError of fieldErrors(); track fieldError) {
          <p class="text-xs text-danger">{{ fieldError }}</p>
        }

        @if (invited()) {
          <!-- KER-67 · Alta por invitación: el tipo de cuenta es family y no se elige.
               El círculo se compone solo de cuentas family y confirmar exige family (UC-03 A6/KER-50). -->
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-ink-700">Tipo de cuenta</span>
            <div
              class="rounded-card border-2 border-primary-600 bg-primary-50 px-4 py-3"
              aria-live="polite"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="font-medium">Familiar</span>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  class="w-5 h-5 shrink-0 text-primary-600"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span class="text-sm text-ink-700 block">
                Te sumás al círculo de cuidado de un ser querido.
              </span>
            </div>
            @if (linkRoleLabel(); as rl) {
              <p class="text-xs text-ink-700">
                Rol en el círculo:
                <span class="font-medium text-ink-700">{{ rl }}</span>
              </p>
            }
          </div>
        } @else {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium text-ink-700 mb-1">Quiero usar Keru como…</legend>
            <div class="grid grid-cols-1 gap-2">
              @for (option of roleOptions; track option.value) {
                <button
                  type="button"
                  (click)="role.set(option.value)"
                  [attr.aria-pressed]="role() === option.value"
                  class="text-left rounded-card border-2 px-4 py-3 transition-colors"
                  [class]="
                    role() === option.value
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-ink-300 hover:border-ink-500'
                  "
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="font-medium">{{ option.label }}</span>
                    @if (role() === option.value) {
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        class="w-5 h-5 shrink-0 text-primary-600"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    }
                  </span>
                  <span class="text-sm text-ink-700 block">{{ option.hint }}</span>
                </button>
              }
            </div>
          </fieldset>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Nombre y apellido</span>
          <input
            type="text"
            name="displayName"
            required
            autocomplete="name"
            [(ngModel)]="displayName"
            class="rounded-control border border-ink-300 bg-surface px-3 py-2 hover:border-ink-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Email</span>
          <!-- KER-67 · Por invitación: readonly (envía su valor y se anuncia como solo-lectura,
               a diferencia de un disabled mudo) — el email es el objetivo de la invitación (NFR-19). -->
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            [(ngModel)]="email"
            [readonly]="invited()"
            [attr.aria-describedby]="invited() ? 'email-locked-hint' : null"
            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            [class]="
              invited()
                ? 'bg-sand-100 cursor-not-allowed'
                : 'bg-surface hover:border-ink-500'
            "
          />
          @if (invited()) {
            <span id="email-locked-hint" class="text-xs text-ink-700">
              Es el email de tu invitación y no se puede cambiar.
            </span>
          }
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Contraseña</span>
          <kr-password-input
            name="password"
            required
            [minlength]="8"
            autocomplete="new-password"
            [(ngModel)]="password"
          />
          <span class="text-xs text-ink-700">Mínimo 8 caracteres</span>
        </label>

        <button
          type="submit"
          [disabled]="loading()"
          class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>

        <p class="text-sm text-ink-700 text-center">
          ¿Ya tenés cuenta?
          <a routerLink="/login" class="text-primary-600 font-medium hover:underline">
            Iniciá sesión
          </a>
        </p>
      </form>
    </kr-auth-shell>
  `,
})
export class SignupPage {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // KER-50: el self-signup ofrece solo family y caregiver. Administrar perfiles de paciente es
  // capacidad de `family` (para vos o un ser querido); el rol `patient` quedó fuera del signup
  // (login-de-paciente diferido, ADR-0003 §7). Quien se cuida a sí mismo se registra como Familiar.
  readonly roleOptions: { value: SignupRole; label: string; hint: string }[] = [
    {
      value: 'family',
      label: 'Familiar',
      hint: 'Busco y contrato cuidadores para mí o un ser querido',
    },
    { value: 'caregiver', label: 'Cuidador/a', hint: 'Ofrezco mis servicios de cuidado' },
  ];

  readonly role = signal<SignupRole>('family');
  displayName = '';
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  // KER-67 · Alta por invitación: el email viene prellenado+bloqueado y el tipo de cuenta es
  // family (no editable). El signup normal (sin invitación) mantiene todo editable.
  readonly invited = signal(false);
  private readonly linkRole = signal<LinkRoleToGrant | null>(null);
  readonly linkRoleLabel = computed(() => {
    const r = this.linkRole();
    return r ? LINK_ROLE_LABELS[r] : null;
  });

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    // Deep link de invitación: precargar el email invitado si viene por query.
    const email = qp.get('email');
    if (email) {
      this.email = email;
    }
    // El registro por invitación se reconoce por el returnUrl a /invite/:token: fija el tipo de
    // cuenta en family (confirmar exige family, UC-03 A6/KER-50) y bloquea el email prellenado.
    const returnUrl = qp.get('returnUrl') ?? '';
    if (returnUrl.startsWith('/invite/')) {
      this.invited.set(true);
      this.role.set('family');
      const lr = qp.get('linkRole');
      if (lr === 'manager' || lr === 'viewer') {
        this.linkRole.set(lr);
      }
    }
  }

  submit(): void {
    if (this.loading() || !this.email || !this.password || !this.displayName) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    this.api
      .signup({
        email: this.email,
        password: this.password,
        displayName: this.displayName,
        role: this.role(),
      })
      .subscribe({
        next: (auth) => {
          this.store.setSession(auth);
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          void this.router.navigateByUrl(returnUrl ?? homeForRole(auth.role));
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          if (err.statusCode === 409) {
            this.error.set('Ese email ya está registrado. Probá iniciar sesión.');
          } else if (err.statusCode === 429) {
            this.error.set('Demasiados intentos. Esperá un minuto y volvé a probar.');
          } else {
            this.error.set(err.message);
            this.fieldErrors.set(err.fields);
          }
        },
      });
  }
}
