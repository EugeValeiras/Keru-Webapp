import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * UC-18 · Push del navegador para alertas, adicional a la campana (KER-4).
 *
 * El push service real (FCM/autopush) no existe en headless, así que se stubean
 * Notification (permiso controlado por test) y PushManager (suscripción fake con un
 * endpoint inalcanzable). Eso deja el resto del circuito REAL: el service worker se
 * registra, la suscripción viaja a la API y persiste, y cuando la alerta dispara el
 * push la API falla contra el endpoint fake — exactamente el escenario "el push falla
 * y la campana sigue registrando todo" (constitution §2.7).
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';
const PATIENT_NAME = 'Elena Push';

/**
 * Stub del canal push del navegador:
 * - Notification.permission arranca 'default' y requestPermission() resuelve `outcome`
 *   (persistido en localStorage para sobrevivir recargas).
 * - pushManager entrega una suscripción fake estable por contexto, también persistida.
 */
function pushStubs(outcome: 'granted' | 'denied'): { outcome: string } {
  return { outcome };
}

const STUB_SCRIPT = ({ outcome }: { outcome: string }) => {
  const PERM_KEY = 'e2e.push.perm';
  const SUB_KEY = 'e2e.push.subscribed';
  const EP_KEY = 'e2e.push.endpoint';

  const FakeNotification = function () {} as unknown as { permission: string; requestPermission: () => Promise<string> };
  Object.defineProperty(FakeNotification, 'permission', {
    get: () => localStorage.getItem(PERM_KEY) ?? 'default',
  });
  FakeNotification.requestPermission = async () => {
    localStorage.setItem(PERM_KEY, outcome);
    return outcome;
  };
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });

  const makeSub = () => {
    let endpoint = localStorage.getItem(EP_KEY);
    if (!endpoint) {
      endpoint = 'https://push.e2e.invalid/sub-' + Math.random().toString(36).slice(2);
      localStorage.setItem(EP_KEY, endpoint);
    }
    return {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'BFakeP256dhKeyForE2E', auth: 'FakeAuthSecret' } }),
      unsubscribe: async () => {
        localStorage.removeItem(SUB_KEY);
        return true;
      },
    };
  };
  const fakeManager = {
    subscribe: async () => {
      localStorage.setItem(SUB_KEY, '1');
      return makeSub();
    },
    getSubscription: async () => (localStorage.getItem(SUB_KEY) === '1' ? makeSub() : null),
  };
  Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', {
    get: () => fakeManager,
    configurable: true,
  });
};

/** GET autenticado a la API desde la página (mismo origen y token que usa la webapp). */
async function apiGet(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (p) => {
    const session = JSON.parse(localStorage.getItem('keru.session') ?? '{}') as { accessToken?: string };
    const res = await fetch(p, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    return res.json();
  }, path);
}

async function signupFamily(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Familia Push E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
}

