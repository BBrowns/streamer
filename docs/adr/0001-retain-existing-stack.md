# ADR-0001: Retain The Existing Application Stack

- Status: Accepted
- Date: 2026-08-01

## Context

Streamer already has substantial behavior and reliability coverage in
TypeScript, npm workspaces, Expo/React Native, React Native Web, Electron, Hono,
PostgreSQL/Prisma, Zod and the Node/WebTorrent/FFmpeg bridge. The observed
maintenance problems come from mixed responsibilities and implicit boundaries,
not from a measured inability of those technologies to meet the product needs.

## Decision

Retain the current stack. Improve ownership through typed contracts, pure
application services, explicit playback routes and platform adapters. Do not
start a Flutter, native-only, Tauri, Rust, Go, NestJS or similar migration
without a measured limitation and a focused replacement proposal.

## Consequences

- Existing reliability behavior and tests remain useful during migration.
- Architectural work is incremental and reviewable instead of a big-bang
  rewrite.
- Platform-specific limits still require honest capability reporting and real
  target evidence.
- A future component may be replaced independently when measurements justify
  it, provided its port remains stable.
