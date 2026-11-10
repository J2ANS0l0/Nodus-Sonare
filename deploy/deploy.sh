#!/usr/bin/env bash
# Deploys the image nodus-sonare:<sha> as the <env> environment and checks that the running instance
# answers that same version on GET /api/version. Exits non-zero if anything fails.
#
#   deploy/deploy.sh <env> <sha>        e.g. deploy/deploy.sh staging "$(git rev-parse HEAD)"
set -euo pipefail

ENV_NAME="${1:?usage: deploy.sh <env> <sha>}"
SHA="${2:?usage: deploy.sh <env> <sha>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/env/$ENV_NAME.env"
IMAGE="nodus-sonare:$SHA"
CONTAINER="nodus-$ENV_NAME"

[[ -f "$ENV_FILE" ]] || { echo "Unknown environment '$ENV_NAME' (no $ENV_FILE)"; exit 2; }
HOST_PORT="$(grep -E '^HOST_PORT=' "$ENV_FILE" | cut -d= -f2)"
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image $IMAGE not found: run the build stage first"; exit 2; }

# 1. Shared infrastructure (DynamoDB Local + Silo). Same values as docker/.env in local development.
export S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}" S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin123}"
docker compose -f "$ROOT/docker/docker-compose.yml" up -d --wait silo dynamodb
NETWORK="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose -f "$ROOT/docker/docker-compose.yml" ps -q dynamodb)")"

# 2. Environment data: table, buckets and SQLite file (idempotent, keeps existing data)
docker volume create "nodus-$ENV_NAME-data" >/dev/null
RUN_ARGS=(--network "$NETWORK" --env-file "$ENV_FILE" -v "nodus-$ENV_NAME-data:/app/data")
docker run --rm "${RUN_ARGS[@]}" "$IMAGE" python -m scripts.init_infra

# 3. Replace the running instance of this environment
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped "${RUN_ARGS[@]}" \
  -e JWT_SECRET="$(openssl rand -hex 32)" -p "$HOST_PORT:5002" "$IMAGE" >/dev/null

# 4. The instance must answer with the version of this commit
"$ROOT/deploy/check-version.sh" "http://localhost:$HOST_PORT" "$ENV_NAME" "$SHA"
