import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiError, InvitationPreview } from '../../core/api/api.types';
import { MembershipApi } from '../../core/api/membership-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { AuthShell } from './auth-shell';

type LandingState = 'loading' | 'invalid' | 'expired' | 'ready' | 'confirmed';

/**
 * Landing pública del deep link /invite/:token. Sin shell: cualquiera con el
 * link ve el preview; confirmar requiere sesión con el email invitado.
 */
@Component({
  selector: 'kr-invite-landing-page',
  imports: [AuthShell],
  template: `
    <kr-auth-shell
      tagline="Alguien te guardó un lugar en su círculo de cuidado."
      subline="Cuidado de confianza para los tuyos."
    >
      <div class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4 text-center">
        @switch (state()) {
          @case ('loading') {
            <div class="kr-shimmer rounded-pill w-14 h-14 mx-auto" aria-hidden="true"></div>
            <p class="text-ink-500 text-sm">Verificando invitación…</p>
          }
          @case ('invalid') {
            <span
              aria-hidden="true"
              class="w-14 h-14 rounded-pill bg-sand-100 text-ink-500 flex items-center justify-center mx-auto"
            >
              <svg
                viewBox="0 0 24 24"
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <h1 class="text-lg font-sans font-semibold">Invitación inválida</h1>
            <p class="text-sm text-ink-500">
              Este link no corresponde a ninguna invitación. Revisá que esté completo o pedí uno
              nuevo a quien te invitó.
            </p>
            <a href="/login" class="text-primary-600 font-medium hover:underline text-sm">
              Ir a iniciar sesión
            </a>
          }
          @case ('expired') {
            <span
              aria-hidden="true"
              class="w-14 h-14 rounded-pill bg-sand-100 text-ink-500 flex items-center justify-center mx-auto"
            >
              <svg
                viewBox="0 0 24 24"
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <h1 class="text-lg font-sans font-semibold">
              Esta invitación ya fue usada o expiró
            </h1>
            <p class="text-sm text-ink-500">
              Las invitaciones vencen a los 30 minutos y sirven una sola vez. Pedile a quien te
              invitó que genere una nueva.
            </p>
            <a href="/login" class="text-primary-600 font-medium hover:underline text-sm">
              Ir a iniciar sesión
            </a>
          }
          @case ('confirmed') {
            <span
              aria-hidden="true"
              class="kr-pop w-14 h-14 rounded-pill bg-accent-50 text-accent-500 flex items-center justify-center mx-auto"
            >
              <svg
                viewBox="0 0 24 24"
                class="w-6 h-6"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z"
                />
              </svg>
            </span>
            <h1 class="text-[1.375rem]">¡Bienvenido/a al círculo!</h1>
            <p class="text-sm text-ink-500">
              Ya formás parte del círculo de cuidado de {{ preview()?.patientName }}. Te llevamos
              a tus pacientes…
            </p>
          }
          @case ('ready') {
            @if (preview(); as p) {
              <!-- El abrazo del logo: los arcos sostienen, el punto es la persona. -->
              <span
                aria-hidden="true"
                class="w-14 h-14 rounded-pill bg-primary-50 flex items-center justify-center mx-auto"
              >
                <svg viewBox="0 0 40 26" class="w-8">
                  <g fill="none" stroke="#7443b0" stroke-linecap="round" stroke-width="3">
                    <path d="M7 24a13 13 0 0 1 26 0" opacity="0.35" />
                    <path d="M12 24a8 8 0 0 1 16 0" />
                  </g>
                  <circle cx="20" cy="6" r="3.5" fill="#d96a3d" />
                </svg>
              </span>
              <h1 class="text-[1.375rem]">
                Te invitaron a acompañar a {{ p.patientName }} en Keru
              </h1>
              <p class="text-sm text-ink-500">
                Invitación para <span class="font-medium text-ink-700">{{ p.invitedEmail }}</span>
              </p>
              <p class="text-sm text-ink-700">
                Vence en
                <span class="font-semibold tabular-nums text-primary-700">{{ countdown() }}</span>
              </p>

              @if (error(); as err) {
                <p
                  role="alert"
                  class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 text-left"
                >
                  {{ err }}
                </p>
              }

              @if (!auth.isAuthenticated()) {
                <div class="flex flex-col gap-2 mt-2">
                  <button
                    type="button"
                    (click)="goToLogin()"
                    class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
                  >
                    Iniciar sesión
                  </button>
                  <button
                    type="button"
                    (click)="goToSignup()"
                    class="rounded-pill border border-primary-600 text-primary-600 font-semibold py-2.5 px-6 hover:bg-primary-50 transition-colors"
                  >
                    Crear cuenta
                  </button>
                  <p class="text-xs text-ink-500 mt-1">Ingresá con {{ p.invitedEmail }}</p>
                </div>
              } @else if (emailMatches()) {
                <button
                  type="button"
                  (click)="accept()"
                  [disabled]="confirming()"
                  class="mt-2 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {{ confirming() ? 'Aceptando…' : 'Aceptar invitación' }}
                </button>
              } @else {
                <p class="text-sm text-warning bg-warning-50 rounded-control px-3 py-2 text-left">
                  Esta invitación es para {{ p.invitedEmail }} y estás conectado como
                  {{ auth.email() }}.
                </p>
                <button
                  type="button"
                  (click)="switchAccount()"
                  class="rounded-pill border border-primary-600 text-primary-600 font-semibold py-2.5 px-6 hover:bg-primary-50 transition-colors"
                >
                  Cambiar de cuenta
                </button>
              }
            }
          }
        }
      </div>
    </kr-auth-shell>
  `,
})
export class InviteLandingPage {
  private readonly api = inject(MembershipApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly patientStore = inject(ActivePatientStore);
  protected readonly auth = inject(AuthStore);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly state = signal<LandingState>('loading');
  readonly preview = signal<InvitationPreview | null>(null);
  readonly error = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly remaining = signal(0);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly countdown = computed(() => {
    const total = Math.max(0, this.remaining());
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });

  /** true cuando el backend devolvió 403 pese al match local (sesión desactualizada). */
  private readonly serverMismatch = signal(false);

  readonly emailMatches = computed(() => {
    const invited = this.preview()?.invitedEmail ?? '';
    return !this.serverMismatch() && invited.toLowerCase() === this.auth.email().toLowerCase();
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCountdown());
    this.api.getInvitationPreview(this.token).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        if (!preview.valid) {
          this.state.set('expired');
          return;
        }
        this.state.set('ready');
        this.startCountdown(preview.expiresAt);
      },
      error: () => {
        // 404 = token inexistente; otros errores caen en la misma card amable.
        this.state.set('invalid');
      },
    });
  }

  private inviteQueryParams(): { returnUrl: string; email: string } {
    return {
      returnUrl: `/invite/${this.token}`,
      email: this.preview()?.invitedEmail ?? '',
    };
  }

  goToLogin(): void {
    void this.router.navigate(['/login'], { queryParams: this.inviteQueryParams() });
  }

  goToSignup(): void {
    void this.router.navigate(['/signup'], { queryParams: this.inviteQueryParams() });
  }

  switchAccount(): void {
    this.auth.clear();
    this.goToLogin();
  }

  accept(): void {
    if (this.confirming()) {
      return;
    }
    this.confirming.set(true);
    this.error.set(null);
    this.api.confirmInvitation(this.token).subscribe({
      next: () => {
        this.stopCountdown();
        this.state.set('confirmed');
        this.patientStore.load();
        setTimeout(() => void this.router.navigateByUrl('/app/patients'), 1800);
      },
      error: (err: ApiError) => {
        this.confirming.set(false);
        if (err.statusCode === 400) {
          this.stopCountdown();
          this.state.set('expired');
        } else if (err.statusCode === 403) {
          // El backend detectó otra cuenta: pasar al aviso de cuenta equivocada
          // con el botón "Cambiar de cuenta".
          this.serverMismatch.set(true);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }

  private startCountdown(expiresAt: string): void {
    this.stopCountdown();
    const tick = () => {
      const secs = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      this.remaining.set(secs);
      if (secs <= 0) {
        this.stopCountdown();
        this.state.set('expired');
      }
    };
    tick();
    this.intervalId = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
