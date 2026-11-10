# Decisiones

Justificación de las decisiones de calidad del proyecto. Cada decisión es una tabla con su alternativa, el concepto
del curso, la evidencia en el repositorio o en el pipeline y la fuente. Las referencias completas están al final
en formato IEEE.

> Estado: la capa **unitaria**, la capa de **integración** (Bruno) y las etapas **Lint** y **Unitarias** del pipeline
> están implementadas. La etapa de integración del pipeline, el despliegue, end-to-end, page objects, parámetros y
> correo se agregan cuando se implementen. Los números de build se anotan aquí y en `EVIDENCIA.md` cuando corran en
> GitHub Actions.

## 1. Pruebas unitarias

### 1.1 Umbral de cobertura

| Campo | Contenido |
|---|---|
| Decisión | La etapa *Unitarias* falla si la cobertura de **líneas + ramas** (`branch = true`) de los módulos de negocio baja de **90 %**. El umbral vive en `backend/pyproject.toml` (`[tool.coverage.report] fail_under = 90`), no en el YAML del CI, así un desarrollador local y el pipeline aplican exactamente la misma regla. |
| Alternativa | **80 %**: es el valor común en la industria, pero es débil para código de dominio puro, sin E/S, que se prueba con fakes en milisegundos. **95 % o más**: empuja a escribir pruebas de bajo valor para ramas defensivas casi inalcanzables (p. ej. `except asyncio.CancelledError: raise` en `LiveFeed._poll_loop`) y bloquea builds por cambios triviales. 90 % es el nivel "ejemplar" de la guía de Google y deja un margen pequeño para esas ramas. |
| Concepto | **Gate** (puerta de calidad) y **shift-left**: el defecto se detecta en la segunda etapa del pipeline, antes del build y del despliegue. **Config as code**: el umbral está versionado junto al código. |
| Evidencia | Cobertura actual: 99.8 % de líneas y 98.1 % de ramas (155 pruebas). `uv run pytest tests/unit --cov --cov-fail-under=100` termina con código 1 (`FAIL Required test coverage of 100% not reached. Total coverage: 99.46%`), lo que demuestra que la puerta detiene el pipeline. Build detenido por la puerta: _anotar número de build_. |
| Fuente | [1], [2] |

### 1.2 Módulos medidos y módulos fuera de la medición

| Campo | Contenido |
|---|---|
| Decisión | Se miden `app/domain` y `app/services` (incluido `live_feed.py`, que se prueba con `pytest-asyncio`). Quedan **fuera**: `app/infrastructure/` (adaptadores de SQLite, DynamoDB, Silo/S3, bcrypt/JWT, mutagen y Pillow), `app/api/` (routers FastAPI, schemas y manejo de errores), `app/core/` (configuración y *composition root*) y `scripts/` (inicialización de infraestructura). |
| Alternativa | **Medir todo `app/`**: obligaría a levantar DynamoDB y Silo o a mockear boto3 en pruebas "unitarias", lo que las vuelve lentas y frágiles; esos adaptadores se validan mejor en la capa de integración contra la API en ejecución. **Excluir también `LiveFeed`**: más simple, pero deja sin cubrir lógica real (detectar cambios en el snapshot, descartar clientes lentos, sobrevivir a errores de DynamoDB). |
| Concepto | **Pirámide de pruebas**: la lógica de negocio se cubre en la base (unitarias, rápidas y numerosas); los adaptadores y los routers suben a integración; la interfaz, a end-to-end. |
| Evidencia | `[tool.coverage.run] source = ["app/domain", "app/services"]` en `backend/pyproject.toml`. Reporte de cobertura en el artefacto `unit-reports-<sha>` de cada build. `tests/unit/test_live_feed.py` (10 pruebas). |
| Fuente | [3], [4] |

### 1.3 Dobles de prueba: fakes en memoria

