import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../../core/api/api.types';
import { NotificationStore } from '../../core/notifications/notification.store';
import { timeAgo } from '../../shared/utils/dates';

@Component({
  selector: 'kr-notification-bell',
  host: { class: 'relative inline-block', '(keydown.escape)': 'closePanel()' },
  template: `
    <button
      #trigger
      type="button"
      (click)="toggle()"
      class="relative p-2 rounded-full hover:bg-primary-50 transition-colors"
      [attr.aria-label]="
        store.unread() > 0 ? 'Notificaciones, ' + store.unread() + ' sin leer' : 'Notificaciones'
      "
      aria-haspopup="true"
      [attr.aria-expanded]="open()"
    >
      <span class="text-xl" aria-hidden="true">🔔</span>
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
        class="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto bg-surface rounded-card shadow-card z-20"
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
                [class.bg-red-500]="n.type === 'alert'"
                [class.bg-primary-600]="n.type === 'note'"
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
      </div>
    }
  `,
})
export class NotificationBell {
  readonly store = inject(NotificationStore);
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
    void this.router.navigate(['/app/patients', n.patientId, 'dashboard']);
  }
}
