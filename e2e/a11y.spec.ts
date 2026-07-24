import AxeBuilder from '@axe-core/playwright';
import { test, expect, Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * Pasada de accesibilidad WCAG AA (KER-8) sobre el circuito principal:
 *   1. axe (wcag2a/aa + wcag21a/aa) sin violaciones críticas ni serias en cada pantalla.
 *   2. Flujo de contratación completable SOLO con teclado (Tab/flechas/Espacio/Enter).
 *   3. Modales con focus trap y Escape para cerrar (y la campana cierra con Escape).
 *
 * El setup de datos (signup, onboarding, aprobación) replica el circuito y usa
 * mouse: lo auditado por teclado es el flujo de contratación de la familia.
 */
const run = Date.now();

const FAMILY_EMAIL = `a11y-familia+${run}@e2e.com`;
const CAREGIVER_EMAIL = `a11y-cuidador+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador A11y ${run}`;
const PATIENT_NAME = 'Elena A11y';
const ZONE = `Belgrano A11y ${run}`;

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

/** Tabea hasta que el target tenga foco; falla si no es alcanzable (orden de foco). */
async function tabTo(page: Page, target: Locator, maxTabs = 50): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const focused = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (focused) {
      return;
    }
  }
  throw new Error(`No se alcanzó el elemento con Tab (${maxTabs} intentos)`);
}

/**
 * Setea un datetime-local YA enfocado por Tab. El editor de segmentos
 * (tipeo de dígitos/flechas) es UI interna del navegador y el Chromium de
 * Playwright no lo trae en headless: lo que auditamos acá es que el campo sea
 * alcanzable por teclado (orden de foco); el valor se setea con fill().
 */
async function fillFocusedDateTime(target: Locator, date: Date): Promise<void> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const value =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  await target.fill(value);
}

