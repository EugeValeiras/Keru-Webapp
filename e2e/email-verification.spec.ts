import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-49 · UC-04 A5: verificación de email del self-signup desde el cliente.
 *
 * Cubre el flujo alcanzable por la UI contra el stack real:
 *   1. La pantalla de verificación con token ausente/ inválido avisa y ofrece iniciar sesión.
 *   2. Tras un self-signup, la app muestra el banner persistente "verificá tu email" con la acción
 *      de reenviar (feedback neutro por toast, anti-enumeración).
 *   3. axe AA verde en cada pantalla nueva.
 *
 * El camino feliz criptográfico (token válido → email verificado → gate de invitaciones) vive en
 * la suite jest e2e de la API (email-verification.e2e-spec.ts): el token viaja por email y no hay
 * forma limpia de leerlo desde el browser.
 */

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  // Dejar asentar el render antes de muestrear contraste. En pantallas con datos e imágenes
  // (el marketplace tras el signup) axe puede muestrear el texto de una card de cuidador antes
  // de que carguen sus datos/imagen y se pinte el fondo → color-contrast falso (ver KER-46/20).
  // Esperamos red quieta + fuentes + imágenes cargadas + un frame antes de analizar.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((res) => (img.onload = img.onerror = () => res(null)))),
    ),
  );
  // Causa raíz del color-contrast falso: en ng serve (dev, también en CI) los estilos de cada
  // componente se inyectan async; hasta que se pinta el fondo de las cards del marketplace,
  // axe mide el texto contra un fondo equivocado. Esperar a que una card tenga fondo real.
  await page.waitForFunction(() => {
    const card = document.querySelector('.p-6.transition-shadow');
    if (!card) return true; // pantalla sin cards (verify-email): nada que asentar
    const bg = getComputedStyle(card).backgroundColor;
    return bg !== '' && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
  });
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

test('la verificación sin token avisa y ofrece iniciar sesión (axe AA)', async ({ page }) => {
  await page.goto('/verify-email');

  await expect(page.getByRole('alert')).toContainText(/inválido o expiró/i);
  await expect(page.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeVisible();

  await expectAxeClean(page, 'verify-email (sin token)');
});

test('un token inválido es rechazado con un aviso claro (410) y salida a login', async ({ page }) => {
  await page.goto('/verify-email?token=token-invalido-000');

  await expect(page.getByRole('alert')).toContainText(/ya fue usado o expiró/i);
  await expect(page.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeVisible();

  await expectAxeClean(page, 'verify-email (token inválido)');
});

test('tras el self-signup aparece el banner de verificación con reenviar; reenviar da feedback neutro', async ({
  page,
}) => {
  await page.goto('/signup');

  await page.getByRole('button', { name: 'Familiar' }).click();
  await page.getByLabel('Nombre y apellido').fill('Nueva Cuenta E2E');
  await page.getByLabel('Email').fill(`verif+${Date.now()}@e2e.com`);
  await page.getByLabel('Contraseña').and(page.locator('input')).fill('S3gura!123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Aterriza en la app (marketplace) con el banner persistente de verificación.
  await expect(page).toHaveURL(/\/app\/marketplace$/);
  const banner = page.getByRole('region', { name: 'Verificación de cuenta pendiente' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/verificá tu email/i);

  await expectAxeClean(page, 'app + banner de verificación');

  // Reenviar: feedback neutro por toast (la API responde siempre 200).
  await banner.getByRole('button', { name: 'Reenviar email' }).click();
  await expect(page.getByText(/te reenviamos el email de verificación/i)).toBeVisible();
});
