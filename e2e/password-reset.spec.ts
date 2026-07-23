import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-46 · UC-04 A4: recuperación de contraseña (forgot/reset) desde el cliente.
 *
 * Cubre el flujo alcanzable por la UI contra el stack real:
 *   1. Desde el login, el link "Olvidé mi contraseña" lleva a pedir el reset.
 *   2. Pedir el reset muestra SIEMPRE un estado neutro (anti-enumeración): un email inexistente
 *      ve exactamente lo mismo que uno registrado — nunca "no encontramos esa cuenta".
 *   3. La pantalla de confirmación con token inválido/ausente avisa y ofrece pedir uno nuevo.
 *   4. Valida coincidencia y longitud de la contraseña nueva (reusa kr-password-input, KER-45).
 *   5. axe AA verde en cada pantalla nueva.
 *
 * El camino feliz criptográfico (token válido → contraseña nueva → sesiones revocadas) vive en
 * la suite jest e2e de la API (password-reset.e2e-spec.ts): acá el token viaja por email y no hay
 * forma limpia de leerlo desde el browser.
 */

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  // Dejar asentar el render (chunk lazy + fuentes) antes de muestrear contraste: axe sobre una
  // pantalla a medio pintar da falsos color-contrast (el card aún no aplicó su fondo).
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

test('desde el login se llega a recuperar la contraseña y la pantalla pasa axe AA', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await expect(page).toHaveURL(/\/password-reset\/request$/);
  await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();

  await expectAxeClean(page, 'password-reset/request');
});

test('pedir el reset muestra un estado neutro (anti-enumeración) también para un email inexistente', async ({
  page,
}) => {
  await page.goto('/password-reset/request');

  // Email que seguro no existe: la respuesta NO debe delatar que no hay cuenta.
  await page.getByLabel('Email').fill(`fantasma+${Date.now()}@e2e.com`);
  await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();

  await expect(page.getByRole('heading', { name: 'Revisá tu correo' })).toBeVisible();
  // Nunca aparece un mensaje que revele la (in)existencia de la cuenta.
  await expect(page.getByText(/no encontramos|no existe|no hay una cuenta/i)).toHaveCount(0);

  await expectAxeClean(page, 'password-reset/request (enviado)');
});

test('el enlace de confirmación sin token avisa y ofrece pedir uno nuevo (axe AA)', async ({ page }) => {
  await page.goto('/password-reset/confirm');

  await expect(page.getByRole('alert')).toContainText(/inválido o expiró/i);
  await expect(page.getByRole('link', { name: 'Pedí un enlace nuevo' })).toBeVisible();

  await expectAxeClean(page, 'password-reset/confirm (sin token)');
});

test('un token inválido es rechazado con un aviso claro (410)', async ({ page }) => {
  await page.goto('/password-reset/confirm?token=token-invalido-000');

  await page.getByLabel('Nueva contraseña').and(page.locator('input')).fill('NuevaClave!456');
  await page.getByLabel('Repetí la contraseña').and(page.locator('input')).fill('NuevaClave!456');
  await page.getByRole('button', { name: 'Guardar contraseña nueva' }).click();

  await expect(page.getByRole('alert')).toContainText(/ya fue usado o expiró/i);
  await expect(page.getByRole('link', { name: 'Pedí un enlace nuevo' })).toBeVisible();
});

test('la confirmación valida coincidencia y longitud de la contraseña nueva', async ({ page }) => {
  await page.goto('/password-reset/confirm?token=algun-token');

  const nueva = page.getByLabel('Nueva contraseña').and(page.locator('input'));
  const repetir = page.getByLabel('Repetí la contraseña').and(page.locator('input'));
  const submit = page.getByRole('button', { name: 'Guardar contraseña nueva' });

  // Distintas → aviso de no coincidencia y submit deshabilitado.
  await nueva.fill('NuevaClave!456');
  await repetir.fill('OtraCosa!456');
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await expect(submit).toBeDisabled();

  // Coinciden pero demasiado cortas → submit sigue deshabilitado.
  await nueva.fill('corta');
  await repetir.fill('corta');
  await expect(submit).toBeDisabled();

  // Coinciden y ≥ 8 → habilitado.
  await nueva.fill('NuevaClave!456');
  await repetir.fill('NuevaClave!456');
  await expect(submit).toBeEnabled();

  await expectAxeClean(page, 'password-reset/confirm (form)');
});