| Campo | Contenido |
|---|---|
| Decisión | Cada puerto de `app/interfaces/` tiene un **fake** escrito a mano en `backend/tests/unit/fakes.py` (`FakeUserRepository`, `FakeNodeRepository`, `FakeObjectStorage`, `FakePasswordHasher`, `FakeTokenService`, `FakeCoverExtractor`, `FakeImageProcessor`). Las pruebas verifican el **estado resultante** (qué quedó guardado) y no la secuencia de llamadas. Los repositorios devuelven **copias**, como una base de datos real, así que si un servicio modifica un nodo y olvida `save()`, la prueba falla. Para forzar errores puntuales se usa una subclase del fake (p. ej. `FlakyDeleteStorage`, `RacyNodes`). |
| Alternativa | **`unittest.mock` en todo**: menos código inicial, pero acopla las pruebas a detalles de implementación (`assert_called_with`), se rompen en cada refactor y un `MagicMock` acepta cualquier método aunque no exista en el `Protocol`. **Mezcla de fakes y mocks**: menos consistente y más difícil de justificar. |
| Concepto | **SOLID – Inversión de dependencias (D)**: los servicios dependen de `Protocol`s y reciben los fakes por constructor. **SOLID – Sustitución de Liskov (L)**: el servicio no distingue el fake del adaptador real. Ambos principios ya estaban en el diseño del backend (`core/container.py`) y los fakes lo aprovechan sin tocar el código de producción. |
| Evidencia | `backend/tests/unit/fakes.py`. `test_auth_service.py::TestRegisterConflicts::test_user_is_rolled_back_when_the_author_node_cannot_be_created` y `test_node_id_collision_is_retried_with_the_next_id` simulan fallas de DynamoDB que con la base real son muy difíciles de reproducir. |
| Fuente | [5], [6], [7] |

### 1.4 Diseño de casos unitarios con técnicas ISTQB

| Campo | Contenido |
|---|---|
| Decisión | Los casos unitarios se derivan con técnicas de caja negra y el docstring de cada caso dice cuál lo produjo: **partición de equivalencia** (colores dentro y fuera de la paleta, tipos MIME válidos e inválidos, nodo destino de un like inexistente o de otro tipo), **valores límite** (usuario de 1/2/40/41 caracteres, contraseña de 5/6 caracteres y 72/73 bytes, archivo de exactamente el máximo y de un byte más, álbum de 0 y de 1 pista) y una **tabla de decisión** para la autorización de `ProfileService.update_profile` (reglas R1–R4). La cobertura de ramas se usa como criterio de salida (caja blanca), no como objetivo de diseño. |
| Alternativa | Escribir pruebas "hasta llegar al porcentaje": se alcanza el umbral pero sin garantizar que cada límite y cada regla estén probados de los dos lados. |
| Concepto | Técnicas de diseño de pruebas de ISTQB CTFL (partición de equivalencia, análisis de valores límite, tabla de decisión) y cobertura de ramas como criterio de salida. |
| Evidencia | `test_auth_service.py::TestRegisterValidation` (límites de usuario y contraseña, incluido `test_password_limit_counts_utf8_bytes_not_characters`), `test_media_services.py::TestUploadTrack::test_audio_size_limit`, `test_profile_service.py::TestUpdateProfile` (tabla R1–R4 en el docstring de la clase). |
| Fuente | [1] |

### 1.5 Defecto encontrado por las unitarias: archivos sin extensión

| Campo | Contenido |
|---|---|
| Decisión | `MediaService` aceptaba `audio/wav`, `audio/flac`, etc., pero calculaba la extensión con `mimetypes.guess_extension()`, que devuelve `None` para varios de esos tipos (y responde distinto en Windows y Linux). Un archivo llamado `track` subido como `audio/wav` se guardaba en el bucket **sin extensión**. Se corrigió el sistema con un mapa explícito `EXTENSIONS` en `app/services/media_service.py` y se agregó una prueba guardiana que exige que cada tipo aceptado tenga su extensión. |
| Alternativa | Ajustar la prueba para usar solo `audio/mpeg` y documentar la limitación (deja un comportamiento que depende de la plataforma). Marcarla `xfail` hasta corregirla (el defecto queda visible pero no se arregla). |
| Concepto | **Shift-left**: el defecto se encontró en la capa unitaria, antes de llegar a integración o a producción. Prueba de regresión. |
| Evidencia | `test_media_services.py::TestUploadTrack::test_file_without_extension_gets_one_from_its_type` (parametrizada sobre los 11 tipos de audio; antes de la corrección fallaba con `audio/wav`) y `test_every_accepted_type_has_an_explicit_extension`. |
| Fuente | [8] |

