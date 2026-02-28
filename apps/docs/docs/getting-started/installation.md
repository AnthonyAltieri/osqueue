---
sidebar_position: 1
---

# Installation

## Prerequisites

- **Bun 1.1+** or **Node.js 20+**
- For S3 backend: an AWS account with an S3 bucket
- For GCS backend: a Google Cloud project with a GCS bucket

## Monorepo Setup

If you're working from the osqueue monorepo:

```bash
git clone https://github.com/AnthonyAltieri/osqueue.git
cd osqueue
bun install
bun run build
```

## Package Installation

For consumers, install only the packages you need:

| Package | Install | Use case |
|---------|---------|----------|
| `@osqueue/client` | `npm i @osqueue/client` | Submit and manage jobs from any service |
| `@osqueue/worker` | `npm i @osqueue/worker` | Process jobs with typed handlers |
| `@osqueue/broker` | `npm i @osqueue/broker` | Run a broker server |
| `@osqueue/storage` | `npm i @osqueue/storage` | Direct storage backend access |
| `@osqueue/types` | `npm i @osqueue/types` | Shared types and error classes |

The client, worker, and broker packages re-export the types they need, so `@osqueue/types` is only required if you need error classes or storage interfaces directly.

## ESM Only

All packages are ESM-only. Make sure your project is configured for ES modules:

```json
{
  "type": "module"
}
```

Or use `.mts` file extensions with TypeScript.
