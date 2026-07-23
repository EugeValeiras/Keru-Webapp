import AxeBuilder from '@axe-core/playwright';
import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-40 · Selector de paciente + "Mis contrataciones" por paciente activo (UC-22).
 *
 * Circuito: una cuenta de familia con DOS pacientes contrata al MISMO cuidador
 * para cada uno (una solicitud por paciente, UC-09). En "Mis contrataciones":
 *   - el selector de paciente (kr-patient-picker, no <select> nativo) filtra la
 *     lista al paciente activo;
 *   - "Todos los pacientes" muestra las dos;
 *   - axe queda verde (AA) con el picker cerrado y con el menú abierto.
 */
const run = Date.now();

const FAMILY_EMAIL = `sel-familia+${run}@e2e.com`;
const CAREGIVER_EMAIL = `sel-cuidador+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador Selector ${run}`;
const PATIENT_A = 'Elena Uno';
const PATIENT_B = 'Rosa Dos';
const ZONE = `Caballito Selector ${run}`;

/** datetime-local: 'YYYY-MM-DDTHH:mm' en hora local. */
function toLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

async function registerPatient(family: Page, fullName: string): Promise<void> {
  await family.goto('/app/patients/new');
  await expect(family.getByLabel('Nombre completo')).toBeVisible({ timeout: 15_000 });
  await family.getByLabel('Nombre completo').fill(fullName);
  await family.getByLabel('Fecha de nacimiento').fill('1950-05-10');
  await family.getByLabel('Condición principal').fill('Hipertensión');
  await family.getByLabel('Nombre', { exact: true }).fill('Contacto ' + fullName);
  await family.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0001');
  await family.getByRole('button', { name: 'Registrar paciente' }).click();
  await expect(family).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
  await expect(family.getByText(fullName).first()).toBeVisible({ timeout: 15_000 });
}

/** Manda una solicitud al cuidador para el paciente indicado (wizard UC-09). */
async function requestForPatient(family: Page, patientName: string): Promise<void> {
  await family.goto('/app/marketplace');
  await family.getByLabel('Zona').fill(ZONE);
  await family.getByRole('button', { name: 'Buscar' }).click();

  const card = family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await family.getByRole('link', { name: 'Solicitar cuidado' }).click();
  await expect(family).toHaveURL(/\/request$/);

  // Paso 1: elegir el paciente concreto.
  await family
    .locator('label')
    .filter({ hasText: patientName })
    .locator('input[type="radio"]')
    .check();
  await family.getByRole('button', { name: 'Continuar' }).click();

  // Paso 2: modalidad + fechas (mañana → +10 días).
  await family
    .locator('label')
    .filter({ hasText: 'A domicilio' })
    .locator('input[type="radio"]')
    .check();
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 10);
  await family.getByLabel('Desde').fill(toLocalDateTime(start));
  await family.getByLabel('Hasta').fill(toLocalDateTime(end));
  await family.getByRole('button', { name: 'Continuar' }).click();

  // Paso 3: teléfono.
  await family.getByLabel('Teléfono de contacto').fill('+54 11 5555-0002');
  await family.getByRole('button', { name: 'Continuar' }).click();

  // Paso 4: envío.
  await family.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(family).toHaveURL(/\/app\/hiring$/, { timeout: 15_000 });
}

