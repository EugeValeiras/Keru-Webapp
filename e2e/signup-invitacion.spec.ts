import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-67 · UC-03 A1 · Registro POR INVITACIÓN pre-configurado. Desde el deep link /invite/:token,
 * el signup debe traer el email prellenado+bloqueado, el tipo de cuenta autoseleccionado `family`
 * y bloqueado, el rol del vínculo (roleToGrant) informativo, y el nombre editable. El signup NORMAL
 * (sin invitación) mantiene todo editable. El token viaja por email/link y no es criptográficamente
 * legible acá, así que stubbeamos el preview con page.route (patrón KER-63) para ejercer la rama de
 * forma determinista sin depender de una invitación real del backend.
 */

const INVITED_EMAIL = 'invitada@e2e.keru.test';
const TOKEN = 'tok-e2e-signup-invite';
const PATIENT_NAME = 'Rosa Domínguez';

/** Preview determinista: pendiente, no expirado, con roleToGrant. */
async function stubPreview(page: Page, roleToGrant: 'manager' | 'viewer'): Promise<void> {
  await page.route(`**/api/v1/invitations/${TOKEN}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        patientId: 'pat-e2e',
        patientName: PATIENT_NAME,
        invitedEmail: INVITED_EMAIL,
        roleToGrant,
        expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
        valid: true,
      }),
    }),
  );
}

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    severe.map(
      (v) => `[${screen}] ${v.id} (${v.impact}): ${v.help} → ` + v.nodes.map((n) => n.target.join(' ')).join(' | '),
    ),
  ).toEqual([]);
}

test('por invitación: email prellenado+bloqueado, tipo de cuenta family bloqueado, rol del vínculo informativo, nombre editable', async ({
  page,
}) => {
  await stubPreview(page, 'viewer');

  // Arranca en la landing del deep link (sin sesión) y elige "Crear cuenta".
  await page.goto(`/invite/${TOKEN}`);
  await expect(page.getByText(`Te invitaron a acompañar a ${PATIENT_NAME} en Keru`)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/signup/);

  // Email: prellenado con el invitado y NO editable (readonly), pero presente (envía su valor).
  const email = page.getByLabel('Email');
  await expect(email).toHaveValue(INVITED_EMAIL);
  await expect(email).toHaveAttribute('readonly', '');
  await expect(page.getByText('Es el email de tu invitación y no se puede cambiar.')).toBeVisible();

  // Tipo de cuenta: autoseleccionado Familiar y bloqueado (no hay selector de rol de cuenta).
  await expect(page.getByText('Tipo de cuenta')).toBeVisible();
  await expect(page.getByText('Te sumás al círculo de cuidado de un ser querido.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Cuidador\/a/ })).toHaveCount(0);
  // Rol del vínculo informativo (viewer → "Solo ver").
  await expect(page.getByText('Solo ver')).toBeVisible();

  // Nombre: editable.
  const name = page.getByLabel('Nombre y apellido');
  await expect(name).not.toHaveAttribute('readonly', '');
  await name.fill('Ana Invitada');
  await expect(name).toHaveValue('Ana Invitada');

  await expectAxeClean(page, 'signup-invitacion');
});

test('signup normal (sin invitación): email, tipo de usuario y nombre todos editables', async ({ page }) => {
  await page.goto('/signup');

  // Email editable (sin readonly).
  const email = page.getByLabel('Email');
  await expect(email).not.toHaveAttribute('readonly', '');
  await email.fill('nueva@e2e.keru.test');
  await expect(email).toHaveValue('nueva@e2e.keru.test');

  // El selector de rol de cuenta ofrece Familiar y Cuidador/a (elegibles).
  await expect(page.getByRole('button', { name: /^Familiar/ })).toBeVisible();
  const caregiver = page.getByRole('button', { name: /^Cuidador\/a/ });
  await expect(caregiver).toBeVisible();
  await caregiver.click();
  await expect(caregiver).toHaveAttribute('aria-pressed', 'true');

  // Nombre editable.
  await page.getByLabel('Nombre y apellido').fill('Nueva Persona');
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue('Nueva Persona');
});