test.describe.serial('UC-18 · push aceptado: suscripción, alerta con push caído, revocación', () => {
  let browser: Browser;
  let ctx: BrowserContext;
  let family: Page;
  const EMAIL = `familia.push+${run}@e2e.com`;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    ctx = await browser.newContext();
    await ctx.addInitScript(STUB_SCRIPT, pushStubs('granted'));
    family = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a. el primer inicio ofrece activar el push (la app pide el permiso)', async () => {
    await signupFamily(family, EMAIL);
    await expect(
      family.getByText('¿Querés recibir las alertas del paciente como notificaciones de este navegador?'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('b. aceptar suscribe este navegador y la suscripción queda persistida por cuenta', async () => {
    await family.getByRole('button', { name: 'Activar notificaciones' }).click();

    // El banner se va y la campana pasa a mostrar el push como activo (revocable).
    await expect(family.getByText('¿Querés recibir las alertas del paciente', { exact: false })).toBeHidden({
      timeout: 15_000,
    });
    await family.getByRole('button', { name: 'Notificaciones' }).click();
    await expect(family.getByRole('button', { name: 'Desactivar push' })).toBeVisible({ timeout: 15_000 });
    await family.keyboard.press('Escape');

    // Persistida en la API, asociada a la cuenta (criterio 4).
    await expect
      .poll(async () => ((await apiGet(family, '/api/v1/notifications/push/subscriptions')) as unknown[]).length, {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test('c. una alerta clínica llega SIEMPRE a la campana aunque el push (endpoint fake) falle', async () => {
    // Alta de paciente.
    await family.goto('/app/patients');
    await family.getByRole('link', { name: 'Registrar paciente' }).first().click();
    await family.getByLabel('Nombre completo').fill(PATIENT_NAME);
    await family.getByLabel('Fecha de nacimiento').fill('1948-03-02');
    await family.getByLabel('Condición principal').fill('Hipertensión');
    await family.getByLabel('Nombre', { exact: true }).fill('María Push');
    await family.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0018');
    await family.getByRole('button', { name: 'Registrar paciente' }).click();
    await expect(family).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });

    // Vital fuera de rango → alerta (UC-12 A2 → UC-18). El push sale al endpoint fake
    // inalcanzable y falla del lado del server; la campana tiene que registrar igual (§2.7).
    await family.getByText(PATIENT_NAME, { exact: true }).first().click();
    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await family.getByRole('link', { name: 'Registrar vitales' }).first().click();
    await family.getByLabel('Presión sistólica').fill('175');
    await family.getByRole('button', { name: 'Guardar vitales' }).click();
    await expect(family).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    // La campana registró la alerta (badge + ítem rojo), con el push suscripto y caído.
    await family.goto('/app/patients');
    const bell = family.getByRole('button', { name: /Notificaciones/ });
    await expect(bell.locator('span.absolute')).toBeVisible({ timeout: 20_000 });
    await bell.click();
    await expect(family.locator('button:has(span.bg-danger-600)').first()).toBeVisible({ timeout: 15_000 });
    await expect(family.getByText('Alerta clínica').first()).toBeVisible();
    await family.keyboard.press('Escape');

    // Y la suscripción sigue registrada: un fallo transitorio no revoca nada.
    const subs = (await apiGet(family, '/api/v1/notifications/push/subscriptions')) as unknown[];
    expect(subs.length).toBe(1);
  });

  test('d. desactivar el push revoca la suscripción (la campana sigue)', async () => {
    await family.getByRole('button', { name: /Notificaciones/ }).click();
    await family.getByRole('button', { name: 'Desactivar push' }).click();
    await expect(family.getByRole('button', { name: 'Activar push' })).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => ((await apiGet(family, '/api/v1/notifications/push/subscriptions')) as unknown[]).length, {
        timeout: 15_000,
      })
      .toBe(0);

    // La campana quedó intacta después de revocar.
    await expect(family.getByText('Alerta clínica').first()).toBeVisible();
  });
});

test.describe.serial('UC-18 A1 · permiso rechazado: solo campana', () => {
  let ctx: BrowserContext;
  let family: Page;
  const EMAIL = `familia.push.a1+${run}@e2e.com`;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    await ctx.addInitScript(STUB_SCRIPT, pushStubs('denied'));
    family = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a. rechazar el permiso deja la campana sola y ninguna suscripción', async () => {
    await signupFamily(family, EMAIL);
    await expect(
      family.getByText('¿Querés recibir las alertas del paciente como notificaciones de este navegador?'),
    ).toBeVisible({ timeout: 15_000 });

    // El navegador deniega el permiso (A1): el banner se va y no hay suscripción.
    await family.getByRole('button', { name: 'Activar notificaciones' }).click();
    await expect(family.getByText('¿Querés recibir las alertas del paciente', { exact: false })).toBeHidden({
      timeout: 15_000,
    });

    const subs = (await apiGet(family, '/api/v1/notifications/push/subscriptions')) as unknown[];
    expect(subs.length).toBe(0);

    // La campana queda operativa y muestra el push como bloqueado (no hay botón Activar).
    await family.getByRole('button', { name: 'Notificaciones' }).click();
    await expect(family.getByText('Bloqueado por el navegador')).toBeVisible();
    await expect(family.getByText('Sin notificaciones')).toBeVisible();
  });

  test('b. el rechazo persiste: recargar no vuelve a ofrecer el banner', async () => {
    await family.reload();
    await expect(family.getByRole('button', { name: 'Notificaciones' })).toBeVisible({ timeout: 15_000 });
    await expect(family.getByText('¿Querés recibir las alertas del paciente', { exact: false })).toBeHidden();
  });
});