test.describe.serial('KER-40 · Selector de paciente filtra "Mis contrataciones"', () => {
  let browser: Browser;
  let familyCtx: BrowserContext;
  let caregiverCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let family: Page;
  let caregiver: Page;
  let admin: Page;

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

  test('setup: familia con dos pacientes', async () => {
    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill('Familia Selector');
    await family.getByLabel('Email').fill(FAMILY_EMAIL);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await registerPatient(family, PATIENT_A);
    await registerPatient(family, PATIENT_B);
  });

  test('setup: cuidador aprobado', async () => {
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

    adminCtx = await browser.newContext(E2E_CONTEXT);
    admin = await adminCtx.newPage();
    await admin.goto('/login');
    await admin.getByLabel('Email').fill('admin@test.com');
    await admin.locator('input[type="password"]').fill('S3gura!123');
    await admin.getByRole('button', { name: 'Ingresar' }).click();
    await expect(admin).toHaveURL(/\/admin\/pending$/, { timeout: 15_000 });

    const pendingCard = admin
      .locator('div.bg-surface')
      .filter({ hasText: CAREGIVER_NAME })
      .filter({ has: admin.getByRole('link', { name: 'Revisar' }) });
    await expect(pendingCard).toBeVisible({ timeout: 15_000 });
    await pendingCard.getByRole('link', { name: 'Revisar' }).click();
    await expect(admin).toHaveURL(/\/admin\/caregivers\//);
    await admin.getByRole('button', { name: 'Aprobar' }).click();

    // KER-38: aprobar es operación sensible — step-up.
    const stepUp = admin.getByRole('dialog', { name: 'Confirmá tu identidad' });
    await expect(stepUp).toBeVisible();
    await stepUp.locator('input[type="password"]').fill('S3gura!123');
    await stepUp.getByRole('button', { name: 'Confirmar' }).click();
    await expect(
      admin.getByText('Perfil aprobado: ya es visible en el marketplace.'),
    ).toBeVisible();
  });

  test('setup: una contratación por paciente (mismo cuidador)', async () => {
    await requestForPatient(family, PATIENT_A);
    await requestForPatient(family, PATIENT_B);
  });

  test('el selector filtra "Mis contrataciones" por paciente activo', async () => {
    await family.goto('/app/hiring');

    const cards = family.getByTestId('card-patient');
    const trigger = family.getByRole('button', { name: /Cambiar de paciente/ });
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    // Elegir el paciente A: solo su contratación queda visible.
    await trigger.click();
    await family.getByRole('menuitemradio', { name: new RegExp(PATIENT_A) }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(PATIENT_A);
    await expect(family.getByText('Paciente: ' + PATIENT_B)).toHaveCount(0);

    // Cambiar al paciente B: la lista se filtra a su contratación.
    await trigger.click();
    await family.getByRole('menuitemradio', { name: new RegExp(PATIENT_B) }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(PATIENT_B);
    await expect(family.getByText('Paciente: ' + PATIENT_A)).toHaveCount(0);

    // "Todos los pacientes": las dos contrataciones.
    await family.getByTestId('scope-all').click();
    await expect(cards).toHaveCount(2);
    await expect(family.getByText('Paciente: ' + PATIENT_A)).toBeVisible();
    await expect(family.getByText('Paciente: ' + PATIENT_B)).toBeVisible();

    // Volver a elegir un paciente en el selector recupera el contexto por-paciente.
    await trigger.click();
    await family.getByRole('menuitemradio', { name: new RegExp(PATIENT_A) }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(PATIENT_A);
  });

  test('a11y: el selector es operable por teclado y axe queda verde', async () => {
    await family.goto('/app/hiring');
    const trigger = family.getByRole('button', { name: /Cambiar de paciente/ });
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    // axe con el picker cerrado.
    await expectAxeClean(family, 'hiring · picker cerrado');

    // Abrir con teclado (ArrowDown) y navegar/elegir con flechas + Enter.
    await trigger.focus();
    await family.keyboard.press('ArrowDown');
    const menu = family.getByRole('menu', { name: 'Elegí un paciente' });
    await expect(menu).toBeVisible();

    // axe con el menú abierto (roles menuitemradio, aria-checked).
    await expectAxeClean(family, 'hiring · picker abierto');

    // El foco arranca en el ítem activo; una flecha abajo mueve al siguiente.
    await family.keyboard.press('ArrowDown');
    await family.keyboard.press('Enter');
    await expect(menu).toBeHidden();

    // Escape cierra sin elegir y devuelve el foco al disparador.
    await trigger.click();
    await expect(menu).toBeVisible();
    await family.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