## 2. Pruebas de integración

Capa de caja negra contra la API **en ejecución** (FastAPI + SQLite + DynamoDB Local + Silo), con la colección Bruno
de `integration/`. 57 casos: 31 de partición de equivalencia, 18 de valores límite y 8 de una tabla de decisión.

### 2.1 Herramienta y ubicación: Bruno en `integration/`

| Campo | Contenido |
|---|---|
| Decisión | Las pruebas de integración son una colección **Bruno** de archivos `.bru` (texto plano) en `integration/`, en la raíz del repositorio y separada de `backend/`. Corren con el CLI `@usebruno/cli`, fijado como devDependency **exacta** (`4.2.1`) en `package.json` y `package-lock.json`, con `npm run test:integration`. La colección solo habla HTTP con la URL del ambiente: **nunca importa código del backend**, así que es caja negra por construcción y prueba los adaptadores reales (SQLite, DynamoDB, Silo, bcrypt, JWT) que la capa unitaria reemplaza con fakes. |
| Alternativa | **pytest + httpx en `backend/tests/integration/`**: el mismo lenguaje que las unitarias, pero tienta a importar `app.*` o usar `TestClient` en proceso (caja gris) y no apunta a una instancia desplegada. **Postman/Newman**: colecciones JSON difíciles de revisar en un diff y atadas a una cuenta en la nube. **Rango de versiones (`^4.2.1`) o la 4.3.0**: la 4.3.0 tenía 18 días de publicada y no se probó con esta colección; un rango puede cambiar el runner entre dos builds del mismo commit. |
| Concepto | **Pirámide de pruebas**: capa intermedia, menos casos y más lentos que las unitarias (~11 s contra milisegundos), y cubre lo que las unitarias dejan fuera (`app/infrastructure`, `app/api`). **Config as code**: casos, ambientes y versión del runner están versionados. |
| Evidencia | `integration/` (57 `.bru`), `package.json` (`"@usebruno/cli": "4.2.1"`, script `test:integration`). `npx bru --version` → `4.2.1`. Corrida local: `Requests 57 (56 Passed, 1 Skipped)`, `Tests 113/113`. |
| Fuente | [13], [3] |

### 2.2 Diseño de casos: partición de equivalencia, valores límite y tabla de decisión

| Campo | Contenido |
|---|---|
| Decisión | Cada caso es un `.bru` con un id `<ÁREA>-<TÉCNICA>-<n>` y su bloque `docs` dice la **técnica** que lo produjo (EP, BVA, DT + regla), qué **partición, límite o regla** cubre y el resultado esperado. Las aserciones están en el bloque `tests` (chai) y verifican el código HTTP, el cuerpo `{"error": "..."}` y el estado resultante. **Valores límite**: se prueban los dos lados de cada límite, incluidos los dos niveles de validación: el schema de Pydantic (fuera → 422) y el servicio (fuera → 400); username 0/1/2/40/41, contraseña 0/1/5/6 caracteres, 72/73 bytes en ASCII y en UTF-8 (36 × `ñ` = 72 bytes, 36 × `ñ` + `a` = 73 bytes con solo 37 caracteres) y 200/201 caracteres; álbum de 0/1/2 pistas. **Tabla de decisión**: `POST /api/profile/update` con 6 condiciones (token, existencia, tipo y dueño del nodo, color, nombre) reducidas a 8 reglas R1–R8, una por caso; la tabla está en `integration/07-profile/folder.bru`. Los casos verifican persistencia real: R8 hace un login nuevo y comprueba que el nombre (DynamoDB) y la `bio` (SQLite) quedaron guardados; MED-EP-01 descarga de Silo el MP3 que subió. |
| Alternativa | Casos "felices" por endpoint (uno por ruta): son más rápidos de escribir, pero no prueban los límites ni las combinaciones de autorización. Repetir en integración todas las particiones de las unitarias: duplica esfuerzo; aquí se eligen las que dependen del contrato HTTP (422 contra 400, autenticación, multipart, persistencia entre stores). |
| Concepto | Técnicas de caja negra de ISTQB CTFL: partición de equivalencia, análisis de valores límite de dos valores y tabla de decisión con reglas colapsadas (`-` = no importa). |
| Evidencia | Inventario en 2.6. Ejemplos: `integration/02-register/bva-13-password-73-bytes-utf8.bru`, `integration/07-profile/dt-r8-valid.bru`. Para comprobar que las aserciones pueden fallar se cambió el valor esperado en R8 y en MED-EP-01 en una copia de la colección: `bru run` reportó `2 Failed`, y la corrida de la carpeta mutada salió con código 1. |
| Fuente | [1] |

