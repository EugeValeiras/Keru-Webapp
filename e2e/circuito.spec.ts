import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * Circuito completo del MVP por UI, con tres actores en contextos separados:
 *   familia (signup nuevo) → alta paciente → cuidador (signup + onboarding) →
 *   admin aprueba → familia contrata → cuidador acepta → familia registra
 *   vitales (alerta) → campana → cierre (finalizar + reseña).
 *
 * Los emails son únicos por corrida para no chocar con datos previos.
 */
const run = Date.now();

const FAMILY_EMAIL = `familia+${run}@e2e.com`;
const CAREGIVER_EMAIL = `cuidador+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador E2E ${run}`;
const PATIENT_NAME = 'Elena Test';
// Zona única por corrida (como en a11y.spec): con zona fija, las corridas
// acumulan cuidadores y el nuevo cae detrás del corte de "Mostrar más" (50).
const ZONE = `Belgrano E2E ${run}`;

/** datetime-local: 'YYYY-MM-DDTHH:mm' en hora local. */
function toLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe.serial('Circuito MVP Keru', () => {
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

  test('a. signup de familia aterriza en marketplace', async () => {
    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill('Familia E2E');
    await family.getByLabel('Email').fill(FAMILY_EMAIL);
    await family.locator('input[type="password"]').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
  });

  test('b. alta de paciente y card visible', async () => {
    await family.goto('/app/patients');
    // Sin pacientes hay dos links "Registrar paciente" (header + empty state).
    await family.getByRole('link', { name: 'Registrar paciente' }).first().click();
    await expect(family).toHaveURL(/\/app\/patients\/new$/);

    await family.getByLabel('Nombre completo').fill(PATIENT_NAME);
    await family.getByLabel('Fecha de nacimiento').fill('1950-05-10');
    await family.getByLabel('Condición principal').fill('Hipertensión');
    await family.getByLabel('Nombre', { exact: true }).fill('María Test');
    await family.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0001');
    await family.getByRole('button', { name: 'Registrar paciente' }).click();

    await expect(family).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
    await expect(family.getByText(PATIENT_NAME)).toBeVisible();
  });

  test('c. signup de cuidador y onboarding completo', async () => {
    caregiverCtx = await browser.newContext(E2E_CONTEXT);
    caregiver = await caregiverCtx.newPage();

    await caregiver.goto('/signup');
    await caregiver.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await caregiver.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
    await caregiver.getByLabel('Email').fill(CAREGIVER_EMAIL);
    await caregiver.locator('input[type="password"]').fill(PASSWORD);
    await caregiver.getByRole('button', { name: 'Crear cuenta' }).click();

    // Sin perfil, el shell del cuidador termina en el onboarding.
    await expect(caregiver).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    // Paso 1: datos. El nombre a mostrar es el de la cuenta (ADR-0003), no un input editable:
    // se muestra de solo lectura y ya viene del signup (CAREGIVER_NAME).
    await expect(caregiver.getByText(CAREGIVER_NAME).first()).toBeVisible({ timeout: 15_000 });
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 2: especialidades (>= 1)
    await caregiver.getByLabel('Adultos mayores').check();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 3: certificaciones (ninguna)
    await expect(caregiver.getByText('Sumá tus certificaciones')).toBeVisible();
    await caregiver.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 4: disponibilidad (>= 1) — KER-53: elegir día(s) + rango y aplicar.
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
    await expect(caregiver.getByText('Tu perfil está en revisión.')).toBeVisible();
  });

  test('d. admin aprueba la postulación', async () => {
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
    await card.getByRole('link', { name: 'Revisar' }).click();

    await expect(admin).toHaveURL(/\/admin\/caregivers\//);
    await admin.getByRole('button', { name: 'Aprobar' }).click();

    // KER-38 (NFR-33): aprobar es operación sensible — re-confirmación de identidad (step-up).
    const stepUp = admin.getByRole('dialog', { name: 'Confirmá tu identidad' });
    await expect(stepUp).toBeVisible();
    await stepUp.locator('input[type="password"]').fill('S3gura!123');
    await stepUp.getByRole('button', { name: 'Confirmar' }).click();

    await expect(
      admin.getByText('Perfil aprobado: ya es visible en el marketplace.'),
    ).toBeVisible();
  });

  test('e. familia busca por zona y envía la solicitud', async () => {
    await family.goto('/app/marketplace');
    // KER-56 · el rol familia no tiene bandeja de solicitudes → su nav no muestra badge de conteo.
    await expect(family.locator('header nav kr-badge')).toHaveCount(0);
    await family.getByLabel('Zona').fill(ZONE);
    await family.getByRole('button', { name: 'Buscar' }).click();

    const card = family.getByRole('link', { name: new RegExp(CAREGIVER_NAME) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await family.getByRole('link', { name: 'Solicitar cuidado' }).click();
    await expect(family).toHaveURL(/\/request$/);

    // Paso 1: paciente
    const patientOption = family.locator('label').filter({ hasText: PATIENT_NAME });
    await expect(patientOption).toBeVisible({ timeout: 15_000 });
    await patientOption.locator('input[type="radio"]').check();
    await family.getByRole('button', { name: 'Continuar' }).click();

    // Paso 2: modalidad y fechas (mañana → +10 días)
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

    // Paso 3: teléfono
    await family.getByLabel('Teléfono de contacto').fill('+54 11 5555-0002');
    await family.getByRole('button', { name: 'Continuar' }).click();

    // Paso 4: resumen + envío
    await family.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(family).toHaveURL(/\/app\/hiring$/, { timeout: 15_000 });
    await expect(family.locator('kr-badge', { hasText: 'Pendiente' })).toBeVisible();
  });

  test('f. cuidador acepta la solicitud', async () => {
    await caregiver.goto('/caregiver/requests');
    const acceptBtn = caregiver.getByRole('button', { name: 'Aceptar' });
    await expect(acceptBtn).toBeVisible({ timeout: 15_000 });

    // KER-56 · con 1 solicitud pendiente, el badge de la nav muestra el conteo (aria-label + número).
    const requestsNav = caregiver.getByRole('link', { name: /^Solicitudes/ });
    await expect(requestsNav).toHaveAttribute('aria-label', 'Solicitudes, 1 pendiente');
    await expect(requestsNav.locator('kr-badge')).toHaveText('1');

    await acceptBtn.click();

    // El filtro queda en "Pendiente"; pasar a "Aceptada" y verificar el estado.
    await expect(caregiver.getByText('Sin solicitudes por ahora')).toBeVisible({
      timeout: 15_000,
    });

    // KER-56 · al aceptar, el conteo baja a 0 → el badge desaparece de la nav.
    await expect(requestsNav.locator('kr-badge')).toHaveCount(0);

    await caregiver.getByRole('button', { name: 'Aceptada', exact: true }).click();
    await expect(caregiver.locator('kr-badge', { hasText: 'Aceptada' })).toBeVisible();
  });

  test('f2. Mis servicios (KER-57): inicio futuro → "Comienza el", lectura habilitada, sin botón muerto', async () => {
    // La solicitud arranca MAÑANA (test e). La affordance debe reflejar la autorización real
    // (constitution §3.7): LEER va por la vida del servicio (disponible ya), REGISTRAR por la
    // ventana (todavía no) → banner "Comienza el {fecha}" + Ver estado/Historial, sin registrar.
    await caregiver.goto('/caregiver/services');
    const card = caregiver.locator('.bg-surface').filter({ hasText: PATIENT_NAME });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await expect(card.getByText(/Comienza el/)).toBeVisible();
    await expect(card.getByRole('link', { name: 'Ver estado' })).toBeVisible();
    // La escritura NO se ofrece fuera de ventana (evita el botón que la API rechazaría/cuarentena).
    await expect(card.getByRole('link', { name: 'Registrar vitales' })).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Medicación' })).toHaveCount(0);

    // "Ver estado" YA autoriza la lectura (antes daba 403 "Sin acceso"): aterriza en el dashboard.
    await card.getByRole('link', { name: 'Ver estado' }).click();
    await expect(caregiver).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(caregiver.getByText('Sin acceso a este paciente')).toHaveCount(0);
    await expect(caregiver.getByRole('heading', { name: 'Estado actual' })).toBeVisible();
  });

  test('g. familia registra vitales con alerta', async () => {
    await family.goto('/app/patients');
    // Click sobre el NOMBRE (no el centro de la card: ahí vive la fila de botones Ficha/Cuidadores).
    await family.getByText(PATIENT_NAME, { exact: true }).first().click();
    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    // Con el dashboard vacío hay dos links "Registrar vitales" (acción + empty state).
    await family.getByRole('link', { name: 'Registrar vitales' }).first().click();
    await expect(family).toHaveURL(/\/record\/vitals$/);

    await family.getByLabel('Presión sistólica').fill('170');
    await expect(family.getByText('Este valor va a generar una alerta.')).toBeVisible();
    await family.getByLabel('Frecuencia cardíaca').fill('70');
    await family.getByRole('button', { name: 'Guardar vitales' }).click();

    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    const systolicCard = family.locator('div.bg-surface').filter({ hasText: 'Presión sistólica' });
    await expect(systolicCard).toContainText('170');
    const heartCard = family.locator('div.bg-surface').filter({ hasText: 'Frecuencia cardíaca' });
    await expect(heartCard).toContainText('70');
  });

  test('h. campana: badge, notificación de alerta y marcado como leída', async () => {
    // Recargar remonta el NotificationStore y refresca el contador ya.
    await family.goto('/app/patients');

    const bell = family.getByRole('button', { name: 'Notificaciones' });
    const badge = bell.locator('span.absolute');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const before = parseInt((await badge.innerText()).trim(), 10);
    expect(before).toBeGreaterThanOrEqual(1);

    await bell.click();
    // Ítem con punto rojo = notificación de alerta.
    const alertItem = family.locator('button:has(span.bg-danger-600)').first();
    await expect(alertItem).toBeVisible({ timeout: 15_000 });
    await alertItem.click();

    // Marcarla leída decrementa el badge (o lo oculta si era la única).
    if (before === 1) {
      await expect(badge).toBeHidden();
    } else {
      await expect(badge).toHaveText(String(before - 1));
    }
  });

  test('i. cierre: finalizar contratación y calificar', async () => {
    await family.goto('/app/hiring');

    family.on('dialog', (dialog) => void dialog.accept());
    const finishBtn = family.getByRole('button', { name: 'Finalizar y marcar pagada' });
    await expect(finishBtn).toBeVisible({ timeout: 15_000 });
    await finishBtn.click();

    await expect(family.locator('kr-badge', { hasText: 'Finalizada' })).toBeVisible({
      timeout: 15_000,
    });

    await family.getByRole('button', { name: 'Calificar cuidador' }).click();
    await family.getByRole('button', { name: 'Calificar 5 de 5' }).click();
    await family.locator('textarea[name="comment"]').fill('Excelente trato con Elena. ¡Gracias!');
    await family.getByRole('button', { name: 'Enviar calificación' }).click();

    // Reseña doble-ciega: queda sellada hasta que la otra parte califique.
    await expect(family.getByText(/sellada|publicadas/)).toBeVisible({ timeout: 15_000 });
  });

  test('j. reseña ya enviada: la card muestra mi calificación y no el botón (KER-39)', async () => {
    // Al cerrar el modal, la card pasa a mostrar la reseña dejada en el paso i.
    await family.getByRole('button', { name: 'Listo' }).click();

    const myReview = family.getByTestId('my-review');
    await expect(myReview).toBeVisible({ timeout: 15_000 });
    await expect(myReview).toContainText('Tu calificación');
    await expect(myReview).toContainText('5.0');
    await expect(myReview).toContainText('Excelente trato con Elena');
    await expect(family.getByRole('button', { name: 'Calificar cuidador' })).toBeHidden();

    // Persiste tras recargar: el estado viene del contrato (myReview), no de la sesión de UI.
    await family.reload();
    await expect(family.getByTestId('my-review')).toBeVisible({ timeout: 15_000 });
    await expect(family.getByRole('button', { name: 'Calificar cuidador' })).toBeHidden();
  });
});
