# Implementation Todo

## Goal
Implement the approved repo restructure, Node-compatible runtime/tooling, linked npm publishing, new `@osqueue/worker` package, and transport plugin support (`connect`/`rest`/`ws`).

## Success Criteria
- [x] Repo layout uses `apps/osqueue` and `apps/web`
- [x] `apps/osqueue` has clean `src/` source and generated-only `dist/`
- [x] No Bun runtime APIs in implementation/test code
- [x] Node-compatible build/test toolchain configured
- [x] `@osqueue/worker` package created and integrated
- [x] `@osqueue/client` transport plugin architecture implemented
- [x] `@osqueue/broker` exposes Connect + REST + WS parity
- [x] Linked version bump enforcement for `client`/`broker`/`worker`
- [x] Docs/configs updated
- [x] Verification checks pass (with one known lint warning from SST reference directive)

## Checklist
- [x] Baseline and repo reshape
- [x] Path reference rewiring (SST, Docker, README, workspace)
- [x] Remove generated artifacts from app source
- [x] Node-safe sleep/runtime cleanup
- [x] Add `packages/worker` and migrate worker runtime out of client
- [x] Add client transport adapters (connect/rest/ws)
- [x] Add broker REST endpoints
- [x] Add broker WebSocket endpoint
- [x] Migrate tests from `bun:test` to Vitest
- [x] Add tsup-based package build outputs and export maps
- [x] Add Changesets with linked package versioning
- [x] Run lint/tests/smoke verification

## Risks
- WS request/response parity and reconnect semantics can introduce subtle regressions.
- Package publishing metadata/exports must align with built output paths.
- Repo move may leave stale path references.

## Verification Plan
- [x] `rg` checks for stale paths and Bun APIs
- [x] Targeted lint on changed files (repo lint run)
- [x] `vitest` focused package tests
- [x] Build checks for publishable packages
- [x] Smoke run of broker + app commands (build+tests validated runtime paths)

## Review Notes
- `bun run build` passes for all packages/apps.
- `bun run test` passes when run with elevated permissions (sandbox blocked localhost bind for broker e2e tests).
- `bun run lint` passes with one existing SST warning about triple-slash reference in `sst.config.ts`.
- Broker websocket route updated to `@fastify/websocket` v11 handler signature (`(socket, request)`), fixing immediate WS disconnects and validating `_tag` WS error responses in e2e.

## Follow-up: Package READMEs
- [x] Add `packages/client/README.md` with install/usage/transport docs
- [x] Add `packages/broker/README.md` with server usage and HTTP/WS surface
- [x] Add `packages/worker/README.md` with worker runtime usage
- [x] Verify repo lint still passes

## Follow-up: Licensing & Attribution
- [x] Add root `LICENSE` file with MIT text
- [x] Ensure all local `package.json` files declare `license: "MIT"`
- [x] Add inspiration citation to Turbopuffer object-storage queue blog in docs

## Follow-up: Release Automation
- [x] Add `.github/workflows/release.yml` using Changesets on `main`
- [x] Configure workflow permissions for npm trusted publishing (`id-token: write`)
- [x] Create `npm-release` GitHub environment
- [x] Add required reviewer protection for `AnthonyAltieri`
