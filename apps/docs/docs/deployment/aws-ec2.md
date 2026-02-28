---
sidebar_position: 2
---

# AWS EC2 Deployment

osqueue deploys to a single EC2 t2.micro instance (AWS free tier eligible) running all services in a Docker container.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 EC2 t2.micro                     │
│                                                  │
│  ┌──────────┐                                    │
│  │  Caddy   │◀── HTTPS ── Internet               │
│  │  :80/443 │                                    │
│  └────┬─────┘                                    │
│       │                                          │
│       ├── yourdomain.com → Docs (static files)   │
│       ├── demo.yourdomain.com → Dashboard :3001  │
│       └── api.yourdomain.com → Broker :8080      │
│                                                  │
│  ┌───────────┐  ┌───────────┐                    │
│  │ Broker    │  │ Broker    │ (standby)          │
│  │ :8080     │  │ :8081     │                    │
│  └───────────┘  └───────────┘                    │
│                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐               │
│  │Worker 1│ │Worker 2│ │Worker 3│               │
│  └────────┘ └────────┘ └────────┘               │
│                                                  │
│  ┌───────────────┐                               │
│  │ Web Dashboard  │                               │
│  │ :3001          │                               │
│  └───────────────┘                               │
└─────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────┐
    │ S3 Bucket│
    │queue.json│
    └──────────┘
```

## Deploy with SST

```bash
sst deploy --stage production
```

This provisions:
- An S3 bucket for queue state
- An ECR repository for the Docker image
- A t2.micro EC2 instance with an Elastic IP
- IAM roles with S3 and ECR access
- A security group allowing HTTP (80), HTTPS (443), and SSH (22)

The Docker image is built from `infra/Dockerfile.ec2` and pushed to ECR.

## What the Docker Image Contains

The `Dockerfile.ec2` builds a multi-stage image:

1. **Dependencies**: Installs all workspace packages via `bun install`
2. **Build**: Compiles all packages in dependency order, plus the web dashboard
3. **Caddy**: Copies the Caddy binary for reverse proxy / HTTPS
4. **Entrypoint**: Runs `infra/entrypoint.sh`

## Entrypoint: What Runs

The `entrypoint.sh` script starts all services:

1. **Caddy** — reverse proxy with automatic HTTPS (if `DOMAIN` is set)
2. **Two brokers** on ports 8080 and 8081 — one becomes leader, the other retries every 10 seconds
3. **Health check wait** — waits for at least one broker to become healthy
4. **Three workers** — connect to the leader broker
5. **Web dashboard** — serves the production build on port 3001

## Domain Setup

1. Point your domain's A record to the Elastic IP (shown in SST output)
2. Point `demo.yourdomain.com` and `api.yourdomain.com` to the same IP
3. Caddy auto-provisions TLS certificates via Let's Encrypt

The Caddyfile routes:
- `yourdomain.com` → documentation site (static files from Docusaurus build)
- `demo.yourdomain.com` → web dashboard (port 3001)
- `api.yourdomain.com` → broker API (port 8080)

## Production Environment

The SST config sets these environment variables on the EC2 instance:

```bash
DOMAIN=osqueue.com
STORAGE_BACKEND=s3
S3_BUCKET=<auto-created bucket>
S3_REGION=<your AWS region>
GROUP_COMMIT_INTERVAL_MS=2000
BROKER_HEARTBEAT_INTERVAL_MS=30000
S3_MAX_WRITES_PER_MINUTE=30
S3_MAX_READS_PER_MINUTE=60
```

## Cost Breakdown

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t2.micro | Free (750 hrs/month for 12 months) |
| Elastic IP | Free (when attached to running instance) |
| S3 storage | ~$0.01 (single small JSON file) |
| S3 API calls | ~$0.25 (with throttling) |
| Data transfer | ~$0.00 (minimal) |
| **Total** | **~$0.26/month** (free tier) or **~$8.50/month** (after free tier) |
