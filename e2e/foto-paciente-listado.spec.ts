import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-65 · La foto del paciente aparece en la LISTA de pacientes (UC-22).
 *
 * El alta ya sube la foto (kr-photo-input → /files/images) y la manda como photoUrl; el bug era
 * que el listado del backend no exponía photoUrl y la card del listado no lo pintaba. Este circuito,
 * contra el stack real:
 *   - registra un paciente CON foto → su card en /app/patients muestra la <img> (no iniciales);
 *   - registra un paciente SIN foto → su card cae al avatar de iniciales (sin <img>).
 */
const run = Date.now();
const EMAIL = `foto-paciente+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const NAME = 'Familia FotoPaciente';
const CON_FOTO = `Con Foto ${run}`;
const SIN_FOTO = `Sin Foto ${run}`;

// PNG 1x1 válido (kr-photo-input valida tipo/tamaño; el recorte lo lleva a canvas y sube el blob).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

async function fillPatientBasics(page: Page, fullName: string): Promise<void> {
  await page.goto('/app/patients/new');
  await expect(page.getByLabel('Nombre completo')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Fecha de nacimiento').fill('1950-05-10');
  await page.getByLabel('Condición principal').fill('Hipertensión');
  await page.getByLabel('Nombre', { exact: true }).fill('Contacto ' + fullName);
  await page.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0001');
}

async function submitAndExpectListed(page: Page, fullName: string): Promise<void> {
  await page.getByRole('button', { name: 'Registrar paciente' }).click();
  await expect(page).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
  await expect(page.getByText(fullName).first()).toBeVisible({ timeout: 15_000 });
}

/** La card de un paciente en el listado: el <a> que contiene su nombre. */
function patientCard(page: Page, fullName: string) {
  return page.locator('a').filter({ hasText: fullName });
}

test.describe.serial('KER-65 · La foto del paciente aparece en la lista', () => {
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

  test('alta con foto: la card del listado muestra la imagen (no iniciales)', async () => {
    await fillPatientBasics(page, CON_FOTO);

    // Subir la foto por el mismo componente compartido (kr-photo-input) → recorte → subida.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'paciente.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    const cropper = page.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });
    await cropper.getByRole('button', { name: 'Recortar y subir' }).click();
    // La subida terminó cuando el input pasa a "Cambiar foto…" (ya hay url).
    await expect(page.getByRole('button', { name: 'Cambiar foto de perfil' })).toBeVisible({
      timeout: 15_000,
    });

    await submitAndExpectListed(page, CON_FOTO);

    // En su card, el avatar es una <img> (kr-avatar con photoUrl), con alt = nombre.
    const card = patientCard(page, CON_FOTO);
    await expect(card.getByRole('img', { name: CON_FOTO })).toBeVisible({ timeout: 15_000 });
  });

  test('alta sin foto: la card del listado cae al avatar de iniciales (sin imagen)', async () => {
    await fillPatientBasics(page, SIN_FOTO);
    await submitAndExpectListed(page, SIN_FOTO);

    const card = patientCard(page, SIN_FOTO);
    // Sin foto: no hay <img> en la card; el avatar muestra las iniciales del nombre.
    await expect(card.locator('img')).toHaveCount(0);
    await expect(card.getByText('SF', { exact: true })).toBeVisible();
  });
});
