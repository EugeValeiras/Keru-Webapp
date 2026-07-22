import { defineConfig } from '@playwright/test';

/**
 * E2E contra el entorno local YA levantado:
 * - Webapp: http://127.0.0.1:4200 (ng serve con proxy a la API)
 * - API:    http://localhost:3000/api/v1 (con seed admin@test.com)
 * Por eso NO hay webServer acá.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    headless: true,
  },
});
