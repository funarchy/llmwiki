import { describe, it, expect } from 'vitest';
import { parseGitHubSlug } from '../src/git.js';

describe('parseGitHubSlug', () => {
  it('parses an ssh remote', () => {
    expect(parseGitHubSlug('git@github.com:funarchy/wiki-sticky.git')).toBe('funarchy/wiki-sticky');
  });

  it('parses an https remote with and without .git', () => {
    expect(parseGitHubSlug('https://github.com/funarchy/wiki-sticky.git')).toBe('funarchy/wiki-sticky');
    expect(parseGitHubSlug('https://github.com/funarchy/wiki-sticky')).toBe('funarchy/wiki-sticky');
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubSlug('git@gitlab.com:foo/bar.git')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseGitHubSlug(null)).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(parseGitHubSlug('https://github.com/funarchy/wiki-sticky/')).toBe('funarchy/wiki-sticky');
  });
});
