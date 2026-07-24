import AxeBuilder from '@axe-core/playwright';
import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-74 · La foto del cuidador aparece en las vistas de ADMIN (UC-19).
 *
 * El backend ya exponía la foto (photoUrl deriva de la cuenta, ADR-0003/KER-54) pero las tres
 * vistas de back-office pintaban <kr-avatar> SIN [photoUrl], así que el avatar caía siempre a las
 * iniciales aunque el cuidador tuviera foto (mismo patrón que KER-65 en la lista de pacientes).
 *
 * Circuito contra el stack real:
 *   - un cuidador se postula CON foto → aparece con su <img> en /admin/pending, en la lista de
 *     cuidadores y en el detalle;
 *   - un cuidador se postula SIN foto → cae al avatar de iniciales (sin <img>) en esas vistas.
 *   - axe sin violaciones serias en /admin/pending con la foto presente (el avatar-imagen lleva alt).
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';
const ADMIN_EMAIL = 'admin@test.com';

const CON_FOTO_NAME = `ConFoto Cuidador ${run}`;
const CON_FOTO_EMAIL = `cg-foto-admin+${run}@e2e.com`;
const CON_FOTO_ZONE = `Nunez Foto ${run}`;

const SIN_FOTO_NAME = `SinFoto Cuidador ${run}`;
const SIN_FOTO_EMAIL = `cg-sinfoto-admin+${run}@e2e.com`;
const SIN_FOTO_ZONE = `Nunez SinFoto ${run}`;
// kr-avatar arma las iniciales con la 1ª letra de las 2 primeras palabras del nombre.
const SIN_FOTO_INITIALS = 'SC';

// PNG 1x1 válido (kr-photo-input valida tipo/tamaño; la API lo sube a floci/S3).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

/** Postula un cuidador (signup + onboarding de 5 pasos); sube foto en el paso 1 si withPhoto. */
async function onboardCaregiver(
  page: Page,
  opts: { name: string; email: string; zone: string; withPhoto: boolean },
): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Cuidador\/a/ }).click();
  await page.getByLabel('Nombre y apellido').fill(opts.name);
  await page.getByLabel('Email').fill(opts.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

  // Paso 1: el nombre a mostrar es el de la cuenta (solo lectura); la foto es opcional.
  await expect(page.getByText(opts.name).first()).toBeVisible({ timeout: 15_000 });
  if (opts.withPhoto) {
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    const cropper = page.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });
    await cropper.getByRole('button', { name: 'Recortar y subir' }).click();
    await expect(page.getByAltText('Foto de perfil')).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Paso 2: especialidad
  await page.getByLabel('Adultos mayores').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  // Paso 3: certificaciones (ninguna)
  await page.getByRole('button', { name: 'Siguiente' }).click();
  // Paso 4: disponibilidad (KER-53)
  await page.getByRole('button', { name: 'Lunes' }).click();
  await page.getByLabel('Desde').fill('09:00');
  await page.getByLabel('Hasta').fill('17:00');
  await page.getByRole('button', { name: 'Agregar horario' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  // Paso 5: tarifa, zona y modalidad
  await page.getByLabel('Tarifa por hora').fill('4000');
  await page.getByLabel('Zona', { exact: true }).fill(opts.zone);
  await page.getByLabel('A domicilio').check();
  await page.getByRole('button', { name: 'Enviar postulación' }).click();
  await expect(page).toHaveURL(/\/caregiver\/profile$/, { timeout: 15_000 });
}

/** La card de un cuidador en /admin/pending: el div.bg-surface con su nombre y el link "Revisar". */
function pendingCard(page: Page, name: string) {
  return page
    .locator('div.bg-surface')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('link', { name: 'Revisar' }) });
}

/** Espera a que terminen las animaciones finitas de entrada antes de muestrear con axe. */
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    severe.map(
      (v) => `[${screen}] ${v.id} (${v.impact}): ${v.help}`,
    ),
  ).toEqual([]);
}

