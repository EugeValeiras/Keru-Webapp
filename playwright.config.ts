import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * E2E contra el entorno local YA levantado:
 * - Webapp: http://127.0.0.1:4200 (ng serve con proxy a la API)
 * - API:    http://localhost:3000/api/v1 (con seed admin@test.com)
 * Por eso NO hay webServer acá.
 *
 * Para apuntar a otro origen (p. ej. el nginx del modo producción local en
 * http://localhost:8080, o un serve de worktree en :4201) sin tocar el default
 * que usa CI: la env E2E_BASE_URL, o un archivo local `.e2e-base-url`
 * (gitignoreado) con la URL — útil cuando quien corre `npm run e2e` no hereda
 * el entorno de la shell (p. ej. el gate de verify del kanban).
 */
const baseUrlFile = '.e2e-base-url';
const fileBaseUrl = existsSync(baseUrlFile) ? readFileSync(baseUrlFile, 'utf8').trim() : '';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env['E2E_BASE_URL'] || fileBaseUrl || 'http://127.0.0.1:4200',
    headless: true,
    // Motion v2 (KER-21): todas las animaciones respetan prefers-reduced-motion,
    // así que emularlo las apaga durante los tests y axe no muestrea colores a
    // mitad de animación (el flake de KER-20). Esto solo cubre los fixtures por
    // defecto: los contextos que las suites crean a mano (browser.newContext())
    // NO lo heredan y deben pasar E2E_CONTEXT (e2e/context-options.ts).
    reducedMotion: 'reduce',
  },
});
