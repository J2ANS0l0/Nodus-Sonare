# Decisiones

Justificación de las decisiones de calidad del proyecto. Cada decisión es una tabla con su alternativa, el concepto
del curso, la evidencia en el repositorio o en el pipeline y la fuente. Las referencias completas están al final
en formato IEEE.

> Estado: la capa **unitaria** y las etapas **Lint** y **Unitarias** del pipeline están implementadas. Las secciones
> de integración, end-to-end, page objects, despliegue, parámetros y correo se agregan cuando se implementen esas
> capas. Los números de build se anotan aquí y en `EVIDENCIA.md` cuando corran en GitHub Actions.

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

## 2. Pipeline

### 2.1 Etapas Lint y Unitarias, en ese orden y antes del build

| Campo | Contenido |
|---|---|
| Decisión | `.github/workflows/ci.yml` tiene dos jobs encadenados: `lint` (Ruff) y `unit` (`needs: lint`, pytest con la puerta de cobertura). Si *Lint* falla, *Unitarias* no corre. Cada job tiene `timeout-minutes` (5 y 10) para que una etapa colgada termine sola. Corre en cada push a `main`, en pull requests y a mano (`workflow_dispatch`). Publica el JUnit XML y el XML de cobertura como artefacto y un resumen (número de pruebas y % de cobertura) en el *job summary*. Las etapas de build, despliegue, integración, end-to-end y correo se agregan en el mismo archivo. |
| Alternativa | Un solo job con todos los pasos: más rápido de escribir, pero en la interfaz no se ve qué etapa falló y no se puede reintentar una sola. Correr las unitarias después del build: retrasa la retroalimentación de lo más barato de detectar. |
| Concepto | **Shift-left** (lo más barato y rápido primero), **gate** (cada etapa detiene a las siguientes), **config as code** (el pipeline vive en el repositorio). |
| Evidencia | `.github/workflows/ci.yml`. Build verde con ambas etapas: _anotar número de build_. |
| Fuente | [9], [10] |

### 2.2 Versión de Python fijada en 3.13

| Campo | Contenido |
|---|---|
| Decisión | `backend/.python-version` fija Python 3.13 y `astral-sh/setup-uv` la lee en el CI. Las dependencias se instalan con `uv sync --locked`, que falla si `uv.lock` no coincide con `pyproject.toml`. |
| Alternativa | Dejar que cada máquina use su Python más reciente (`requires-python = ">=3.13"` lo permite): con Python 3.15, `uv run` falló al compilar `pyyaml==6.0.3` porque aún no hay wheel para esa versión. El CI y los desarrolladores podrían usar intérpretes distintos. |
| Concepto | **Config as code** y builds reproducibles: el mismo intérprete y las mismas versiones de dependencias en local y en CI. Evita **flaky builds** por diferencias de entorno. |
| Evidencia | `backend/.python-version`, `backend/uv.lock`. Falla original: `error: Failed to build pyyaml==6.0.3` con `cpython-3.15.2`. |
| Fuente | [11] |

### 2.3 Reglas de lint explícitas

| Campo | Contenido |
|---|---|
| Decisión | Ruff con un conjunto de reglas fijo en `pyproject.toml`: `E`, `W` (pycodestyle), `F` (pyflakes), `I` (orden de imports) y `B` (flake8-bugbear), con `B008` ignorada porque FastAPI declara dependencias con `File()`/`Depends()` como valor por defecto. Líneas de 120 caracteres, el estilo que ya usaba el código. |
| Alternativa | Las reglas por defecto de Ruff 0.17, que incluyen reglas de estilo de versión (`UP`) y de excepciones genéricas (`BLE`, `S`) y daban 15 errores en código existente; el resultado del lint cambiaría al actualizar Ruff. |
| Concepto | **Config as code** y **gate**: la regla es explícita, versionada e igual en local y en CI. Bugbear encontró un `zip()` sin `strict=True` en `AlbumService.upload`; ahora, si las listas de pistas e ids no tienen la misma longitud, falla en vez de descartar pistas en silencio. |
| Evidencia | `[tool.ruff.lint]` en `backend/pyproject.toml`; `app/services/album_service.py` (`zip(tracks, music_ids, strict=True)`). |
| Fuente | [12] |

## 3. Sugerencias de IA

El grupo usó Claude (Anthropic) como asistente durante la implementación de la capa unitaria. Estas son sugerencias
que la IA propuso y que el grupo discutió antes de aceptarlas o rechazarlas.

| # | Sugerencia de la IA | Decisión del grupo | Razón | Prueba o build que la respalda |
|---|---|---|---|---|
| 1 | Usar **fakes en memoria** que implementan los `Protocol`s en lugar de `unittest.mock` en todas las pruebas. | **Aceptada**. Se rechazaron las alternativas "mocks en todo" y "mezcla de fakes y mocks". | Las pruebas verifican estado, no llamadas, así que sobreviven a refactors; además demuestran DIP y LSP sin tocar el código de producción. | `backend/tests/unit/fakes.py`; `test_auth_service.py::TestRegisterConflicts` (rollback y reintento de ids con `RacyNodes`/`BrokenNodes`). |
| 2 | Umbral de cobertura de **90 % de líneas + ramas**. | **Aceptada**. Se rechazaron 80 % (débil para dominio puro) y 95 %+ (persigue ramas defensivas). | Nivel "ejemplar" alcanzable con fakes; deja margen para ramas casi inalcanzables. | `uv run pytest tests/unit --cov --cov-fail-under=100` sale con código 1; cobertura actual 99.8 % / 98.1 %. Build detenido por la puerta: _anotar número_. |
| 3 | Medir `app/domain` + `app/services` **incluyendo `LiveFeed`** con `pytest-asyncio`, y dejar infraestructura, routers y wiring a otras capas. | **Aceptada**. Se rechazaron "medir todo `app/`" y "excluir `LiveFeed`". | Respeta la pirámide de pruebas sin dejar fuera lógica real del hub SSE. | `tests/unit/test_live_feed.py` (10 pruebas, `live_feed.py` al 96.1 %); 10 corridas seguidas sin fallas intermitentes. |
| 4 | En esta iteración, construir solo las etapas **Lint + Unitarias** del pipeline y dejar build, despliegue, integración, end-to-end y correo para los demás integrantes. | **Aceptada**. Se rechazó generar todo el esqueleto del pipeline de una vez. | Cada integrante debe tener commits propios en las pruebas y el pipeline; un esqueleto completo generado por IA les quitaba esa parte. | `.github/workflows/ci.yml` (jobs `lint` y `unit`). Build verde: _anotar número_. |
| 5 | Ante la falla de `test_file_without_extension_gets_one_from_its_type`, **corregir el sistema** con un mapa explícito de extensiones en vez de ajustar la prueba. | **Aceptada**. Se rechazaron "ajustar la prueba a `audio/mpeg`" y "marcarla `xfail`". | Era un defecto real (archivos `audio/wav`/`audio/flac` sin extensión, dependiente de la plataforma); la prueba hizo su trabajo. | `test_media_services.py::TestUploadTrack::test_file_without_extension_gets_one_from_its_type` (falla sin el mapa, pasa con él) y `test_every_accepted_type_has_an_explicit_extension`. |

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
