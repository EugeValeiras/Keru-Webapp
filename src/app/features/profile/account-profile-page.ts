import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipApi } from '../../core/api/membership-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { ApiError, AccountProfile, UpdateAccountDto } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrPhotoInput } from '../../shared/ui/kr-photo-input';
import { ToastService } from '../../shared/ui/toast.service';

const ROLE_LABELS: Record<string, string> = {
  patient: 'Paciente',
  family: 'Familiar',
  caregiver: 'Cuidador',
  admin: 'Administrador',
};

/**
 * UC-23 · "Mi perfil": la cuenta ve sus datos (nombre, email, rol, foto) y edita nombre y foto
 * con previsualización inmediata. Al guardar, actualiza la sesión (AuthStore) para que el avatar
 * del encabezado cambie al instante sin recargar (toast de éxito + estados de carga). El email es
 * la identidad de login (UC-04) y no se edita por esta vía.
 */
@Component({
  selector: 'kr-account-profile-page',
  imports: [FormsModule, KrAvatar, KrPhotoInput],
  template: `
    <div class="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1>Mi perfil</h1>
        <p class="text-ink-500 mt-1">Tus datos de cuenta. El nombre y la foto se ven en el encabezado.</p>
      </div>

      @if (loading()) {
        <p class="text-ink-500">Cargando tu perfil…</p>
      } @else {
        <form class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-5" (ngSubmit)="save()">
          @if (error(); as err) {
            <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
              <p>{{ err }}</p>
              @if (fieldErrors().length > 0) {
                <ul class="list-disc list-inside mt-1">
                  @for (f of fieldErrors(); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              }
            </div>
          }

          <!-- Previsualización: refleja nombre/foto en vivo, igual que se verá en el header. -->
          <div class="flex items-center gap-4">
            <kr-avatar [name]="displayName() || '—'" [seed]="accountId()" [photoUrl]="photoUrl()" [size]="72" />
            <div class="min-w-0">
              <p class="font-semibold text-ink-900 truncate">{{ displayName() || 'Sin nombre' }}</p>
              <p class="text-sm text-ink-500 truncate">{{ email() }}</p>
              <p class="text-xs text-primary-700 font-medium mt-0.5">{{ roleLabel() }}</p>
            </div>
          </div>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Nombre y apellido</span>
            <input
              type="text"
              name="displayName"
              [ngModel]="displayName()"
              (ngModelChange)="displayName.set($event)"
              maxlength="200"
              autocomplete="name"
              class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Email</span>
            <input
              type="email"
              [value]="email()"
              readonly
              aria-describedby="email-hint"
              class="rounded-control border border-ink-300 bg-primary-50/40 text-ink-500 px-3 py-2 focus:outline-none"
            />
            <span id="email-hint" class="text-xs text-ink-500">
              El email es tu identidad de inicio de sesión: no se edita desde acá.
            </span>
          </label>

          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Foto de perfil</span>
            <kr-photo-input [(url)]="photoUrl" />
          </div>

          <div class="flex justify-end mt-2">
            <button
              type="submit"
              [disabled]="!formValid() || saving()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class AccountProfilePage {
  private readonly api = inject(MembershipApi);
  private readonly store = inject(AuthStore);
  private readonly toasts = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);

  // Estado del formulario.
  readonly displayName = signal('');
  readonly photoUrl = signal<string | null>(null);
  // Datos de solo lectura.
  readonly email = signal('');
  readonly accountId = signal('');
  private readonly role = signal('');

  readonly formValid = computed(() => this.displayName().trim().length > 0);

  constructor() {
    this.api.getMyAccount().subscribe({
      next: (account) => {
        this.prefill(account);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  private prefill(account: AccountProfile): void {
    this.displayName.set(account.displayName);
    this.photoUrl.set(account.photoUrl ?? null);
    this.email.set(account.email);
    this.accountId.set(account.id);
    this.role.set(account.role);
  }

  roleLabel(): string {
    return ROLE_LABELS[this.role()] ?? '';
  }

  save(): void {
    if (!this.formValid() || this.saving()) {
      return;
    }
    const dto: UpdateAccountDto = {
      displayName: this.displayName().trim(),
      photoUrl: this.photoUrl(),
    };

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    this.api.updateMyAccount(dto).subscribe({
      next: (account) => {
        this.saving.set(false);
        this.prefill(account);
        // El header reacciona al instante: la sesión expone name/photo como signals (UC-23).
        this.store.updateProfile({ displayName: account.displayName, photoUrl: account.photoUrl ?? null });
        this.toasts.success('Perfil actualizado');
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
        this.fieldErrors.set(err.fields);
      },
    });
  }
}
