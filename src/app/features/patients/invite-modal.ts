import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, CreateInvitationDto, EmittedInvitation, Invitation } from '../../core/api/api.types';
import { MembershipApi } from '../../core/api/membership-api.service';
import { KrModal } from '../../shared/ui/kr-modal';

type InviteRole = CreateInvitationDto['role'];

const ROLE_HINTS: Record<InviteRole, string> = {
  viewer: 'Puede ver el estado y la historia clínica del paciente.',
  manager: 'Además de ver, puede registrar datos y gestionar el cuidado.',
};

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Solo ver',
  manager: 'Gestionar',
  'consent-holder': 'Titular',
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

      <!-- UC-03 A4/A5 · Invitaciones vigentes: countdown por invitación y revocar con confirmación -->
      <section class="mt-6 border-t border-ink-300/60 pt-4">
        <h3 class="text-sm font-semibold text-ink-900 mb-2">Invitaciones vigentes</h3>
        @if (listError()) {
          <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
            No se pudieron cargar las invitaciones. Probá cerrar y volver a abrir.
          </p>
        } @else if (!listLoaded()) {
          <p class="text-sm text-ink-500">Cargando invitaciones…</p>
        } @else if (active().length === 0) {
          <p class="text-sm text-ink-500">No hay invitaciones pendientes.</p>
        } @else {
          <ul class="flex flex-col divide-y divide-ink-300/60">
            @for (inv of active(); track inv.token) {
              <li class="py-3 flex flex-col gap-2">
                <div class="flex items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-ink-900 truncate">{{ inv.invitedEmail }}</p>
                    <p class="text-xs text-ink-500">
                      {{ roleLabel(inv.roleToGrant) }} · vence en
                      <span class="font-semibold tabular-nums text-primary-700">{{ remainingFor(inv) }}</span>
                    </p>
                  </div>
                  @if (revokeCandidate() !== inv.token) {
                    <button
                      type="button"
                      (click)="askRevoke(inv.token)"
                      [disabled]="revoking() !== null"
                      class="rounded-pill border border-danger text-danger text-sm font-semibold py-1 px-3 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Revocar
                    </button>
                  }
                </div>
                @if (revokeCandidate() === inv.token) {
                  <div class="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
                    <p class="text-sm text-ink-700 flex-1">¿Revocar? El link deja de servir.</p>
                    <button
                      type="button"
                      (click)="confirmRevoke(inv.token)"
                      [disabled]="revoking() !== null"
                      class="rounded-pill bg-danger text-white text-sm font-semibold py-1 px-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {{ revoking() === inv.token ? 'Revocando…' : 'Sí, revocar' }}
                    </button>
                    <button
                      type="button"
                      (click)="revokeCandidate.set(null)"
                      [disabled]="revoking() !== null"
                      class="rounded-pill border border-ink-300 text-ink-700 text-sm font-medium py-1 px-3 hover:bg-primary-50 disabled:opacity-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
        }
        @if (revokeError(); as err) {
          <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mt-2">{{ err }}</p>
        }
      </section>
    </kr-modal>
  `,
})
export class InviteModal implements OnInit {
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

  // UC-03 A4/A5 · Gestión de las invitaciones emitidas del paciente.
  readonly invitations = signal<EmittedInvitation[]>([]);
  readonly listLoaded = signal(false);
  readonly listError = signal(false);
  readonly revokeCandidate = signal<string | null>(null);
  readonly revoking = signal<string | null>(null);
  readonly revokeError = signal<string | null>(null);
  private readonly now = signal(Date.now());

  /** Vigentes = pendientes y no vencidas (el tick va sacando las que expiran). */
  readonly active = computed(() =>
    this.invitations().filter(
      (inv) => inv.status === 'pending' && new Date(inv.expiresAt).getTime() > this.now(),
    ),
  );

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickId: ReturnType<typeof setInterval> | null = null;

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
    this.tickId = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      this.stopCountdown();
      if (this.tickId !== null) {
        clearInterval(this.tickId);
      }
    });
  }

  ngOnInit(): void {
    this.loadInvitations();
  }

  roleHint(): string {
    return ROLE_HINTS[this.role];
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  /** mm:ss restantes de una invitación listada (comparte el tick de 1 s). */
  remainingFor(inv: EmittedInvitation): string {
    const secs = Math.max(0, Math.floor((new Date(inv.expiresAt).getTime() - this.now()) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  private loadInvitations(): void {
    this.api.listInvitations(this.patientId()).subscribe({
      next: (list) => {
        this.listLoaded.set(true);
        this.listError.set(false);
        this.invitations.set(list);
      },
      error: () => {
        this.listLoaded.set(true);
        this.listError.set(true);
      },
    });
  }

  askRevoke(token: string): void {
    this.revokeError.set(null);
    this.revokeCandidate.set(token);
  }

  confirmRevoke(token: string): void {
    if (this.revoking() !== null) {
      return;
    }
    this.revoking.set(token);
    this.revokeError.set(null);
    this.api.revokeInvitation(token).subscribe({
      next: () => {
        this.revoking.set(null);
        this.revokeCandidate.set(null);
        // Si revocó la que acaba de generar, sacar el link de la vista superior.
        if (this.invitation()?.token === token) {
          this.reset();
        }
        this.loadInvitations();
      },
      error: (err: ApiError) => {
        this.revoking.set(null);
        this.revokeError.set(err.message);
      },
    });
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
          this.loadInvitations();
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
