---
question: How do the agent skills get installed, and what keeps them current?
added: 2026-08-15
status: satisfied
navigation: [index.md, skills/index.md, skills/overview.md, commands/index.md, commands/init.md, commands/add-rm-update.md, commands/install.md, commands/lint.md, composition/index.md, format/index.md]
answer-must-mention: [syncSkills, .claude/skills, .agents/skills, hash, skills-current]
---

## Correct answer

`wiki-sticky init` calls `syncSkills` against the just-written config,
installing the five shipped skills into `.claude/skills/` and
`.agents/skills/`; `wiki-sticky skills sync` does the same standalone.
Currency is hash-locking: the installed copies are recorded in
`wiki-sticky-lock.json`'s `skills` section and checked for drift by lint
check 12 (`skills-current`), which only ever warns — a stale skill
nudges `skills sync`, never fails CI; confirmed by jkbo on 2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index.
