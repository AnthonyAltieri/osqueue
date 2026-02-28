---
sidebar_position: 100
---

# Contributing

## Repository Layout

```
osqueue/
├── packages/
│   ├── types/       # Shared types, branded IDs, error classes
│   ├── proto/       # Protocol buffer schema + generated code
│   ├── storage/     # S3, GCS, Memory, Throttled backends
│   ├── core/        # State machine, broker election, group-commit
│   ├── client/      # Queue client with transport plugins
│   ├── worker/      # Worker runtime
│   └── broker/      # Broker server (Fastify + Connect + REST + WS)
├── apps/
│   ├── osqueue/     # Example CLI app (broker, producer, worker)
│   ├── web/         # Web dashboard (React + TanStack)
│   └── docs/        # This documentation site (Docusaurus)
├── infra/           # Docker, Caddy, entrypoint for EC2 deploy
├── sst.config.ts    # SST infrastructure config
└── package.json     # Workspace root
```

## Getting Started

```bash
# Install dependencies
bun install

# Build all packages (in dependency order)
bun run build

# Run tests
bun run test

# Lint
bun run lint

# Format
bun run fmt
```

## Package Build Order

Packages must be built in dependency order:

1. `@osqueue/types`
2. `@osqueue/proto`
3. `@osqueue/storage`
4. `@osqueue/core`
5. `@osqueue/client`
6. `@osqueue/worker`
7. `@osqueue/broker`

The `build:packages` script handles this automatically:

```bash
bun run build:packages
```

## Testing

Tests use Vitest:

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch
```

## Adding a New Package

1. Create `packages/my-package/` with `package.json`, `tsconfig.json`, and `src/index.ts`
2. Set `"name": "@osqueue/my-package"` in `package.json`
3. Add `tsup` build config
4. Add the package to the `build:packages` script in root `package.json` (in the right dependency order)
5. If publishable, add to `.changeset/config.json` linked group

## Changesets and Versioning

osqueue uses [Changesets](https://github.com/changesets/changesets) for version management. Published packages (`@osqueue/client`, `@osqueue/broker`, `@osqueue/worker`) use linked versioning — when any linked package is bumped, all linked packages receive the same bump level.

```bash
# Create a changeset
bun run changeset

# Bump versions
bun run release:version

# Publish to npm
bun run release:publish
```

## Code Style

- **Formatter**: oxfmt (`bun run fmt`)
- **Linter**: oxlint (`bun run lint`)
- **Language**: TypeScript 5.7+, ESM only
- **Build tool**: tsup (ESM output, Node 20+ target)