### 2.3 Aislamiento de datos: cada caso crea sus propios datos

| Campo | Contenido |
|---|---|
| Decisión | No hay reset de base. El `script:pre-request` de cada caso crea lo que necesita mediante la API pública, con `integration/lib/fixtures.js` (`newUser`, `newAlbum`, `like`, `login`): usuarios con sufijo aleatorio (`it_<tiempo><aleatorio>`), un segundo usuario para R3, un álbum para los likes, etc. Así cada `.bru` es **independiente** (se puede correr solo y en cualquier orden) y la suite es **repetible** contra un ambiente persistente como staging. Caso especial: el límite "username de 2 caracteres" solo tiene 1 296 nombres posibles, así que REG-BVA-03 acepta `201` o `409 Username already taken` (el 409 también prueba que pasó la regla de longitud) y falla con 400/422. |
| Alternativa | **Setup por carpeta** (un request `00-setup` guarda tokens en variables): más rápido, pero los casos dependen del orden y no se pueden correr sueltos. **Reset de base antes de la suite** (`init_infra --reset`): no sirve contra un ambiente compartido y requiere acceso a la infraestructura, no solo a la API. **Exigir solo 201 en REG-BVA-03**: en un ambiente persistente fallaría al azar cuando el nombre de 2 letras ya existe. |
| Concepto | **Flaky test**: se evita la dependencia entre casos y de datos previos; el resultado no depende del orden ni del historial del ambiente. Casos independientes y repetibles. |
| Evidencia | Tres corridas seguidas sobre la misma base sin limpiarla (dev, dev, staging): las tres en verde con `113/113`. `npx bru run 07-profile/dt-r8-valid.bru --env dev` corre un caso solo. Costo: ~11 s por corrida. |
| Fuente | [14], [1] |

### 2.4 Ambientes, reportes y opciones del runner

| Campo | Contenido |
|---|---|
| Decisión | Dos ambientes en `integration/environments/`: `dev.bru` (`baseUrl = http://localhost:5002`) y `staging.bru` (`http://localhost:5003`). El script elige con `BRUNO_ENV` (por defecto `dev`), que es lo que usará el parámetro de ambiente del pipeline. Reportes: `--reporter-junit reports/integration-junit.xml` (resumen y artefacto del CI) y `--reporter-html reports/integration.html` (lectura humana), ignorados en git. **Sin `--bail`**: el reporte muestra todas las fallas, no solo la primera. `--sandbox=developer` porque el helper compartido se carga con `require()`. |
| Alternativa | Un único ambiente con `{{process.env.BASE_URL}}`: más flexible, pero el ambiente no queda visible en el repositorio. Tres ambientes (`local`, `dev`, `staging`): un archivo más sin uso todavía. Solo JUnit, o `--bail`: menos evidencia por corrida. |
| Concepto | **Config as code** (los ambientes están versionados y el pipeline solo elige el nombre). **Gate**: `bru run` sale con código 1 si un caso falla, así la etapa detendrá el pipeline. |
| Evidencia | `BRUNO_ENV=staging npm run test:integration` contra una segunda instancia en el puerto 5003: verde y 53 registros en el log de esa instancia. Código de salida 0 en verde y 1 con fallas. El JUnit marca el caso saltado como `<skipped message="Request Skipped"/>`. |
| Fuente | [13], [10] |

