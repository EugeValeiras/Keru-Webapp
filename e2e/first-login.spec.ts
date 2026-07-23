import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-47 · UC-04 A5: definir la contraseña en el primer acceso (first-login) desde el cliente.
 *
 * El camino feliz punta-a-punta por invitación (aceptar → set-password → home) vive en
 * `circulo-invitaciones.spec.ts` test c, contra el stack real. Acá cubrimos la pantalla
 * "Definí tu contraseña" en aislamiento (sesión limitada seedeada) y el guard de la ruta:
 *   1. La pantalla pide la contraseña, valida fuerza/coincidencia y reusa kr-password-input (KER-45).
 *   2. axe AA verde.
 *   3. El guard: sin sesión → login; con la contraseña ya definida → no se queda en set-password.
 */

/** Sesión LIMITADA de first-login (mustSetPassword): lo que devuelve aceptar una invitación sin cuenta. */
const LIMITED_SESSION = {
  accessToken: 'e2e.limited.session',
  accountId: 'acc-e2e-first-login',
  email: 'nuevo-invitado@e2e.com',
  role: 'family',
  displayName: 'nuevo-invitado',
  photoUrl: null,
  mustSetPassword: true,
};

async function seedSession(page: Page, session: Record<string, unknown> | null): Promise<void> {
  await page.addInitScript((s) => {
    if (s) {
      localStorage.setItem('keru.session', JSON.stringify(s));
    } else {
      localStorage.removeItem('keru.session');
    }
  }, session);
}

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    severe.map(
      (v) =>
        `[${screen}] ${v.id} (${v.impact}): ${v.help} → ` +
        v.nodes.map((n) => n.target.join(' ')).join(' | '),
    ),
  ).toEqual([]);
}

test('la pantalla de primer acceso pide definir la contraseña, valida y pasa axe AA', async ({ page }) => {
  await seedSession(page, LIMITED_SESSION);
  await page.goto('/set-password');

  await expect(page.getByRole('heading', { name: 'Definí tu contraseña' })).toBeVisible();
  // Muestra para qué email es (la cuenta recién creada por la invitación).
  await expect(page.getByText(LIMITED_SESSION.email)).toBeVisible();

  const pass = page.getByLabel('Tu contraseña').and(page.locator('input'));
  const repeat = page.getByLabel('Repetí la contraseña').and(page.locator('input'));
  const submit = page.getByRole('button', { name: 'Guardar y entrar' });

  // Distintas → aviso de no coincidencia y submit deshabilitado.
  await pass.fill('PrimeraClave!123');
  await repeat.fill('OtraCosa!123');
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await expect(submit).toBeDisabled();

  // Coinciden pero cortas → sigue deshabilitado (misma fuerza que el alta).
  await pass.fill('corta');
  await repeat.fill('corta');
  await expect(submit).toBeDisabled();

  // Coinciden y ≥ 8 → habilitado.
  await pass.fill('PrimeraClave!123');
  await repeat.fill('PrimeraClave!123');
  await expect(submit).toBeEnabled();

  await expectAxeClean(page, 'set-password');
});

test('sin sesión, la ruta de primer acceso redirige a login', async ({ page }) => {
  await seedSession(page, null);
  await page.goto('/set-password');
  await expect(page).toHaveURL(/\/login$/);
});

test('con la contraseña ya definida, la ruta de primer acceso no se queda en set-password', async ({ page }) => {
  await seedSession(page, { ...LIMITED_SESSION, mustSetPassword: false });
  await page.goto('/set-password');
  // El guard la saca de acá (a su home; con token de prueba puede rebotar a login por 401, pero nunca queda en set-password).
  await expect(page).not.toHaveURL(/\/set-password$/, { timeout: 15_000 });
});
