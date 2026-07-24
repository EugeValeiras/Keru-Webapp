import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-48 · UX de la subida de foto de perfil (componente compartido kr-photo-input).
 *
 * Cubre lo específico de esta tarea sobre /perfil:
 *  1. El avatar editable es un botón accesible (aria-label, alcanzable por teclado) con
 *     feedback claro de "clickeable" — no un pill genérico.
 *  2. Elegir una imagen abre el paso de RECORTE con máscara circular; el modal es
 *     accesible (axe AA verde), tiene zoom operable por teclado y Escape cancela sin subir.
 *  3. Ajustar el zoom y confirmar sube la imagen recortada (preview inmediato).
 */
const run = Date.now();
const EMAIL = `foto+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const NAME = 'Familia Foto E2E';

// PNG 1x1 válido (kr-photo-input valida tipo/tamaño; el recorte lo lleva a canvas y sube el blob).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

async function expectAxeClean(page: Page, screen: string): Promise<void> {
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

test.describe.serial('KER-48 · Avatar clickeable + recorte circular', () => {
  test.use(E2E_CONTEXT);

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test('setup: alta de familia y "Mi perfil"', async () => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /^Familiar/ }).click();
    await page.getByLabel('Nombre y apellido').fill(NAME);
    await page.getByLabel('Email').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await page.getByRole('button', { name: /Tu cuenta/ }).click();
    await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/, { timeout: 15_000 });
  });

  test('el avatar editable es un botón accesible, alcanzable por teclado', async () => {
    const avatar = page.getByRole('button', { name: 'Subir foto de perfil' });
    await expect(avatar).toBeVisible();

    // Operable por teclado: el botón es alcanzable con Tab (orden de foco).
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await avatar.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });

  test('elegir imagen abre el recorte circular (axe verde) y Escape cancela sin subir', async () => {
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    const cropper = page.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });
    await expect(cropper.getByLabel('Zoom de la foto')).toBeVisible();

    // El modal de recorte es accesible.
    await expectAxeClean(page, 'perfil · recorte');

    // Escape cancela: el modal cierra y NO quedó ninguna foto subida.
    await page.keyboard.press('Escape');
    await expect(cropper).toBeHidden();
    await expect(page.getByAltText('Foto de perfil')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Subir foto de perfil' })).toBeVisible();
  });

  test('ajustar el zoom y confirmar sube la imagen recortada (preview inmediato)', async () => {
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    const cropper = page.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });

    // Reencuadrar con el zoom (control operable por teclado).
    const zoom = cropper.getByLabel('Zoom de la foto');
    await zoom.fill('2');
    await expect(zoom).toHaveValue('2');

    await cropper.getByRole('button', { name: 'Recortar y subir' }).click();

    await expect(page.getByAltText('Foto de perfil')).toBeVisible({ timeout: 15_000 });
    await expect(cropper).toBeHidden();
    await expect(page.getByRole('button', { name: 'Cambiar foto de perfil' })).toBeVisible();
    // axe sigue verde con la foto ya cargada.
    await expectAxeClean(page, 'perfil · con foto');
  });
});
