import { expect, Page } from '@playwright/test';

/**
 * Bandeja de emails del entorno de test. La API "envía" por SES contra el emulador floci
 * (docker), que expone los mensajes enviados en GET /_aws/ses (estilo LocalStack). Sirve para
 * cerrar por UI los flujos que dependen de un link enviado por email —verificación de cuenta
 * (KER-49)— sin backdoors: el test lee el email REAL y navega el link, como haría la persona.
 *
 * En CI floci publica :4566 al host (igual que en el repro local); overridable con FLOCI_URL.
 */
const FLOCI_URL = process.env['FLOCI_URL'] ?? 'http://localhost:4566';

interface SesMessage {
  Destination?: { ToAddresses?: string[] };
  Subject?: string;
  Body?: { text_part?: string };
}

/** Espera (poll) y devuelve el email más reciente a `to` cuyo asunto matchea `subject`. */
async function fetchLatestEmail(page: Page, to: string, subject: RegExp): Promise<SesMessage> {
  for (let intento = 0; intento < 40; intento++) {
    const res = await page.request.get(`${FLOCI_URL}/_aws/ses`);
    if (res.ok()) {
      const { messages = [] } = (await res.json()) as { messages?: SesMessage[] };
      const match = messages
        .filter((m) => m.Destination?.ToAddresses?.includes(to) && subject.test(m.Subject ?? ''))
        .pop();
      if (match) return match;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`No llegó ningún email a ${to} con asunto ${subject} (${FLOCI_URL}/_aws/ses)`);
}

/**
 * KER-49 · Verifica el email de una cuenta recién auto-registrada como lo haría la persona: lee
 * el email de verificación real (floci SES), extrae el link /verify-email?token=… y lo navega.
 * La pantalla confirma contra la API (emailVerified=true) y auto-loguea. Necesario antes de
 * cualquier acción gateada por email verificado (p. ej. emitir una invitación al círculo).
 */
export async function verifyEmailViaLink(page: Page, email: string): Promise<void> {
  const msg = await fetchLatestEmail(page, email, /verific/i);
  const link = (msg.Body?.text_part ?? '').match(/\/verify-email\?token=[a-f0-9]+/i)?.[0];
  if (!link) throw new Error(`El email de verificación a ${email} no traía un link /verify-email`);
  await page.goto(link);
  await expect(page.getByText('¡Tu email quedó verificado!')).toBeVisible({ timeout: 15_000 });
  await page.waitForURL(/\/app\//, { timeout: 15_000 });
}
