# llmwiki

This repository's mission is to solve
[#1](https://github.com/funarchy/llmwiki/issues/1) well.

A knowledge base that lives in your repository — [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
markdown pages that agents navigate along explicit links instead of similarity
search — plus the dependency layer OKF leaves out of scope.

## Status

Early but complete for v1. The bundle core, the linter, `init` / `lint` /
`gaps`, the dependency layer (`add`, `rm`, `install`, `update`, vendoring),
and the agent skillset (five skills, `skills sync`, hash-locking) all ship.

## Quick start

Not yet on npm — run from a checkout:

```bash
npm install && npm run build
node dist/cli.js init                    # scaffold llmwiki/, llmwiki.yaml and the skillset
node dist/cli.js lint                    # hold the bundle to the schema
node dist/cli.js gaps                    # list unresolved eval cases and stub pages
node dist/cli.js add <pkg>               # resolve, vendor and lock a dependency
node dist/cli.js rm <pkg>                # remove a dependency and re-sync
node dist/cli.js install --frozen        # verify the vendored tree matches the lock (CI)
node dist/cli.js update [pkg]            # re-resolve and report the knowledge diff
node dist/cli.js skills sync             # reinstall skills from the installed CLI version
```

Once published these become `npx llmwiki init` / `lint` / `gaps` / etc.

## Skills

`llmwiki init` (and `llmwiki skills sync`) installs five model-invoked
skills into both `.claude/skills/` and `.agents/skills/`, canonically
`skills/wiki-*/SKILL.md` in this repository:

- **`wiki-ingest`** — the write path: turn a source (conversation, doc,
  config file, URL) into pages, propose the structure first, wire up
  indexes and cross-links, then lint and commit once.
- **`wiki-search`** — the read path: answer a question by navigating the
  bundle from its root index, citing every page used and reporting which
  subtree (own pages, `deps/`, `vendor/`) each part came from.
- **`wiki-eval`** — usability tests over `_meta/eval/` cases: `add`, a
  single navigator run, a batch run that flags regressions, and `list`.
- **`wiki-review`** — adversarial, advisory-only: reports data loss,
  inter-page conflicts and convention issues without editing anything.
- **`wiki-vendor`** — synthesizes a bundle for a dependency that ships
  none, sourced from `llms.txt` / docs / README / docs site, marked
  `generated: true`, with coverage stated honestly.

`llmwiki.yaml`'s `skills:` setting controls installation: `managed`
(default) keeps both trees synced to the CLI's shipped copies; `vendored`
installs once and never overwrites local edits; `off` leaves skill
installation to the plugin path instead (`.claude-plugin/`, for
`/plugin install`) — one source, two delivery paths. Lint check 12 flags a
skill whose installed copy has drifted from the CLI's shipped hash, and is
**warning-only**: a stale skill must never fail CI.

## Contributing

The contribution this project wants right now is an issue, not a PR —
see [CONTRIBUTING.md](CONTRIBUTING.md) for the honest why.

## Design

The design — format, dependency model, trust boundaries — is documented
in this repository's own bundle: start at [llmwiki/index.md](llmwiki/index.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
