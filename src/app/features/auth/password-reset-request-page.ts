import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError } from '../../core/api/api.types';
import { AuthShell } from './auth-shell';

/**
 * UC-04 A4 (KER-46) · Pedir la recuperación de contraseña. Al enviar, mostramos SIEMPRE el mismo
 * estado de éxito neutro — no revelamos si el email existe (anti-enumeración): tanto una cuenta
 * registrada como una inexistente ven "si existe una cuenta, te llegó un mail".
 */
@Component({
  selector: 'kr-password-reset-request-page',
  imports: [FormsModule, RouterLink, AuthShell],
  template: `
    <kr-auth-shell
      tagline="Recuperá el acceso a tu cuenta."
      subline="Te mandamos un enlace para crear una contraseña nueva."
    >
      @if (sent()) {
        <div class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4">
          <div>
            <h1 class="text-[1.375rem]">Revisá tu correo</h1>
            <p class="text-sm text-ink-500 mt-1">
              Si existe una cuenta con ese email, te enviamos un enlace para recuperar tu contraseña.
              Vence a los 30 minutos y sirve una sola vez.
            </p>
          </div>
          <a
            routerLink="/login"
            class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 text-center hover:bg-primary-700 transition-colors"
          >
            Volver al inicio de sesión
          </a>
        </div>
      } @else {
        <form
          class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
          (ngSubmit)="submit()"
        >
          <div>
            <h1 class="text-[1.375rem]">¿Olvidaste tu contraseña?</h1>
            <p class="text-sm text-ink-500 mt-1">
              Ingresá el email de tu cuenta y te enviaremos un enlace para recuperarla.
            </p>
          </div>

          @if (error(); as err) {
            <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
              {{ err }}
            </p>
          }

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Email</span>
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              [(ngModel)]="email"
              class="rounded-control border border-ink-300 bg-surface px-3 py-2 hover:border-ink-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>

          <button
            type="submit"
            [disabled]="loading()"
            class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {{ loading() ? 'Enviando…' : 'Enviar enlace de recuperación' }}
          </button>

          <p class="text-sm text-ink-500 text-center">
            ¿Ya te acordaste?
            <a routerLink="/login" class="text-primary-600 font-medium hover:underline">
              Volvé a iniciar sesión
            </a>
          </p>
        </form>
      }
    </kr-auth-shell>
  `,
})
export class PasswordResetRequestPage {
  private readonly api = inject(AuthApi);

  email = '';
  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.loading() || !this.email) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.requestPasswordReset(this.email).subscribe({
      // Anti-enumeración: la respuesta es idéntica exista o no el email → estado neutro.
      next: () => this.sent.set(true),
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: ApiError): string {
    if (err.statusCode === 429) {
      return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
    }
    return err.message;
  }
}
