import { describe, it, expect } from 'vitest';
import { parseGitHubSlug } from '../src/git.js';

describe('parseGitHubSlug', () => {
  it('parses an ssh remote', () => {
    expect(parseGitHubSlug('git@github.com:funarchy/llmwiki.git')).toBe('funarchy/llmwiki');
  });

  it('parses an https remote with and without .git', () => {
    expect(parseGitHubSlug('https://github.com/funarchy/llmwiki.git')).toBe('funarchy/llmwiki');
    expect(parseGitHubSlug('https://github.com/funarchy/llmwiki')).toBe('funarchy/llmwiki');
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubSlug('git@gitlab.com:foo/bar.git')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseGitHubSlug(null)).toBeNull();
  });
});
