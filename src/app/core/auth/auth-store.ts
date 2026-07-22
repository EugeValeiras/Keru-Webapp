import { Injectable, computed, signal } from '@angular/core';
import { AuthResponse } from '../api/api.types';

const STORAGE_KEY = 'keru.session';

type Session = AuthResponse;

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Sesión JWT stateless: la API no tiene refresh ni logout server-side.
 * Ante cualquier 401 el errorInterceptor llama a clear() y redirige a login.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly session = signal<Session | null>(readStoredSession());

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly role = computed(() => this.session()?.role ?? null);
  readonly displayName = computed(() => this.session()?.displayName ?? '');
  readonly accountId = computed(() => this.session()?.accountId ?? null);
  readonly email = computed(() => this.session()?.email ?? '');

  setSession(auth: AuthResponse): void {
    this.session.set(auth);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }

  clear(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
