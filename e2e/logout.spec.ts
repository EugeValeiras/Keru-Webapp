import { test, expect } from '@playwright/test';

/**
 * KER-38 · UC-04 (NFR-41): "Cerrar sesión" (KER-41 lo movió al menú de cuenta del avatar) hace
 * logout REAL — la API deslista el jti y el mismo token deja de valer al instante (no al
 * expirar). Se prueba por la UI y se verifica server-side pegándole a la API con el token
 * capturado antes de salir.
 */
const run = Date.now();
const EMAIL = `logout+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';

test('logout desde el shell revoca la sesión server-side', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Familia Logout E2E');
  await page.getByLabel('Email').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app\/marketplace$/, { timeout: 15_000 });

  // Token vigente ANTES de salir: la API responde 200.
  const token = await page.evaluate(
    () => (JSON.parse(localStorage.getItem('keru.session') ?? '{}') as { accessToken?: string }).accessToken,
  );
  expect(token).toBeTruthy();
  const before = await page.request.get('/api/v1/notifications', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(before.status()).toBe(200);

  // El logout vive en el menú de cuenta (KER-41): abrir el avatar y elegir "Cerrar sesión".
  await page.getByRole('button', { name: /Tu cuenta/ }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });

  // El MISMO token ya no vale: revocación server-side (denylist jti), no solo limpieza local.
  await expect
    .poll(
      async () =>
        (
          await page.request.get('/api/v1/notifications', {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status(),
      { timeout: 10_000 },
    )
    .toBe(401);

  // Y la sesión local quedó limpia: las rutas protegidas rebotan a login.
  await page.goto('/app/marketplace');
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});
