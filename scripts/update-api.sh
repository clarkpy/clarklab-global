#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${CLARKLAB_HOST_REPO_PATH:?CLARKLAB_HOST_REPO_PATH is required}"
COMPOSE_FILE="${CLARKLAB_DOCKER_COMPOSE_FILE:-docker-compose.prod.yml}"
BRANCH="${CLARKLAB_UPDATE_BRANCH:-main}"
GIT_HEADER="${CLARKLAB_GIT_HTTP_HEADER:-}"
DOCKER_CLI_IMAGE="${CLARKLAB_DOCKER_CLI_IMAGE:-docker:27-cli}"
SELF_CONTAINER="${CLARKLAB_API_CONTAINER:-$HOSTNAME}"
CANDIDATE_NAME="clarklab-api-candidate-${CLARKLAB_API_UPDATE_JOB_ID:-manual}"
CANDIDATE_TIMEOUT_SECONDS="${CLARKLAB_API_CANDIDATE_TIMEOUT_SECONDS:-60}"

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

PROJECT_NAME="$(docker inspect "$SELF_CONTAINER" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
if [[ -z "$PROJECT_NAME" ]]; then
  PROJECT_NAME="$(basename "$REPO_PATH")"
fi

HOST_PROJECT_DIR="$(docker inspect "$SELF_CONTAINER" --format "{{ range .Mounts }}{{ if eq .Destination \"${REPO_PATH}\" }}{{ .Source }}{{ end }}{{ end }}" 2>/dev/null || true)"
if [[ -z "$HOST_PROJECT_DIR" ]]; then
  HOST_PROJECT_DIR="$REPO_PATH"
fi

echo "Rebuilding API container for project ${PROJECT_NAME}..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" build api
cleanup_candidate() {
  docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true
}

trap cleanup_candidate EXIT
cleanup_candidate

echo "Starting candidate API container (${CANDIDATE_NAME})..."
CANDIDATE_ID="$(
  docker compose \
    -p "$PROJECT_NAME" \
    -f "$COMPOSE_FILE" \
    run \
    --no-deps \
    -d \
    --name "$CANDIDATE_NAME" \
    api
)"

echo "Candidate container started: ${CANDIDATE_ID}"
echo "Waiting for candidate API to become healthy (timeout: ${CANDIDATE_TIMEOUT_SECONDS}s)..."

CANDIDATE_DEADLINE=$((SECONDS + CANDIDATE_TIMEOUT_SECONDS))
while true; do
  CANDIDATE_STATE="$(docker inspect "$CANDIDATE_ID" --format '{{ .State.Status }}' 2>/dev/null || echo missing)"
  CANDIDATE_HEALTH="$(
    docker inspect "$CANDIDATE_NAME" \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      2>/dev/null || echo missing
  )"

  if [[ "$CANDIDATE_STATE" != "running" ]]; then
    echo "Candidate API stopped before becoming healthy."
    docker logs "$CANDIDATE_NAME" --tail 100 || true
    exit 1
  fi

  if [[ "$CANDIDATE_HEALTH" == "healthy" ]]; then
    echo "Candidate API is healthy."
    break
  fi

  if [[ "$CANDIDATE_HEALTH" == "unhealthy" ]]; then
    echo "Candidate API failed its health check."
    docker logs "$CANDIDATE_NAME" --tail 100 || true
    exit 1
  fi

  if (( SECONDS >= CANDIDATE_DEADLINE )); then
    echo "Candidate API did not become healthy within ${CANDIDATE_TIMEOUT_SECONDS}s."
    docker logs "$CANDIDATE_NAME" --tail 100 || true
    exit 1
  fi

  sleep 2
done

cleanup_candidate
trap - EXIT

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
    -v "${HOST_PROJECT_DIR}:${HOST_PROJECT_DIR}" \
    -w "${HOST_PROJECT_DIR}" \
    "$DOCKER_CLI_IMAGE" \
    sh -ec "
      set -e
      sleep 2
      docker compose \
      -p '${PROJECT_NAME}' \
      -f '${COMPOSE_FILE}' \
      up \
      -d \
      --no-deps \
      --wait \
      --wait-timeout '${CANDIDATE_TIMEOUT_SECONDS}' \
      api
    "
)"

printf '%s\n' "{\"jobId\":\"${CLARKLAB_API_UPDATE_JOB_ID:-}\",\"commitSha\":\"${DEPLOYED_SHA}\"}" \
  > "$REPO_PATH/.clarklab/pending-api-update.json"

{
  echo "[$(date -Iseconds)] Scheduled API restart helper ${HELPER_ID} (${RESTART_NAME})"
} >> "$RESTART_LOG"

echo "API restart scheduled via helper container ${HELPER_ID}."
echo "The candidate passed its health check. The live API replacement has been scheduled."
echo "API update finished."
