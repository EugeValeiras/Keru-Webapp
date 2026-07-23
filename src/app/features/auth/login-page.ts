import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { AuthShell } from './auth-shell';
import { KrPasswordInput } from '../../shared/ui/kr-password-input';

@Component({
  selector: 'kr-login-page',
  imports: [FormsModule, RouterLink, AuthShell, KrPasswordInput],
  template: `
    <kr-auth-shell>
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit()"
      >
        <div>
          <h1 class="text-[1.375rem]">Qué bueno verte de nuevo</h1>
          <p class="text-sm text-ink-500 mt-1">Entrá para seguir acompañando a los tuyos.</p>
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

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Contraseña</span>
          <kr-password-input
            name="password"
            required
            autocomplete="current-password"
            [(ngModel)]="password"
          />
        </label>

        <a
          routerLink="/password-reset/request"
          class="text-sm text-primary-600 font-medium hover:underline self-end"
        >
          Olvidé mi contraseña
        </a>

        <button
          type="submit"
          [disabled]="loading()"
          class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Ingresando…' : 'Ingresar' }}
        </button>

        <p class="text-sm text-ink-500 text-center">
          ¿No tenés cuenta?
          <a routerLink="/signup" class="text-primary-600 font-medium hover:underline">
            Registrate
          </a>
        </p>
      </form>
    </kr-auth-shell>
  `,
})
export class LoginPage {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // Deep link de invitación: precargar el email invitado si viene por query.
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.email = email;
    }
  }

  submit(): void {
    if (this.loading() || !this.email || !this.password) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.login({ email: this.email, password: this.password }).subscribe({
      next: (auth) => {
        this.store.setSession(auth);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl ?? homeForRole(auth.role));
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(loginErrorMessage(err));
      },
    });
  }
}

/** Errores en tono de marca: el hecho + el siguiente paso, sin culpar. */
function loginErrorMessage(err: ApiError): string {
  switch (err.statusCode) {
    case 401:
      return 'No encontramos esa combinación de email y contraseña. Revisala y probá de nuevo.';
    case 429:
      return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
    default:
      return err.message;
  }
}
