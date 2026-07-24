import AxeBuilder from '@axe-core/playwright';
import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-52 · Certificaciones del cuidador: catálogo finito + adjunto privado + aprobación por-cert.
 *
 * Circuito: el cuidador se registra y en el onboarding elige una certificación del CATÁLOGO y
 * adjunta su documento privado (PDF) → el admin revisa (ve el botón de descarga del documento) y
 * APRUEBA la certificación (step-up) → la familia ve esa certificación con su insignia en la ficha
 * del marketplace. axe sin violaciones serias en el paso de certificaciones y en el detalle admin.
 */
const run = Date.now();
const CAREGIVER_EMAIL = `cg-cert+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador Cert ${run}`;
const ZONE = `Núñez Cert ${run}`;
const CERT_LABEL = 'Título de Enfermería';

const PDF = Buffer.from('%PDF-1.4\nKER-52 certificado de prueba\n%%EOF', 'latin1');

async function expectAxeClean(page: Page, screen: string): Promise<void> {
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

test.describe.serial('KER-52 · Catálogo + adjunto privado + aprobación por-certificación', () => {
  let browser: Browser;
  let caregiverCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let familyCtx: BrowserContext;
  let caregiver: Page;
  let admin: Page;
  let family: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    caregiverCtx = await browser.newContext(E2E_CONTEXT);
    caregiver = await caregiverCtx.newPage();
  });

  test.afterAll(async () => {
    await caregiverCtx?.close();
    await adminCtx?.close();
    await familyCtx?.close();
  });

  test('a. el cuidador se registra y en el onboarding elige una certificación del catálogo + adjunta el documento', async () => {
    await caregiver.goto('/signup');
    await caregiver.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
    await caregiver.getByLabel('Email').fill(CAREGIVER_EMAIL);
    await caregiver.locator('input[type="password"]').fill(PASSWORD);
    await caregiver.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    // Paso 1: datos (nombre de la cuenta, foto opcional se omite).
    await expect(caregiver.getByText(CAREGIVER_NAME).first()).toBeVisible({ timeout: 15_000 });
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 2: especialidad.
    await caregiver.getByLabel('Adultos mayores').check();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 3: certificación del catálogo + documento privado (KER-52).
    // Nota: los campos usan [(ngModel)] + [name], que NgModel consume como input (no emite el
    // atributo name al DOM); por eso se localizan por su etiqueta (label implícita), no por name.
    await caregiver.getByRole('button', { name: '+ Agregar certificación' }).click();
    await caregiver.getByLabel('Tipo de certificación').selectOption('nursing-degree');
    await caregiver.getByLabel('Institución').fill('Universidad de Buenos Aires');
    await caregiver.getByLabel('Año').fill('2015');
    await caregiver.getByLabel('Documento (PDF o imagen)').setInputFiles({
      name: 'certificado.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect(caregiver.getByText(/adjuntado/)).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(caregiver, 'onboarding · certificaciones');
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 4: disponibilidad.
    await caregiver.getByRole('button', { name: 'Lunes' }).click();
    await caregiver.getByLabel('Desde').fill('09:00');
    await caregiver.getByLabel('Hasta').fill('17:00');
    await caregiver.getByRole('button', { name: 'Agregar horario' }).click();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 5: tarifa, zona y modalidad.
    await caregiver.getByLabel('Tarifa por hora').fill('4200');
    await caregiver.getByLabel('Zona', { exact: true }).fill(ZONE);
    await caregiver.getByLabel('A domicilio').check();
    await caregiver.getByRole('button', { name: 'Enviar postulación' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/profile$/, { timeout: 15_000 });
  });

  test('b. el admin aprueba la cuenta, ve el documento y aprueba la certificación (step-up)', async () => {
    adminCtx = await browser.newContext(E2E_CONTEXT);
    admin = await adminCtx.newPage();

    await admin.goto('/login');
    await admin.getByLabel('Email').fill('admin@test.com');
    await admin.locator('input[type="password"]').fill(PASSWORD);
    await admin.getByRole('button', { name: 'Ingresar' }).click();
    await expect(admin).toHaveURL(/\/admin\/pending$/, { timeout: 15_000 });

    const card = admin
      .locator('div.bg-surface')
      .filter({ hasText: CAREGIVER_NAME })
      .filter({ has: admin.getByRole('link', { name: 'Revisar' }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('link', { name: 'Revisar' }).click();
    await expect(admin).toHaveURL(/\/admin\/caregivers\//);

    // La certificación se ve con su tipo del catálogo, pendiente, y el botón para descargar el documento.
    const certItem = admin.locator('li').filter({ hasText: CERT_LABEL });
    await expect(certItem).toBeVisible({ timeout: 15_000 });
    await expect(certItem.getByRole('button', { name: 'Ver documento' })).toBeVisible();
    await expectAxeClean(admin, 'admin · detalle cuidador (certificaciones)');

    // Aprobar la cuenta (step-up). El botón "Aprobar" de la cuenta vive en la tarjeta de Acciones
    // (la última tarjeta con un botón "Aprobar"; las otras son las certificaciones pendientes).
    const accionesAprobar = admin
      .locator('div.bg-surface')
      .filter({ has: admin.getByRole('button', { name: 'Aprobar' }) })
      .last()
      .getByRole('button', { name: 'Aprobar' });
    await accionesAprobar.click();
    const stepUp = admin.getByRole('dialog', { name: 'Confirmá tu identidad' });
    await expect(stepUp).toBeVisible();
    await stepUp.locator('input[type="password"]').fill(PASSWORD);
    await stepUp.getByRole('button', { name: 'Confirmar' }).click();
    await expect(admin.getByText('Perfil aprobado: ya es visible en el marketplace.')).toBeVisible({
      timeout: 15_000,
    });

    // Aprobar la certificación individual. El token de step-up recién usado para aprobar la cuenta
    // queda cacheado (~5 min, KER-38/StepUpStore), así que esta acción lo reusa SIN volver a pedir
    // el password — no reaparece el modal; la certificación se aprueba directo.
    const certItem2 = admin.locator('li').filter({ hasText: CERT_LABEL });
    await certItem2.getByRole('button', { name: 'Aprobar' }).click();
    await expect(
      admin.getByText('Certificación aprobada: su insignia ya se ve en el marketplace.'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('c. la familia ve la certificación verificada con su insignia en la ficha del marketplace', async () => {
    familyCtx = await browser.newContext(E2E_CONTEXT);
    family = await familyCtx.newPage();

    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill(`Familia Cert ${run}`);
    await family.getByLabel('Email').fill(`fam-cert+${run}@e2e.com`);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await family.getByLabel('Zona').fill(ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();
    const cardLink = family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) });
    await expect(cardLink).toBeVisible({ timeout: 15_000 });
    await cardLink.click();
    await expect(family).toHaveURL(/\/app\/marketplace\/[0-9a-f-]{36}/);

    // La certificación aprobada aparece con su etiqueta del catálogo y la insignia "Verificada".
    const certRow = family.locator('li').filter({ hasText: CERT_LABEL });
    await expect(certRow).toBeVisible({ timeout: 15_000 });
    await expect(certRow.getByText('Verificada')).toBeVisible();
  });
});
