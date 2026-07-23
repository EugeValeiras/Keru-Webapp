import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthShell } from './auth-shell';
import { KrPasswordInput } from '../../shared/ui/kr-password-input';

/**
 * UC-04 A4 (KER-46) · Confirmar la recuperación: el token llega en el query param del link del
 * email. El usuario define una contraseña nueva (misma fuerza que el alta, reusa kr-password-input
 * de KER-45). Al confirmar, la API revoca las sesiones vigentes y devuelve una sesión nueva
 * (auto-login) → guardamos la sesión y redirigimos al home del rol.
 */
@Component({
  selector: 'kr-password-reset-confirm-page',
  imports: [FormsModule, RouterLink, AuthShell, KrPasswordInput],
  template: `
    <kr-auth-shell
      tagline="Creá una contraseña nueva."
      subline="Elegí una contraseña fuerte para proteger tu cuenta."
    >
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit()"
      >
        <div>
          <h1 class="text-[1.375rem]">Creá tu nueva contraseña</h1>
          <p class="text-sm text-ink-500 mt-1">Usá al menos 8 caracteres.</p>
        </div>

        @if (error(); as err) {
          <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            <p>{{ err }}</p>
            @if (linkInvalid()) {
              <a routerLink="/password-reset/request" class="font-medium underline">
                Pedí un enlace nuevo
              </a>
            }
          </div>
        }

        @for (fieldError of fieldErrors(); track fieldError) {
          <p class="text-xs text-danger">{{ fieldError }}</p>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Nueva contraseña</span>
          <kr-password-input
            name="password"
            required
            [minlength]="8"
            autocomplete="new-password"
            [(ngModel)]="password"
          />
          <span class="text-xs text-ink-500">Mínimo 8 caracteres</span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Repetí la contraseña</span>
          <kr-password-input
            name="confirmPassword"
            required
            [minlength]="8"
            autocomplete="new-password"
            [(ngModel)]="confirmPassword"
          />
        </label>

        @if (password && confirmPassword && password !== confirmPassword) {
          <p class="text-xs text-danger">Las contraseñas no coinciden.</p>
        }

        <button
          type="submit"
          [disabled]="!canSubmit()"
          class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Guardando…' : 'Guardar contraseña nueva' }}
        </button>

        <p class="text-sm text-ink-500 text-center">
          ¿Preferís volver?
          <a routerLink="/login" class="text-primary-600 font-medium hover:underline">
            Iniciá sesión
          </a>
        </p>
      </form>
    </kr-auth-shell>
  `,
})
export class PasswordResetConfirmPage {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  password = '';
  confirmPassword = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);
  readonly linkInvalid = signal(false);

  constructor() {
    if (!this.token) {
      this.error.set('El enlace de recuperación es inválido o expiró.');
      this.linkInvalid.set(true);
    }
  }

  canSubmit(): boolean {
    return (
      !this.loading() &&
      !!this.token &&
      this.password.length >= 8 &&
      this.password === this.confirmPassword
    );
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    this.api.confirmPasswordReset({ token: this.token, newPassword: this.password }).subscribe({
      next: (auth) => {
        this.store.setSession(auth);
        this.toast.success('Tu contraseña se actualizó. Cerramos las otras sesiones por seguridad.');
        void this.router.navigateByUrl(homeForRole(auth.role));
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.linkInvalid.set(err.statusCode === 410);
        this.fieldErrors.set(err.fields);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: ApiError): string {
    switch (err.statusCode) {
      case 410:
        return 'Este enlace ya fue usado o expiró.';
      case 400:
        return 'Revisá los requisitos de la contraseña e intentá de nuevo.';
      case 429:
        return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
      default:
        return err.message;
    }
  }
}
