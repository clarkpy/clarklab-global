#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${CLARKLAB_HOST_REPO_PATH:?CLARKLAB_HOST_REPO_PATH is required}"
COMPOSE_FILE="${CLARKLAB_DOCKER_COMPOSE_FILE:-docker-compose.prod.yml}"
BRANCH="${CLARKLAB_UPDATE_BRANCH:-main}"
GIT_HEADER="${CLARKLAB_GIT_HTTP_HEADER:-}"
DOCKER_CLI_IMAGE="${CLARKLAB_DOCKER_CLI_IMAGE:-docker:27-cli}"

cd "$REPO_PATH"

echo "Fetching latest changes for branch ${BRANCH}..."
if [[ -n "$GIT_HEADER" ]]; then
  git -c "http.extraHeader=${GIT_HEADER}" fetch origin "$BRANCH"
else
  git fetch origin "$BRANCH"
fi

git checkout "$BRANCH"
if [[ -n "$GIT_HEADER" ]]; then
  git -c "http.extraHeader=${GIT_HEADER}" pull --ff-only origin "$BRANCH"
else
  git pull --ff-only origin "$BRANCH"
fi

echo "Rebuilding API container..."
docker compose -f "$COMPOSE_FILE" build api

DEPLOYED_SHA="$(git rev-parse HEAD)"
mkdir -p "$REPO_PATH/.clarklab"

echo "Scheduling API container restart..."
RESTART_NAME="clarklab-api-restart-${CLARKLAB_API_UPDATE_JOB_ID:-manual}"
RESTART_LOG="$REPO_PATH/.clarklab/restart-api.log"

docker pull "$DOCKER_CLI_IMAGE" >/dev/null 2>&1 || true

docker rm -f "$RESTART_NAME" >/dev/null 2>&1 || true

HELPER_ID="$(
  docker run -d --rm \
    --name "$RESTART_NAME" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${REPO_PATH}:${REPO_PATH}" \
    -w "${REPO_PATH}" \
    "$DOCKER_CLI_IMAGE" \
    sh -ec "
      set -e
      sleep 2
      docker compose -f '${COMPOSE_FILE}' stop api || true
      docker compose -f '${COMPOSE_FILE}' up -d --no-deps api
    "
)"

printf '%s\n' "{\"jobId\":\"${CLARKLAB_API_UPDATE_JOB_ID:-}\",\"commitSha\":\"${DEPLOYED_SHA}\"}" \
  > "$REPO_PATH/.clarklab/pending-api-update.json"

{
  echo "[$(date -Iseconds)] Scheduled API restart helper ${HELPER_ID} (${RESTART_NAME})"
} >> "$RESTART_LOG"

echo "API restart scheduled via helper container ${HELPER_ID}."
echo "The control plane will stop briefly while the new API container starts."
echo "API update finished."
