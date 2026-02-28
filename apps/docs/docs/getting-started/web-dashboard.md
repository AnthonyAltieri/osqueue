---
sidebar_position: 3
---

# Web Dashboard

osqueue includes a web dashboard built with React, TanStack Router, and Tailwind CSS. It provides real-time visibility into queue state and lets you submit jobs interactively.

## Running the Dashboard

### With SST (recommended for development)

```bash
bunx sst dev
```

This starts the broker, web dashboard, and provisions an S3 bucket automatically. The dashboard is available at `http://localhost:3001`.

### Manual Setup

Start the broker and dashboard in separate terminals:

```bash
# Terminal 1: Start the broker
STORAGE_BACKEND=memory bun run --cwd apps/osqueue broker

# Terminal 2: Start the web dashboard
cd apps/web
VITE_BROKER_URL=http://localhost:8080 bun run dev
```

## Dashboard Features

### Queue Stats

The dashboard header shows real-time queue statistics:

- **Total** — number of jobs currently in the queue
- **Unclaimed** — jobs waiting to be picked up by a worker
- **In Progress** — jobs currently being processed
- **Completed** — running total of all completed jobs

### Job Table

Lists all active jobs with details:

- Job ID, status, type, assigned worker
- Attempt count and max attempts
- Created and last heartbeat timestamps

### Producer Panel

Submit jobs directly from the browser:

- Select a job type from the dropdown
- Enter a JSON payload
- Click submit and see the job appear in the job table

### Worker Panel

Displays connected worker information and active job assignments.

### Connection Status

An indicator showing whether the dashboard is connected to the broker. The dashboard auto-detects the broker URL:

- If `VITE_BROKER_URL` is set, it uses that directly
- On a real domain (e.g., `demo.osqueue.com`), it connects to `api.osqueue.com` (via Caddy reverse proxy)
- On localhost, it connects to `localhost:8080`

## Transport Configuration

The dashboard uses Connect Web transport by default. You can override this with `VITE_OSQUEUE_TRANSPORT`:

```bash
VITE_OSQUEUE_TRANSPORT=rest bun run dev   # Use REST transport
VITE_OSQUEUE_TRANSPORT=ws bun run dev     # Use WebSocket transport
```
