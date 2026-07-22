import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role, homeForRole } from '../api/api.types';
import { AuthStore } from './auth-store';

export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (store.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Restringe un árbol de rutas a ciertos roles; rol equivocado → home de su rol. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const store = inject(AuthStore);
    const router = inject(Router);
    const role = store.role();
    if (role && roles.includes(role)) {
      return true;
    }
    return router.createUrlTree([role ? homeForRole(role) : '/login']);
  };
}
