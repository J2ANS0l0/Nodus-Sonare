# Nodus Sonare — Backend (Python / FastAPI)

| Store | Tecnología | Contenido |
|---|---|---|
| Usuarios | **SQLite3** (`backend/data/users.db`) | `id, email, username, password_hash (bcrypt), profile_picture_key, bio, avatar_url, created_at` |
| Grafo | **DynamoDB Local** (tabla `node`, PK `node_id`) | Nodos con la misma estructura que `data/nodes.json` |
| Archivos | **Silo** ([pgsty/silo](https://github.com/pgsty/silo), compatible S3) | Buckets `music`, `music-cover`, `profile-picture` (lectura pública) |

Un usuario de SQLite se enlaza con su nodo `Author` en DynamoDB mediante `author_id == users.id`.

## Puesta en marcha

```bash
npm run infra:up      # docker compose: silo (9000/9001), dynamodb (8002), dynamodb-admin (8003)
cp backend/.env.example backend/.env   # y cambia JWT_SECRET
npm run infra:init    # crea tabla users, tabla node + seed de data/nodes.json, buckets
npm start             # backend :5002 + frontend :3000 (vite hace proxy de /api)
npm run test:backend  # pytest con fakes en memoria (no requiere Docker)
```

`uv run python -m scripts.init_infra --reseed` sobrescribe los nodos con `data/nodes.json`.
Consola de Silo: http://localhost:9001 · Admin de DynamoDB: http://localhost:8003 · Swagger: http://localhost:5002/docs

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/register` | – | `{email, username, password, real_name?, description?}` → crea usuario (SQLite) + nodo Author (Dynamo), devuelve `token` |
| POST | `/api/login` | – | `{username (o email), password}` → `{token, user, node}` |
| GET | `/api/me` | ✔ | Usuario + nodo Author |
| GET | `/api/nodes` | – | Todos los nodos |
| GET | `/api/nodes/{id}` | – | Un nodo |
| GET | `/api/nodes/stream` | – | SSE: snapshot de nodos cuando cambian + eventos `{"__type":"track"}` |
| GET | `/api/current_track` | – | Última pista seleccionada (204 si no hay) |
| POST | `/api/node_selected` | – | Publica la pista seleccionada a los clientes SSE |
| POST | `/api/like` | ✔ | `{music_node_id}` → alterna like en `node_music_likes` |
| POST | `/api/profile/update` | ✔ | Edita el propio nodo Author (y sincroniza `bio` en SQLite) |
| POST | `/api/profile/picture` | ✔ | multipart `file` → bucket `profile-picture`; actualiza `profile_picture_key`, `avatar_url` y `author_profile_picture` |
| POST | `/api/upload/music` | ✔ | multipart `file` (audio) → bucket `music`, devuelve `url` |
| POST | `/api/upload/cover` | ✔ | multipart `file` (imagen) → bucket `music-cover`, devuelve `url` |
| POST | `/api/album/upload` | ✔ | Crea nodos Music/Tag y sus enlaces, ligados al Author del usuario |

Auth = header `Authorization: Bearer <token>` (JWT). Los errores siempre son `{"error": "..."}`.

## Arquitectura (SOLID)

```
app/
  domain/          entidades (User, Node, StoredObject, IncomingFile) y excepciones de dominio
  interfaces/      puertos (Protocols): UserRepository, NodeRepository, ObjectStorage, PasswordHasher, TokenService
  infrastructure/  adaptadores: SqliteUserRepository, DynamoNodeRepository, SiloObjectStorage, Bcrypt, JWT
  services/        casos de uso: Auth, Node, Profile, Like, Album, Media, LiveFeed (SSE)
  api/             routers FastAPI, schemas Pydantic, dependencias y manejo de errores
  core/            config (pydantic-settings) y container.py (composition root)
```

- **S**: cada servicio/adaptador tiene una sola responsabilidad (p. ej. `MediaService` valida y sube archivos, `ProfileService` gestiona el perfil).
- **O/L**: nuevos backends (AWS S3 real, DynamoDB en la nube, Postgres…) se agregan implementando el mismo puerto, sin tocar servicios.
- **I**: puertos pequeños y específicos (usuarios, nodos, storage, hashing, tokens).
- **D**: los servicios dependen de `interfaces/`; solo `core/container.py` conoce las clases concretas. Los tests inyectan fakes en memoria.
