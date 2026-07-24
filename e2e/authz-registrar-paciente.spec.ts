import { test, expect } from '@playwright/test';
import { E2E_CONTEXT } from './context-options';

/**
 * KER-50 · Quién puede registrar/administrar pacientes (§2.4 rol Y vínculo).
 * Lado webapp de los criterios de aceptación:
 *  - el self-signup ya no ofrece el rol "Paciente" (queda Familiar + Cuidador/a);
 *  - la gestión de pacientes (/app) es capacidad de `family`: una cuenta cuidador
 *    que intente entrar es redirigida a su home por el roleGuard.
 */
const run = Date.now();
const PASSWORD = 'S3gura!123';

test.describe('KER-50 · authz de registrar pacientes (webapp)', () => {
  test('el signup ya no ofrece el rol Paciente (solo Familiar y Cuidador/a)', async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    const page = await ctx.newPage();
    await page.goto('/signup');

    await expect(page.getByRole('button', { name: /^Familiar/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Cuidador\/a/ })).toBeVisible();
    // El rol paciente salió del self-signup (KER-50): no hay opción "Paciente".
    await expect(page.getByRole('button', { name: /^Paciente/ })).toHaveCount(0);

    await ctx.close();
  });

  test('una cuenta cuidador no accede a /app/patients (roleGuard family) → va a su home', async ({ browser }) => {
    const ctx = await browser.newContext(E2E_CONTEXT);
    const page = await ctx.newPage();

    // Signup de cuidador: aterriza en su onboarding (no en /app).
    await page.goto('/signup');
    await page.getByRole('button', { name: /^Cuidador\/a/ }).click();
    await page.getByLabel('Nombre y apellido').fill(`Cuidador KER50 ${run}`);
    await page.getByLabel('Email').fill(`cuidador-ker50+${run}@e2e.com`);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

    // Intentar entrar a la gestión de pacientes (capacidad family) → el roleGuard lo saca a /caregiver.
    await page.goto('/app/patients/new');
    await expect(page).toHaveURL(/\/caregiver/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/app\/patients/);

    await ctx.close();
  });
});
