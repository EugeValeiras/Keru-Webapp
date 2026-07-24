import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-54 · ADR-0003 · Una sola fuente de verdad de identidad (nombre/avatar) entre la cuenta y el
 * perfil de cuidador. La identidad canónica vive en la cuenta; el perfil de cuidador la deriva.
 * Editar nombre/foto en "Mi perfil" (UC-23) se ve igual en el encabezado y en el marketplace/ficha.
 *
 * Circuito: cuidador (signup + onboarding con foto) → admin aprueba → la familia ve su card en el
 * marketplace con esa identidad → el cuidador cambia su nombre en "Mi perfil" → el encabezado se
 * actualiza y la familia ve el nombre nuevo en la card (misma identidad, sin campos duplicados).
 */
const run = Date.now();
const CAREGIVER_EMAIL = `cg-identidad+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador Identidad ${run}`;
const CAREGIVER_NEW_NAME = `Cuidador Renombrado ${run}`;
const ZONE = `Caballito E2E ${run}`;

// PNG 1x1 válido (kr-photo-input valida tipo/tamaño; la API lo sube a floci/S3).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

test.describe.serial('KER-54 · Identidad unificada cuenta↔perfil de cuidador (ADR-0003)', () => {
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

  test('a. cuidador se registra y hace el onboarding con foto (la foto es identidad de la cuenta)', async () => {
    await caregiver.goto('/signup');
    await caregiver.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
    await caregiver.getByLabel('Email').fill(CAREGIVER_EMAIL);
    await caregiver.locator('input[type="password"]').fill(PASSWORD);
    await caregiver.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(caregiver).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    // Paso 1: el nombre a mostrar es el de la cuenta (solo lectura); subo la foto (avatar de cuenta).
    await expect(caregiver.getByText(CAREGIVER_NAME).first()).toBeVisible({ timeout: 15_000 });
    await caregiver.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    // KER-48: elegir la imagen abre el recorte circular; se confirma para subir.
    const cropper = caregiver.getByRole('dialog', { name: 'Ajustá tu foto' });
    await expect(cropper).toBeVisible({ timeout: 15_000 });
    await cropper.getByRole('button', { name: 'Recortar y subir' }).click();
    await expect(caregiver.getByAltText('Foto de perfil')).toBeVisible({ timeout: 15_000 });
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 2: especialidad
    await caregiver.getByLabel('Adultos mayores').check();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 3: certificaciones (ninguna)
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 4: disponibilidad (KER-53) — elegir un día, poner el rango y aplicarlo.
    await caregiver.getByRole('button', { name: 'Lunes' }).click();
    await caregiver.getByLabel('Desde').fill('09:00');
    await caregiver.getByLabel('Hasta').fill('17:00');
    await caregiver.getByRole('button', { name: 'Agregar horario' }).click();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 5: tarifa, zona y modalidad
    await caregiver.getByLabel('Tarifa por hora').fill('4000');
    await caregiver.getByLabel('Zona', { exact: true }).fill(ZONE);
    await caregiver.getByLabel('A domicilio').check();
    await caregiver.getByRole('button', { name: 'Enviar postulación' }).click();

    await expect(caregiver).toHaveURL(/\/caregiver\/profile$/, { timeout: 15_000 });
  });

  test('b. admin aprueba la postulación (step-up)', async () => {
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
    await admin.getByRole('button', { name: 'Aprobar' }).click();

    const stepUp = admin.getByRole('dialog', { name: 'Confirmá tu identidad' });
    await expect(stepUp).toBeVisible();
    await stepUp.locator('input[type="password"]').fill(PASSWORD);
    await stepUp.getByRole('button', { name: 'Confirmar' }).click();
    await expect(admin.getByText('Perfil aprobado: ya es visible en el marketplace.')).toBeVisible();
  });

  test('c. la familia ve la card del marketplace con la identidad de la cuenta (nombre + foto)', async () => {
    familyCtx = await browser.newContext(E2E_CONTEXT);
    family = await familyCtx.newPage();

    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill(`Familia Identidad ${run}`);
    await family.getByLabel('Email').fill(`fam-identidad+${run}@e2e.com`);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await family.getByLabel('Zona').fill(ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();

    const cardLink = family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) });
    await expect(cardLink).toBeVisible({ timeout: 15_000 });
    // La foto de la card es la de la cuenta (img con alt = nombre).
    await expect(family.locator(`img[alt="${CAREGIVER_NAME}"]`).first()).toBeVisible();
  });

  test('d. el cuidador cambia su nombre en "Mi perfil" y el encabezado se actualiza', async () => {
    await caregiver.getByRole('button', { name: /Tu cuenta/ }).click();
    await caregiver.getByRole('menuitem', { name: 'Mi perfil' }).click();
    await expect(caregiver).toHaveURL(/\/perfil$/, { timeout: 15_000 });

    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NEW_NAME);
    await caregiver.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(caregiver.getByText('Perfil actualizado')).toBeVisible({ timeout: 15_000 });

    // El encabezado (identidad de la cuenta) muestra el nombre nuevo sin recargar.
    await expect(
      caregiver.getByRole('button', { name: new RegExp('Tu cuenta: ' + CAREGIVER_NEW_NAME) }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('e. coherencia: la familia ve el NOMBRE NUEVO en el marketplace (misma identidad)', async () => {
    await family.goto('/app/marketplace');
    await family.getByLabel('Zona').fill(ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();

    // La card ahora muestra el nombre nuevo editado por la cuenta: identidad unificada, sin duplicación.
    await expect(family.getByRole('link', { name: new RegExp(CAREGIVER_NEW_NAME) })).toBeVisible({
      timeout: 15_000,
    });
    await expect(family.locator(`img[alt="${CAREGIVER_NEW_NAME}"]`).first()).toBeVisible();
    // Y el nombre viejo ya no aparece (no hay copia divergente en el perfil de cuidador).
    await expect(family.getByRole('link', { name: new RegExp(CAREGIVER_NAME + '$') })).toHaveCount(0);
  });
});
