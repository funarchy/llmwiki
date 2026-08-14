---
question: What happens when two dependencies require different versions of the same knowledge bundle?
added: 2026-08-15
status: satisfied
navigation: [index.md, composition/index.md, composition/conflicts.md]
answer-must-mention: [ConflictError, requirers, non-zero]
---

## Correct answer

A hard failure, not a nested install: `resolveGraph` throws
`ConflictError` naming both requirers and both versions, and
`install`/`add`/`rm`/`update` all exit non-zero without writing a lock.
The rationale is the bundle's own: an agent that can navigate to two
contradictory pages about the same bundle will silently pick one —
code tolerates two truths in separate scopes, knowledge does not;
confirmed by jkbo on 2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index. Three link hops.
