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

This starts the broker and provisions an S3 bucket automatically. Run the web dashboard separately (see Manual Setup below).

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

The dashboard has multiple pages accessible via the navigation.

### Main Dashboard (`/`)

- **Queue Stats** — real-time counts of total, unclaimed, in-progress, and completed jobs
- **Active Workers** — broker connection status and active worker information
- **Job Table** — lists all active jobs with ID, status, type, worker, attempts, and timestamps
- **Activity Log** — real-time event log
- **Raw State** — view the raw `queue.json` state

### Producer Page (`/producer`)

Submit jobs directly from the browser:

- Select a job type from the dropdown
- Enter a JSON payload
- Click submit and see the job appear in the job table

### Worker Page (`/worker`)

Displays connected worker information and active job assignments.

### Connection Status

An indicator showing whether the dashboard is connected to the broker. The dashboard auto-detects the broker URL:

- If `VITE_BROKER_URL` is set, it uses that directly
- On a real domain (e.g., `demo.osqueue.com`), it connects to `api.osqueue.com` (via CloudFront → Caddy reverse proxy)
- On localhost, it connects to `localhost:8080`

## Transport Configuration

The dashboard uses Connect Web transport by default. You can override this with `VITE_OSQUEUE_TRANSPORT`:

```bash
VITE_OSQUEUE_TRANSPORT=rest bun run dev   # Use REST transport
VITE_OSQUEUE_TRANSPORT=ws bun run dev     # Use WebSocket transport
```
