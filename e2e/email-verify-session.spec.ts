import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-63 · UC-04 A5.2b: la pantalla de verificación ramifica según la SESIÓN del browser. El token
 * viaja por email y no es legible desde el browser (por eso el camino criptográfico vive en la suite
 * jest e2e de la API); acá stubbeamos `peek`/`confirm` con page.route para ejercer las tres ramas de
 * sesión + el 410 de forma determinista, que es lo que agrega este ticket sobre KER-49.
 *
 * Ramas: sin sesión → confirm + auto-login (entra al home); misma cuenta → confirm sin credenciales;
 * otra cuenta → NO confirm, cierra sesión y va a login con el email destino prefilleado + aviso;
 * token inválido/expirado/usado → 410 con salida a login.
 */

const TARGET_EMAIL = 'destino@e2e.keru.test';
const TOKEN = 'tok-e2e-session-000';

type Session = {
  accessToken: string;
  accountId: string;
  email: string;
  role: 'family' | 'caregiver' | 'admin';
  displayName: string;
  photoUrl: string | null;
  emailVerified: boolean;
};

function session(over: Partial<Session> = {}): Session {
  return {
    accessToken: 'fake.jwt.token',
    accountId: 'acc-session',
    email: 'sesion-actual@e2e.keru.test',
    role: 'family',
    displayName: 'Sesión Actual',
    photoUrl: null,
    emailVerified: true,
    ...over,
  };
}

/** Deja (o limpia) la sesión en localStorage antes de que arranque la app. */
async function primeSession(page: Page, value: Session | null): Promise<void> {
  await page.addInitScript((raw) => {
    if (raw) localStorage.setItem('keru.session', raw);
    else localStorage.removeItem('keru.session');
  }, value ? JSON.stringify(value) : null);
}

interface StubOptions {
  peekStatus?: number;
  peekEmail?: string;
  onConfirm?: () => void;
}

/** Intercepta la API: peek/confirm deterministas; el resto responde benigno para no bouncear por 401. */
async function stubApi(page: Page, opts: StubOptions = {}): Promise<void> {
  const { peekStatus = 200, peekEmail = TARGET_EMAIL, onConfirm } = opts;
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/email-verification/peek')) {
      if (peekStatus === 200) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ email: peekEmail }),
        });
      }
      return route.fulfill({
        status: peekStatus,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: peekStatus, message: 'El enlace es inválido o expiró' }),
      });
    }
    if (url.includes('/auth/email-verification/confirm')) {
      onConfirm?.();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(session({ email: peekEmail, displayName: 'Verificado', emailVerified: true })),
      });
    }
    // Cualquier otra llamada del home autenticado: respuesta benigna (token “válido”, sin 401 → sin bounce).
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    severe.map(
      (v) => `[${screen}] ${v.id} (${v.impact}): ${v.help} → ` + v.nodes.map((n) => n.target.join(' ')).join(' | '),
    ),
  ).toEqual([]);
}

test('sin sesión: el link verifica por token y auto-loguea (entra al home)', async ({ page }) => {
  await primeSession(page, null);
  let confirmCalled = false;
  await stubApi(page, { onConfirm: () => (confirmCalled = true) });

  await page.goto(`/verify-email?token=${TOKEN}`);

  // Ramificó a confirm (auto-login KER-49) y entró a la app; el feedback de éxito se emite al aterrizar.
  await expect(page).toHaveURL(/\/app/);
  expect(confirmCalled).toBe(true);
});

test('logueado con la MISMA cuenta: verifica sin pedir credenciales (no pasa por login)', async ({ page }) => {
  await primeSession(page, session({ email: TARGET_EMAIL, emailVerified: false }));
  let confirmCalled = false;
  await stubApi(page, { onConfirm: () => (confirmCalled = true) });

  await page.goto(`/verify-email?token=${TOKEN}`);

  await expect(page).toHaveURL(/\/app/);
  expect(confirmCalled).toBe(true);
  await expect(page).not.toHaveURL(/\/login/);
});

test('logueado con OTRA cuenta: cierra sesión y pide credenciales (email prefilleado + aviso), sin cambio silencioso', async ({
  page,
}) => {
  await primeSession(page, session({ email: 'otra-cuenta@e2e.keru.test', displayName: 'Otra Cuenta' }));
  let confirmCalled = false;
  await stubApi(page, { onConfirm: () => (confirmCalled = true) });

  await page.goto(`/verify-email?token=${TOKEN}`);

  // No cambia de identidad en silencio: va a login pidiendo credenciales de la cuenta correcta.
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel('Email')).toHaveValue(TARGET_EMAIL);
  await expect(page.getByRole('status')).toContainText(/otra cuenta/i);

  // No se confirmó con la sesión ajena y la sesión previa quedó cerrada.
  expect(confirmCalled).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('keru.session'))).toBeNull();

  await expectAxeClean(page, 'login (verificación de otra cuenta)');
});

test('token inválido/expirado/usado (410): error claro con salida a iniciar sesión', async ({ page }) => {
  await primeSession(page, null);
  await stubApi(page, { peekStatus: 410 });

  await page.goto(`/verify-email?token=${TOKEN}`);

  await expect(page.getByRole('alert')).toContainText(/ya fue usado o expiró/i);
  await expect(page.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeVisible();

  await expectAxeClean(page, 'verify-email (410 vía peek)');
});
