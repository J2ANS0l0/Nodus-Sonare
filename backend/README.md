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
# Corre los tests con fakes en memoria (no requiere Docker)
uv run pytest -q
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
| POST | `/api/profile/update` | ✔ | Edita el propio nodo Author (y sincroniza `bio` en SQLite) |
| POST | `/api/profile/picture` | ✔ | multipart `file` → bucket `profile-picture`; actualiza `profile_picture_key`, `avatar_url` y `author_profile_picture` |
| POST | `/api/upload/music` | ✔ | multipart `file` (audio) → bucket `music`. Extrae la portada incrustada en el audio (ID3, FLAC, M4A, OGG), la guarda en `music-cover` y devuelve `{url, cover_url, color}` (color dominante de la portada) |
| POST | `/api/album/upload` | ✔ | Crea nodos Music/Tag y sus enlaces, ligados al Author del usuario. Cada track acepta `cover_url` y `color`: se guardan como `music_cover_url` y `node_color` de su nodo (si no hay, se usa el color del autor) |

Auth = header `Authorization: Bearer <token>` (JWT). Los errores siempre son `{"error": "..."}`.

## Arquitectura (SOLID)

```
app/
  domain/          entidades (User, Node, StoredObject, IncomingFile) y excepciones de dominio
  interfaces/      puertos (Protocols): UserRepository, NodeRepository, ObjectStorage, PasswordHasher, TokenService,
                   CoverExtractor, ImageProcessor
  infrastructure/  adaptadores: SqliteUserRepository, DynamoNodeRepository, SiloObjectStorage, Bcrypt, JWT,
                   MutagenCoverExtractor (portadas incrustadas), PillowImageProcessor (validación y color dominante)
  services/        casos de uso: Auth, Profile, Like, Album, Media, Artwork, LiveFeed (SSE)
  api/             routers FastAPI, schemas Pydantic, dependencias y manejo de errores
  core/            config (pydantic-settings) y container.py (composition root)
```

- **S**: cada servicio/adaptador tiene una sola responsabilidad (p. ej. `MediaService` valida y sube archivos, `ProfileService` gestiona el perfil).
- **O/L**: nuevos backends (AWS S3 real, DynamoDB en la nube, Postgres…) se agregan implementando el mismo puerto, sin tocar servicios.
- **I**: puertos pequeños y específicos (usuarios, nodos, storage, hashing, tokens).
- **D**: los servicios dependen de `interfaces/`; solo `core/container.py` conoce las clases concretas. Los tests inyectan fakes en memoria.

### Cover y color de cada canción

Al subir un audio, `ArtworkService` extrae su portada incrustada (prefiere la *front cover*), la valida y
normaliza con Pillow (formato real, máx. 1200 px / 1 MB) y la guarda en `music-cover` con una clave basada en
su hash: todas las pistas de un álbum con la misma portada comparten un solo objeto.

El color del nodo es el más relevante de la portada, como lo nombraría una persona ("es una portada verde"):
1. Se reduce la imagen a una paleta de 16 colores y se descartan grises, casi negros y casi blancos.
2. Los colores se agrupan por familia de matiz (todos los verdes juntos, todos los cafés juntos…), para que un
   sujeto pintado en muchos tonos no pierda contra un fondo plano de un solo tono.
3. Gana la familia con más superficie saturada, y dentro de ella se elige el tono más vivo y bien iluminado.
4. Una portada en escala de grises devuelve su gris más común.
