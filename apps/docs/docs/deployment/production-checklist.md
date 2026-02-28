---
sidebar_position: 4
---

# Production Checklist

Before deploying osqueue to production, review this checklist.

## Storage

- [ ] **Use S3 or GCS** — never use the memory backend in production
- [ ] **Enable throttling** — set `S3_MAX_WRITES_PER_MINUTE` and `S3_MAX_READS_PER_MINUTE` to control costs
- [ ] **Bucket permissions** — ensure the broker's IAM role has read/write access to the S3 bucket

## Broker Tuning

- [ ] **Increase commit interval** — set `GROUP_COMMIT_INTERVAL_MS=2000` (default 50ms is for dev)
- [ ] **Increase heartbeat interval** — set `BROKER_HEARTBEAT_INTERVAL_MS=30000` (default 3s is aggressive)
- [ ] **Run two brokers** — for automatic failover via leader election

## Worker Configuration

- [ ] **Set `maxAttempts`** on jobs to prevent infinite retries (default: 3)
- [ ] **Tune `heartbeatIntervalMs`** — for long-running jobs, increase from the 5s default
- [ ] **Ensure `heartbeatTimeoutMs` > 2x `heartbeatIntervalMs`** — prevents false expiry

## Monitoring

- [ ] **Check `/healthz`** — returns `{"status":"ok"}` when the broker is running
- [ ] **Monitor `/v1/stats`** — track total, unclaimed, in-progress, and completed counts
- [ ] **Watch `/v1/throttle-stats`** — if `throttledWrites` is growing, your commit interval may be too low
- [ ] **Monitor broker leadership** — the broker logs "Lost leadership" if it self-demotes

## Networking

- [ ] **HTTPS via Caddy** — set the `DOMAIN` environment variable for automatic TLS
- [ ] **DNS records** — point `yourdomain.com`, `demo.yourdomain.com`, and `api.yourdomain.com` to the Elastic IP
- [ ] **Security group** — only open ports 80 (HTTP), 443 (HTTPS), and 22 (SSH)

## Cost Control

With the recommended production settings:

```bash
GROUP_COMMIT_INTERVAL_MS=2000
S3_MAX_WRITES_PER_MINUTE=30
S3_MAX_READS_PER_MINUTE=60
```

Expected S3 costs: ~$0.25/month for API calls.

## Example Production Environment

```bash
DOMAIN=yourdomain.com
STORAGE_BACKEND=s3
S3_BUCKET=my-queue-bucket
S3_REGION=us-east-1
GROUP_COMMIT_INTERVAL_MS=2000
BROKER_HEARTBEAT_INTERVAL_MS=30000
S3_MAX_WRITES_PER_MINUTE=30
S3_MAX_READS_PER_MINUTE=60
```
