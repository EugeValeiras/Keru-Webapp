import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-41 · UC-23 · Avatar + menú de cuenta en el header y página "Mi perfil".
 *
 * Circuito (una cuenta de familia): el header muestra el avatar (fallback inicial+color sin
 * foto); el avatar abre un menú de cuenta accesible (nombre, email, "Mi perfil", "Cerrar
 * sesión"); "Mi perfil" lleva a /perfil, donde subo una foto (preview inmediato) y edito el
 * nombre; al guardar, el avatar del header se actualiza al instante sin recargar. axe AA verde
 * en la pantalla nueva (menú abierto y cerrado). El logout vive en el menú.
 */
const run = Date.now();
const EMAIL = `perfil+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const NAME = 'Familia Perfil E2E';
const NEW_NAME = 'Familia Renombrada E2E';

// PNG 1x1 válido (el kr-photo-input valida tipo/tamaño; la API lo sube a floci/S3).
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

test.describe.serial('KER-41 · Avatar, menú de cuenta y "Mi perfil"', () => {
  test.use(E2E_CONTEXT);

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test('setup: alta de familia', async () => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /^Familiar/ }).click();
    await page.getByLabel('Nombre y apellido').fill(NAME);
    await page.getByLabel('Email').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
  });

  test('el header muestra el avatar y abre el menú de cuenta accesible', async () => {
    const trigger = page.getByRole('button', { name: /Tu cuenta/ });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    // Sin foto todavía: el avatar es el fallback inicial+color (no un <img>).
    await expect(page.locator('header img[alt="' + NAME + '"]')).toHaveCount(0);

    // axe con el menú cerrado.
    await expectAxeClean(page, 'marketplace · menú cuenta cerrado');

    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(NAME);
    await expect(menu).toContainText(EMAIL);
    await expect(menu.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();

    // axe con el menú abierto (roles menuitem, separador, encabezado presentacional).
    await expectAxeClean(page, 'marketplace · menú cuenta abierto');

    // Cerrar el menú para dejar el header limpio para el próximo paso.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('"Mi perfil" abre /perfil con los datos de la cuenta (axe verde)', async () => {
    await page.getByRole('button', { name: /Tu cuenta/ }).click();
    await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
    await expect(page.getByLabel('Nombre y apellido')).toHaveValue(NAME);
    // El email es de solo lectura (identidad de login).
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveValue(EMAIL);
    await expect(emailInput).toHaveAttribute('readonly', '');

    await expectAxeClean(page, 'perfil');
  });

  test('subir foto (recorte circular + preview) + editar nombre → el header se actualiza sin recargar', async () => {
    // El avatar editable es un botón accesible (KER-48), no un pill "Subir foto".
    await expect(page.getByRole('button', { name: 'Subir foto de perfil' })).toBeVisible();

    // Elegir la imagen abre el paso de recorte con máscara circular; se confirma para subir.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    const cropper = page.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });
    await expect(cropper.getByLabel('Zoom de la foto')).toBeVisible();
    await cropper.getByRole('button', { name: 'Recortar y subir' }).click();

    // Recortada y subida: preview inmediato y el modal se cierra.
    await expect(page.getByAltText('Foto de perfil')).toBeVisible({ timeout: 15_000 });
    await expect(cropper).toBeHidden();
    // Ahora el avatar comunica que se puede cambiar (aria-label).
    await expect(page.getByRole('button', { name: 'Cambiar foto de perfil' })).toBeVisible();

    // Editar el nombre y guardar.
    await page.getByLabel('Nombre y apellido').fill(NEW_NAME);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Feedback de éxito (toast KER-23).
    await expect(page.getByText('Perfil actualizado')).toBeVisible({ timeout: 15_000 });

    // Sin recargar: el header ahora muestra la foto (un <img>) con el nombre nuevo.
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.locator('header img[alt="' + NEW_NAME + '"]')).toBeVisible({ timeout: 15_000 });
    // Y el menú de cuenta refleja el nombre nuevo.
    await expect(page.getByRole('button', { name: new RegExp('Tu cuenta: ' + NEW_NAME) })).toBeVisible();

    // axe sigue verde tras el cambio.
    await expectAxeClean(page, 'perfil · guardado');
  });

  test('el menú de cuenta es operable por teclado (abrir, Escape devuelve el foco)', async () => {
    const trigger = page.getByRole('button', { name: /Tu cuenta/ });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('"Cerrar sesión" desde el menú cierra la sesión', async () => {
    await page.getByRole('button', { name: /Tu cuenta/ }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });
});
