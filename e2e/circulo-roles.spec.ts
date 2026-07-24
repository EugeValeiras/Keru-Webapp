import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-51 · UC-22 A3/A4 · Gestión del círculo y edición de ficha/avatar por el titular.
 *
 * Lo alcanzable por UI sin invitaciones (emitir invitación exige email verificado, un token que
 * viaja por email y no es testeable desde el browser — ver circulo-invitaciones.spec b–h): el
 * titular (consent-holder, único miembro de un paciente recién creado) edita la ficha y sube un
 * avatar, y desde el círculo dispone del control de cambio de rol; degradarse a sí mismo (dejaría
 * al paciente sin titular) lo frena la política de titularidad (409) con feedback claro. La matriz
 * completa de autorización (promover un miembro, 403 de manager/viewer, 404, transferencia de
 * titularidad) la cubre la suite jest e2e de la API (apps/keru-api/test/circle-role.e2e-spec.ts).
 */
const run = Date.now();
const EMAIL = `circulo-rol+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const TITULAR_NAME = `Titular Rol ${run}`;
const PATIENT_NAME = 'Elena Titularidad';
const NEW_CONDITION = 'Hipertensión controlada KER-51';

// PNG 1x1 válido (kr-photo-input valida tipo/tamaño; la API lo sube a floci/S3).
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

/** Navega a la ficha del paciente desde "Mis pacientes". */
async function openFicha(page: Page): Promise<void> {
  await page.goto('/app/patients');
  await page.getByRole('button', { name: 'Ficha', exact: true }).click();
  await expect(page).toHaveURL(/\/record$/, { timeout: 15_000 });
}

test.describe.serial('KER-51 · Círculo: cambio de rol y edición de ficha/avatar', () => {
  test.use(E2E_CONTEXT);

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test('setup: alta de familia (titular) y paciente', async () => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /^Familiar/ }).click();
    await page.getByLabel('Nombre y apellido').fill(TITULAR_NAME);
    await page.getByLabel('Email').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await page.goto('/app/patients');
    await page.getByRole('link', { name: 'Registrar paciente' }).first().click();
    await page.getByLabel('Nombre completo').fill(PATIENT_NAME);
    await page.getByLabel('Fecha de nacimiento').fill('1948-03-20');
    await page.getByLabel('Condición principal').fill('Hipertensión');
    await page.getByLabel('Nombre', { exact: true }).fill('María Titular');
    await page.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0120');
    await page.getByRole('button', { name: 'Registrar paciente' }).click();
    await expect(page).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
    await expect(page.getByText(PATIENT_NAME)).toBeVisible();
  });

  test('el titular edita la ficha y sube un avatar → confirmación', async () => {
    await openFicha(page);
    await page.getByRole('button', { name: 'Editar ficha' }).click();

    // Subir el avatar del paciente: preview inmediato antes de guardar.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await expect(page.getByAltText('Foto de perfil')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Condición principal').fill(NEW_CONDITION);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    // Feedback de éxito (toast KER-23, región viva polite) y el dato editado a la vista.
    await expect(
      page.getByRole('status').filter({ hasText: 'Ficha actualizada.' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(NEW_CONDITION)).toBeVisible();
    // El avatar quedó persistido: la ficha lo muestra como <img>.
    await expect(page.locator(`img[alt="${PATIENT_NAME}"]`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('el círculo ofrece el control de rol al titular; la guardia del último titular avisa', async () => {
    const circle = page.locator('section').filter({ hasText: 'Círculo' });
    const owner = circle.locator('li').filter({ hasText: TITULAR_NAME });
    await expect(owner).toBeVisible({ timeout: 15_000 });
    await expect(owner).toContainText('Titular');

    // El titular (consent-holder) dispone del menú de cambio de rol.
    const roleMenu = owner.getByRole('button', { name: `Cambiar el rol de ${TITULAR_NAME}` });
    await expect(roleMenu).toBeVisible();
    await roleMenu.click();

    // Elegir "Solo lectura" abre la confirmación (reutiliza kr-modal).
    await page.getByRole('menuitem', { name: 'Cambiar a Solo lectura' }).click();
    const modal = page.getByRole('dialog', { name: 'Cambiar rol del círculo' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Sí, cambiar' }).click();

    // Degradarse dejaría al paciente sin titular: el backend lo frena (409) y la UI lo comunica.
    await expect(
      page.getByRole('alert').filter({ hasText: /no se puede dejar al paciente sin titular/i }),
    ).toBeVisible({ timeout: 15_000 });
    // El rol no cambió: sigue siendo Titular.
    await expect(owner).toContainText('Titular');
  });

  test('axe AA verde en la ficha (círculo + menú de rol, cerrado y abierto)', async () => {
    await openFicha(page);
    await expect(page.locator('section').filter({ hasText: 'Círculo' })).toBeVisible({
      timeout: 15_000,
    });
    await expectAxeClean(page, 'ficha · círculo (menú cerrado)');

    await page.getByRole('button', { name: `Cambiar el rol de ${TITULAR_NAME}` }).click();
    await expect(page.getByRole('menu', { name: 'Elegí el nuevo rol' })).toBeVisible();
    await expectAxeClean(page, 'ficha · círculo (menú de rol abierto)');
    await page.keyboard.press('Escape');
  });
});
