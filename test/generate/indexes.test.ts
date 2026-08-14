import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { depsIndexContent, vendorIndexContent, generateIndexes } from '../../src/generate/indexes.js';
import { makeRepo } from '../helpers/fixture.js';
import type { Config, Lock } from '../../src/types.js';

function config(overrides: Partial<Config> = {}): Config {
  return {
    version: 1,
    bundle: { root: 'llmwiki' },
    deps: {},
    vendor: {},
    skills: 'managed',
    mode: 'copy',
    ...overrides,
  };
}

function lock(bundles: Lock['bundles']): Lock {
  return { version: 1, bundles, skills: {} };
}

describe('depsIndexContent', () => {
  it('lists bundles sorted by name with version and source', () => {
    const content = depsIndexContent(
      'llmwiki',
      lock({
        z: { source: 'npm', version: '2.0.0', resolvedFrom: 'node_modules/z', upstreamHash: 'sha256-z', requiredBy: ['.'] },
        a: { source: 'path', version: '1.0.0', resolvedFrom: '../a', upstreamHash: 'sha256-a', requiredBy: ['.'] },
      }),
    );
    const aLine = content.split('\n').find((l) => l.includes('](/llmwiki/deps/a/index.md)'));
    const zLine = content.split('\n').find((l) => l.includes('](/llmwiki/deps/z/index.md)'));
    expect(content.indexOf('a](')).toBeLessThan(content.indexOf('z]('));
    expect(aLine).toBe('* [a](/llmwiki/deps/a/index.md) - v1.0.0, path');
    expect(zLine).toBe('* [z](/llmwiki/deps/z/index.md) - v2.0.0, npm');
  });

  it('shows "required by" for a transitive entry', () => {
    const content = depsIndexContent(
      'llmwiki',
      lock({
        b: { source: 'npm', version: '1.0.0', resolvedFrom: 'node_modules/b', upstreamHash: 'sha256-b', requiredBy: ['a'] },
      }),
    );
    expect(content).toContain('* [b](/llmwiki/deps/b/index.md) - v1.0.0, npm, required by a');
  });

  it('omits "required by" for a directly-required entry', () => {
    const content = depsIndexContent(
      'llmwiki',
      lock({
        a: { source: 'npm', version: '1.0.0', resolvedFrom: 'node_modules/a', upstreamHash: 'sha256-a', requiredBy: ['.'] },
      }),
    );
    expect(content).toContain('* [a](/llmwiki/deps/a/index.md) - v1.0.0, npm\n');
    expect(content).not.toContain('required by');
  });

  it('is derivable from the lock alone, with no producer on disk', () => {
    // No filesystem access at all in depsIndexContent — passing a lock with a
    // nonexistent producer path must not throw or attempt any IO.
    expect(() =>
      depsIndexContent(
        'llmwiki',
        lock({
          ghost: {
            source: 'npm',
            version: '9.9.9',
            resolvedFrom: 'node_modules/ghost',
            upstreamHash: 'sha256-ghost',
            requiredBy: ['.'],
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe('vendorIndexContent', () => {
  it('lists vendor dirs with declared provenance and flags undeclared', () => {
    const content = vendorIndexContent('llmwiki', config({ vendor: { known: { from: 'https://example.com/docs' } } }), [
      'known',
      'mystery',
    ]);
    expect(content).toContain('* [known](/llmwiki/vendor/known/index.md) - from https://example.com/docs');
    expect(content).toContain('* [mystery](/llmwiki/vendor/mystery/index.md) - provenance undeclared');
  });
});

describe('generateIndexes', () => {
  it('writes nothing when there are no deps and no vendor dirs', () => {
    const root = makeRepo({});
    mkdirSync(join(root, 'llmwiki'), { recursive: true });
    generateIndexes(root, 'llmwiki', config(), lock({}));
    expect(existsSync(join(root, 'llmwiki', 'deps', 'index.md'))).toBe(false);
    expect(existsSync(join(root, 'llmwiki', 'vendor', 'index.md'))).toBe(false);
  });
});
