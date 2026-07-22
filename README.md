# Keru-Webapp

SPA Angular del marketplace de cuidadores domiciliarios **Keru**. Una sola app con tres experiencias ruteadas por el rol del JWT: **familia/paciente** (marketplace + seguimiento clínico), **cuidador** (onboarding, bandeja, registro clínico) y **admin** (back-office de aprobación).

Estética: look Airbnb con paleta violeta — Tailwind v4 + design system propio en `shared/ui` (tokens en `src/styles.css`).

## Stack

- Angular 20 standalone, **zoneless**, signals (sin NgRx)
- Tailwind CSS v4 (`@theme` tokens)
- chart.js (gráficos de evolución)
- Tipos del contrato generados con `openapi-typescript` desde `../Keru-API/openapi.json`
- Playwright (E2E)

## Desarrollo

Requiere la API corriendo (ver `../Keru-API`: `docker compose up -d` + `npm run seed` + `npm run start:dev`).

```bash
npm install
npm start          # dev server en http://127.0.0.1:4200, proxy /api → localhost:3000
npm run gen:api    # regenerar src/app/core/api/schema.d.ts desde ../Keru-API/openapi.json
npm run e2e        # suite Playwright (requiere API + dev server corriendo)
npm run build      # build de producción
```

Usuarios seed: `familiar@test.com`, `cuidador@test.com`, `admin@test.com` (password `S3gura!123`).

## Modo producción local (Docker)

El `Dockerfile` compila la SPA (`npm run build`) y la sirve con **nginx** (`nginx.conf`), que además proxya `/api` → `api:3000` y `/media` → floci — el mismo contrato que `proxy.conf.json` en dev, pero dentro de la red del compose de `../Keru-API`.

No se levanta desde este repo: el servicio `webapp` vive en el `docker-compose.yml` de **Keru-API** bajo el profile `app` (ver su README, "Modo producción local"):

```bash
cd ../Keru-API
docker compose --profile app up -d --build   # webapp en http://localhost:8080
```

Para correr la suite E2E contra ese contenedor (en lugar del dev server):

```bash
E2E_BASE_URL=http://localhost:8080 npm run e2e
```

## Arquitectura

```
src/app/
├── core/          # sin UI: auth (store+interceptores+guards), clientes API por dominio,
│                  # catálogos, contexto de paciente activo, notificaciones (polling), idempotencia
├── features/      # una carpeta por dominio: auth, patients, marketplace, care,
│                  # reputation, caregiver, admin, shell
└── shared/        # ui/ (kr-* components) y utils/
```

Decisiones clave (ver `docs/plan-webapp.md` para el plan completo):

- **Sin refresh token**: ante cualquier 401 el interceptor limpia la sesión y redirige a login.
- **Idempotencia (NFR-34)**: cada formulario de creación genera UN `operationId` al montarse y lo reusa en reintentos.
- **Sin push/WebSocket**: campana y vistas "en vivo" por polling (pausado con la pestaña oculta).
- **Paciente activo (UC-22)**: la URL es la fuente de verdad; el store es el default al navegar.
- Cliente API híbrido: tipos generados + overrides manuales (schemas no declarados) + servicios finos a mano.