test.describe.serial('Accesibilidad WCAG AA del circuito principal', () => {
  let browser: Browser;
  let familyCtx: BrowserContext;
  let caregiverCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let family: Page;
  let caregiver: Page;
  let admin: Page;
  let caregiverId: string;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    familyCtx = await browser.newContext(E2E_CONTEXT);
    family = await familyCtx.newPage();
  });

  test.afterAll(async () => {
    await familyCtx?.close();
    await caregiverCtx?.close();
    await adminCtx?.close();
  });

  test('axe: pantallas públicas (login y signup)', async () => {
    await family.goto('/login');
    await expect(family.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await expectAxeClean(family, 'login');

    await family.goto('/signup');
    await expect(family.getByRole('button', { name: /^Familiar/ })).toBeVisible();
    await expectAxeClean(family, 'signup');
  });

  test('setup familia + axe: pacientes y alta de paciente', async () => {
    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill('Familia A11y');
    await family.getByLabel('Email').fill(FAMILY_EMAIL);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await family.goto('/app/patients/new');
    await expect(family.getByLabel('Nombre completo')).toBeVisible();
    await expectAxeClean(family, 'patients/new');

    await family.getByLabel('Nombre completo').fill(PATIENT_NAME);
    await family.getByLabel('Fecha de nacimiento').fill('1950-05-10');
    await family.getByLabel('Condición principal').fill('Hipertensión');
    await family.getByLabel('Nombre', { exact: true }).fill('María A11y');
    await family.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0001');
    await family.getByRole('button', { name: 'Registrar paciente' }).click();

    await expect(family).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
    await expect(family.getByText(PATIENT_NAME)).toBeVisible();
    await expectAxeClean(family, 'patients');
  });

  test('setup cuidador + axe: onboarding', async () => {
    caregiverCtx = await browser.newContext(E2E_CONTEXT);
    caregiver = await caregiverCtx.newPage();

    await caregiver.goto('/signup');
    await caregiver.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
    await caregiver.getByLabel('Email').fill(CAREGIVER_EMAIL);
    await caregiver.locator('input[type="password"]').fill(PASSWORD);
    await caregiver.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    const nameInput = caregiver.getByLabel('Nombre a mostrar');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(caregiver, 'caregiver/onboarding paso 1');

    await nameInput.fill(CAREGIVER_NAME);
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    await caregiver.getByLabel('Adultos mayores').check();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    await expect(caregiver.getByText('Sumá tus certificaciones')).toBeVisible();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    await caregiver.getByLabel('Desde').fill('09:00');
    await caregiver.getByLabel('Hasta').fill('17:00');
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    await caregiver.getByLabel('Tarifa por hora').fill('4000');
    await caregiver.getByLabel('Zona', { exact: true }).fill(ZONE);
    await caregiver.getByLabel('A domicilio').check();
    await caregiver.getByRole('button', { name: 'Enviar postulación' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/profile$/, { timeout: 15_000 });
  });

  test('admin aprueba + axe: bandeja de pendientes', async () => {
    adminCtx = await browser.newContext(E2E_CONTEXT);
    admin = await adminCtx.newPage();

    await admin.goto('/login');
    await admin.getByLabel('Email').fill('admin@test.com');
    await admin.locator('input[type="password"]').fill('S3gura!123');
    await admin.getByRole('button', { name: 'Ingresar' }).click();
    await expect(admin).toHaveURL(/\/admin\/pending$/, { timeout: 15_000 });

    const card = admin
      .locator('div.bg-surface')
      .filter({ hasText: CAREGIVER_NAME })
      .filter({ has: admin.getByRole('link', { name: 'Revisar' }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(admin, 'admin/pending');

    await card.getByRole('link', { name: 'Revisar' }).click();
    await expect(admin).toHaveURL(/\/admin\/caregivers\//);
    await admin.getByRole('button', { name: 'Aprobar' }).click();

    // KER-38 (NFR-33): aprobar pide re-confirmación de identidad — axe también sobre el modal.
    const stepUp = admin.getByRole('dialog', { name: 'Confirmá tu identidad' });
    await expect(stepUp).toBeVisible();
    await expectAxeClean(admin, 'step-up-modal');
    await stepUp.locator('input[type="password"]').fill('S3gura!123');
    await stepUp.getByRole('button', { name: 'Confirmar' }).click();

    await expect(
      admin.getByText('Perfil aprobado: ya es visible en el marketplace.'),
    ).toBeVisible();
  });

  test('flujo de contratación completo SOLO con teclado', async () => {
    await family.goto('/app/marketplace');
    await expect(family.getByLabel('Zona')).toBeVisible();

    // Buscar por zona: Tab hasta el filtro, tipear, Enter en "Buscar".
    await tabTo(family, family.getByLabel('Zona'));
    await family.keyboard.type(ZONE);
    await tabTo(family, family.getByRole('button', { name: 'Buscar' }), 10);
    await family.keyboard.press('Enter');

    // Card del cuidador: link alcanzable por Tab, se abre con Enter.
    const card = family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await tabTo(family, card);
    await family.keyboard.press('Enter');
    await expect(family).toHaveURL(/\/app\/marketplace\/[^/]+$/, { timeout: 15_000 });
    caregiverId = family.url().split('/').pop()!;

    // "Solicitar cuidado" con Enter.
    const requestLink = family.getByRole('link', { name: 'Solicitar cuidado' });
    await expect(requestLink).toBeVisible();
    await tabTo(family, requestLink);
    await family.keyboard.press('Enter');
    await expect(family).toHaveURL(/\/request$/);

    // axe del wizard (paso 1) antes de seguir.
    const patientRadio = family
      .locator('label')
      .filter({ hasText: PATIENT_NAME })
      .locator('input[type="radio"]');
    await expect(patientRadio).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(family, 'request-wizard paso 1');

    // Paso 1: elegir paciente con Espacio.
    await tabTo(family, patientRadio);
    await family.keyboard.press('Space');
    await expect(patientRadio).toBeChecked();
    const nextBtn = family.getByRole('button', { name: 'Continuar' });
    await tabTo(family, nextBtn);
    await family.keyboard.press('Enter');

    // Paso 2: modalidad con Espacio (primer radio del grupo) y fechas tipeadas.
    const homeRadio = family
      .locator('label')
      .filter({ hasText: 'A domicilio' })
      .locator('input[type="radio"]');
    await expect(homeRadio).toBeVisible();
    await tabTo(family, homeRadio);
    await family.keyboard.press('Space');
    await expect(homeRadio).toBeChecked();

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 10);

    await tabTo(family, family.getByLabel('Desde'), 10);
    await fillFocusedDateTime(family.getByLabel('Desde'), start);
    await tabTo(family, family.getByLabel('Hasta'), 10);
    await fillFocusedDateTime(family.getByLabel('Hasta'), end);
    await tabTo(family, family.getByRole('button', { name: 'Continuar' }));
    await family.keyboard.press('Enter');

    // Paso 3: teléfono.
    const phone = family.getByLabel('Teléfono de contacto');
    await expect(phone).toBeVisible();
    await tabTo(family, phone);
    await family.keyboard.type('+54 11 5555-0002');
    await tabTo(family, family.getByRole('button', { name: 'Continuar' }));
    await family.keyboard.press('Enter');

    // Paso 4: resumen y envío con Enter.
    const submit = family.getByRole('button', { name: 'Enviar solicitud' });
    await expect(submit).toBeVisible();
    await expectAxeClean(family, 'request-wizard resumen');
    await tabTo(family, submit);
    await family.keyboard.press('Enter');

    await expect(family).toHaveURL(/\/app\/hiring$/, { timeout: 15_000 });
    await expect(family.locator('kr-badge', { hasText: 'Pendiente' })).toBeVisible();
  });

  test('axe: contrataciones, marketplace con resultados y solicitudes del cuidador', async () => {
    await expectAxeClean(family, 'hiring');

    await family.goto('/app/marketplace');
    await family.getByLabel('Zona').fill(ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();
    await expect(family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) })).toBeVisible({
      timeout: 15_000,
    });
    await expectAxeClean(family, 'marketplace');

    await family.goto(`/app/marketplace/${caregiverId}`);
    await expect(family.getByRole('link', { name: 'Solicitar cuidado' })).toBeVisible({
      timeout: 15_000,
    });
    await expectAxeClean(family, 'caregiver-detail');

    await caregiver.goto('/caregiver/requests');
    await expect(caregiver.getByRole('button', { name: 'Aceptar' })).toBeVisible({
      timeout: 15_000,
    });
    // KER-56 · el badge de solicitudes pendientes expone el conteo por aria-label (no solo color)
    // y queda cubierto por esta pasada axe.
    await expect(caregiver.getByRole('link', { name: /^Solicitudes,.*pendiente/ })).toBeVisible();
    await expectAxeClean(caregiver, 'caregiver/requests');
  });

  test('vitales con alerta + axe: registro, dashboard y panel de campana', async () => {
    await family.goto('/app/patients');
    await family.getByText(PATIENT_NAME, { exact: true }).first().click();
    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    await family.getByRole('link', { name: 'Registrar vitales' }).first().click();
    await expect(family).toHaveURL(/\/record\/vitals$/);
    await family.getByLabel('Presión sistólica').fill('170');
    await expect(family.getByText('Este valor va a generar una alerta.')).toBeVisible();
    await expectAxeClean(family, 'record/vitals');

    await family.getByLabel('Frecuencia cardíaca').fill('70');
    await family.getByRole('button', { name: 'Guardar vitales' }).click();
    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await expectAxeClean(family, 'patient-dashboard');

    // Campana con el panel abierto (remonta el store para refrescar el badge).
    await family.goto('/app/patients');
    const bell = family.getByRole('button', { name: 'Notificaciones' });
    await expect(bell.locator('span.absolute')).toBeVisible({ timeout: 20_000 });
    await bell.click();
    await expect(family.getByRole('heading', { name: 'Notificaciones' })).toBeVisible();
    await expectAxeClean(family, 'campana abierta');

    // Escape cierra el panel y devuelve el foco a la campana.
    await family.keyboard.press('Escape');
    await expect(family.getByRole('heading', { name: 'Notificaciones' })).toBeHidden();
    await expect(bell).toBeFocused();
  });

  test('modal: focus trap, Escape y foco restaurado', async () => {
    await family.goto('/app/patients');
    const inviteBtn = family.getByRole('button', { name: 'Invitar familiar' }).first();
    await expect(inviteBtn).toBeVisible({ timeout: 15_000 });

    // Abrir con teclado.
    await tabTo(family, inviteBtn);
    await family.keyboard.press('Enter');
    const dialog = family.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Foco inicial dentro del modal.
    expect(await family.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );

    // axe con el modal abierto.
    await expectAxeClean(family, 'invite-modal abierto');

    // Focus trap: 10 Tabs y el foco nunca sale del diálogo.
    for (let i = 0; i < 10; i++) {
      await family.keyboard.press('Tab');
      expect(
        await family.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
      ).toBe(true);
    }
    // También hacia atrás.
    for (let i = 0; i < 3; i++) {
      await family.keyboard.press('Shift+Tab');
      expect(
        await family.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
      ).toBe(true);
    }

    // Escape cierra y el foco vuelve al disparador.
    await family.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(inviteBtn).toBeFocused();
  });
});
