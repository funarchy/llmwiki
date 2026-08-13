import { describe, it, expect } from 'vitest';
import { linksResolve } from '../../src/lint/checks/links-resolve.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: links-resolve', () => {
  it('accepts an absolute link to an existing file', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('flags an absolute link to a missing file with its line number', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [gone][gone].\n\n[gone]: /llmwiki/gone.md\n'),
    });
    const issues = linksResolve(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/mongo.md');
    expect(issues[0].message).toMatch(/llmwiki\/gone\.md/);
    expect(issues[0].line).toBeGreaterThan(0);
  });

  it('resolves links to files outside the bundle but inside the repo', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'README.md': '# Repo\n',
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [repo][repo].\n\n[repo]: /README.md\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('skips external URLs', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [ext][ext].\n\n[ext]: https://example.com/x\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('skips relative links, which check 8 owns', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [rel][rel].\n\n[rel]: ../nowhere.md\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('flags a link that climbs out of the repository root rather than resolving it', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [esc][esc].\n\n[esc]: /../../etc/passwd\n'),
    });
    const issues = linksResolve(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/escapes the repository root/);
  });

  it('resolves an image link like any other link', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/img/d.png': 'binary-ish',
      'llmwiki/mongo.md': page('Mongo', '\n![diagram][d]\n\n[d]: /llmwiki/img/d.png\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('flags a missing image', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\n![diagram][d]\n\n[d]: /llmwiki/img/gone.png\n'),
    });
    expect(linksResolve(contextFor(root))).toHaveLength(1);
  });

  it('checks links in index files too', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Gone](/llmwiki/gone.md) - gone\n',
    });
    const issues = linksResolve(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/index.md');
  });
});
