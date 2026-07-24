import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';

/**
 * KER-53 · Editor de disponibilidad ágil (kr-availability-editor) en el onboarding del cuidador.
 *
 * Cubre el flujo mejorado pedido por el usuario:
 *   1. Multi-día: un preset (Lun a Vie) selecciona varios días y un solo rango se aplica a todos.
 *   2. Duración en vivo: al fijar un rango se ve "N h" y cada slot cargado muestra su duración.
 *   3. Rango inválido (to<=from): se rechaza con feedback claro y el botón queda deshabilitado.
 *   4. Quitar un slot es directo.
 *   5. axe AA sin violaciones críticas/serias sobre el editor.
 */
const run = Date.now();
const CAREGIVER_EMAIL = `cg-dispo+${run}@e2e.com`;
const PASSWORD = 'S3gura!123';
const CAREGIVER_NAME = `Cuidador Dispo ${run}`;

async function expectAxeClean(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('kr-availability-editor')
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

/** Registra un cuidador nuevo y lo deja parado en el paso 4 (disponibilidad) del onboarding. */
async function gotoAvailabilityStep(page: Page): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('button', { name: /^Cuidador\/a/ }).click();
  await page.getByLabel('Nombre y apellido').fill(CAREGIVER_NAME);
  await page.getByLabel('Email').fill(CAREGIVER_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/caregiver\/onboarding$/, { timeout: 15_000 });

  // Paso 1 (datos) → 2 (especialidad) → 3 (certificaciones) → 4 (disponibilidad).
  await expect(page.getByText(CAREGIVER_NAME).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Adultos mayores').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Sumá tus certificaciones')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('¿Qué días y horarios podés trabajar?')).toBeVisible();
}

test('editor de disponibilidad: multi-día, duración en vivo, rango inválido y quitar (axe AA)', async ({
  page,
}) => {
  await gotoAvailabilityStep(page);

  const editor = page.locator('kr-availability-editor');
  const addBtn = page.getByRole('button', { name: 'Agregar horario' });
  const next = page.getByRole('button', { name: 'Siguiente' });

  // Sin días ni rango no se puede aplicar, y el paso todavía no es válido.
  await expect(addBtn).toBeDisabled();
  await expect(page.getByText('Todavía no agregaste horarios.')).toBeVisible();
  await expect(next).toBeDisabled();

  // 1) Multi-día con preset: "Lun a Vie" marca 5 días; un rango se aplica a todos de una.
  await page.getByRole('button', { name: 'Lun a Vie' }).click();
  await page.getByLabel('Desde').fill('08:00');
  await page.getByLabel('Hasta').fill('16:00');

  // 2) Duración en vivo del rango: 08:00–16:00 = 8 h.
  await expect(editor.getByText('Duración:')).toContainText('8 h');
  await expect(addBtn).toBeEnabled();

  await addBtn.click();

  // Se cargaron los 5 días laborables, cada uno con su duración calculada.
  const slots = editor.getByRole('listitem');
  await expect(slots).toHaveCount(5);
  await expect(slots.first()).toContainText('Lunes');
  await expect(slots.first()).toContainText('08:00–16:00');
  await expect(slots.first()).toContainText('8 h');
  await expect(editor.getByText('Total: 40 h por semana')).toBeVisible();

  // 3) Rango inválido (to <= from): feedback claro y botón deshabilitado.
  await page.getByLabel('Desde').fill('18:00');
  await page.getByLabel('Hasta').fill('09:00');
  await expect(editor.getByRole('alert')).toContainText('«Hasta» tiene que ser mayor que «Desde»');
  await expect(addBtn).toBeDisabled();

  // axe AA sobre el editor con datos cargados y el error visible.
  await expectAxeClean(page, 'onboarding paso 4 (disponibilidad)');

  // 4) Quitar un slot: baja el conteo y el total.
  await slots
    .filter({ hasText: 'Lunes' })
    .getByRole('button', { name: /^Quitar/ })
    .click();
  await expect(editor.getByRole('listitem')).toHaveCount(4);
  await expect(editor.getByText('Total: 32 h por semana')).toBeVisible();

  // Con al menos un slot válido, el paso queda habilitado para avanzar.
  await expect(next).toBeEnabled();
});
