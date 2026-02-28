---
sidebar_position: 3
---

# Configuration

All osqueue configuration is done via environment variables.

## Full Reference

### Broker

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BROKER_HOST` | string | `0.0.0.0` | Address the broker binds to |
| `BROKER_PORT` | number | `8080` | Port the broker listens on |
| `BROKER_URL` | string | `http://localhost:8080` | Broker URL for clients and workers |
| `GROUP_COMMIT_INTERVAL_MS` | number | `50` | How often the write loop commits batched mutations |
| `BROKER_HEARTBEAT_INTERVAL_MS` | number | `3000` | How often the broker registers itself in state |

### Storage

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `STORAGE_BACKEND` | enum | `memory` | Backend type: `memory`, `s3`, or `gcs` |
| `S3_BUCKET` | string | — | S3 bucket name (required for `s3` backend) |
| `S3_REGION` | string | — | AWS region for S3 |
| `S3_PREFIX` | string | — | Key prefix for S3 objects |
| `GCS_BUCKET` | string | — | GCS bucket name (required for `gcs` backend) |
| `GCS_PREFIX` | string | — | Key prefix for GCS objects |

### Throttling

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `S3_MAX_READS_PER_MINUTE` | number | `0` (disabled) | Maximum storage read operations per minute (applies to all backends, not just S3) |
| `S3_MAX_WRITES_PER_MINUTE` | number | `0` (disabled) | Maximum storage write operations per minute (applies to all backends, not just S3) |

### Web Dashboard

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VITE_BROKER_URL` | string | auto-detected | Broker URL for the dashboard |
| `VITE_OSQUEUE_TRANSPORT` | string | `connect` | Transport plugin: `connect`, `rest`, or `ws` |

### Deployment

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DOMAIN` | string | — | Domain name for Caddy routing (production only; TLS is handled by CloudFront) |

## Tuning Guide

### Development Settings

Low latency, high API usage (fine for local/memory backend):

```bash
GROUP_COMMIT_INTERVAL_MS=50
BROKER_HEARTBEAT_INTERVAL_MS=3000
# No throttling needed for memory backend
```

### Production Settings

Balanced for cost and responsiveness:

```bash
GROUP_COMMIT_INTERVAL_MS=2000
BROKER_HEARTBEAT_INTERVAL_MS=30000
S3_MAX_WRITES_PER_MINUTE=30
S3_MAX_READS_PER_MINUTE=60
```

### High-Throughput Settings

More API calls, lower latency:

```bash
GROUP_COMMIT_INTERVAL_MS=200
BROKER_HEARTBEAT_INTERVAL_MS=5000
S3_MAX_WRITES_PER_MINUTE=300
S3_MAX_READS_PER_MINUTE=600
```

## Constants

These are compile-time defaults in the source code, not environment variables:

| Constant | Value | Description |
|----------|-------|-------------|
| `QUEUE_STATE_KEY` | `queue.json` | Object key for the state file |
| `DEFAULT_HEARTBEAT_TIMEOUT_MS` | `30000` | Job heartbeat expiry timeout |
| `DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS` | `10000` | Broker liveness timeout |
| `DEFAULT_MAX_ATTEMPTS` | `3` | Default max retry attempts per job |
