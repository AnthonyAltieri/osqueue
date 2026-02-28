#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null' EXIT SIGINT SIGTERM

# Health check using bun (curl not available in oven/bun image)
check_health() {
  bun -e "fetch('http://localhost:$1/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>/dev/null
}

# Caddy reverse proxy (HTTP routing)
if [ -n "$DOMAIN" ]; then
  echo "Starting Caddy for $DOMAIN..."
  DOMAIN=$DOMAIN caddy run --config /app/Caddyfile --adapter caddyfile &
fi

# Broker with auto-retry (standby retries every 10s until leader dies)
start_broker() {
  local port=$1
  while true; do
    BROKER_HOST=0.0.0.0 BROKER_PORT=$port bun /app/apps/osqueue/src/broker.ts && break
    echo "Broker :$port not elected, retrying in 10s..."
    sleep 10
  done
}

start_broker 8080 &
start_broker 8081 &

# Wait for primary broker health
echo "Waiting for broker to become healthy..."
until check_health 8080 || check_health 8081; do
  sleep 1
done
echo "Broker healthy"

# Determine which port the leader is on
if check_health 8080; then
  LEADER_PORT=8080
else
  LEADER_PORT=8081
fi

# 3 workers
for i in 1 2 3; do
  BROKER_URL=http://localhost:$LEADER_PORT bun /app/apps/osqueue/src/worker.ts &
done

# Web dashboard on demo subdomain (TanStack Start requires Node runtime)
PORT=3001 node /app/serve-web.mjs 2>&1 &

# Docs site is served as static files by Caddy from /app/apps/docs/build

wait -n
