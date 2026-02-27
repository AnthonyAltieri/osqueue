# osqueue

Distributed job queue built on object storage with compare-and-swap semantics. Jobs are persisted in S3 (or GCS) as a single JSON file, coordinated through a broker that batches mutations via group commit.

## Architecture

```
Browser tabs (producer/worker/observer)
       │
       │ ConnectRPC (HTTP)
       ▼
┌──────────────┐       ┌──────────┐
│  Broker      │──────▶│  S3      │
│  (Fastify)   │  CAS  │  queue.json
└──────────────┘       └──────────┘
```

Each browser tab connects directly to the broker via ConnectRPC. The broker reads/writes queue state to object storage using compare-and-swap for consistency.

## Packages

| Package | Description |
|---------|-------------|
| `packages/types` | Shared TypeScript types and constants |
| `packages/core` | State machine, group commit engine, broker election |
| `packages/proto` | Protobuf definitions and generated ConnectRPC stubs |
| `packages/storage` | Storage backends (Memory, S3, GCS) |
| `packages/client` | Queue client and worker SDK |
| `packages/broker` | Broker server (Fastify + ConnectRPC) |
| `packages/web` | TanStack Start frontend (dashboard, producer, worker) |
| `apps/` | CLI entrypoints for running broker/producer/worker locally |

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials (for deployment)
- [Docker](https://www.docker.com/) (for deployment)
- [SST](https://sst.dev) v3 (installed as a dev dependency)

## Quick Start (Local)

```bash
# Install dependencies
bun install

# Start the broker (in-memory storage)
bun run apps/src/broker.ts

# In another terminal — submit jobs
bun run apps/src/producer.ts

# In another terminal — process jobs
bun run apps/src/worker.ts
```

## Web Demo (Local Dev)

Run the broker and web app together using SST dev mode:

```bash
# Start both broker and web app with hot reload
bunx sst dev
```

This starts:
- **Broker** on `http://localhost:8080` (auto-detects SST-linked S3 bucket when available, falls back to in-memory storage)
- **Web app** on `http://localhost:3001` (Vite dev server)

For remote dev access (e.g. from another machine), set `DEV_HOST` to your machine's hostname:

```bash
DEV_HOST=my-dev-box.local bunx sst dev
```

Or run them separately:

```bash
# Terminal 1: broker
bun run apps/src/broker.ts

# Terminal 2: web app
VITE_BROKER_URL=http://localhost:8080 bun run --cwd packages/web dev
```

Then open three browser tabs:
1. `http://localhost:3001/` — Dashboard (observe the queue)
2. `http://localhost:3001/producer` — Submit jobs
3. `http://localhost:3001/worker` — Process jobs

## Deploy to AWS

Deployment uses SST v3 to provision all infrastructure on AWS:

- **S3 bucket** for queue state persistence
- **ECS Fargate** service for the broker (behind an ALB with health checks)
- **CloudFront + Lambda** for the TanStack Start web app

### 1. Configure AWS credentials

```bash
# Ensure your AWS credentials are set
aws sts get-caller-identity
```

SST uses your default AWS profile. Set `AWS_PROFILE` to use a different one:

```bash
export AWS_PROFILE=my-profile
```

### 2. Deploy

```bash
# Deploy to a personal dev stage
bunx sst deploy --stage dev

# Deploy to production
bunx sst deploy --stage production
```

The first deploy takes ~5 minutes (VPC + ECS cluster creation). Subsequent deploys are faster.

SST prints the outputs when done:

```
web:    https://d1xxxxx.cloudfront.net
broker: http://Broke-Broke-xxxxx.us-east-1.elb.amazonaws.com
```

Open the `web` URL and follow the multi-tab demo instructions.

### 3. Tear down

```bash
bunx sst remove --stage dev
```

This deletes all provisioned resources. The `production` stage uses `retain` removal policy for the S3 bucket.

## Environment Variables

### Broker (`apps/`)

| Variable | Default | Description |
|----------|---------|-------------|
| `BROKER_HOST` | `0.0.0.0` | Bind address |
| `BROKER_PORT` | `8080` | Listen port |
| `STORAGE_BACKEND` | `memory` | `memory`, `s3`, or `gcs` |
| `S3_BUCKET` | — | S3 bucket name (required when `s3`) |
| `S3_REGION` | — | AWS region |
| `S3_PREFIX` | — | Key prefix in bucket |
| `GCS_BUCKET` | — | GCS bucket name (required when `gcs`) |
| `GCS_PREFIX` | — | Key prefix in bucket |

### Web App (`packages/web/`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BROKER_URL` | `http://localhost:8080` | Broker URL for browser ConnectRPC calls |

## Tests

```bash
bun test
```

Runs unit tests (state machine) and e2e tests (broker + client + worker integration).
