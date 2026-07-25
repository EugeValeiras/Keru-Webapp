import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-80 · Vincular los errores de validación a sus inputs (aria-describedby + aria-invalid) en
 * signup y alta de paciente. WCAG 2.1: 1.3.1 (Info & Relationships), 3.3.1 (Error Identification),
 * 4.1.3 (Status Messages).
 *
 * Contra el stack real, al enviar cada form con campos inválidos verifica que:
 *   - el input queda con aria-invalid="true" y aria-describedby apuntando al id del mensaje;
 *   - ese id resuelve a un elemento (role="alert") con el texto del error concreto;
 *   - sin envío (form limpio), NI aria-invalid NI aria-describedby cuelgan del input.
 */
const run = Date.now();
const EMAIL = `vinculo-err+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const NAME = 'Familia VinculoErr';

/** Falla listando las violaciones critical/serious de axe en la pantalla dada. */
async function expectAxeClean(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    severe.map(
      (v) =>
        `[${screen}] ${v.id} (${v.impact}): ${v.help} → ` +
        v.nodes.map((n) => n.target.join(' ')).join(' | '),
    ),
  ).toEqual([]);
}

/**
 * Verifica el vínculo error↔input: `input` tiene aria-invalid + aria-describedby=`errorId`, y ese
 * id resuelve a un elemento visible con `text`.
 */
async function expectLinkedError(
  page: Page,
  inputSelector: string,
  errorId: string,
  text: string,
): Promise<void> {
  const input = page.locator(inputSelector);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', errorId);
  const message = page.locator(`#${errorId}`);
  await expect(message).toBeVisible();
  await expect(message).toHaveText(text);
  // El vínculo cierra el círculo: el describedby del input resuelve al id del mensaje.
  const described = await input.getAttribute('aria-describedby');
  expect(described).toBe(errorId);
}

test.describe.serial('KER-80 · Vínculo error↔input en signup y alta de paciente', () => {
  test.use(E2E_CONTEXT);

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test('signup: sin enviar, los inputs no cuelgan aria-invalid ni aria-describedby', async () => {
    await page.goto('/signup');
    await expect(page.getByLabel('Nombre y apellido')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('input[name="displayName"]')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('input[name="displayName"]')).not.toHaveAttribute('aria-describedby');
    await expect(page.locator('input[name="password"]')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('input[name="password"]')).not.toHaveAttribute('aria-describedby');
  });

  test('signup: enviar vacío vincula cada error a su input y axe queda verde', async () => {
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // No navegó: el envío quedó frenado por la validación de cliente.
    await expect(page).toHaveURL(/\/signup$/);

    await expectLinkedError(
      page,
      'input[name="displayName"]',
      'err-displayName',
      'Ingresá tu nombre y apellido.',
    );
    await expectLinkedError(page, 'input[name="email"]', 'err-email', 'Ingresá un email válido.');
    await expectLinkedError(
      page,
      'input[name="password"]',
      'err-password',
      'Ingresá una contraseña de al menos 8 caracteres.',
    );

    // El foco fue al primer inválido del DOM (nombre y apellido).
    await expect(page.locator('input[name="displayName"]')).toBeFocused();

    await expectAxeClean(page, 'signup (con errores)');
  });

  test('setup: alta de familia para llegar al alta de paciente', async () => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /^Familiar/ }).click();
    await page.getByLabel('Nombre y apellido').fill(NAME);
    await page.getByLabel('Email').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
  });

  test('alta de paciente: sin enviar, sin aria-invalid ni aria-describedby', async () => {
    await page.goto('/app/patients/new');
    await expect(page.getByLabel('Nombre completo')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('input[name="fullName"]')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('input[name="fullName"]')).not.toHaveAttribute('aria-describedby');
  });

  test('alta de paciente: enviar vacío vincula cada error a su input y axe queda verde', async () => {
    await page.getByRole('button', { name: 'Registrar paciente' }).click();
    await expect(page).toHaveURL(/\/app\/patients\/new$/);

    await expectLinkedError(
      page,
      'input[name="fullName"]',
      'err-fullName',
      'Ingresá el nombre completo.',
    );
    await expectLinkedError(
      page,
      'input[name="birthDate"]',
      'err-birthDate',
      'Ingresá la fecha de nacimiento.',
    );
    await expectLinkedError(
      page,
      'input[name="mainCondition"]',
      'err-mainCondition',
      'Ingresá la condición principal.',
    );
    await expectLinkedError(
      page,
      'input[name="contactName"]',
      'err-contactName',
      'Ingresá el nombre del contacto.',
    );
    await expectLinkedError(
      page,
      'input[name="contactPhone"]',
      'err-contactPhone',
      'Ingresá el teléfono del contacto.',
    );

    await expectAxeClean(page, 'patients/new (con errores)');
  });

  test('alta de paciente: completar un campo suelta su aria-invalid y su describedby', async () => {
    await page.locator('input[name="fullName"]').fill('Rosa Díaz');

    await expect(page.locator('input[name="fullName"]')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('input[name="fullName"]')).not.toHaveAttribute('aria-describedby');
    await expect(page.locator('#err-fullName')).toHaveCount(0);
  });
});
