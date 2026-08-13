import { describe, it, expect } from 'vitest';
import { linkAbsolute } from '../../src/lint/checks/link-absolute.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' };

describe('check: link-absolute', () => {
  it('accepts repo-root-absolute links', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: /llmwiki/index.md\n'),
    });
    expect(linkAbsolute(contextFor(root))).toEqual([]);
  });

  it('flags a relative link', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: ./index.md\n'),
    });
    const issues = linkAbsolute(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/repo-root-absolute/);
  });

  it('flags a parent-relative link', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/data/index.md': '# Data\n\n* [Up](../index.md) - up\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(linkAbsolute(contextFor(root))).toHaveLength(1);
  });

  it('accepts external URLs', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: https://example.com/docs\n'),
    });
    expect(linkAbsolute(contextFor(root))).toEqual([]);
  });

  it('flags a GitHub blob URL pointing at this same repository', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/funarchy/llmwiki/blob/main/src/cli.ts\n',
      ),
    });
    const ctx = contextFor(root, 'git@github.com:funarchy/llmwiki.git');
    const issues = linkAbsolute(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/same repository/);
  });

  it('allows a GitHub URL for a different repository', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/other/project/blob/main/readme.md\n',
      ),
    });
    const ctx = contextFor(root, 'git@github.com:funarchy/llmwiki.git');
    expect(linkAbsolute(ctx)).toEqual([]);
  });

  it('skips the in-repo GitHub check when there is no remote', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/funarchy/llmwiki/blob/main/src/cli.ts\n',
      ),
    });
    expect(linkAbsolute(contextFor(root, null))).toEqual([]);
  });

  it('flags a tree URL as well as a blob URL', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/funarchy/llmwiki/tree/main/src\n',
      ),
    });
    const ctx = contextFor(root, 'https://github.com/funarchy/llmwiki');
    expect(linkAbsolute(ctx)).toHaveLength(1);
  });

  it('checks index files too', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Rel](./mongo.md) - rel\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    expect(linkAbsolute(contextFor(root))).toHaveLength(1);
  });
});