### 2.5 Defecto D-1 encontrado al diseñar la integración: la foto de perfil no valida el contenido

| Campo | Contenido |
|---|---|
| Decisión | Al diseñar la partición "contenido que no es imagen pero se declara `image/png`" para `POST /api/profile/picture`, la API respondió **200**, guardó el texto en el bucket público `profile-picture` y lo puso como `avatar_url`. `MediaService.upload_avatar` solo revisa el tipo MIME declarado; `PillowImageProcessor` se usa únicamente para las portadas extraídas del audio. Se dejó documentado como **defecto abierto D-1** y el caso MED-EP-05 espera el comportamiento correcto (400) y se salta con `bru.runner.skipRequest()` y el motivo en el script, para que la suite siga en verde sin ocultar el defecto. Se corregirá después de entregar el pipeline. |
| Alternativa | Corregirlo en esta iteración (validar con `ImageProcessor` en `upload_avatar`, más una unitaria): es lo correcto, pero toca un servicio bajo la puerta de cobertura con poco tiempo antes de la entrega. Ajustar el caso para que espere 200: fija como correcto un comportamiento defectuoso. Solo anotarlo sin caso: se pierde la prueba de regresión lista para activarse. |
| Concepto | Partición de equivalencia (una partición inválida que el diseño original no contemplaba). Gestión de defectos: el caso queda visible como *skipped* en cada reporte hasta que se corrija. |
| Evidencia | `integration/08-media/ep-05-picture-fake-png.bru` y `integration/fixtures/not-an-image.png`. Reproducción manual: subir ese archivo con `Content-Type: image/png` devuelve 200 y un `avatar_url` en `/profile-picture/`. |
| Fuente | [1] |

### 2.6 Inventario de casos

| Área (carpeta) | Técnica | Casos | Qué cubre |
|---|---|---|---|
| `01-health` | EP | HEA-EP-01, 02 | API arriba en el ambiente (smoke); paleta de 12 colores hex distintos |
| `02-register` | EP | REG-EP-01 a 06 | Válido → 201; email mal formado → 422; username con `@` → 400; username repetido (igual y en MAYÚSCULAS) → 409; email repetido en MAYÚSCULAS → 409 |
| `02-register` | BVA | REG-BVA-01 a 05 | Username 0 → 422, 1 → 400, 2 → no se rechaza por longitud, 40 → 201, 41 → 422 |
| `02-register` | BVA | REG-BVA-06 a 15 | Contraseña 0 → 422, 1 → 400, 5 → 400, 6 → 201, 72 bytes → 201, 73 bytes → 400, 36 × ñ (72 B) → 201, 36 × ñ + a (73 B) → 400, 200 → 400, 201 → 422 |
| `03-login` | EP | LOG-EP-01 a 05 | Username correcto → 200; email en MAYÚSCULAS → 200; contraseña incorrecta y usuario inexistente → 401 con el mismo mensaje; identificador vacío → 422 |
| `04-auth` | EP | AUTH-EP-01 a 03 | Token ausente, token inválido, esquema `Basic` → 401 |
| `05-album` | BVA | ALB-BVA-01 a 03 | 0 pistas → 422; 1 → 201 sin vecinos; 2 → 201 enlazadas en orden |
| `05-album` | EP | ALB-EP-01 a 04 | Nombre de pista en blanco, url vacía, álbum en blanco → 400; tags repetidos → un enlace por tag |
| `06-like` | EP | LIKE-EP-01 a 05 | Music sin like → se agrega; con like → se quita; nodo inexistente o Author → 400; sin token → 401 |
| `07-profile` | DT | PRO-DT-R1 a R8 | Una regla por caso: 401, 404, 403 (otro dueño), 403 (no Author), 400 (color), 200 (color en minúsculas), 400 (nombre en blanco), 200 (persistido) |
| `08-media` | EP | MED-EP-01 a 06 | MP3 → 201 y descargable desde Silo; texto como audio → 400; PNG → 200; texto como foto → 400; texto declarado `image/png` → 400 (D-1, saltado); sin token → 401 |

