# llmwiki

A knowledge base that lives in your repository — [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
markdown pages that agents navigate along explicit links instead of similarity
search — plus the dependency layer OKF leaves out of scope.

## Status

Early. The bundle core, the linter, and `init` / `lint` / `gaps` work. The
dependency layer (`add`, `install`, vendoring) and the agent skillset are next.

## Quick start

```bash
npx llmwiki init      # scaffold llmwiki/ and llmwiki.yaml
npx llmwiki lint      # hold the bundle to the schema
npx llmwiki gaps      # list unresolved eval cases and stub pages
```

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
