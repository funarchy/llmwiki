---
$schema: ../_meta/page.schema.json
type: topic
title: Version conflicts and cycles
description: Why llmwiki hoists dependencies flat and refuses rather than nests conflicting versions
tags: [composition]
sources:
  - src/resolve/graph.ts
---

A published bundle declares its own dependencies but never ships its own
`deps/` subtree, so `resolveGraph` (`src/resolve/graph.ts`) hoists every
transitive dependency flat into `<root>/deps/<name>/`, npm-style — the same
bundle required by two different producers lands at one path, not two nested
copies.

**Two dependencies wanting different versions of the same bundle name is a
hard failure, not a nested install.** Where a package manager would place
each version at a different depth in `node_modules`, llmwiki refuses: when
`resolveGraph` resolves a name it has already seen at a different version,
it throws `ConflictError` naming both requirers and both versions, and
`install`/`add`/`rm`/`update` all exit non-zero without writing a lock. An
agent that can navigate to two contradictory pages about the same bundle has
no basis to prefer either and will silently pick one — code tolerates two
truths in separate scopes, knowledge does not.

**Dependency cycles are rejected the same way.** `detectCycles` does a
depth-first walk over declared-dependency edges, starting from `.` (the
consumer itself); revisiting a node still on the current path throws
`CycleError` with the full cycle path joined by ` → `. Nothing else would
stop two bundles from declaring each other as dependencies, and a cyclic
composition graph has no well-defined flat-hoist result to vendor.

Both errors surface as a thrown `Error` from `resolveGraph`, which every
caller (`install`, `add`'s pre-write probe, `rm`, `update`) lets propagate —
`cli.ts`'s `runAction` wrapper turns it into a printed message and exit code
1, never a stack trace.

This repository has no dependencies declared, so `resolveGraph` here always
resolves to an empty bundle list — there is nothing to conflict.
