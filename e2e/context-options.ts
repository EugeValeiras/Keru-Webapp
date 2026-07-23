import { BrowserContextOptions } from '@playwright/test';

/**
 * Opciones base para los contextos que las suites crean a mano con
 * browser.newContext(): esos contextos NO heredan el `use` de
 * playwright.config.ts, y Playwright emula reducedMotion: 'no-preference'
 * por defecto (pisa incluso un flag de Chromium). Sin esto, el motion v2
 * (KER-21) corre durante los tests y axe muestrea colores a mitad de
 * animación — el flake de color-contrast visto en KER-20.
 */
export const E2E_CONTEXT: BrowserContextOptions = { reducedMotion: 'reduce' };