test.describe.serial('KER-74 · La foto del cuidador aparece en las vistas de admin', () => {
  let browser: Browser;
  // Cada cuidador es su propia cuenta → su propio contexto (evita que el 2º /signup choque con
  // la sesión del 1º; el guard de auth redirige a los usuarios ya logueados fuera de /signup).
  const caregiverCtxs: BrowserContext[] = [];
  let adminCtx: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
  });

  test.afterAll(async () => {
    for (const ctx of caregiverCtxs) await ctx.close();
    await adminCtx?.close();
  });

  async function newCaregiverPage(): Promise<Page> {
    const ctx = await browser.newContext(E2E_CONTEXT);
    caregiverCtxs.push(ctx);
    return ctx.newPage();
  }

  test('setup: un cuidador se postula CON foto y otro SIN foto', async () => {
    await onboardCaregiver(await newCaregiverPage(), {
      name: CON_FOTO_NAME,
      email: CON_FOTO_EMAIL,
      zone: CON_FOTO_ZONE,
      withPhoto: true,
    });
    await onboardCaregiver(await newCaregiverPage(), {
      name: SIN_FOTO_NAME,
      email: SIN_FOTO_EMAIL,
      zone: SIN_FOTO_ZONE,
      withPhoto: false,
    });
  });

  test('admin login + /admin/pending: con foto → imagen; sin foto → iniciales (+ axe)', async () => {
    adminCtx = await browser.newContext(E2E_CONTEXT);
    admin = await adminCtx.newPage();

    await admin.goto('/login');
    await admin.getByLabel('Email').fill(ADMIN_EMAIL);
    await admin.locator('input[type="password"]').fill(PASSWORD);
    await admin.getByRole('button', { name: 'Ingresar' }).click();
    await expect(admin).toHaveURL(/\/admin\/pending$/, { timeout: 15_000 });

    // Con foto: el avatar es una <img> con alt = nombre.
    const conFoto = pendingCard(admin, CON_FOTO_NAME);
    await expect(conFoto).toBeVisible({ timeout: 15_000 });
    await expect(conFoto.getByRole('img', { name: CON_FOTO_NAME })).toBeVisible();

    // Sin foto: no hay <img>; el avatar cae a las iniciales.
    const sinFoto = pendingCard(admin, SIN_FOTO_NAME);
    await expect(sinFoto).toBeVisible({ timeout: 15_000 });
    await expect(sinFoto.locator('img')).toHaveCount(0);
    await expect(sinFoto.getByText(SIN_FOTO_INITIALS, { exact: true })).toBeVisible();

    // El avatar-imagen lleva alt: axe sin violaciones serias con la foto presente.
    await expectAxeClean(admin, 'admin/pending');
  });

  test('/admin/caregivers (lista): con foto → imagen; sin foto → iniciales', async () => {
    await admin.goto('/admin/caregivers');

    // Buscar por el nombre único del cuidador con foto → su fila muestra la <img>.
    await admin.getByPlaceholder('Nombre o zona…').fill(CON_FOTO_NAME);
    await admin.getByRole('button', { name: 'Buscar' }).click();
    const conFotoRow = admin.locator('tr').filter({ hasText: CON_FOTO_NAME });
    await expect(conFotoRow).toBeVisible({ timeout: 15_000 });
    await expect(conFotoRow.getByRole('img', { name: CON_FOTO_NAME })).toBeVisible();

    // Buscar por el del sin foto → su fila cae a las iniciales (sin <img>).
    await admin.getByPlaceholder('Nombre o zona…').fill(SIN_FOTO_NAME);
    await admin.getByRole('button', { name: 'Buscar' }).click();
    const sinFotoRow = admin.locator('tr').filter({ hasText: SIN_FOTO_NAME });
    await expect(sinFotoRow).toBeVisible({ timeout: 15_000 });
    await expect(sinFotoRow.locator('img')).toHaveCount(0);
    await expect(sinFotoRow.getByText(SIN_FOTO_INITIALS, { exact: true })).toBeVisible();
  });

  test('/admin/caregivers/:id (detalle): el encabezado muestra la foto del cuidador', async () => {
    await admin.goto('/admin/pending');
    const conFoto = pendingCard(admin, CON_FOTO_NAME);
    await expect(conFoto).toBeVisible({ timeout: 15_000 });
    await conFoto.getByRole('link', { name: 'Revisar' }).click();
    await expect(admin).toHaveURL(/\/admin\/caregivers\//);

    // El encabezado del detalle muestra el avatar-imagen (alt = nombre), no las iniciales.
    await expect(admin.getByRole('heading', { name: CON_FOTO_NAME })).toBeVisible({
      timeout: 15_000,
    });
    await expect(admin.getByRole('img', { name: CON_FOTO_NAME })).toBeVisible();
  });
});
