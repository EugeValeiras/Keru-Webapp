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
  // La grilla del marketplace entra con `.kr-stagger` (fade-in opacity 0→1). Hasta que ese
  // fundido TERMINA, el texto atenuado (text-ink-500) se renderiza semitransparente: axe compone
  // el fg con el fondo blanco y el contraste cae por debajo de AA (p. ej. #6f6779 al ~90% sobre
  // blanco = #7d7686 → 4.33:1) → color-contrast serious TRANSITORIO. Las cards a partir de la 9ª
  // entran con el retardo máximo (~360ms + 350ms), así que con muchos cuidadores en página el
  // fundido no cierra en el settle viejo (400ms) → order/data-flake de KER-72 ("pasa al re-run").
  // Esperar a que: (a) no queden skeletons, (b) toda card tenga su fondo real, y
  // (c) toda la entrada escalonada esté en opacity:1 (fundido cerrado). Sin cards → nada que asentar.
  await page.waitForFunction(() => {
    if (document.querySelector('.kr-shimmer')) return false;
    const cards = Array.from(document.querySelectorAll('.p-6.transition-shadow'));
    const bgReady = cards.every((c) => {
      const bg = getComputedStyle(c).backgroundColor;
      return bg !== '' && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    });
    const staggerSettled = Array.from(document.querySelectorAll('.kr-stagger > *')).every(
      (el) => getComputedStyle(el).opacity === '1',
    );
    return bgReady && staggerSettled;
  });
  await page.waitForTimeout(200);
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