## 3. Pipeline

### 3.1 Etapas Lint y Unitarias, en ese orden y antes del build

| Campo | Contenido |
|---|---|
| Decisión | `.github/workflows/ci.yml` tiene dos jobs encadenados: `lint` (Ruff) y `unit` (`needs: lint`, pytest con la puerta de cobertura). Si *Lint* falla, *Unitarias* no corre. Cada job tiene `timeout-minutes` (5 y 10) para que una etapa colgada termine sola. Corre en cada push a `main`, en pull requests y a mano (`workflow_dispatch`). Publica el JUnit XML y el XML de cobertura como artefacto y un resumen (número de pruebas y % de cobertura) en el *job summary*. Las etapas de build, despliegue, integración, end-to-end y correo se agregan en el mismo archivo. |
| Alternativa | Un solo job con todos los pasos: más rápido de escribir, pero en la interfaz no se ve qué etapa falló y no se puede reintentar una sola. Correr las unitarias después del build: retrasa la retroalimentación de lo más barato de detectar. |
| Concepto | **Shift-left** (lo más barato y rápido primero), **gate** (cada etapa detiene a las siguientes), **config as code** (el pipeline vive en el repositorio). |
| Evidencia | `.github/workflows/ci.yml`. Build verde con ambas etapas: _anotar número de build_. |
| Fuente | [9], [10] |

### 3.2 Versión de Python fijada en 3.13

| Campo | Contenido |
|---|---|
| Decisión | `backend/.python-version` fija Python 3.13 y `astral-sh/setup-uv` la lee en el CI. Las dependencias se instalan con `uv sync --locked`, que falla si `uv.lock` no coincide con `pyproject.toml`. |
| Alternativa | Dejar que cada máquina use su Python más reciente (`requires-python = ">=3.13"` lo permite): con Python 3.15, `uv run` falló al compilar `pyyaml==6.0.3` porque aún no hay wheel para esa versión. El CI y los desarrolladores podrían usar intérpretes distintos. |
| Concepto | **Config as code** y builds reproducibles: el mismo intérprete y las mismas versiones de dependencias en local y en CI. Evita **flaky builds** por diferencias de entorno. |
| Evidencia | `backend/.python-version`, `backend/uv.lock`. Falla original: `error: Failed to build pyyaml==6.0.3` con `cpython-3.15.2`. |
| Fuente | [11] |

### 3.3 Reglas de lint explícitas

| Campo | Contenido |
|---|---|
| Decisión | Ruff con un conjunto de reglas fijo en `pyproject.toml`: `E`, `W` (pycodestyle), `F` (pyflakes), `I` (orden de imports) y `B` (flake8-bugbear), con `B008` ignorada porque FastAPI declara dependencias con `File()`/`Depends()` como valor por defecto. Líneas de 120 caracteres, el estilo que ya usaba el código. |
| Alternativa | Las reglas por defecto de Ruff 0.17, que incluyen reglas de estilo de versión (`UP`) y de excepciones genéricas (`BLE`, `S`) y daban 15 errores en código existente; el resultado del lint cambiaría al actualizar Ruff. |
| Concepto | **Config as code** y **gate**: la regla es explícita, versionada e igual en local y en CI. Bugbear encontró un `zip()` sin `strict=True` en `AlbumService.upload`; ahora, si las listas de pistas e ids no tienen la misma longitud, falla en vez de descartar pistas en silencio. |
| Evidencia | `[tool.ruff.lint]` en `backend/pyproject.toml`; `app/services/album_service.py` (`zip(tracks, music_ids, strict=True)`). |
| Fuente | [12] |

## 4. Sugerencias de IA

El grupo usó Claude (Anthropic) como asistente durante la implementación de las capas unitaria (1–5) y de integración
(6–11). Estas son sugerencias que la IA propuso y que el grupo discutió antes de aceptarlas o rechazarlas.

