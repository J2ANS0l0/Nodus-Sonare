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
