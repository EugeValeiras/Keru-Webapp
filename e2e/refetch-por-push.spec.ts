import { test, expect, BrowserContext, Page } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-78 · ADR-0004 Fase 1 — refetch-por-push (UC-18, NFR-42/NFR-09).
 *
 * Cuando llega un Web Push, el `sw.js` avisa a las pestañas y el badge de la campana refetchea
 * el unread-count al INSTANTE, sin esperar el ciclo de polling. El push service real no existe
 * en headless, así que se simula el mensaje SW→pestaña (el mismo `postMessage` que emite `sw.js`)
 * despachándolo sobre `navigator.serviceWorker` — sin timers reales, como pide el ADR. El
 * fallback (sin permiso de push) mantiene el polling/refresh como piso garantizado.
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';

/** Stub del canal push del navegador (permiso + suscripción fake), igual patrón que push.spec. */
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

async function signupFamily(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Familia Refetch E2E');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });
}

/** Alta de paciente + vital fuera de rango → dispara la alerta (UC-12 A2 → UC-18). Todo en SPA
 * (sin recarga completa) para que el badge NO se refresque por el arranque, solo por push/poll. */
async function crearAlerta(page: Page, patientName: string): Promise<void> {
  await page.goto('/app/patients');
  await page.getByRole('link', { name: 'Registrar paciente' }).first().click();
  await page.getByLabel('Nombre completo').fill(patientName);
  await page.getByLabel('Fecha de nacimiento').fill('1948-03-02');
  await page.getByLabel('Condición principal').fill('Hipertensión');
  await page.getByLabel('Nombre', { exact: true }).fill('María Refetch');
  await page.getByLabel('Teléfono', { exact: true }).fill('+54 11 5555-0019');
  await page.getByRole('button', { name: 'Registrar paciente' }).click();
  await expect(page).toHaveURL(/\/app\/patients$/, { timeout: 15_000 });

  await page.getByText(patientName, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Registrar vitales' }).first().click();
  await page.getByLabel('Presión sistólica').fill('175');
  await page.getByRole('button', { name: 'Guardar vitales' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

/** Simula el mensaje que `sw.js` emite a la pestaña al recibir un push (mismo contrato). */
async function simularPush(page: Page): Promise<void> {
  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', { data: { source: 'keru-sw', kind: 'push', type: 'alert' } }),
    );
  });
}

test.describe.serial('KER-78 · con push activo: el push refetchea el badge sin esperar el polling', () => {
  let ctx: BrowserContext;
  let family: Page;
  const EMAIL = `familia.refetch+${run}@e2e.com`;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext(E2E_CONTEXT);
    await ctx.addInitScript(STUB_SCRIPT, { outcome: 'granted' });
    family = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('al recibir un push, la campana refleja el nuevo unread-count de inmediato', async () => {
    await signupFamily(family, EMAIL);
    // Acepta el push (queda suscripto → push activo → el polling se relaja al fallback largo).
    await family.getByRole('button', { name: 'Activar notificaciones' }).click();
    await expect(family.getByText('¿Querés recibir las alertas del paciente', { exact: false })).toBeHidden({
      timeout: 15_000,
    });

    // Se genera una alerta server-side; el badge del cliente sigue en 0 (no hubo refetch aún:
    // con push activo el poll es de minutos y la pestaña está visible, sin on-focus).
    await crearAlerta(family, `Elena Refetch ${run}`);
    const badge = family.getByRole('button', { name: /Notificaciones/ }).locator('span.absolute');
    await expect(badge).toBeHidden();

    // Llega el push → el SW avisa a la pestaña → refetch inmediato del unread-count.
    await simularPush(family);
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText(/[1-9]/);
  });
});

test.describe.serial('KER-78 · sin permiso de push: el polling (fallback) sigue refrescando el badge', () => {
  let ctx: BrowserContext;
  let family: Page;
  const EMAIL = `familia.refetch.fb+${run}@e2e.com`;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext(E2E_CONTEXT);
    await ctx.addInitScript(STUB_SCRIPT, { outcome: 'denied' });
    family = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('sin push, la campana se actualiza igual por el camino de polling/refresh', async () => {
    await signupFamily(family, EMAIL);
    // Rechaza el permiso (A1): no hay suscripción → no hay push, solo el polling como piso.
    await family.getByRole('button', { name: 'Activar notificaciones' }).click();
    await expect(family.getByText('¿Querés recibir las alertas del paciente', { exact: false })).toBeHidden({
      timeout: 15_000,
    });

    await crearAlerta(family, `Elena Fallback ${run}`);

    // Degradación graceful (NFR-09): el refetch on-focus del poller trae el contador sin push.
    await family.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const badge = family.getByRole('button', { name: /Notificaciones/ }).locator('span.absolute');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText(/[1-9]/);
  });
});
