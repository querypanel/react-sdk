#!/usr/bin/env bash
# Starts querypanel-sdk (npm run dev), waits for /healthz, runs ClickHouse + sync + v2 ask demo, then stops the server.
# Prerequisite: ClickHouse reachable at CLICKHOUSE_URL (default http://localhost:8123), e.g. docker-compose up clickhouse_demo -d
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3001}"
pick_port() {
	local p
	for p in $(seq 3100 3999); do
		if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
			echo "$p"
			return 0
		fi
	done
	return 1
}

PORT_WAS_SET=0
if [[ -n "${PORT+x}" ]]; then
	PORT_WAS_SET=1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
	if [[ "$PORT_WAS_SET" -eq 1 ]]; then
		echo "[run-clickhouse-demo-with-server] error: PORT=${PORT} is already in use" >&2
		exit 1
	fi
	PORT="$(pick_port)"
fi

export PORT
export QUERYPANEL_BASE_URL="${QUERYPANEL_BASE_URL:-http://127.0.0.1:${PORT}}"

DEV_PID=""
DEMO_EXIT=0

kill_tree() {
	local pid=$1
	local c
	for c in $(pgrep -P "$pid" 2>/dev/null || true); do
		kill_tree "$c"
	done
	kill "$pid" 2>/dev/null || true
}

cleanup() {
	if [[ -n "${DEV_PID:-}" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
		kill_tree "$DEV_PID"
		wait "$DEV_PID" 2>/dev/null || true
	fi
}

trap cleanup EXIT INT TERM

echo "[run-clickhouse-demo-with-server] starting API on PORT=${PORT} (${QUERYPANEL_BASE_URL})"
echo "[run-clickhouse-demo-with-server] ensure ClickHouse is up (default ${CLICKHOUSE_URL:-http://localhost:8123})"
npm run dev &
DEV_PID=$!

echo "[run-clickhouse-demo-with-server] waiting for ${QUERYPANEL_BASE_URL}/healthz ..."
for _ in $(seq 1 90); do
	if curl -sf "${QUERYPANEL_BASE_URL}/healthz" >/dev/null 2>&1; then
		echo "[run-clickhouse-demo-with-server] API is up"
		break
	fi
	sleep 1
done

if ! curl -sf "${QUERYPANEL_BASE_URL}/healthz" >/dev/null 2>&1; then
	echo "[run-clickhouse-demo-with-server] error: server did not become healthy within 90s" >&2
	exit 1
fi

npm run dem:ch || DEMO_EXIT=$?

echo "[run-clickhouse-demo-with-server] stopping API (pid ${DEV_PID})"
trap - EXIT INT TERM
cleanup
exit "$DEMO_EXIT"
