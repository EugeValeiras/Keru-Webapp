import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../../core/api/api.types';
import { NotificationStore } from '../../core/notifications/notification.store';
import { PushStore } from '../../core/notifications/push.store';
import { timeAgo } from '../../shared/utils/dates';

@Component({
  selector: 'kr-notification-bell',
  host: { class: 'relative inline-block', '(keydown.escape)': 'closePanel()' },
  template: `
    <button
      #trigger
      type="button"
      (click)="toggle()"
      class="relative p-2 rounded-full text-ink-700 hover:bg-primary-50 active:bg-primary-100 transition-colors"
      [attr.aria-label]="
        store.unread() > 0 ? 'Notificaciones, ' + store.unread() + ' sin leer' : 'Notificaciones'
      "
      aria-haspopup="true"
      [attr.aria-expanded]="open()"
    >
      <!-- Campana del set de iconos (Lucide "bell"): lineal, trazo 1.75, currentColor. -->
      <svg
        viewBox="0 0 24 24"
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path
          d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.74 7.326"
        />
      </svg>
      @if (store.unread() > 0) {
        <span
          class="absolute -top-0.5 -right-0.5 rounded-pill bg-primary-600 text-white text-xs font-semibold px-1.5 py-0.5 leading-none"
          aria-hidden="true"
        >
          {{ store.unread() }}
        </span>
      }
    </button>

    @if (open()) {
      <!-- Overlay transparente para cerrar al click afuera -->
      <div class="fixed inset-0 z-10" (click)="open.set(false)" aria-hidden="true"></div>

      <div
        class="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto bg-surface rounded-card shadow-card-hover z-20"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-ink-300">
          <h3 class="font-semibold">Notificaciones</h3>
          <label class="flex items-center gap-1.5 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              [checked]="onlyUnread()"
              (change)="toggleOnlyUnread()"
              class="accent-primary-600"
            />
            Solo no leídas
          </label>
        </div>

        @if (visible().length === 0) {
          <p class="text-ink-500 text-sm text-center py-8">Sin notificaciones</p>
        } @else {
          @for (n of visible(); track n.id) {
            <button
              type="button"
              (click)="openItem(n)"
              class="w-full text-left px-4 py-3 flex gap-3 hover:bg-primary-50 transition-colors border-b border-ink-300 last:border-b-0"
              [class.bg-primary-50]="!n.read"
            >
              <span
                class="mt-1.5 w-2 h-2 rounded-full shrink-0"
                [class.bg-danger-600]="n.type === 'alert'"
                [class.bg-primary-600]="n.type === 'note'"
                [class.bg-warning-600]="n.type === 'quarantine'"
              ></span>
              <span class="min-w-0">
                <span class="block font-semibold text-sm">{{ n.title }}</span>
                <span class="block text-sm text-ink-500">{{ n.body }}</span>
                <span class="block text-xs text-ink-500 mt-1">{{ timeAgo(n.createdAt) }}</span>
              </span>
            </button>
          }
        }

        @if (filtered().length > showCount()) {
          <div class="px-4 py-3 text-center border-t border-ink-300">
            <button
              type="button"
              (click)="showMore()"
              class="text-primary-600 text-sm font-medium hover:underline"
            >
              Mostrar más ({{ filtered().length - showCount() }} restantes)
            </button>
          </div>
        }

        @if (store.unread() > 0) {
          <div class="px-4 py-3 border-t border-ink-300">
            <button
              type="button"
              (click)="store.markAllRead()"
              class="text-primary-600 text-sm font-medium hover:underline"
            >
              Marcar todas como leídas
            </button>
          </div>
        }

        <!-- UC-18 · Ajuste del push de ESTE navegador (A1: activable más tarde; revocable). -->
        @if (push.supported && push.serverEnabled()) {
          <div class="px-4 py-3 border-t border-ink-300 flex items-center justify-between gap-3">
            <span class="text-sm text-ink-700">Push en este navegador</span>
            @if (push.subscribed()) {
              <button
                type="button"
                (click)="push.disable()"
                [disabled]="push.busy()"
                class="text-sm font-medium text-danger hover:underline disabled:opacity-50"
              >
                Desactivar push
              </button>
            } @else if (push.permission() === 'denied') {
              <span class="text-xs text-ink-500">Bloqueado por el navegador</span>
            } @else {
              <button
                type="button"
                (click)="push.enable()"
                [disabled]="push.busy()"
                class="text-sm font-medium text-primary-600 hover:underline disabled:opacity-50"
              >
                Activar push
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class NotificationBell {
  readonly store = inject(NotificationStore);
  readonly push = inject(PushStore);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly onlyUnread = signal(false);
  readonly timeAgo = timeAgo;

  readonly filtered = computed(() =>
    this.onlyUnread() ? this.store.items().filter((n) => !n.read) : this.store.items(),
  );

  /* La API no pagina las notificaciones: render incremental de a 50 para que
     una campana con cientos de entradas no cuelgue el DOM. Abrir el panel o
     cambiar el filtro resetea. */
  private static readonly PAGE = 50;
  readonly showCount = signal(NotificationBell.PAGE);
  readonly visible = computed(() => this.filtered().slice(0, this.showCount()));

  constructor() {
    this.store.startPolling();
  }

  showMore(): void {
    this.showCount.update((n) => n + NotificationBell.PAGE);
  }

  toggleOnlyUnread(): void {
    this.onlyUnread.update((v) => !v);
    this.showCount.set(NotificationBell.PAGE);
  }

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) {
      this.showCount.set(NotificationBell.PAGE);
      this.store.loadList();
    }
  }

  /** Escape: cierra el panel y devuelve el foco a la campana. */
  closePanel(): void {
    if (this.open()) {
      this.open.set(false);
      this.trigger().nativeElement.focus();
    }
  }

  openItem(n: AppNotification): void {
    this.store.markRead(n.id);
    this.open.set(false);
    // Una notificación de cuarentena lleva directo a resolverla (UC-12 A3).
    const page = n.type === 'quarantine' ? 'quarantine' : 'dashboard';
    void this.router.navigate(['/app/patients', n.patientId, page]);
  }
}