| # | Sugerencia de la IA | Decisión del grupo | Razón | Prueba o build que la respalda |
|---|---|---|---|---|
| 1 | Usar **fakes en memoria** que implementan los `Protocol`s en lugar de `unittest.mock` en todas las pruebas. | **Aceptada**. Se rechazaron las alternativas "mocks en todo" y "mezcla de fakes y mocks". | Las pruebas verifican estado, no llamadas, así que sobreviven a refactors; además demuestran DIP y LSP sin tocar el código de producción. | `backend/tests/unit/fakes.py`; `test_auth_service.py::TestRegisterConflicts` (rollback y reintento de ids con `RacyNodes`/`BrokenNodes`). |
| 2 | Umbral de cobertura de **90 % de líneas + ramas**. | **Aceptada**. Se rechazaron 80 % (débil para dominio puro) y 95 %+ (persigue ramas defensivas). | Nivel "ejemplar" alcanzable con fakes; deja margen para ramas casi inalcanzables. | `uv run pytest tests/unit --cov --cov-fail-under=100` sale con código 1; cobertura actual 99.8 % / 98.1 %. Build detenido por la puerta: _anotar número_. |
| 3 | Medir `app/domain` + `app/services` **incluyendo `LiveFeed`** con `pytest-asyncio`, y dejar infraestructura, routers y wiring a otras capas. | **Aceptada**. Se rechazaron "medir todo `app/`" y "excluir `LiveFeed`". | Respeta la pirámide de pruebas sin dejar fuera lógica real del hub SSE. | `tests/unit/test_live_feed.py` (10 pruebas, `live_feed.py` al 96.1 %); 10 corridas seguidas sin fallas intermitentes. |
| 4 | En esta iteración, construir solo las etapas **Lint + Unitarias** del pipeline y dejar build, despliegue, integración, end-to-end y correo para los demás integrantes. | **Aceptada**. Se rechazó generar todo el esqueleto del pipeline de una vez. | Cada integrante debe tener commits propios en las pruebas y el pipeline; un esqueleto completo generado por IA les quitaba esa parte. | `.github/workflows/ci.yml` (jobs `lint` y `unit`). Build verde: _anotar número_. |
| 5 | Ante la falla de `test_file_without_extension_gets_one_from_its_type`, **corregir el sistema** con un mapa explícito de extensiones en vez de ajustar la prueba. | **Aceptada**. Se rechazaron "ajustar la prueba a `audio/mpeg`" y "marcarla `xfail`". | Era un defecto real (archivos `audio/wav`/`audio/flac` sin extensión, dependiente de la plataforma); la prueba hizo su trabajo. | `test_media_services.py::TestUploadTrack::test_file_without_extension_gets_one_from_its_type` (falla sin el mapa, pasa con él) y `test_every_accepted_type_has_an_explicit_extension`. |
| 6 | Colección Bruno en **`integration/` en la raíz** (no en `backend/tests/integration/`) y `@usebruno/cli` fijado en **4.2.1 exacta** como devDependency. | **Aceptada**. Se descartaron `backend/tests/integration/` y la versión 4.3.0. | La ubicación deja claro que es caja negra y no depende del código Python; la 4.2.1 se probó antes con `.bru` y JUnit, y la 4.3.0 tenía 18 días de publicada. | `package.json`; `npx bru --version` → `4.2.1`; corrida local `57 (56 Passed, 1 Skipped)`. |
| 7 | Implementar el aislamiento propuesto por el grupo (cada caso registra su propio usuario con sufijo aleatorio, sin reset) con un **helper compartido** `integration/lib/fixtures.js` que usa `bru.sendRequest` desde el pre-request. | **Aceptada**. Se descartaron "setup por carpeta" y "reset de base antes de correr". | Cada `.bru` corre solo y en cualquier orden; la suite se repite contra un ambiente persistente sin borrar datos. | Tres corridas seguidas sobre la misma base, todas `113/113`; `npx bru run 07-profile/dt-r8-valid.bru --env dev` corre un caso suelto. |
| 8 | Ambientes **`dev` (5002) y `staging` (5003)** en `integration/environments/`, elegidos con `BRUNO_ENV`. | **Aceptada**. Se descartaron un único ambiente con `process.env.BASE_URL` y tres ambientes (`local`, `dev`, `staging`). | Solo cambia `baseUrl`; el ambiente queda visible en el repo y el pipeline solo tiene que pasar el nombre. | `BRUNO_ENV=staging npm run test:integration` contra una instancia en el puerto 5003: verde. |
| 9 | Reportes **JUnit + HTML**, **sin `--bail`**, y `--sandbox=developer`. | **Aceptada**. Se descartaron "solo JUnit" y "JUnit + `--bail`". | El JUnit alimenta el resumen y los artefactos del CI y el HTML sirve de evidencia legible; sin `--bail` se ven todas las fallas de una corrida. | `reports/integration-junit.xml` y `reports/integration.html`; código de salida 1 con una copia mutada de la colección. |
| 10 | En el límite "username de 2 caracteres" (REG-BVA-03), aceptar **201 o 409 `Username already taken`** y fallar con 400/422. | **Aceptada**. Se descartaron "reintentar con otro nombre en el pre-request" y "exigir solo 201". | Solo hay 1 296 nombres de 2 caracteres en el alfabeto del caso: exigir 201 vuelve el caso intermitente en un ambiente persistente, y el 409 también prueba que pasó la regla de longitud. | `integration/02-register/bva-03-username-2.bru`; tres corridas seguidas sobre la misma base en verde. |
| 11 | Ante el defecto D-1 (la foto de perfil acepta texto declarado como `image/png`), **documentarlo y dejar un caso saltado** que espera 400, y corregirlo después de la entrega. | **Aceptada**. Se descartaron "corregirlo en esta sesión" y "solo documentarlo sin caso". | Con poco tiempo, no se toca un servicio bajo la puerta de cobertura; el caso deja lista la prueba de regresión y el defecto aparece como *skipped* en cada reporte. | `integration/08-media/ep-05-picture-fake-png.bru` (`<skipped message="Request Skipped"/>` en el JUnit). |

