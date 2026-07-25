import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-61 · Campos requeridos con "*" y resaltado en rojo del faltante al enviar (alta de paciente).
 *
 * Contra el stack real, sobre el ALTA DE PACIENTE (/app/patients/new):
 *   - los labels requeridos muestran el marcador "*" (kr-required-mark), y el "*" NO contamina el
 *     accessible name del control (los getByLabel exactos siguen resolviendo — clave para no romper
 *     los otros specs);
 *   - enviar con requeridos vacíos NO navega: cada campo faltante queda con borde danger
 *     (.input-error) + aria-invalid + mensaje inline, y el foco va al PRIMER inválido del DOM;
 *   - completar parcialmente y reenviar mueve el foco al siguiente faltante;
 *   - completar un campo LIMPIA su error en vivo (sin reenviar).
 */
const run = Date.now();
const EMAIL = `campos-req+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const NAME = 'Familia CamposReq';

/** Los 5 campos requeridos del alta, en orden del DOM. */
const REQUIRED = ['fullName', 'birthDate', 'mainCondition', 'contactName', 'contactPhone'];

function input(page: Page, name: string) {
  return page.locator(`input[name="${name}"]`);
}

test.describe.serial('KER-61 · Campos requeridos en el alta de paciente', () => {
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

  test('los labels requeridos muestran "*" y el "*" no entra en el accessible name', async () => {
    await page.goto('/app/patients/new');
    await expect(page.getByLabel('Nombre completo')).toBeVisible({ timeout: 15_000 });

    // Hay un marcador "*" por cada campo requerido (5).
    await expect(page.locator('kr-required-mark')).toHaveCount(REQUIRED.length);
    await expect(page.locator('kr-required-mark').first()).toHaveText('*');

    // El "*" es aria-hidden: los getByLabel EXACTOS siguen resolviendo (si el "*" hubiera entrado en
    // el accessible name, "Nombre"/"Teléfono" exactos ya no matchearían).
    await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Teléfono', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Condición principal')).toBeVisible();
  });

  test('enviar vacío: no navega, marca cada requerido en rojo y enfoca el primero', async () => {
    await page.goto('/app/patients/new');
    await expect(page.getByLabel('Nombre completo')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Registrar paciente' }).click();

    // No navegó: sigue en el alta.
    await expect(page).toHaveURL(/\/app\/patients\/new$/);

    // Cada requerido: borde danger + aria-invalid.
    for (const name of REQUIRED) {
      await expect(input(page, name)).toHaveClass(/input-error/);
      await expect(input(page, name)).toHaveAttribute('aria-invalid', 'true');
    }

    // Mensajes inline específicos (no el banner genérico viejo).
    await expect(page.getByText('Ingresá la condición principal.')).toBeVisible();
    await expect(page.getByText('Ingresá el nombre completo.')).toBeVisible();
    await expect(
      page.getByText('Completá nombre, fecha de nacimiento y condición principal.'),
    ).toHaveCount(0);

    // El foco fue al primer inválido del DOM (nombre completo).
    await expect(input(page, 'fullName')).toBeFocused();
  });

  test('reenviar tras completar parcial: el foco va al siguiente faltante', async () => {
    // fullName ya no está vacío; el resto sí.
    await input(page, 'fullName').fill('Rosa Díaz');
    await page.getByRole('button', { name: 'Registrar paciente' }).click();

    // fullName dejó de estar en error; birthDate (siguiente requerido) queda marcado y recibe foco.
    await expect(input(page, 'fullName')).not.toHaveClass(/input-error/);
    await expect(input(page, 'birthDate')).toHaveClass(/input-error/);
    await expect(input(page, 'birthDate')).toBeFocused();
  });

  test('completar un campo limpia su error en vivo (sin reenviar)', async () => {
    // mainCondition sigue en error del submit anterior; al completarlo, su error desaparece solo.
    await expect(input(page, 'mainCondition')).toHaveClass(/input-error/);
    await expect(page.getByText('Ingresá la condición principal.')).toBeVisible();

    await input(page, 'mainCondition').fill('Hipertensión');

    await expect(input(page, 'mainCondition')).not.toHaveClass(/input-error/);
    await expect(page.getByText('Ingresá la condición principal.')).toHaveCount(0);
  });
});
