import { describe, it, expect } from 'vitest';
import { dirIndex } from '../../src/lint/checks/dir-index.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: dir-index', () => {
  it('accepts a tree where every page directory has an index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(dirIndex(contextFor(root))).toEqual([]);
  });

  it('flags a directory with pages but no index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const issues = dirIndex(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data');
  });

  it('does not require an index inside _meta/', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/a-question.md': '---\nquestion: "Q?"\nstatus: to_resolve\n---\n',
    });
    expect(dirIndex(contextFor(root))).toEqual([]);
  });

  it('flags each indexless directory separately', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/a/one.md': page('One'),
      'llmwiki/b/two.md': page('Two'),
    });
    expect(dirIndex(contextFor(root)).map((i) => i.file).sort()).toEqual(['llmwiki/a', 'llmwiki/b']);
  });

  it('reports the check id and error severity', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const issues = dirIndex(contextFor(root));
    expect(issues[0].check).toBe('dir-index');
    expect(issues[0].severity).toBe('error');
  });
});
