import AxeBuilder from '@axe-core/playwright';
import { test, expect, Browser, BrowserContext, Page, Request } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * #49 · UC-19 A3 · El administrador edita por completo la información de un cuidador.
 *
 * Circuito contra el stack real:
 *   a. un cuidador se postula con una certificación del catálogo (documento privado adjunto);
 *   b. el admin aprueba la cuenta y la certificación (step-up);
 *   c. desde el detalle, «Editar» abre el formulario precargado (nombre, especialidad, certificación,
 *      disponibilidad, tarifa, zona, modalidad) — axe sin violaciones serias;
 *   c2. guardar SIN tocar nada no manda ningún PATCH ni pide step-up (toast «No había cambios»): el diff
 *      de disponibilidad compara slot a slot, no el jsonb con otro orden de claves;
 *   d. un intento con nombre vacío y tarifa 0 se señala en los campos y no persiste;
 *   e. el admin corrige nombre, zona, tarifa, especialidad y la institución de la certificación; al
 *      guardar, re-confirma la contraseña (step-up, contexto nuevo sin token cacheado), ve el toast y
 *      vuelve al detalle con los datos nuevos y el estado todavía «Aprobado»;
 *   e2. reintento tras un fallo parcial (el PATCH del perfil persistió, el de la certificación falló):
 *      el segundo guardado de tarifa viaja con OTRO operationId (versión nueva, NFR-03/23);
 *   f. la familia ve en la card y la ficha pública el nombre, la zona y la tarifa finales (UC-06/07).
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';
const ADMIN_EMAIL = 'admin@test.com';

const CAREGIVER_EMAIL = `cg-admin-edit+${run}@e2e.com`;
const CAREGIVER_NAME = `Cuidador Editable ${run}`;
const CAREGIVER_NEW_NAME = `Cuidador Corregido ${run}`;
const ZONE = `Villa Crespo Edit ${run}`;
const NEW_ZONE = `Colegiales Edit ${run}`;
const NEW_RATE = '6100';
const RETRY_RATE_1 = '5000';
const RETRY_RATE_2 = '5500';
const CERT_LABEL = 'Título de Enfermería';
const CERT_INSTITUTION = 'UBA';
const CERT_NEW_INSTITUTION = `Universidad Corregida ${run}`;
const CERT_RETRY_INSTITUTION = `Instituto Reintento ${run}`;

const PDF = Buffer.from('%PDF-1.4\n#49 certificado de prueba\n%%EOF', 'latin1');

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
      (v) =>
        `[${screen}] ${v.id} (${v.impact}): ${v.help} → ` +
        v.nodes.map((n) => n.target.join(' ')).join(' | '),
    ),
  ).toEqual([]);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin\/pending$/, { timeout: 15_000 });
}

/** Re-confirmación de contraseña (step-up, NFR-33) en el modal hosteado por el shell. */
async function confirmStepUp(page: Page): Promise<void> {
  const stepUp = page.getByRole('dialog', { name: 'Confirmá tu identidad' });
  await expect(stepUp).toBeVisible({ timeout: 15_000 });
  await stepUp.locator('input[type="password"]').fill(PASSWORD);
  await stepUp.getByRole('button', { name: 'Confirmar' }).click();
}

