#!/usr/bin/env bash
set -Eeuo pipefail

suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
network="streamer-server-smoke-${suffix}"
postgres="streamer-server-postgres-${suffix}"
server="streamer-server-app-${suffix}"
image="streamer-server-smoke:${suffix}"

cleanup() {
  docker rm -f "$server" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --target production -f server/Dockerfile -t "$image" .
docker network create "$network" >/dev/null
docker run -d --name "$postgres" --network "$network" \
  -e POSTGRES_USER=streamer \
  -e POSTGRES_PASSWORD=streamer_test \
  -e POSTGRES_DB=streamer_test \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "$postgres" pg_isready -U streamer -d streamer_test >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "PostgreSQL smoke dependency did not become ready."
    exit 1
  fi
  sleep 1
done

docker run -d --name "$server" --network "$network" \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e SERVER_INSTANCE_MODE=single \
  -e "DATABASE_URL=postgresql://streamer:streamer_test@${postgres}:5432/streamer_test" \
  -e JWT_SECRET=9f4e3d2c1b0a8765fedcba0987654321 \
  -e CORS_ORIGINS=https://app.streamer.example \
  -e APP_URL_WEB=https://app.streamer.example \
  -e APP_URL_DEEPLINK=streamer:// \
  -e EMAIL_DELIVERY_MODE=smtp \
  -e SMTP_HOST=smtp.streamer.example \
  -e SMTP_USER=streamer \
  -e SMTP_PASS=smoke-test-only \
  "$image" >/dev/null

for attempt in $(seq 1 45); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$server")"
  if [[ "$health" == "healthy" ]]; then
    break
  fi
  if [[ "$health" == "unhealthy" ]] || [[ "$(docker inspect --format '{{.State.Running}}' "$server")" != "true" ]]; then
    docker logs "$server"
    echo "Server container failed before becoming healthy."
    exit 1
  fi
  if [[ "$attempt" -eq 45 ]]; then
    docker logs "$server"
    echo "Server container did not become healthy."
    exit 1
  fi
  sleep 1
done

live="$(docker exec "$server" wget -qO- http://127.0.0.1:3001/live)"
ready="$(docker exec "$server" wget -qO- http://127.0.0.1:3001/ready)"
runtime_user="$(docker exec "$server" id)"

grep -q '"status":"live"' <<<"$live"
grep -q '"status":"ok"' <<<"$ready"
grep -q 'uid=1000(node)' <<<"$runtime_user"

docker stop --time 15 "$server" >/dev/null
echo "Server production container smoke test passed."
