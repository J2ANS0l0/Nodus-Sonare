#!/usr/bin/env bash
# Asks a running instance which version and environment it is (the answer comes from the system, not from
# the pipeline) and fails if it does not match the expected commit SHA and environment.
#
#   deploy/check-version.sh <base-url> <env> <sha>
set -euo pipefail

URL="${1:?usage: check-version.sh <base-url> <env> <sha>}/api/version"
EXPECTED_ENV="${2:?}"
EXPECTED_SHA="${3:?}"

for _ in $(seq 1 30); do
  BODY="$(curl -fsS "$URL" 2>/dev/null)" && break
  sleep 1
done
[[ -n "${BODY:-}" ]] || { echo "No answer from $URL after 30 s"; exit 1; }

echo "URL tested: $URL"
echo "Response:   $BODY"
VERSION="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])' <<<"$BODY")"
ENVIRONMENT="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["environment"])' <<<"$BODY")"

if [[ "$VERSION" != "$EXPECTED_SHA" ]]; then
  echo "::error::Deployed version $VERSION does not match commit $EXPECTED_SHA"
  exit 1
fi
if [[ "$ENVIRONMENT" != "$EXPECTED_ENV" ]]; then
  echo "::error::Instance reports environment '$ENVIRONMENT', expected '$EXPECTED_ENV'"
  exit 1
fi
echo "OK: environment '$ENVIRONMENT' runs version $VERSION"
