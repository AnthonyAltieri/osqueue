---
sidebar_position: 1
---

# Local Development

Two options for running osqueue locally: SST dev mode (provisions real S3 bucket) or manual mode (in-memory storage).

## Option 1: SST Dev Mode

SST creates a real S3 bucket in your AWS account and runs all services locally.

```bash
bunx sst dev
```

This starts:
- A broker on `http://localhost:8080` (backed by S3)
- The web dashboard on `http://localhost:3001`

To run producers and workers:

```bash
# In a new terminal
bun run --cwd apps/osqueue producer

# In another terminal
bun run --cwd apps/osqueue worker
```

SST automatically injects the S3 bucket name via the `Resource.QueueBucket` binding.

## Option 2: Manual with Memory Backend

No AWS account needed. Uses in-memory storage (data lost on restart).

```bash
# Terminal 1: Broker
STORAGE_BACKEND=memory bun run --cwd apps/osqueue broker

# Terminal 2: Producer
BROKER_URL=http://localhost:8080 bun run --cwd apps/osqueue producer

# Terminal 3: Worker
BROKER_URL=http://localhost:8080 bun run --cwd apps/osqueue worker
```

## Web Dashboard

The web dashboard runs separately:

```bash
# Terminal 4: Dashboard
cd apps/web
VITE_BROKER_URL=http://localhost:8080 bun run dev
```

Open `http://localhost:3001` to see the dashboard.

## Environment Variables

Key environment variables for local development:

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `memory` | Storage backend: `memory`, `s3`, or `gcs` |
| `BROKER_HOST` | `0.0.0.0` | Broker bind address |
| `BROKER_PORT` | `8080` | Broker listen port |
| `BROKER_URL` | `http://localhost:8080` | Broker URL for clients/workers |
| `GROUP_COMMIT_INTERVAL_MS` | `50` | Group commit interval (low for dev) |
| `BROKER_HEARTBEAT_INTERVAL_MS` | `3000` | Broker heartbeat interval |

See [Configuration](/deployment/configuration) for the full reference.
