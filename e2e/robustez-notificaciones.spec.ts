import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-83 · Robustez del front — el panel de la campana no queda colgado si la API falla.
 *
 * `NotificationStore.loadList()` maneja el error del GET /notifications: marca el intento como
 * resuelto y expone `listError`, y la campana muestra "No pudimos cargar…" con un botón Reintentar
 * en lugar del vacío engañoso "Sin notificaciones". Al reintentar con la API sana, el panel carga.
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';

/** Sólo el listado (GET /notifications), sin pisar el unread-count que comparte prefijo. */
const isListEndpoint = (url: string) => /\/api\/v1\/notifications(\?|$)/.test(url);
/** Misma referencia para route()/unroute(): Playwright empareja los matchers por identidad. */
const listMatcher = (url: URL) => isListEndpoint(url.href);

async function signupFamily(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Familia Robustez E2E');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
}

test.use(E2E_CONTEXT);

test('si el GET de notificaciones falla, la campana muestra feedback con reintento (no queda colgada)', async ({
  page,
}) => {
  await signupFamily(page, `familia.robustez+${run}@e2e.com`);

  // Fuerza el fallo del listado al abrir el panel.
  await page.route(listMatcher, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  );

  const bell = page.getByRole('button', { name: /Notificaciones/ });
  await bell.click();

  // No cae en el vacío engañoso "Sin notificaciones": muestra error + Reintentar.
  await expect(page.getByText('No pudimos cargar las notificaciones.')).toBeVisible({ timeout: 15_000 });
  const retry = page.getByRole('button', { name: 'Reintentar' });
  await expect(retry).toBeVisible();

  // Con la API sana, reintentar carga la lista (cuenta nueva → estado vacío legítimo).
  await page.unroute(listMatcher);
  await retry.click();
  await expect(page.getByText('No pudimos cargar las notificaciones.')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('Sin notificaciones')).toBeVisible({ timeout: 15_000 });
});
