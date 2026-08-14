import { describe, it, expect } from 'vitest';
import { vendorableFiles } from '../../src/vendor/files.js';
import { hashBundle } from '../../src/vendor/hash.js';
import { makeRepo } from '../helpers/fixture.js';

describe('hashBundle', () => {
  it('hashes identical trees in two temp dirs identically', () => {
    const files = {
      'index.md': '# Index\n',
      'topic.md': '# Topic\n',
      'nested/page.md': '# Nested\n',
    };
    const a = makeRepo(files);
    const b = makeRepo(files);
    expect(hashBundle(a)).toBe(hashBundle(b));
  });

  it('changes the hash when content changes', () => {
    const a = makeRepo({ 'topic.md': '# Topic\n' });
    const b = makeRepo({ 'topic.md': '# Topic changed\n' });
    expect(hashBundle(a)).not.toBe(hashBundle(b));
  });

  it('changes the hash on a rename with identical content', () => {
    const content = '# Topic\n';
    const a = makeRepo({ 'topic.md': content });
    const b = makeRepo({ 'renamed.md': content });
    expect(hashBundle(a)).not.toBe(hashBundle(b));
  });

  it('is unaffected by _meta/, deps/, vendor/ (top-level), root README.md, and dot-entries', () => {
    const base = {
      'index.md': '# Index\n',
      'topic.md': '# Topic\n',
    };
    const a = makeRepo(base);
    const b = makeRepo({
      ...base,
      '_meta/notes.md': 'internal notes',
      'deps/other/index.md': 'vendored dep content',
      'vendor/synth/index.md': 'synthesized content',
      'README.md': '# Front door\n',
      '.hidden': 'dotfile content',
      '.hiddendir/file.md': 'dotdir content',
    });
    expect(hashBundle(a)).toBe(hashBundle(b));
  });

  it('is affected by a nested (non-root) README.md', () => {
    const a = makeRepo({ 'index.md': '# Index\n' });
    const b = makeRepo({
      'index.md': '# Index\n',
      'nested/README.md': '# Nested readme is content\n',
    });
    expect(hashBundle(a)).not.toBe(hashBundle(b));
  });

  it('vendorableFiles returns sorted posix rel paths excluding tooling dirs, root README, and dot-entries', () => {
    const repo = makeRepo({
      'topic.md': '# Topic\n',
      'index.md': '# Index\n',
      'nested/page.md': '# Nested\n',
      '_meta/notes.md': 'internal notes',
      'deps/other/index.md': 'vendored dep content',
      'vendor/synth/index.md': 'synthesized content',
      'README.md': '# Front door\n',
      '.hidden': 'dotfile content',
    });
    expect(vendorableFiles(repo)).toEqual(['index.md', 'nested/page.md', 'topic.md']);
  });

  it('includes a nested directory literally named deps/ as content, unlike the top-level exclusion', () => {
    const repo = makeRepo({
      'index.md': '# Index\n',
      // Not top-level: this is a section's own subdirectory that happens to be named "deps".
      'section/deps/page.md': '# Nested deps content\n',
    });
    expect(vendorableFiles(repo)).toEqual(['index.md', 'section/deps/page.md']);
  });
});