## Referencias

[1] ISTQB, *Certified Tester Foundation Level Syllabus*, v4.0. International Software Testing Qualifications Board, 2023.

[2] C. Arguelles, M. Ivanković y A. Bender, "Code Coverage Best Practices," *Google Testing Blog*, ago. 2020. [En línea]. Disponible: https://testing.googleblog.com/2020/08/code-coverage-best-practices.html

[3] M. Cohn, *Succeeding with Agile: Software Development Using Scrum*. Boston, MA, EE. UU.: Addison-Wesley, 2009.

[4] Ned Batchelder, "Branch coverage measurement," *Coverage.py documentation*. [En línea]. Disponible: https://coverage.readthedocs.io/en/latest/branch.html

[5] G. Meszaros, *xUnit Test Patterns: Refactoring Test Code*. Boston, MA, EE. UU.: Addison-Wesley, 2007.

[6] M. Fowler, "Mocks Aren't Stubs," *martinfowler.com*, ene. 2007. [En línea]. Disponible: https://martinfowler.com/articles/mocksArentStubs.html

[7] R. C. Martin, *Clean Architecture: A Craftsman's Guide to Software Structure and Design*. Boston, MA, EE. UU.: Prentice Hall, 2017.

[8] Python Software Foundation, "mimetypes — Map filenames to MIME types," *Python 3.13 documentation*. [En línea]. Disponible: https://docs.python.org/3.13/library/mimetypes.html

[9] J. Humble y D. Farley, *Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation*. Boston, MA, EE. UU.: Addison-Wesley, 2010.

[10] GitHub, "Workflow syntax for GitHub Actions," *GitHub Docs*. [En línea]. Disponible: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

[11] Astral, "Python versions," *uv documentation*. [En línea]. Disponible: https://docs.astral.sh/uv/concepts/python-versions/

[12] Astral, "Configuring Ruff," *Ruff documentation*. [En línea]. Disponible: https://docs.astral.sh/ruff/configuration/

[13] Bruno, "Bruno CLI," *Bruno documentation*. [En línea]. Disponible: https://docs.usebruno.com/bru-cli/overview

[14] J. Micco, "Flaky Tests at Google and How We Mitigate Them," *Google Testing Blog*, may. 2016. [En línea]. Disponible: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
