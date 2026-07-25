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

// KER-77: los íconos SVG son assets locales; nada debe pegarle a icons0.dev en runtime.
const externalIconRequests: string[] = [];
function watchExternalIcons(page: Page): void {
  page.on('request', (req) => {
    if (/icons0\.dev/i.test(req.url())) externalIconRequests.push(req.url());
  });
}

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
    watchExternalIcons(caregiver);
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
    watchExternalIcons(admin);

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
    // KER-77: la insignia se renderiza como ÍCONO SVG diseñado (no emoji), con su iconKey estable.
    await expect(certItem.locator('kr-cert-icon[data-cert-icon="stethoscope"] svg')).toBeVisible();
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

    // KER-82/87: el LISTADO de gestión (/admin/caregivers) muestra la insignia por-certificación
    // (con su estado) además de las de verificación, en el componente UNIFICADO kr-insignias.
    await admin.goto('/admin/caregivers');
    await admin.getByPlaceholder('Nombre o zona…').fill(CAREGIVER_NAME);
    await admin.getByRole('button', { name: 'Buscar' }).click();
    const adminRow = admin.locator('tr').filter({ hasText: CAREGIVER_NAME });
    await expect(adminRow).toBeVisible({ timeout: 15_000 });
    // La insignia por-cert se ve en la fila (ícono SVG del catálogo + etiqueta), en el componente unificado.
    await expect(
      adminRow.locator('kr-insignias kr-cert-icon[data-cert-icon="stethoscope"] svg'),
    ).toBeVisible();
    // KER-87: la certificación aprobada es una insignia VERIFICADA (dorada), con su aria-label propio.
    await expect(
      adminRow.locator(`[aria-label="Certificación verificada: ${CERT_LABEL}"]`),
    ).toBeVisible();
    await expectAxeClean(admin, 'admin · listado cuidadores (insignias unificadas)');
  });

  test('c. la familia ve la certificación verificada con su insignia en la ficha del marketplace', async () => {
    familyCtx = await browser.newContext(E2E_CONTEXT);
    family = await familyCtx.newPage();
    watchExternalIcons(family);

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

    // KER-82/87: la CARD del listado muestra la certificación aprobada como insignia VERIFICADA
    // (dorada) en el componente unificado kr-insignias: ícono SVG del catálogo + etiqueta + aria-label.
    await expect(
      cardLink.locator('kr-insignias kr-cert-icon[data-cert-icon="stethoscope"] svg'),
    ).toBeVisible();
    await expect(
      cardLink.locator(`[aria-label="Certificación verificada: ${CERT_LABEL}"]`),
    ).toBeVisible();
    // Esperar que la entrada (kr-stagger) asiente antes de axe: mid-fade el color se compone con el
    // fondo y el contraste cae (flake KER-72). Los chips usan tinte -50/texto-700 (holgura AA).
    await expect
      .poll(async () => cardLink.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await expectAxeClean(family, 'marketplace · card con insignia por-certificación');

    await cardLink.click();
    await expect(family).toHaveURL(/\/app\/marketplace\/[0-9a-f-]{36}/);

    // La certificación aprobada aparece como insignia VERIFICADA (dorada, KER-87) con su etiqueta del
    // catálogo, más institución y año. El realce "verificada" queda en el aria-label (no solo color).
    const certRow = family.locator('li').filter({ hasText: CERT_LABEL });
    await expect(certRow).toBeVisible({ timeout: 15_000 });
    await expect(
      certRow.locator(`[aria-label="Certificación verificada: ${CERT_LABEL}"]`),
    ).toBeVisible();
    // KER-77: la insignia pública es el ÍCONO SVG diseñado del catálogo (no emoji).
    await expect(certRow.locator('kr-cert-icon[data-cert-icon="stethoscope"] svg')).toBeVisible();
    // El ícono es decorativo (aria-hidden) y el nombre de la certificación lo acompaña como texto → axe verde.
    await expectAxeClean(family, 'marketplace · ficha pública (certificación con ícono SVG)');

    // KER-77: en ningún momento del circuito se pegó a icons0.dev (assets 100% locales).
    expect(externalIconRequests).toEqual([]);
  });
});
