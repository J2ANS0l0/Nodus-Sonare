# Nodus-Sonare
An artistic reinterpretation of the visual representation of music and its connections. An experiment in graph visualization applied to music databases.

## Requisitos

- Docker y Docker Compose
- Node.js 20+ y npm
- Python 3.13+ y [uv](https://docs.astral.sh/uv/)

## Servicios

| Servicio | URL |
|---|---|
| Frontend (Vite) | http://localhost:3000 |
| Backend (FastAPI) | http://localhost:5002 · docs: http://localhost:5002/docs |
| Silo (S3 API) | http://localhost:9000 |
| Silo (consola web) | http://localhost:9001 (usuario/clave en `docker/.env`) |
| DynamoDB Local | http://localhost:8002 |
| DynamoDB Admin | http://localhost:8003 |

## Primera instalación

```bash
# Instala las dependencias del frontend
npm install
# Instala las dependencias del backend (crea backend/.venv)
cd backend && uv sync && cd ..
# Crea el archivo de configuración del backend (luego cambia JWT_SECRET por un valor aleatorio)
cp backend/.env.example backend/.env
# Crea y levanta los contenedores de Silo, DynamoDB y DynamoDB Admin
docker compose -f docker/docker-compose.yml up -d
# Crea la tabla de usuarios (SQLite), la tabla de nodos (DynamoDB) y los buckets (Silo), vacíos
npm run infra:init
```

## Correr la app

```bash
# Levanta backend (puerto 5002) y frontend (puerto 3000) juntos
npm start
# Levanta solo el backend
npm run server
# Levanta solo el frontend
npm run dev
# Compila el frontend para producción
npm run build
```

## Pruebas y calidad

```bash
# Lint del backend (reglas fijadas en backend/pyproject.toml)
npm run lint:backend
# Pruebas unitarias con cobertura; falla si la cobertura de app/domain + app/services baja de 90 %
npm run test:unit
```

Las pruebas unitarias viven en `backend/tests/unit/` y no necesitan Docker: usan fakes en memoria de los puertos
(`backend/tests/unit/fakes.py`). El pipeline de GitHub Actions está en `.github/workflows/ci.yml` y las decisiones
de diseño en [`DECISIONES.md`](DECISIONES.md).

### Pruebas de integración (Bruno)

Pruebas de caja negra contra la API **en ejecución**, con [Bruno](https://docs.usebruno.com/). La colección está en
[`integration/`](integration/) (archivos `.bru` versionados) y el CLI está fijado en `package.json`
(`@usebruno/cli` 4.2.1, versión exacta). Necesitan Docker, la infraestructura inicializada y el backend corriendo:

```bash
docker compose -f docker/docker-compose.yml up -d   # Silo + DynamoDB Local
npm run infra:init                                  # tablas y buckets (solo la primera vez)
npm run server                                      # API en http://localhost:5002
# En otra terminal: corre los 58 casos contra el ambiente dev (http://localhost:5002)
npm run test:integration
# Contra otro ambiente de integration/environments/ (staging = http://localhost:5003)
BRUNO_ENV=staging npm run test:integration
# Un solo caso o una carpeta (desde integration/)
cd integration && npx bru run 07-profile --env dev
```

- Reportes: `reports/integration-junit.xml` (JUnit, para el CI) y `reports/integration.html`. El comando sale con
  código 1 si algún caso falla.
- No hace falta vaciar la base: cada caso registra su propio usuario con un sufijo aleatorio
  (`integration/lib/fixtures.js`), así que la suite se puede repetir contra un ambiente con datos.
- Cada caso dice en su bloque `docs` la técnica que lo produjo (EP, BVA o tabla de decisión + regla) y qué cubre.
  Se puede ver en la app de escritorio de Bruno abriendo la carpeta `integration/`. El inventario completo está en
  [`DECISIONES.md`](DECISIONES.md#2-pruebas-de-integración).
- `08-media/ep-05-picture-fake-png` se salta a propósito: documenta el defecto abierto D-1 (la foto de perfil no valida
  el contenido del archivo).

### Pruebas end-to-end (Playwright)

Recorridos de usuario en el navegador con [Playwright](https://playwright.dev/) (`@playwright/test` 1.65.0, versión
exacta) y Page Object Model. Corren contra la app **ya levantada** (frontend + API + infraestructura):

```bash
npx playwright install chromium        # navegador de Playwright (solo la primera vez)
npm start                              # frontend en http://localhost:3000 y API en http://localhost:5002
# En otra terminal: solo los recorridos marcados @smoke
npm run test:e2e:smoke
# El mismo smoke con el navegador visible (headed)
npm run test:e2e:smoke:headed
# Todos los recorridos
npm run test:e2e
# Otro ambiente u otro navegador
E2E_BASE_URL=http://localhost:3001 E2E_BROWSER=firefox npm run test:e2e
```

| Variable | Valor por defecto | Efecto |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | URL del frontend probado (el ambiente) |
| `E2E_BROWSER` | `chromium` | `chromium`, `firefox` o `webkit` |
| `E2E_REUSE_USER` | `1` en local, `0` con `CI` definida | Con `1`, si el usuario del recorrido ya existe, el recorrido entra con login; con `0`, el 409 hace fallar la prueba |

- Estructura: `playwright.config.ts`, page objects en `e2e/pages/`, datos y fuentes de archivos en `e2e/support/` y
  recorridos en `e2e/tests/`.
- **Smoke** (`e2e/tests/smoke.spec.ts`, `@smoke`): registra a *Feeling Blew*, espera la home, en *Post* suelta los
  audios de `album/` y escribe el tag general *Rock Alternativo*, en *Explore* comprueba el tag, selecciona al autor,
  presiona random, adelanta el audio hasta el final (verifica el evento `ended`) y hace logout.
- **Buscar y reproducir** (`e2e/tests/search_and_play.spec.ts`, `@regression`, `npm run test:e2e:regression`):
  registra a *Smoke* (`SmokeTest@gmail.com` / `Smoke1234`), espera la home, en *Explore* comprueba que se ven los nodos
  existentes, en *Search* busca la pista *Nodo Semilla E2E*, verifica que el grafo queda solo con ese nodo, hace clic
  en él y comprueba que el reproductor la toca. La pista no depende del smoke: un `beforeAll` la publica por API con el
  usuario *Seed Artist* (`e2e/support/catalog_seed.ts`) solo si todavía no existe, así que el recorrido corre solo, en
  cualquier orden y contra una base vacía.
- **Editar perfil** (`e2e/tests/edit_profile.spec.ts`, `@regression`): inicia sesión como *Profile Tester*
  (`profile.tester@example.com` / `ProfileTester1234`, creado por API en un `beforeAll` si no existe), abre *Profile*,
  cambia la foto con *[ Change Profile Picture ]* (`e2e/fixtures/avatar.png`), escribe una descripción, elige otro color
  de la paleta y guarda; después cierra sesión, vuelve a entrar y comprueba que los tres cambios se guardaron.
- `album/` tiene dos pistas **sintéticas** de 12 s (acordes de senos generados con ffmpeg, sin derechos de terceros),
  con tags ID3 (`artist` Feeling Blew, `album` Ensayos Sinteticos, `genre` Demo, `track` 1/2 y 2/2). Para
  regenerarlas: `ffmpeg -f lavfi -i "aevalsrc=0.3*sin(2*PI*220*t):s=44100:d=12" -ac 2 -c:a libmp3lame -b:a 128k
  -id3v2_version 3 -metadata title="Primer Ensayo" -metadata artist="Feeling Blew" "album/01 Primer Ensayo.mp3"`.
- El smoke usa credenciales fijas: para repetirlo con `E2E_REUSE_USER=0` hay que vaciar los datos antes (ver
  [Datos](#datos)). En local, cada repetición sube el álbum otra vez.
- Reportes: `reports/e2e-junit.xml` y `reports/e2e-html/`. Si una prueba falla quedan traza, captura y video en
  `test-results/`.

## Pipeline (GitHub Actions)

`.github/workflows/ci.yml`. Cada etapa es un job y, si una falla, las siguientes no corren:

```
Lint → Unitarias + cobertura → Build del artefacto → Despliegue → Integración → (End-to-end)
                                                                          ↘ si algo falla o se cuelga: Correo
```

| Etapa | Dónde corre | Qué hace |
|---|---|---|
| Lint, Unitarias | `ubuntu-latest` (también en pull requests) | Ruff; pytest con la puerta de cobertura del 90 % |
| Build | runner self-hosted | Construye **una sola vez** la imagen `nodus-sonare:<sha>` (API + UI compilada); el SHA queda dentro de la imagen |
| Despliegue | runner self-hosted | `deploy/deploy.sh <ambiente> <sha>`: levanta el contenedor del ambiente elegido y **falla si `GET /api/version` no responde el SHA del commit** |
| Integración | runner self-hosted | Colección Bruno contra la instancia desplegada (la suite elegida); JUnit + HTML como artefacto |
| Correo | `ubuntu-latest` | Si una etapa falla o supera su `timeout-minutes`, manda el correo de la falla |

Cada push a `main` corre todo con los valores por defecto. Los pull requests solo corren Lint y Unitarias: el runner
self-hosted nunca ejecuta código de un PR (el repositorio es público).

### Ambientes

Los dos ambientes corren **la misma imagen** con otra configuración (`deploy/env/<ambiente>.env`):

| Ambiente | URL (UI + API) | Datos |
|---|---|---|
| `dev` | http://localhost:5002 | tabla `node_dev`, buckets `dev-*`, volumen `nodus-dev-data` (SQLite) |
| `staging` | http://localhost:5003 | tabla `node_staging`, buckets `staging-*`, volumen `nodus-staging-data` (SQLite) |

`GET /api/version` responde `{"version": "<sha>", "environment": "<ambiente>"}`. Para desplegar a mano:

```bash
SHA=$(git rev-parse HEAD)
docker build --build-arg GIT_SHA=$SHA -t nodus-sonare:$SHA .
deploy/deploy.sh staging $SHA          # o dev
```

> El ambiente `dev` usa el puerto 5002, el mismo de `npm run server`: no tengas el backend local levantado mientras
> el pipeline despliega `dev`.

### Parámetros (Actions → CI → Run workflow)

| Parámetro | Valores (defecto en **negrita**) | Efecto |
|---|---|---|
| `environment` | **dev**, staging | Ambiente donde se despliega y se prueba; se ve en el nombre del build, en la URL probada y en la respuesta de `/api/version` |
| `suite` | **regression**, smoke | `smoke` corre solo los casos con tag `smoke` (7 de integración, `bru run --tags=smoke`) y los recorridos `@smoke` de end-to-end |
| `browser` | **chromium**, firefox, webkit | Navegador de las pruebas end-to-end |
| `recipients` | **philipfalla@ufm.edu,J2AN.S0l0@gmail.com** | Destinatarios del correo si el build falla |

Desde la terminal: `gh workflow run ci.yml -f environment=staging -f suite=smoke -f recipients=alguien@ejemplo.com`.

### Correo

El job `notify` corre `.github/scripts/notify_failure.py` con el número de build, el commit, el ambiente, la etapa que
falló y el enlace al log. El servidor es `smtp.gmail.com:465` (SSL). Las credenciales vienen de los secrets
`SMTP_USERNAME` y `SMTP_PASSWORD` como variables de entorno; no están en el repositorio y GitHub las oculta en el log.

### Runner self-hosted

Build, Despliegue e Integración corren en un runner self-hosted con las etiquetas `self-hosted, nodus`, que necesita
Docker, Node 20+ y Python 3 en el `PATH`. Para arrancarlo: `cd ~/actions-runner && ./run.sh` (debe decir
`Listening for Jobs`). Si está apagado, esos jobs quedan en cola.

### Agregar la etapa end-to-end

El job de Playwright va después de `integration` en `ci.yml`, en el mismo runner, contra la URL del ambiente elegido:

```yaml
  e2e:
    name: End-to-end (${{ inputs.environment || 'dev' }}, ${{ inputs.browser || 'chromium' }})
    needs: integration
    runs-on: [self-hosted, nodus]
    timeout-minutes: 15
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@v4
      # 1. npm ci y `npx playwright install "$BROWSER"` (el navegador queda en caché en el runner).
      # 2. CI=true hace que el 409 del usuario fijo del smoke falle (E2E_REUSE_USER=0): vaciar antes los datos
      #    del ambiente desplegado, p. ej. `docker exec "nodus-$ENVIRONMENT" python -m scripts.init_infra --reset`
      #    (usa la tabla, los buckets y el SQLite de ese contenedor).
      # 3. E2E_BASE_URL=http://localhost:<HOST_PORT de deploy/env/$ENVIRONMENT.env> E2E_BROWSER="$BROWSER"
      #    npx playwright test, con `--grep @smoke` si SUITE=smoke.
      # 4. Subir reports/e2e-junit.xml, reports/e2e-html/ y test-results/ como artefacto (if: always()).
```

Y agregar `e2e` a `needs` del job `notify`, para que el correo también cubra esa etapa.

## Datos

```bash
# Borra todos los usuarios, nodos y archivos subidos: deja la app vacía como nueva
cd backend && uv run python -m scripts.init_infra --reset && cd ..
```

## Docker

```bash
# Crea (si no existen) y levanta los contenedores en segundo plano
docker compose -f docker/docker-compose.yml up -d
# Muestra el estado de los contenedores
docker compose -f docker/docker-compose.yml ps
# Muestra los logs de los contenedores en vivo
docker compose -f docker/docker-compose.yml logs -f
# Pausa los contenedores (quedan congelados en memoria)
docker compose -f docker/docker-compose.yml pause
# Reanuda los contenedores pausados
docker compose -f docker/docker-compose.yml unpause
# Detiene los contenedores sin eliminarlos (los datos se conservan)
docker compose -f docker/docker-compose.yml stop
# Vuelve a iniciar los contenedores detenidos
docker compose -f docker/docker-compose.yml start
# Elimina los contenedores y la red (los volúmenes con datos se conservan)
docker compose -f docker/docker-compose.yml down
# Elimina los contenedores, la red y los volúmenes (se pierden todos los datos de Silo y DynamoDB)
docker compose -f docker/docker-compose.yml down -v
```

> Los usuarios viven en `backend/data/users.db` (fuera de Docker): `down -v` no los borra. Para vaciar todo usa `init_infra --reset`.

Más detalle del backend (endpoints y arquitectura) en [`backend/README.md`](backend/README.md).
