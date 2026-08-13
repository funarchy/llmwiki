import { describe, it, expect } from 'vitest';
import { orphans } from '../../src/lint/checks/orphans.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: orphans', () => {
  it('accepts pages reachable through nested indexes', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('flags a page no index links to', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const issues = orphans(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/mongo.md');
  });

  it('flags a page linked only from another concept page', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [redis][redis].\n\n[redis]: /llmwiki/redis.md\n'),
      'llmwiki/redis.md': page('Redis'),
    });
    const issues = orphans(contextFor(root));
    expect(issues.map((i) => i.file)).toEqual(['llmwiki/redis.md']);
  });

  it('flags an index unreachable from the root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const files = orphans(contextFor(root)).map((i) => i.file);
    expect(files).toContain('llmwiki/data/mongo.md');
    expect(files).toContain('llmwiki/data/index.md');
  });

  it('never flags the bundle-root index itself', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('does not flag the bundle README', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/README.md': '# Readme\n',
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('tolerates a link cycle between two indexes', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Back](/llmwiki/index.md) - back\n',
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('follows a relative link in an index, since reachability is not about style', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('follows a parent-relative link in an index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Top](../top.md) - top\n',
      'llmwiki/top.md': page('Top'),
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('still flags a page nothing links to, relative or absolute', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/lonely.md': page('Lonely'),
    });
    expect(orphans(contextFor(root)).map((i) => i.file)).toEqual(['llmwiki/lonely.md']);
  });

  it('does not follow a relative link that climbs out of the bundle', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Out](../outside.md) - out\n',
      'llmwiki/lonely.md': page('Lonely'),
      'outside.md': '# Outside\n',
    });
    // `outside.md` is not in the bundle, so it is simply not a traversal target,
    // and `lonely.md` remains an orphan.
    expect(orphans(contextFor(root)).map((i) => i.file)).toEqual(['llmwiki/lonely.md']);
  });

  it('reports the check id and error severity', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const issues = orphans(contextFor(root));
    expect(issues[0].check).toBe('orphans');
    expect(issues[0].severity).toBe('error');
  });
});
