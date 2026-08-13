# llmwiki

A knowledge base that lives in your repository — [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
markdown pages that agents navigate along explicit links instead of similarity
search — plus the dependency layer OKF leaves out of scope.

## Status

Early. The bundle core, the linter, and `init` / `lint` / `gaps` work. The
dependency layer (`add`, `install`, vendoring) and the agent skillset are next.

## Quick start

Not yet on npm — run from a checkout:

```bash
npm install && npm run build
node dist/cli.js init      # scaffold llmwiki/ and llmwiki.yaml
node dist/cli.js lint      # hold the bundle to the schema
node dist/cli.js gaps      # list unresolved eval cases and stub pages
```

Once published these become `npx llmwiki init` / `lint` / `gaps`.

## Design

The full specification, including the dependency model, lives in
[docs/superpowers/specs/2026-08-13-llmwiki-design.md](docs/superpowers/specs/2026-08-13-llmwiki-design.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
