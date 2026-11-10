# Nodus Sonare — Backend (Python / FastAPI)

| Store | Tecnología | Contenido |
|---|---|---|
| Usuarios | **SQLite3** (`backend/data/users.db`) | `id, email, username, password_hash (bcrypt), profile_picture_key, bio, avatar_url, created_at` |
| Grafo | **DynamoDB Local** (tabla `node`, PK `node_id`) | Nodos con la estructura `RawNode` de `src/types/graph.ts` |
| Archivos | **Silo** ([pgsty/silo](https://github.com/pgsty/silo), compatible S3) | Buckets `music`, `music-cover`, `profile-picture` (lectura pública) |

Un usuario de SQLite se enlaza con su nodo `Author` en DynamoDB mediante `author_id == users.id`.

## Puesta en marcha

Ver los comandos completos (instalación, Docker, datos) en el [README principal](../README.md).

```bash
# Crea la tabla users, la tabla node y los buckets, todos vacíos
uv run python -m scripts.init_infra
# Vacía usuarios, nodos y archivos (app nueva)
uv run python -m scripts.init_infra --reset
# Levanta la API en el puerto 5002 con recarga automática
uv run uvicorn app.main:app --port 5002 --reload
```
Consola de Silo: http://localhost:9001 · Admin de DynamoDB: http://localhost:8003 · Swagger: http://localhost:5002/docs

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/register` | – | `{email, username, password, real_name?, description?}` → crea usuario (SQLite) + nodo Author (Dynamo), devuelve `token` |
| POST | `/api/login` | – | `{username (o email), password}` → `{token, user, node}` |
| GET | `/api/nodes/stream` | – | SSE: snapshot de nodos cuando cambian + eventos `{"__type":"track"}` |
| POST | `/api/node_selected` | – | Publica la pista seleccionada a los clientes SSE |
| POST | `/api/like` | ✔ | `{music_node_id}` → alterna like en `node_music_likes` |
| GET | `/api/palette` | – | Colores permitidos para los nodos (de `paleta.jpeg`) |
| POST | `/api/profile/update` | ✔ | Edita el propio nodo Author (y sincroniza `bio` en SQLite). `node_color` debe ser un color de la paleta |
| POST | `/api/profile/picture` | ✔ | multipart `file` → bucket `profile-picture`; actualiza `profile_picture_key`, `avatar_url` y `author_profile_picture` |
| POST | `/api/upload/music` | ✔ | multipart `file` (audio) → bucket `music`. Extrae la portada incrustada en el audio (ID3, FLAC, M4A, OGG), la guarda en `music-cover` y devuelve `{url, cover_url}` |
| POST | `/api/album/upload` | ✔ | Crea nodos Music/Tag y sus enlaces, ligados al Author del usuario. Cada track acepta `cover_url` (se guarda como `music_cover_url`); el `node_color` de cada canción es aleatorio de la paleta |

Auth = header `Authorization: Bearer <token>` (JWT). Los errores siempre son `{"error": "..."}`.

## Arquitectura (SOLID)

```
app/
  domain/          entidades (User, Node, StoredObject, IncomingFile) y excepciones de dominio
  interfaces/      puertos (Protocols): UserRepository, NodeRepository, ObjectStorage, PasswordHasher, TokenService,
                   CoverExtractor, ImageProcessor
  infrastructure/  adaptadores: SqliteUserRepository, DynamoNodeRepository, SiloObjectStorage, Bcrypt, JWT,
                   MutagenCoverExtractor (portadas incrustadas), PillowImageProcessor (validación de imágenes)
  services/        casos de uso: Auth, Profile, Like, Album, Media, Artwork, LiveFeed (SSE)
  api/             routers FastAPI, schemas Pydantic, dependencias y manejo de errores
  core/            config (pydantic-settings) y container.py (composition root)
```

- **S**: cada servicio/adaptador tiene una sola responsabilidad (p. ej. `MediaService` valida y sube archivos, `ProfileService` gestiona el perfil).
- **O/L**: nuevos backends (AWS S3 real, DynamoDB en la nube, Postgres…) se agregan implementando el mismo puerto, sin tocar servicios.
- **I**: puertos pequeños y específicos (usuarios, nodos, storage, hashing, tokens).
- **D**: los servicios dependen de `interfaces/`; solo `core/container.py` conoce las clases concretas y permite inyectar otras implementaciones.

### Cover de cada canción

Al subir un audio, `ArtworkService` extrae su portada incrustada (prefiere la *front cover*), la valida y
normaliza con Pillow (formato real, máx. 1200 px / 1 MB) y la guarda en `music-cover` con una clave basada en
su hash: todas las pistas de un álbum con la misma portada comparten un solo objeto.

### Paleta de colores de los nodos

Todos los nodos (Music, Author y Tag) toman su color de `app/domain/palette.py`: 12 colores extraídos de
`paleta.jpeg` (el tono más puro de cada región del círculo cromático, sin el negro del centro ni el blanco del
fondo). Cada canción, autor o tag nuevo recibe un color aleatorio de la paleta, y en Profile el usuario solo puede
elegir entre esos colores (el backend rechaza cualquier otro).
