import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadBundle, isConceptPage, pageDirectories } from '../../src/bundle/load.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';

describe('loadBundle', () => {
  it('collects pages with repo-relative posix paths', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n\n* [Data](/wiki/data/index.md) - data\n',
      'wiki/data/index.md': '# Data\n\n* [Mongo](/wiki/data/mongo.md) - mongo\n',
      'wiki/data/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'wiki');
    expect(bundle.root).toBe('wiki');
    expect(bundle.pages.map((p) => p.repoPath).sort()).toEqual([
      'wiki/data/index.md',
      'wiki/data/mongo.md',
      'wiki/index.md',
    ]);
  });

  it('marks index files', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'wiki');
    const index = bundle.pages.find((p) => p.repoPath === 'wiki/index.md');
    const concept = bundle.pages.find((p) => p.repoPath === 'wiki/mongo.md');
    expect(index?.isIndex).toBe(true);
    expect(concept?.isIndex).toBe(false);
  });

  it('excludes _meta/ entirely', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/_meta/eval/index.md': '# Eval\n',
      'wiki/_meta/eval/a-question.md': '---\nquestion: "Q?"\nstatus: to_resolve\n---\n',
    });
    const bundle = loadBundle(root, 'wiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['wiki/index.md']);
  });

  it('parses frontmatter and links per page', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/mongo.md': page('Mongo', '\nSee [data][data].\n\n[data]: /wiki/index.md\n'),
    });
    const bundle = loadBundle(root, 'wiki');
    const mongo = bundle.pages.find((p) => p.repoPath === 'wiki/mongo.md')!;
    expect(mongo.frontmatter?.title).toBe('Mongo');
    expect(mongo.links.map((l) => l.href)).toEqual(['/wiki/index.md']);
  });

  it('records the frontmatter state per page', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/good.md': page('Good'),
      'wiki/broken.md': '---\ntitle: [unclosed\n---\n\nBody.\n',
    });
    const bundle = loadBundle(root, 'wiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(byPath('wiki/index.md').frontmatterState).toBe('absent');
    expect(byPath('wiki/good.md').frontmatterState).toBe('parsed');
    expect(byPath('wiki/broken.md').frontmatterState).toBe('invalid');
  });

  it('reports link line numbers relative to the whole file, not the body', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/mongo.md': page('Mongo', '\n[data]: /wiki/index.md\n'),
    });
    const bundle = loadBundle(root, 'wiki');
    const mongo = bundle.pages.find((p) => p.repoPath === 'wiki/mongo.md')!;
    // The fixture's frontmatter occupies lines 1-7, so the link cannot be on line 1-2.
    expect(mongo.links[0].line).toBeGreaterThan(7);
  });

  it('ignores non-markdown files and dotfiles', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/diagram.png': 'not markdown',
      'wiki/.hidden.md': page('Hidden'),
    });
    const bundle = loadBundle(root, 'wiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['wiki/index.md']);
  });

  it('throws when the bundle root does not exist', () => {
    const root = makeRepo({ 'wiki-sticky.yaml': configYaml() });
    expect(() => loadBundle(root, 'wiki')).toThrow(/wiki/);
  });

  it('skips a dangling symlink instead of crashing', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/real.md': page('Real'),
    });
    symlinkSync(join(root, 'wiki', 'gone.md'), join(root, 'wiki', 'dangling.md'));
    const bundle = loadBundle(root, 'wiki');
    expect(bundle.pages.map((p) => p.repoPath).sort()).toEqual([
      'wiki/index.md',
      'wiki/real.md',
    ]);
  });

  it('loads a bundle at a nested root', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml('docs/knowledge'),
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
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/README.md': '# Readme\n',
      'wiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'wiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(isConceptPage(byPath('wiki/index.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('wiki/README.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('wiki/mongo.md'), bundle)).toBe(true);
  });

  it('excludes a README.md anywhere under deps/, needed for mode: link', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/deps/@scope/name/README.md': '# Producer readme\n',
      'wiki/deps/plain/README.md': '# Producer readme\n',
      'wiki/deps/plain/topic.md': page('Topic'),
    });
    const bundle = loadBundle(root, 'wiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(isConceptPage(byPath('wiki/deps/@scope/name/README.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('wiki/deps/plain/README.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('wiki/deps/plain/topic.md'), bundle)).toBe(true);
  });
});

describe('pageDirectories', () => {
  it('lists the directory of every page, including the bundle root itself', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/root-page.md': page('Root page'),
      'wiki/data/nested/index.md': '# Nested\n',
      'wiki/data/nested/deep.md': page('Deep'),
    });
    // The bundle root must appear as `wiki-sticky`, not the empty string — Task 11
    // duplicates this slicing logic, so an off-by-one there would otherwise be silent.
    expect(pageDirectories(loadBundle(root, 'wiki'))).toEqual([
      'wiki',
      'wiki/data/nested',
    ]);
  });
});