test.describe.serial('#49 · El administrador edita los datos de un cuidador aprobado (UC-19 A3)', () => {
  let browser: Browser;
  let caregiverCtx: BrowserContext;
  let approverCtx: BrowserContext;
  let editorCtx: BrowserContext;
  let familyCtx: BrowserContext;
  let caregiver: Page;
  let approver: Page;
  let editor: Page;
  let family: Page;
  let caregiverId: string;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    caregiverCtx = await browser.newContext(E2E_CONTEXT);
    caregiver = await caregiverCtx.newPage();
  });

  test.afterAll(async () => {
    await caregiverCtx?.close();
    await approverCtx?.close();
    await editorCtx?.close();
    await familyCtx?.close();
  });

  test('a. el cuidador se postula con una certificación del catálogo', async () => {
    await caregiver.goto('/signup');
    await caregiver.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
    await caregiver.getByLabel('Email').fill(CAREGIVER_EMAIL);
    await caregiver.locator('input[type="password"]').fill(PASSWORD);
    await caregiver.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    // Paso 1: datos (nombre de la cuenta; sin foto).
    await expect(caregiver.getByText(CAREGIVER_NAME).first()).toBeVisible({ timeout: 15_000 });
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 2: especialidad.
    await caregiver.getByLabel('Adultos mayores').check();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 3: una certificación del catálogo + documento privado.
    await caregiver.getByRole('button', { name: '+ Agregar certificación' }).click();
    await caregiver.getByLabel('Tipo de certificación').selectOption('nursing-degree');
    await caregiver.getByLabel('Institución').fill(CERT_INSTITUTION);
    await caregiver.getByLabel('Año').fill('2015');
    await caregiver
      .getByLabel('Documento (PDF o imagen)')
      .setInputFiles({ name: 'titulo.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(caregiver.getByText('titulo.pdf adjuntado')).toBeVisible({ timeout: 15_000 });
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 4: disponibilidad.
    await caregiver.getByRole('button', { name: 'Lunes' }).click();
    await caregiver.getByLabel('Desde').fill('09:00');
    await caregiver.getByLabel('Hasta').fill('17:00');
    await caregiver.getByRole('button', { name: 'Agregar horario' }).click();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 5: tarifa, zona y modalidad.
    await caregiver.getByLabel('Tarifa por hora').fill('4000');
    await caregiver.getByLabel('Zona', { exact: true }).fill(ZONE);
    await caregiver.getByLabel('A domicilio').check();
    await caregiver.getByRole('button', { name: 'Enviar postulación' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/profile$/, { timeout: 15_000 });
  });

  test('b. el admin aprueba la cuenta y la certificación (step-up)', async () => {
    approverCtx = await browser.newContext(E2E_CONTEXT);
    approver = await approverCtx.newPage();
    await loginAdmin(approver);

    const card = approver
      .locator('div.bg-surface')
      .filter({ hasText: CAREGIVER_NAME })
      .filter({ has: approver.getByRole('link', { name: 'Revisar' }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('link', { name: 'Revisar' }).click();
    await expect(approver).toHaveURL(/\/admin\/caregivers\/[0-9a-f-]+$/);
    caregiverId = approver.url().split('/').pop()!;

    // Aprobar la cuenta (botón de la sección Acciones, no el de la cert).
    await approver.getByRole('button', { name: 'Aprobar', exact: true }).last().click();
    await confirmStepUp(approver);
    await expect(approver.getByText('Perfil aprobado: ya es visible en el marketplace.')).toBeVisible();

    // Aprobar la certificación (el step-up queda cacheado en este contexto).
    const certRow = approver.locator('li').filter({ hasText: CERT_LABEL });
    await certRow.getByRole('button', { name: 'Aprobar' }).click();
    await expect(
      approver.getByText('Certificación aprobada: su insignia ya se ve en el marketplace.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(certRow.getByText('Verificada')).toBeVisible();
  });

  test('c. «Editar» abre el formulario precargado con los datos actuales (axe AA)', async () => {
    // Contexto NUEVO: sin token de step-up cacheado, así guardar exige re-confirmar la contraseña.
    editorCtx = await browser.newContext(E2E_CONTEXT);
    editor = await editorCtx.newPage();
    await loginAdmin(editor);

    await editor.goto(`/admin/caregivers/${caregiverId}`);
    await expect(editor.getByRole('heading', { name: CAREGIVER_NAME })).toBeVisible({ timeout: 15_000 });
    await editor.getByRole('link', { name: 'Editar' }).click();
    await expect(editor).toHaveURL(new RegExp(`/admin/caregivers/${caregiverId}/edit$`));
    await expect(editor.getByRole('heading', { name: 'Editar cuidador' })).toBeVisible({ timeout: 15_000 });

    // Precarga: identidad, especialidad, certificación, disponibilidad, tarifa, zona, modalidad.
    await expect(editor.getByLabel('Nombre y apellido')).toHaveValue(CAREGIVER_NAME);
    await expect(editor.getByRole('checkbox', { name: 'Adultos mayores' })).toBeChecked();
    await expect(editor.getByLabel('Institución')).toHaveValue(CERT_INSTITUTION);
    await expect(editor.getByLabel('Año')).toHaveValue('2015');
    await expect(editor.getByText('Verificada')).toBeVisible();
    await expect(editor.getByText(/Lunes/).first()).toBeVisible();
    await expect(editor.getByLabel('Tarifa por hora')).toHaveValue('4000');
    await expect(editor.getByLabel('Zona')).toHaveValue(ZONE);
    await expect(editor.getByRole('checkbox', { name: 'A domicilio' })).toBeChecked();

    await expectAxeClean(editor, 'admin/caregivers/:id/edit');
  });

  test('c2. guardar sin cambios no manda ningún PATCH ni pide step-up: toast «No había cambios» y vuelta al detalle', async () => {
    const patches: string[] = [];
    const onRequest = (req: Request) => {
      if (req.method() === 'PATCH' && req.url().includes('/api/v1/admin/caregivers/')) {
        patches.push(req.url());
      }
    };
    editor.on('request', onRequest);

    await editor.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(editor.getByText('No había cambios para guardar.')).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveURL(new RegExp(`/admin/caregivers/${caregiverId}$`), { timeout: 15_000 });
    editor.off('request', onRequest);
    // Ni un PATCH (la disponibilidad sin tocar NO cuenta como cambio) ni re-confirmación de contraseña.
    expect(patches).toEqual([]);
    await expect(editor.getByRole('dialog', { name: 'Confirmá tu identidad' })).toHaveCount(0);

    // De vuelta a la edición para los pasos siguientes.
    await editor.getByRole('link', { name: 'Editar' }).click();
    await expect(editor.getByRole('heading', { name: 'Editar cuidador' })).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByLabel('Tarifa por hora')).toHaveValue('4000');
  });

  test('d. nombre vacío y tarifa 0 se señalan en el campo y no persisten', async () => {
    await editor.getByLabel('Nombre y apellido').fill('');
    await editor.getByLabel('Tarifa por hora').fill('0');
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(editor.getByText('Ingresá el nombre y apellido.')).toBeVisible();
    await expect(editor.getByText('La tarifa tiene que ser mayor que 0.')).toBeVisible();
    await expect(editor.getByLabel('Nombre y apellido')).toHaveAttribute('aria-invalid', 'true');
    // No hubo step-up ni guardado: seguimos en la edición.
    await expect(editor.getByRole('dialog', { name: 'Confirmá tu identidad' })).toHaveCount(0);
    await expect(editor).toHaveURL(/\/edit$/);

    // Los errores con axe también limpios (mensajes vinculados por aria-describedby).
    await expectAxeClean(editor, 'admin/caregivers/:id/edit (errores)');
  });

  test('e. el admin corrige nombre, zona, tarifa, especialidad y la certificación; guarda con step-up y vuelve al detalle actualizado', async () => {
    await editor.getByLabel('Nombre y apellido').fill(CAREGIVER_NEW_NAME);
    // Checkbox por rol: «Cuidados paliativos» también aparece como opción del catálogo de certificaciones.
    await editor.getByRole('checkbox', { name: 'Cuidados paliativos' }).check();
    await editor.getByLabel('Institución').fill(CERT_NEW_INSTITUTION);
    await editor.getByLabel('Tarifa por hora').fill(NEW_RATE);
    await editor.getByLabel('Zona').fill(NEW_ZONE);
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();

    // Primera vez en este contexto: re-confirmación de contraseña (NFR-33).
    await confirmStepUp(editor);

    await expect(editor.getByText('Datos del cuidador actualizados.')).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveURL(new RegExp(`/admin/caregivers/${caregiverId}$`), { timeout: 15_000 });

    // El detalle muestra los datos nuevos sin recargar y el estado sigue «Aprobado».
    await expect(editor.getByRole('heading', { name: CAREGIVER_NEW_NAME })).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByText('Aprobado', { exact: true })).toBeVisible();
    await expect(editor.getByText(NEW_ZONE)).toBeVisible();
    await expect(editor.getByText(`$ ${NEW_RATE}/hora`)).toBeVisible();
    await expect(editor.getByText(`— ${CERT_NEW_INSTITUTION}, 2015`)).toBeVisible();
    await expect(editor.locator('li').filter({ hasText: CERT_LABEL }).getByText('Verificada')).toBeVisible();
    // La especialidad nueva aparece como insignia junto a la original.
    await expect(editor.getByText('Cuidados paliativos').first()).toBeVisible();
    await expect(editor.getByText('Adultos mayores').first()).toBeVisible();
  });

  test('e2. reintento tras un fallo parcial: el segundo guardado de tarifa usa OTRO operationId (versión nueva, NFR-03/23)', async () => {
    const operationIds: string[] = [];
    const profilePatch = new RegExp(`/api/v1/admin/caregivers/${caregiverId}$`);
    const onRequest = (req: Request) => {
      if (req.method() === 'PATCH' && profilePatch.test(req.url())) {
        operationIds.push((req.postDataJSON() as { operationId: string }).operationId);
      }
    };
    editor.on('request', onRequest);

    await editor.getByRole('link', { name: 'Editar' }).click();
    await expect(editor.getByRole('heading', { name: 'Editar cuidador' })).toBeVisible({ timeout: 15_000 });

    // Guardado #1: el PATCH del perfil (tarifa) persiste; el PATCH de la certificación falla (simulado).
    const certRoute = /\/api\/v1\/admin\/caregivers\/[^/]+\/certifications\//;
    await editor.route(certRoute, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Fallo simulado por el test' }),
      }),
    );
    await editor.getByLabel('Tarifa por hora').fill(RETRY_RATE_1);
    await editor.getByLabel('Institución').fill(CERT_RETRY_INSTITUTION);
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();
    // El step-up quedó cacheado en este contexto (paso e): no hay modal. El error se muestra y la página
    // sigue en edición con lo que el admin tenía cargado.
    await expect(editor.getByText('Fallo simulado por el test')).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveURL(/\/edit$/);
    await editor.unroute(certRoute);

    // Guardado #2: corrige la tarifa otra vez. Tiene que viajar con un operationId NUEVO (si reusara el
    // del guardado #1, la API devolvería la versión anterior y la tarifa vigente quedaría sin historial).
    await editor.getByLabel('Tarifa por hora').fill(RETRY_RATE_2);
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(editor.getByText('Datos del cuidador actualizados.')).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveURL(new RegExp(`/admin/caregivers/${caregiverId}$`), { timeout: 15_000 });
    editor.off('request', onRequest);

    expect(operationIds).toHaveLength(2);
    expect(operationIds[0]).not.toBe(operationIds[1]);
    await expect(editor.getByText(`$ ${RETRY_RATE_2}/hora`)).toBeVisible();
    await expect(editor.getByText(`— ${CERT_RETRY_INSTITUTION}, 2015`)).toBeVisible();
    await expect(editor.getByText('Aprobado', { exact: true })).toBeVisible();
  });

  test('f. la familia ve el nombre, la zona y la tarifa finales en la card y la ficha del marketplace', async () => {
    familyCtx = await browser.newContext(E2E_CONTEXT);
    family = await familyCtx.newPage();

    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill(`Familia Edit ${run}`);
    await family.getByLabel('Email').fill(`fam-admin-edit+${run}@e2e.com`);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    // Card: se encuentra por la zona NUEVA y muestra el nombre NUEVO (el viejo no aparece).
    await family.getByLabel('Zona').fill(NEW_ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();
    const cardLink = family.getByRole('link', { name: new RegExp(CAREGIVER_NEW_NAME) });
    await expect(cardLink).toBeVisible({ timeout: 15_000 });
    await expect(family.getByRole('link', { name: new RegExp(CAREGIVER_NAME + '$') })).toHaveCount(0);

    // Ficha pública (UC-07): identidad, zona, tarifa vigente y la certificación corregida, verificada.
    await cardLink.click();
    await expect(family.getByRole('heading', { name: CAREGIVER_NEW_NAME })).toBeVisible({ timeout: 15_000 });
    await expect(family.getByText(NEW_ZONE).first()).toBeVisible();
    await expect(family.getByText(`$ ${RETRY_RATE_2}`).first()).toBeVisible();
    await expect(family.getByText(CERT_RETRY_INSTITUTION)).toBeVisible();
  });
});
