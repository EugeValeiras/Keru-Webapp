import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrMenu } from '../../shared/ui/kr-menu';

const ROLE_LABELS: Record<string, string> = {
  patient: 'Paciente',
  family: 'Familiar',
  caregiver: 'Cuidador',
  admin: 'Administrador',
};

/**
 * UC-23 · Menú de cuenta del header (KER-41). El avatar (foto real de la cuenta o inicial+color
 * de fallback) abre un dropdown accesible construido sobre `kr-menu`: nombre + email + rol, un
 * enlace a "Mi perfil" y "Cerrar sesión" (acá vive el logout del shell). Visible en todos los roles.
 */
@Component({
  selector: 'kr-account-menu',
  imports: [KrAvatar, KrMenu, RouterLink],
  template: `
    <kr-menu
      #m="krMenu"
      [triggerLabel]="'Tu cuenta: ' + displayName() + '. Abrir menú de cuenta'"
      menuLabel="Menú de cuenta"
      triggerClass="rounded-full block focus:outline-none focus:ring-2 focus:ring-primary-400 hover:ring-2 hover:ring-primary-200 transition"
      panelClass="absolute right-0 top-full mt-2 w-64 bg-surface rounded-card shadow-card-hover z-20 py-1.5 overflow-hidden"
    >
      <kr-avatar
        ngProjectAs="[menu-trigger]"
        [name]="displayName()"
        [seed]="accountId() || displayName()"
        [photoUrl]="photoUrl()"
        [size]="36"
      />

      <!-- Encabezado del menú: identidad de la cuenta (presentacional, no un ítem). -->
      <div class="px-3.5 py-2.5" role="presentation">
        <p class="font-semibold text-ink-900 truncate">{{ displayName() }}</p>
        <p class="text-sm text-ink-500 truncate">{{ email() }}</p>
        <p class="text-xs text-primary-700 font-medium mt-0.5">{{ roleLabel() }}</p>
      </div>

      <div class="h-px bg-ink-300/40 mx-1 my-1" role="separator"></div>

      <a
        role="menuitem"
        routerLink="/perfil"
        (click)="m.close(false)"
        class="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-ink-700 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none transition-colors"
      >
        <!-- Icono (Lucide "user"). -->
        <svg
          viewBox="0 0 24 24"
          class="w-4 h-4 shrink-0 text-ink-500"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Mi perfil
      </a>

      <button
        type="button"
        role="menuitem"
        (click)="logout.emit(); m.close(false)"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-ink-700 hover:bg-danger-50 hover:text-danger focus:bg-danger-50 focus:text-danger focus:outline-none transition-colors"
      >
        <!-- Icono (Lucide "log-out"). -->
        <svg
          viewBox="0 0 24 24"
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        Cerrar sesión
      </button>
    </kr-menu>
  `,
})
export class KrAccountMenu {
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly role = input<string>('');
  readonly accountId = input<string | null>(null);
  readonly photoUrl = input<string | null>(null);
  readonly logout = output<void>();

  roleLabel(): string {
    return ROLE_LABELS[this.role()] ?? '';
  }
}
