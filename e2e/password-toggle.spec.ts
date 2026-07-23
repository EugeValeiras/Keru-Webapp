import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-45 · Toggle "mostrar/ocultar" (ojo) en los inputs de contraseña.
 *
 * kr-password-input reemplaza a los <input type="password"> sueltos en login,
 * signup y el modal de step-up. Este spec cubre el componente sobre la pantalla
 * pública de login:
 *   1. El campo arranca oculto (type=password) y el botón invita a "Mostrar".
 *   2. Click en el ojo alterna type password↔text y el aria-label/aria-pressed
 *      del botón reflejan el estado.
 *   3. El valor tipeado se preserva al alternar (no se pierde ni se re-enmascara).
 *   4. axe AA sin violaciones críticas/serias con el toggle presente.
 */

// axe acotado al componente kr-password-input: valida lo que introduce el toggle
// (input + botón con su aria-label/aria-pressed). La pasada axe de la pantalla
// completa de login/signup/step-up ya vive en a11y.spec.ts.
async function expectAxeClean(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('kr-password-input')
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

test('el ojo alterna mostrar/ocultar la contraseña y refleja el estado (axe AA)', async ({
  page,
}) => {
  await page.goto('/login');

  // El <input> sigue nombrado por el <label>Contraseña (getByLabel lo alcanza);
  // .and(input) lo desambigua del botón, cuyo aria-label también dice "contraseña".
  const password = page.getByLabel('Contraseña').and(page.locator('input'));
  await expect(password).toBeVisible();
  await password.fill('S3gura!123');

  // Arranca oculto: type=password y el botón invita a mostrar.
  await expect(password).toHaveAttribute('type', 'password');
  const showBtn = page.getByRole('button', { name: 'Mostrar contraseña' });
  await expect(showBtn).toBeVisible();
  await expect(showBtn).toHaveAttribute('aria-pressed', 'false');

  await expectAxeClean(page, 'login (oculto)');

  // Click en el ojo → texto plano, el botón ahora oculta y aria-pressed=true.
  await showBtn.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('S3gura!123');
  const hideBtn = page.getByRole('button', { name: 'Ocultar contraseña' });
  await expect(hideBtn).toBeVisible();
  await expect(hideBtn).toHaveAttribute('aria-pressed', 'true');

  await expectAxeClean(page, 'login (visible)');

  // Click de nuevo → vuelve a ocultar sin perder el valor.
  await hideBtn.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('S3gura!123');
  await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toBeVisible();
});

test('el toggle es operable por teclado (Enter/Espacio)', async ({ page }) => {
  await page.goto('/login');

  const password = page.getByLabel('Contraseña').and(page.locator('input'));
  await password.fill('S3gura!123');

  // Enfocar el botón del ojo con teclado y activarlo con Enter.
  await page.getByRole('button', { name: 'Mostrar contraseña' }).focus();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');

  // Espacio vuelve a ocultar.
  await page.getByRole('button', { name: 'Ocultar contraseña' }).press(' ');
  await expect(password).toHaveAttribute('type', 'password');
});
