import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthShell } from './auth-shell';
import { KrPasswordInput } from '../../shared/ui/kr-password-input';

/**
 * UC-04 A5 (KER-47) · Primer acceso: "Definí tu contraseña". Una cuenta creada al aceptar una
 * invitación sin registro (UC-03 A1) llega acá con una sesión limitada (mustSetPassword): no puede
 * usar la app hasta setear su contraseña. Reusa kr-password-input (KER-45) y la misma validación de
 * fuerza que el alta. Al definirla, la API devuelve una sesión completa (auto-login) → guardamos la
 * sesión y vamos al home del rol.
 */
@Component({
  selector: 'kr-set-password-page',
  imports: [FormsModule, AuthShell, KrPasswordInput],
  template: `
    <kr-auth-shell
      tagline="Definí tu contraseña para entrar a Keru."
      subline="Un último paso: elegí una contraseña para tu cuenta."
    >
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit()"
      >
        <div>
          <h1 class="text-[1.375rem]">Definí tu contraseña</h1>
          <p class="text-sm text-ink-500 mt-1">
            Para <span class="font-medium text-ink-700">{{ email() }}</span>. Usá al menos 8
            caracteres.
          </p>
        </div>

        @if (error(); as err) {
          <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            <p>{{ err }}</p>
          </div>
        }

        @for (fieldError of fieldErrors(); track fieldError) {
          <p class="text-xs text-danger">{{ fieldError }}</p>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Tu contraseña</span>
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
          {{ loading() ? 'Guardando…' : 'Guardar y entrar' }}
        </button>
      </form>
    </kr-auth-shell>
  `,
})
export class SetPasswordPage {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly email = this.store.email;

  password = '';
  confirmPassword = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  canSubmit(): boolean {
    return !this.loading() && this.password.length >= 8 && this.password === this.confirmPassword;
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    this.api.setPassword({ newPassword: this.password }).subscribe({
      next: (auth) => {
        this.store.setSession(auth);
        this.toast.success('¡Listo! Tu contraseña quedó definida.');
        void this.router.navigateByUrl(homeForRole(auth.role));
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.fieldErrors.set(err.fields);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: ApiError): string {
    switch (err.statusCode) {
      case 400:
        return 'Revisá los requisitos de la contraseña e intentá de nuevo.';
      case 409:
        // La cuenta ya tenía contraseña: la sesión ya no está pendiente, seguí a la app.
        return 'Tu cuenta ya tiene una contraseña. Iniciá sesión con ella.';
      case 429:
        return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
      default:
        return err.message;
    }
  }
}
