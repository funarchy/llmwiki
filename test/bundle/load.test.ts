import { describe, it, expect } from 'vitest';
import { loadBundle, isConceptPage } from '../../src/bundle/load.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';

describe('loadBundle', () => {
  it('collects pages with repo-relative posix paths', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.root).toBe('llmwiki');
    expect(bundle.pages.map((p) => p.repoPath).sort()).toEqual([
      'llmwiki/data/index.md',
      'llmwiki/data/mongo.md',
      'llmwiki/index.md',
    ]);
  });

  it('marks index files', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const index = bundle.pages.find((p) => p.repoPath === 'llmwiki/index.md');
    const concept = bundle.pages.find((p) => p.repoPath === 'llmwiki/mongo.md');
    expect(index?.isIndex).toBe(true);
    expect(concept?.isIndex).toBe(false);
  });

  it('excludes _meta/ entirely', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/index.md': '# Eval\n',
      'llmwiki/_meta/eval/a-question.md': '---\nquestion: "Q?"\nstatus: to_resolve\n---\n',
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['llmwiki/index.md']);
  });

  it('parses frontmatter and links per page', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [data][data].\n\n[data]: /llmwiki/index.md\n'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const mongo = bundle.pages.find((p) => p.repoPath === 'llmwiki/mongo.md')!;
    expect(mongo.frontmatter?.title).toBe('Mongo');
    expect(mongo.links.map((l) => l.href)).toEqual(['/llmwiki/index.md']);
  });

  it('records the frontmatter state per page', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/good.md': page('Good'),
      'llmwiki/broken.md': '---\ntitle: [unclosed\n---\n\nBody.\n',
    });
    const bundle = loadBundle(root, 'llmwiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(byPath('llmwiki/index.md').frontmatterState).toBe('absent');
    expect(byPath('llmwiki/good.md').frontmatterState).toBe('parsed');
    expect(byPath('llmwiki/broken.md').frontmatterState).toBe('invalid');
  });

  it('reports link line numbers relative to the whole file, not the body', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\n[data]: /llmwiki/index.md\n'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const mongo = bundle.pages.find((p) => p.repoPath === 'llmwiki/mongo.md')!;
    // The fixture's frontmatter occupies lines 1-7, so the link cannot be on line 1-2.
    expect(mongo.links[0].line).toBeGreaterThan(7);
  });

  it('ignores non-markdown files and dotfiles', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/diagram.png': 'not markdown',
      'llmwiki/.hidden.md': page('Hidden'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['llmwiki/index.md']);
  });

  it('throws when the bundle root does not exist', () => {
    const root = makeRepo({ 'llmwiki.yaml': configYaml() });
    expect(() => loadBundle(root, 'llmwiki')).toThrow(/llmwiki/);
  });

  it('loads a bundle at a nested root', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml('docs/knowledge'),
      'docs/knowledge/index.md': '# Root\n',
      'docs/knowledge/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'docs/knowledge');
    expect(bundle.pages.map((p) => p.repoPath).sort()).toEqual([
      'docs/knowledge/index.md',
      'docs/knowledge/mongo.md',
    ]);
  });
});

describe('isConceptPage', () => {
  it('excludes index files and the bundle-root README', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/README.md': '# Readme\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(isConceptPage(byPath('llmwiki/index.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('llmwiki/README.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('llmwiki/mongo.md'), bundle)).toBe(true);
  });
});
