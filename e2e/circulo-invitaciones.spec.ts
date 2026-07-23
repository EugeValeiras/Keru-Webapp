import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * Círculo del paciente por UI (KER-1/KER-2 + ficha editable), con actores en
 * contextos separados:
 *   familia (titular) invita → copia el link → invitado confirma en contexto
 *   nuevo y ve al paciente → el círculo muestra miembros con roles → la ficha
 *   se edita (el viewer no ve el botón) → revocar una invitación vigente hace
 *   que la landing la rechace.
 *
 * Los emails son únicos por corrida para no chocar con datos previos.
 */
const run = Date.now();

const FAMILY_EMAIL = `circulo-familia+${run}@e2e.com`;
const GUEST_EMAIL = `circulo-viewer+${run}@e2e.com`;
const REVOKED_EMAIL = `circulo-revocado+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const FAMILY_NAME = `Familia Círculo ${run}`;
const GUEST_NAME = `Viewer Círculo ${run}`;
const PATIENT_NAME = 'Elena Círculo';
const NEW_CONDITION = 'Hipertensión controlada E2E';

test.describe.serial('Círculo: invitaciones, roles y ficha', () => {
  let browser: Browser;
  let familyCtx: BrowserContext;
  let guestCtx: BrowserContext;
  let strangerCtx: BrowserContext;
  let family: Page;
  let guest: Page;

  /** Link de la invitación que acepta el viewer (test c). */
  let inviteLink = '';
  /** Link de la invitación que se revoca (tests g/h). */
  let revokedLink = '';

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    // Permisos de clipboard para poder verificar el "Copiar" del modal.
    familyCtx = await browser.newContext({
      ...E2E_CONTEXT,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    family = await familyCtx.newPage();
  });

  test.afterAll(async () => {
    await familyCtx?.close();
    await guestCtx?.close();
    await strangerCtx?.close();
  });

  test('a. setup: signup de familia y alta de paciente', async () => {
    await family.goto('/signup');
    await family.getByRole('button', { name: /^Familiar/ }).click();
    await family.getByLabel('Nombre y apellido').fill(FAMILY_NAME);
    await family.getByLabel('Email').fill(FAMILY_EMAIL);
    await family.getByLabel('Contraseña').fill(PASSWORD);
    await family.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(family).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

    await family.goto('/app/patients');
    await family.getByRole('link', { name: 'Registrar paciente' }).first().click();
    await family.getByLabel('Nombre completo').fill(PATIENT_NAME);
    await family.getByLabel('Fecha de nacimiento').fill('1948-03-20');
    await family.getByLabel('Condición principal').fill('Hipertensión');
    await family.getByLabel('Nombre', { exact: true }).fill('María Círculo');
    await family.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0100');
    await family.getByRole('button', { name: 'Registrar paciente' }).click();
    await expect(family).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
    await expect(family.getByText(PATIENT_NAME)).toBeVisible();
  });

  test('b. invitar al círculo (Solo ver) y copiar el link', async () => {
    await family.getByRole('button', { name: 'Invitar familiar' }).click();
    const modal = family.locator('kr-invite-modal');
    await expect(modal.getByText(`Invitar al círculo de ${PATIENT_NAME}`)).toBeVisible();

    await modal.getByLabel('Email de la persona invitada').fill(GUEST_EMAIL);
    await modal.locator('select[name="role"]').selectOption('viewer');
    await modal.getByRole('button', { name: 'Generar invitación' }).click();

    const linkInput = modal.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    inviteLink = await linkInput.inputValue();
    expect(inviteLink).toContain('/invite/');

    // "Copiar" deja el link en el clipboard y da feedback visual.
    await modal.getByRole('button', { name: 'Copiar', exact: true }).click();
    await expect(modal.getByRole('button', { name: '¡Copiado!' })).toBeVisible();
    const clipboard = await family.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(inviteLink);

    // La invitación aparece en las vigentes con su rol.
    const item = modal.locator('li').filter({ hasText: GUEST_EMAIL });
    await expect(item).toBeVisible();
    await expect(item).toContainText('Solo ver');
  });

  test('c. el invitado confirma en un contexto nuevo y ve al paciente', async () => {
    guestCtx = await browser.newContext(E2E_CONTEXT);
    guest = await guestCtx.newPage();

    await guest.goto(inviteLink);
    await expect(
      guest.getByText(`Te invitaron a acompañar a ${PATIENT_NAME} en Keru`),
    ).toBeVisible({ timeout: 15_000 });

    // Sin sesión: crear cuenta con el email invitado (viene precargado).
    await guest.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(guest).toHaveURL(/\/signup/);
    await expect(guest.getByLabel('Email')).toHaveValue(GUEST_EMAIL);
    await guest.getByRole('button', { name: /^Familiar/ }).click();
    await guest.getByLabel('Nombre y apellido').fill(GUEST_NAME);
    await guest.getByLabel('Contraseña').fill(PASSWORD);
    await guest.getByRole('button', { name: 'Crear cuenta' }).click();

    // El returnUrl vuelve a la landing, ya autenticado y con el email correcto.
    const accept = guest.getByRole('button', { name: 'Aceptar invitación' });
    await expect(accept).toBeVisible({ timeout: 15_000 });
    await accept.click();

    await expect(guest.getByText('¡Bienvenido/a al círculo!')).toBeVisible({ timeout: 15_000 });
    await expect(guest).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });
    await expect(guest.getByText(PATIENT_NAME)).toBeVisible();
  });

  test('d. el círculo muestra los miembros con sus roles', async () => {
    await family.goto('/app/patients');
    await family.getByRole('button', { name: 'Ficha', exact: true }).click();
    await expect(family).toHaveURL(/\/record$/, { timeout: 15_000 });

    const circle = family.locator('section').filter({ hasText: 'Círculo' });
    const owner = circle.locator('li').filter({ hasText: FAMILY_NAME });
    await expect(owner).toBeVisible({ timeout: 15_000 });
    await expect(owner).toContainText('Titular');

    const viewer = circle.locator('li').filter({ hasText: GUEST_NAME });
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText(GUEST_EMAIL);
    await expect(viewer).toContainText('Solo lectura');
  });

  test('e. el titular edita la ficha y ve la confirmación', async () => {
    // Sigue en la ficha del test anterior.
    await family.getByRole('button', { name: 'Editar ficha' }).click();
    await family.getByLabel('Condición principal').fill(NEW_CONDITION);
    await family.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect(family.getByText('Ficha actualizada.')).toBeVisible({ timeout: 15_000 });
    await expect(family.getByText(NEW_CONDITION)).toBeVisible();
  });

  test('f. el viewer ve la ficha actualizada pero no puede editarla', async () => {
    await guest.goto('/app/patients');
    await guest.getByRole('button', { name: 'Ficha', exact: true }).click();
    await expect(guest).toHaveURL(/\/record$/, { timeout: 15_000 });

    // La ficha cargó (con el dato editado por el titular) antes de negar el botón.
    await expect(guest.getByText(NEW_CONDITION)).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByText('Solo lectura').first()).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Editar ficha' })).toHaveCount(0);
  });

  test('g. revocar una invitación vigente la saca de la lista', async () => {
    await family.goto('/app/patients');
    await family.getByRole('button', { name: 'Invitar familiar' }).click();
    const modal = family.locator('kr-invite-modal');

    await modal.getByLabel('Email de la persona invitada').fill(REVOKED_EMAIL);
    await modal.locator('select[name="role"]').selectOption('manager');
    await modal.getByRole('button', { name: 'Generar invitación' }).click();

    const linkInput = modal.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    revokedLink = await linkInput.inputValue();

    // La aceptada (test c) ya no está vigente: solo aparece la nueva.
    const item = modal.locator('li').filter({ hasText: REVOKED_EMAIL });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'Revocar', exact: true }).click();
    await expect(item.getByText('¿Revocar? El link deja de servir.')).toBeVisible();
    await item.getByRole('button', { name: 'Sí, revocar' }).click();

    await expect(modal.getByText('No hay invitaciones pendientes.')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('h. la landing rechaza el link revocado', async () => {
    strangerCtx = await browser.newContext(E2E_CONTEXT);
    const stranger = await strangerCtx.newPage();

    await stranger.goto(revokedLink);
    await expect(
      stranger.getByText('Esta invitación ya fue usada o expiró'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(stranger.getByRole('button', { name: 'Aceptar invitación' })).toHaveCount(0);
  });
});
