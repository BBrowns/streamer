---
name: graphify
description: Use the existing Streamer knowledge graph for codebase navigation, paths, and impact analysis when graphify-out/graph.json exists, or when the user explicitly asks to build, update, or inspect Graphify output. Do not activate for ordinary code questions when no graph exists.
---

# Graphify

Graphify is optional navigation evidence. Source files and tests remain the source
of truth.

## Existing graph

When `graphify-out/graph.json` exists:

1. For a codebase question, run `graphify query "<question>"` first.
2. Use `graphify path "<A>" "<B>"` for a relationship and
   `graphify explain "<concept>"` for one concept.
3. Prefer `graphify-out/wiki/index.md` for broad navigation. Read
   `graphify-out/GRAPH_REPORT.md` only when scoped queries are insufficient.
4. Open the source and tests named by the graph before changing behavior.
5. If code changed after the graph was built and the change is broad or risky,
   refresh with `graphify update .` before relying on impact analysis.

Prefer the `graphify-streamer` MCP tools when available; otherwise use the local
CLI. Dirty generated graph files are normal and do not invalidate a query.

## No graph

For an ordinary code question, continue with repository search and source
inspection. Do not build a graph merely because Graphify is installed.

When the user explicitly invokes `/graphify`, requests a build/update/export, or
asks about stale Graphify output, read [the build reference](references/build.md)
and follow the relevant workflow there.

## Generated artifacts

Do not stage or commit `graphify-out/` unless the user explicitly asks to version
it. `graphify update .` refreshes structural code extraction; use a forced extract
only when changed non-code artifacts must be represented.
