import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLock, writeLock, locksEqual, LOCK_FILENAME } from '../src/lock.js';
import type { Lock } from '../src/types.js';
import { makeRepo } from './helpers/fixture.js';

function bundle(overrides: Partial<Lock['bundles'][string]> = {}): Lock['bundles'][string] {
  return {
    source: 'npm',
    version: '1.0.0',
    resolvedFrom: 'node_modules/@x/a',
    upstreamHash: 'sha256-aaa',
    requiredBy: ['.'],
    ...overrides,
  };
}

describe('readLock / writeLock', () => {
  it('round-trips a lock through write and read', () => {
    const repo = makeRepo({});
    const lock: Lock = {
      version: 1,
      bundles: { '@x/a': bundle(), '@x/b': bundle({ version: '2.0.0' }) },
      skills: { foo: 'sha256-bbb' },
    };
    writeLock(repo, lock);
    const roundTripped = readLock(repo);
    expect(roundTripped).toEqual(lock);
  });

  it('returns null when the lock file is absent', () => {
    const repo = makeRepo({});
    expect(readLock(repo)).toBeNull();
  });

  it('throws on an unsupported lock version', () => {
    const repo = makeRepo({
      [LOCK_FILENAME]: JSON.stringify({ version: 2, bundles: {}, skills: {} }),
    });
    expect(() => readLock(repo)).toThrow(/version/i);
  });

  it('produces byte-identical output regardless of bundle insertion order', () => {
    const repoA = makeRepo({});
    const repoB = makeRepo({});
    const lockA: Lock = {
      version: 1,
      bundles: { '@x/b': bundle({ version: '2.0.0' }), '@x/a': bundle() },
      skills: { z: 'sha256-1', a: 'sha256-2' },
    };
    const lockB: Lock = {
      version: 1,
      bundles: { '@x/a': bundle(), '@x/b': bundle({ version: '2.0.0' }) },
      skills: { a: 'sha256-2', z: 'sha256-1' },
    };
    writeLock(repoA, lockA);
    writeLock(repoB, lockB);
    const contentsA = readFileSync(join(repoA, LOCK_FILENAME), 'utf-8');
    const contentsB = readFileSync(join(repoB, LOCK_FILENAME), 'utf-8');
    expect(contentsA).toBe(contentsB);
  });
});

describe('locksEqual', () => {
  it('ignores requiredBy order but detects content differences', () => {
    const a: Lock = {
      version: 1,
      bundles: { '@x/a': bundle({ requiredBy: ['.', '@x/b'] }) },
      skills: {},
    };
    const bSameOrderDiffers: Lock = {
      version: 1,
      bundles: { '@x/a': bundle({ requiredBy: ['@x/b', '.'] }) },
      skills: {},
    };
    expect(locksEqual(a, bSameOrderDiffers)).toBe(true);

    const differentVersion: Lock = {
      version: 1,
      bundles: { '@x/a': bundle({ requiredBy: ['.', '@x/b'], version: '9.9.9' }) },
      skills: {},
    };
    expect(locksEqual(a, differentVersion)).toBe(false);
  });
});
