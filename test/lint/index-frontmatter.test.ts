import { describe, it, expect } from 'vitest';
import { indexFrontmatter } from '../../src/lint/checks/index-frontmatter.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: index-frontmatter', () => {
  it('accepts an index with no frontmatter', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n',
    });
    expect(indexFrontmatter(contextFor(root))).toEqual([]);
  });

  it('accepts okf_version on the bundle-root index only', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': "---\nokf_version: '0.2'\n---\n\n# Root\n",
    });
    expect(indexFrontmatter(contextFor(root))).toEqual([]);
  });

  it('flags frontmatter on a non-root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': "---\nokf_version: '0.2'\n---\n\n# Data\n",
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data/index.md');
  });

  it('flags a key other than okf_version on the root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': "---\nokf_version: '0.2'\ntitle: Root\n---\n\n# Root\n",
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/title/);
  });

  it('flags an index whose frontmatter block will not parse, rather than passing it', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '---\ntitle: [unclosed\n---\n\n# Data\n',
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data/index.md');
    expect(issues[0].message).toMatch(/not a parseable mapping/);
  });

  it('flags an empty frontmatter block on a non-root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '---\n---\n\n# Data\n',
    });
    expect(indexFrontmatter(contextFor(root))).toHaveLength(1);
  });

  it('reports the check id and error severity', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': "---\ntitle: Data\n---\n\n# Data\n",
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues[0].check).toBe('index-frontmatter');
    expect(issues[0].severity).toBe('error');
  });
});
