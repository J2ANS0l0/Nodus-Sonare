# Evidencia

Builds de GitHub Actions (workflow `CI`, `.github/workflows/ci.yml`) que respaldan el proyecto. Cada build indica el
SHA completo de su commit; todos esos commits están en el historial de `main`. Las capturas están en
[`evidencia/`](evidencia/).

Repositorio: https://github.com/J2ANS0l0/Nodus-Sonare · Actions: https://github.com/J2ANS0l0/Nodus-Sonare/actions

## Secuencia verde → rojo → verde

| Build | Resultado | Commit (SHA) | Ambiente / suite | Qué muestra |
|---|---|---|---|---|
| [#10](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42772193293) | ✅ verde | `ff8bbe47b43412dcbbdca6732053920884e7c590` | dev / regression | Merge del pipeline: Lint, Unitarias, Build, Despliegue e Integración en verde (1 min 39 s) |
| [#11](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42772971643) | ❌ rojo | `d61f4de55da6906ba08684fe4fa2218fad7d484e` | dev / regression | Cambio al sistema (`max_length` de `username` 40 → 50 en `backend/app/api/schemas.py`). Unitarias en verde; falla **Integración** |
| [#12](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42773201168) | ✅ verde | `3b49c0ec2c633c7493cf579e8cd8e18e6c1b99ed` | dev / regression | `git revert` del cambio: todo verde otra vez |

**Etapa y prueba que fallaron en el rojo (#11):** etapa *Integración (dev, regression)*, caso
`integration/02-register/bva-05-username-41.bru` (REG-BVA-05, valor límite "username de 41 caracteres"):

```
02-register/bva-05-username-41 (400 Bad Request)
Tests
   × status 422
AssertionError: expected 400 to equal 422
   × error body {"error": ...}
```

Resultado de la etapa: `58 (56 Passed, 1 Failed, 1 Skipped)`, `114/116`: un caso con sus dos aserciones en rojo. Con
el schema en 50, un username de 41 caracteres ya no lo rechaza el schema (422, `username: String should have at most
40 characters`) sino el servicio (400, `Username must be 2-40 characters…`), así que fallan el código y el mensaje: el
límite superior del contrato HTTP cambió y la capa de integración lo detecta. Las 155 pruebas unitarias pasaron, porque no
miden `app/api`. El build mandó el correo de falla (job *Correo si falla*: success).

## Build detenido por la puerta de cobertura

| Build | Resultado | Commit (SHA) | Qué muestra |
|---|---|---|---|
| [#14](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42773625332) | ❌ rojo | `62b4679898c344210671e568b00893f284c857b3` | Se quitaron las pruebas de `LiveFeed` (`backend/tests/unit/test_live_feed.py`). Las 145 pruebas restantes pasan, pero la etapa *Unit tests + coverage gate* falla: `FAIL Required test coverage of 90.0% not reached. Total coverage: 86.05%` (líneas 85.9 %, ramas 86.5 %). Build, Despliegue e Integración quedan *skipped*; se envió el correo |
| [#15](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42773720456) | ✅ verde | `a132f85e2896493ce668d23163a7007dcaa37b10` | `git revert`: las pruebas vuelven y la cobertura sube a 99.5 % |

## Un build por ambiente

| Build | Ambiente | Commit (SHA) | Respuesta de la instancia (`GET /api/version`) |
|---|---|---|---|
| [#9](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42771896536) | **staging** (http://localhost:5003), suite smoke, lanzado a mano | `65ae0d3aae42e5cee5244f737f6d13cf04d49bbf` | `{"version":"65ae0d3aae42e5cee5244f737f6d13cf04d49bbf","environment":"staging"}` |
| [#10](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42772193293) | **dev** (http://localhost:5002), suite regression, push a `main` | `ff8bbe47b43412dcbbdca6732053920884e7c590` | `{"version":"ff8bbe47b43412dcbbdca6732053920884e7c590","environment":"dev"}` |
| [#19](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42777723410) | **staging** (http://localhost:5003), suite smoke, **firefox**, lanzado a mano, con End-to-end | `db278bfc7eebf278f5890a5ec0792472618b75cb` | `{"version":"db278bfc7eebf278f5890a5ec0792472618b75cb","environment":"staging"}` |
| [#17](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42776939755) | **dev** (http://localhost:5002), suite regression, chromium, push a `main`, con End-to-end | `d338d179d0d9cea098700895846a5a0a0b342e56` | `{"version":"d338d179d0d9cea098700895846a5a0a0b342e56","environment":"dev"}` |

La diferencia entre ambientes y parámetros se ve en el nombre del build (`env=staging · suite=smoke · browser=firefox`
contra `env=dev · suite=regression · browser=chromium`), en la URL probada y en la respuesta de la instancia, en el
número de casos de integración (7 con `smoke`, 58 con `regression`) y en los recorridos end-to-end (`1 passed` en
Firefox con `smoke` en el #19; `3 passed` en Chromium con `regression` en el #17).

## Otros builds

| Build | Resultado | Commit (SHA) | Nota |
|---|---|---|---|
| #7 | ❌ rojo | `49a8cd3…` | Falla del propio pipeline: Bruno pasó (7/7) pero no pudo escribir los reportes porque `reports/` no existe en un checkout limpio. Corregido en `580b43f` (`mkdir -p reports`). También mandó el correo |
| [#13](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42773388581) | ✅ verde | `be312586f2348ddbb7c573a21d06a5925cbb359b` | Segundo recorrido end-to-end (todavía sin etapa end-to-end en el pipeline) |
| #16 | ✅ verde | `337b612…` | Tercer recorrido end-to-end (todavía sin etapa end-to-end en el pipeline) |
| [#17](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42776939755) | ✅ verde | `d338d179d0d9cea098700895846a5a0a0b342e56` | **Primer build con las 7 etapas**, incluida End-to-end (dev, regression, chromium): `3 passed (20.3s)`. Total 3 min 5 s |
| [#18](https://github.com/J2ANS0l0/Nodus-Sonare/actions/runs/42777387393) | ✅ verde | `db278bfc7eebf278f5890a5ec0792472618b75cb` | Todas las etapas en verde con valores por defecto, en el commit que agregó esta evidencia |

## Pruebas por capa

| Capa | Herramienta | Cantidad | Dónde |
|---|---|---|---|
| Unitarias | pytest | **155** pruebas; cobertura 99.5 % (líneas + ramas) de `app/domain` + `app/services`; umbral 90 % | `backend/tests/unit/` |
| Integración | Bruno 4.2.1 | **58** casos / **116** aserciones (32 EP, 18 BVA, 8 DT); 57 pasan y 1 saltado (defecto D-1); 7 con tag `smoke` | `integration/` |
| End-to-end | Playwright 1.65.0 | **3** recorridos: 1 `@smoke` (registro, subir álbum, reproducir y logout) y 2 `@regression` (búsqueda y reproducción; edición de perfil) | `e2e/tests/` |

## Capturas (`evidencia/`)

| Archivo | Build | Contenido |
|---|---|---|
| [`01-build-10-etapas.png`](evidencia/01-build-10-etapas.png) | #10 | Etapas en verde, commit `ff8bbe4`, 1 min 39 s; resumen de unitarias (155 pruebas, 99.8 % / 98.1 %) |
| [`02-build-10-artefacto-despliegue.png`](evidencia/02-build-10-artefacto-despliegue.png) | #10 | Imagen `nodus-sonare:ff8bbe4…`; URL probada `http://localhost:5002/api/version` y respuesta `{"version":"ff8bbe4…","environment":"dev"}`; integración 58 casos, 116 tests, 0 fallas |
| [`03-build-11-etapas.png`](evidencia/03-build-11-etapas.png) | #11 | Integración en rojo con las etapas anteriores en verde; *Correo si falla* ejecutado; commit `d61f4de` |
| [`04-build-11-integracion-resumen.png`](evidencia/04-build-11-integracion-resumen.png) | #11 | Log de Integración: `58 (56 Passed, 1 Failed, 1 Skipped)`, `114/116`, `exit code 1` |
| [`04b-build-11-prueba-fallida.png`](evidencia/04b-build-11-prueba-fallida.png) | #11 | Log de Integración en `02-register/bva-05-username-41 (400 Bad Request)`: `× status 422`, `AssertionError: expected 400 to equal 422`, línea 30 del `.bru` y `× error body` |
| [`05-build-11-correo.png`](evidencia/05-build-11-correo.png) | #11 | Correo recibido: asunto `Build #11 en rojo: Integración (falló) (dev)`, de `philipfalla@ufm.edu` para los dos integrantes, commit, ambiente, etapa y enlace al log |
| [`06-build-12-etapas.png`](evidencia/06-build-12-etapas.png) | #12 | Verde otra vez después del revert, commit `3b49c0e` |
| [`07-build-14-cobertura.png`](evidencia/07-build-14-cobertura.png) | #14 | Unitarias en rojo: 145 pruebas, cobertura 85.9 % / 86.5 %; Build, Despliegue e Integración sin correr; commit `62b4679` |
| [`08-build-14-correo.png`](evidencia/08-build-14-correo.png) | #14 | Correo recibido: `Build #14 en rojo: Unitarias + cobertura (falló) (dev)` |
| [`09-build-9-staging-etapas.png`](evidencia/09-build-9-staging-etapas.png) | #9 | Lanzado a mano con `env=staging · suite=smoke`; etapas *Despliegue (staging)* e *Integración (staging, smoke)* en verde |
| [`09b-build-9-staging-despliegue.png`](evidencia/09b-build-9-staging-despliegue.png) | #9 | Imagen `nodus-sonare:65ae0d3…`; URL probada `http://localhost:5003/api/version` y respuesta `{"version":"65ae0d3…","environment":"staging"}` |
| [`10-build-15-etapas.png`](evidencia/10-build-15-etapas.png) | #15 | Verde después del revert de la cobertura, commit `a132f85` |
| [`11-commits-main.png`](evidencia/11-commits-main.png) | — | Historial de `main` con los SHA de los builds #10 a #16 y su estado de CI |
| [`12-build-17-etapas.png`](evidencia/12-build-17-etapas.png) | #17 | Las 7 etapas en verde, incluida *End-to-end (dev, regression, chromium)*; commit `d338d17`; 3 min 5 s |
| [`13-build-19-staging-firefox-etapas.png`](evidencia/13-build-19-staging-firefox-etapas.png) | #19 | Lanzado a mano con `env=staging · suite=smoke · browser=firefox`; todas las etapas en verde; commit `db278bf` |
| [`13b-build-19-e2e-pasos.png`](evidencia/13b-build-19-e2e-pasos.png) | #19 | Pasos de *End-to-end (staging, smoke, firefox)*: instala Firefox, verifica la instancia, vacía los datos de staging y corre Playwright |
