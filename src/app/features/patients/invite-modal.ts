import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, CreateInvitationDto, Invitation } from '../../core/api/api.types';
import { MembershipApi } from '../../core/api/membership-api.service';
import { KrModal } from '../../shared/ui/kr-modal';

type InviteRole = CreateInvitationDto['role'];

const ROLE_HINTS: Record<InviteRole, string> = {
  viewer: 'Puede ver el estado y la historia clínica del paciente.',
  manager: 'Además de ver, puede registrar datos y gestionar el cuidado.',
};

/**
 * UC invitación al círculo: genera un deep link de un solo uso que vence en
 * 30 min. El backend envía el email al invitado (mejor esfuerzo), por eso
 * copiar/compartir el link a mano sigue siendo la acción primaria.
 */
@Component({
  selector: 'kr-invite-modal',
  imports: [FormsModule, KrModal],
  template: `
    <kr-modal [title]="'Invitar al círculo de ' + patientName()" (closed)="closed.emit()">
      @if (invitation(); as inv) {
        @if (remaining() <= 0) {
          <div class="flex flex-col items-center gap-4 py-4 text-center">
            <p class="text-3xl">⏳</p>
            <p class="font-semibold text-ink-900">Expirada</p>
            <p class="text-sm text-ink-500">
              El link venció sin usarse. Podés generar una invitación nueva.
            </p>
            <button
              type="button"
              (click)="reset()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
            >
              Generar una nueva
            </button>
          </div>
        } @else {
          <div class="flex flex-col gap-4">
            <p class="text-sm text-ink-700">
              Invitación para <span class="font-medium">{{ inv.invitedEmail }}</span>
            </p>

            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                [value]="localLink()"
                class="flex-1 min-w-0 rounded-lg border border-ink-300 bg-canvas px-3 py-2 text-sm text-ink-700"
              />
              <button
                type="button"
                (click)="copy()"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-4 text-sm hover:bg-primary-700 transition-colors whitespace-nowrap"
              >
                {{ copied() ? '¡Copiado!' : 'Copiar' }}
              </button>
            </div>

            <p class="text-sm text-ink-700">
              Vence en
              <span class="font-semibold tabular-nums text-primary-700">{{ countdown() }}</span>
            </p>

            <p class="text-sm text-ink-700 bg-primary-50 rounded-lg px-3 py-2">
              Le enviamos el link por email a {{ inv.invitedEmail }}. Igual podés copiarlo y
              compartirlo por WhatsApp o el canal que quieras. Vence en 30 minutos y sirve una sola
              vez.
            </p>
          </div>
        }
      } @else {
        <form class="flex flex-col gap-4" (ngSubmit)="generate()">
          @if (error(); as err) {
            <p role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
          }

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Email de la persona invitada</span>
            <input
              type="email"
              name="invitedEmail"
              required
              [(ngModel)]="invitedEmail"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">¿Qué va a poder hacer?</span>
            <select
              name="role"
              [(ngModel)]="role"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-surface"
            >
              <option value="viewer">Solo ver</option>
              <option value="manager">Gestionar</option>
            </select>
            <span class="text-xs text-ink-500">{{ roleHint() }}</span>
          </label>

          <button
            type="submit"
            [disabled]="loading() || !invitedEmail"
            class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {{ loading() ? 'Generando…' : 'Generar invitación' }}
          </button>
        </form>
      }
    </kr-modal>
  `,
})
export class InviteModal {
  private readonly api = inject(MembershipApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly patientId = input.required<string>();
  readonly patientName = input.required<string>();
  readonly closed = output<void>();

  invitedEmail = '';
  role: InviteRole = 'viewer';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly invitation = signal<Invitation | null>(null);
  readonly copied = signal(false);
  readonly remaining = signal(0);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly localLink = computed(() => {
    const inv = this.invitation();
    // El campo `link` del backend apunta a keru.app: en dev usamos el origin local.
    return inv ? `${location.origin}/invite/${inv.token}` : '';
  });

  readonly countdown = computed(() => {
    const total = Math.max(0, this.remaining());
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  roleHint(): string {
    return ROLE_HINTS[this.role];
  }

  /** NO reintenta ante error: cada POST crea un token nuevo (no es idempotente). */
  generate(): void {
    if (this.loading() || !this.invitedEmail) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api
      .createInvitation(this.patientId(), { invitedEmail: this.invitedEmail, role: this.role })
      .subscribe({
        next: (inv) => {
          this.loading.set(false);
          this.invitation.set(inv);
          this.startCountdown(inv.expiresAt);
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          this.error.set(err.message);
        },
      });
  }

  copy(): void {
    void navigator.clipboard.writeText(this.localLink()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  reset(): void {
    this.stopCountdown();
    this.invitation.set(null);
    this.copied.set(false);
    this.error.set(null);
  }

  private startCountdown(expiresAt: string): void {
    this.stopCountdown();
    const tick = () => {
      const secs = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      this.remaining.set(secs);
      if (secs <= 0) {
        this.stopCountdown();
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
