import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, SignupDto, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { AuthShell } from './auth-shell';

type SignupRole = SignupDto['role'];

@Component({
  selector: 'kr-signup-page',
  imports: [FormsModule, RouterLink, AuthShell],
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
          <p class="text-sm text-ink-500 mt-1">Unos datos y arrancamos.</p>
        </div>

        @if (error(); as err) {
          <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            {{ err }}
          </p>
        }
        @for (fieldError of fieldErrors(); track fieldError) {
          <p class="text-xs text-danger">{{ fieldError }}</p>
        }

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
                <span class="text-sm text-ink-500 block">{{ option.hint }}</span>
              </button>
            }
          </div>
        </fieldset>

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
          <input
            type="password"
            name="password"
            required
            minlength="8"
            autocomplete="new-password"
            [(ngModel)]="password"
            class="rounded-control border border-ink-300 bg-surface px-3 py-2 hover:border-ink-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <span class="text-xs text-ink-500">Mínimo 8 caracteres</span>
        </label>

        <button
          type="submit"
          [disabled]="loading()"
          class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>

        <p class="text-sm text-ink-500 text-center">
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

  readonly roleOptions: { value: SignupRole; label: string; hint: string }[] = [
    {
      value: 'family',
      label: 'Familiar',
      hint: 'Busco y contrato cuidadores para un ser querido',
    },
    { value: 'patient', label: 'Paciente', hint: 'Busco un cuidador para mí' },
    { value: 'caregiver', label: 'Cuidador/a', hint: 'Ofrezco mis servicios de cuidado' },
  ];

  readonly role = signal<SignupRole>('family');
  displayName = '';
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  constructor() {
    // Deep link de invitación: precargar el email invitado si viene por query.
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.email = email;
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
