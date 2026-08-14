import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { syncDeps, rootIndexHints } from '../../src/commands/install.js';
import { readLock, LOCK_FILENAME } from '../../src/lock.js';
import { hashBundle } from '../../src/vendor/hash.js';
import { loadConfig } from '../../src/config.js';
import { loadBundle } from '../../src/bundle/load.js';
import { runLint } from '../../src/lint/run.js';
import '../../src/lint/checks/index.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';

/** All files under `dir`, as posix rel paths, sorted. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const rec = (d: string) => {
    for (const entry of readdirSync(d)) {
      const abs = join(d, entry);
      if (statSync(abs).isDirectory()) rec(abs);
      else out.push(relative(dir, abs).split('\\').join('/'));
    }
  };
  rec(dir);
  return out.sort();
}

describe('syncDeps', () => {
  it('happy path: vendors an npm dep, rewrites links, writes index and a matching lock', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);

    const result = syncDeps(repo, config, { frozen: false });

    expect(result.bundles.map((b) => b.name)).toEqual(['a']);
    const indexContent = readFileSync(join(repo, 'llmwiki', 'deps', 'a', 'index.md'), 'utf-8');
    expect(indexContent).toContain('/llmwiki/deps/a/topic.md');
    expect(existsSync(join(repo, 'llmwiki', 'deps', 'index.md'))).toBe(true);

    const lock = readLock(repo)!;
    expect(lock.bundles.a.version).toBe('1.0.0');
    expect(lock.bundles.a.source).toBe('npm');
    expect(lock.bundles.a.upstreamHash).toBe(hashBundle(join(repo, 'node_modules', 'a', 'llmwiki')));
  });

  it('hoists a transitive npm dep flat, locking requiredBy and resolvedFrom for a nested-only producer', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    writeProducer(join(repo, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    const config = loadConfig(repo);

    const result = syncDeps(repo, config, { frozen: false });

    expect(result.bundles.map((b) => b.name).sort()).toEqual(['a', 'b']);
    expect(existsSync(join(repo, 'llmwiki', 'deps', 'b', 'index.md'))).toBe(true);

    const lock = readLock(repo)!;
    expect(lock.bundles.b.requiredBy).toEqual(['a']);
    // Not a consumer-declared dep, and resolved only under a's nested node_modules —
    // resolvedFromOf falls to relative(repoRoot, absDir).
    expect(lock.bundles.b.resolvedFrom).toBe('node_modules/a/node_modules/b');
  });

  it('is idempotent: running twice produces byte-identical deps/ tree and lock', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);

    syncDeps(repo, config, { frozen: false });
    const depsDir = join(repo, 'llmwiki', 'deps');
    const treeBefore = walk(depsDir);
    const contentsBefore = new Map(treeBefore.map((f) => [f, readFileSync(join(depsDir, f))]));
    const lockBefore = readFileSync(join(repo, LOCK_FILENAME));

    syncDeps(repo, config, { frozen: false });
    const treeAfter = walk(depsDir);
    expect(treeAfter).toEqual(treeBefore);
    for (const f of treeAfter) {
      expect(readFileSync(join(depsDir, f))).toEqual(contentsBefore.get(f));
    }
    expect(readFileSync(join(repo, LOCK_FILENAME))).toEqual(lockBefore);
  });

  it('heals a hand-edited vendored page on re-sync', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);
    syncDeps(repo, config, { frozen: false });

    const pagePath = join(repo, 'llmwiki', 'deps', 'a', 'topic.md');
    const original = readFileSync(pagePath, 'utf-8');
    writeFileSync(pagePath, 'HAND-EDITED CONTENT\n');
    expect(readFileSync(pagePath, 'utf-8')).not.toBe(original);

    syncDeps(repo, config, { frozen: false });
    expect(readFileSync(pagePath, 'utf-8')).toBe(original);
  });

  it('--frozen with a matching lock succeeds without writing the lock file', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);
    syncDeps(repo, config, { frozen: false });

    const lockPath = join(repo, LOCK_FILENAME);
    const before = readFileSync(lockPath);
    // Make the file unwritable: if the frozen path attempted writeLock despite a
    // matching lock, the write would throw EACCES rather than silently succeed —
    // a byte comparison alone cannot distinguish "wrote identical bytes" from
    // "never wrote," so this makes the no-write behaviour observable.
    chmodSync(lockPath, 0o444);
    try {
      expect(() => syncDeps(repo, config, { frozen: true })).not.toThrow();
      const after = readFileSync(lockPath);
      expect(after).toEqual(before);
    } finally {
      chmodSync(lockPath, 0o644);
    }
  });

  it('--frozen throws naming the lock file when no lock exists or the lock is stale', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);

    // No lock at all yet.
    expect(() => syncDeps(repo, config, { frozen: true })).toThrow(new RegExp(LOCK_FILENAME));

    syncDeps(repo, config, { frozen: false });
    // Stale: producer content changes after the lock was written.
    writeFileSync(join(repo, 'node_modules', 'a', 'llmwiki', 'topic.md'), '# Topic\n\nChanged upstream.\n');
    expect(() => syncDeps(repo, config, { frozen: true })).toThrow(new RegExp(LOCK_FILENAME));
  });

  it('removes a vendored bundle whose dep was dropped from config', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n  b: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    writeProducer(join(repo, 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });
    expect(existsSync(join(repo, 'llmwiki', 'deps', 'a'))).toBe(true);
    expect(existsSync(join(repo, 'llmwiki', 'deps', 'b'))).toBe(true);

    writeFileSync(join(repo, 'llmwiki.yaml'), 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n');
    syncDeps(repo, loadConfig(repo), { frozen: false });

    expect(existsSync(join(repo, 'llmwiki', 'deps', 'a'))).toBe(true);
    expect(existsSync(join(repo, 'llmwiki', 'deps', 'b'))).toBe(false);
  });

  it('produces a tree that passes every registered lint check end to end', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);

    syncDeps(repo, config, { frozen: false });

    const issues = runLint({
      repoRoot: repo,
      config: loadConfig(repo),
      bundle: loadBundle(repo, config.bundle.root),
      gitRemote: null,
    });
    expect(issues).toEqual([]);
  });

  it('rootIndexHints fires when the root index lacks the deps link and stays quiet when present', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const config = loadConfig(repo);
    const { lock } = syncDeps(repo, config, { frozen: false });

    expect(rootIndexHints(repo, config, lock).length).toBeGreaterThan(0);

    writeFileSync(
      join(repo, 'llmwiki', 'index.md'),
      '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
    );
    expect(rootIndexHints(repo, config, lock)).toEqual([]);
  });

  it('with zero deps leaves no deps/ dir and an empty-bundle lock', () => {
    const repo = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    const config = loadConfig(repo);

    const result = syncDeps(repo, config, { frozen: false });

    expect(existsSync(join(repo, 'llmwiki', 'deps'))).toBe(false);
    expect(result.lock.bundles).toEqual({});
  });
});
