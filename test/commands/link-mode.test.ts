import { describe, it, expect } from 'vitest';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncDeps } from '../../src/commands/install.js';
import { clearDeps } from '../../src/vendor/copy.js';
import { hashBundle } from '../../src/vendor/hash.js';
import { readLock } from '../../src/lock.js';
import { loadConfig } from '../../src/config.js';
import { vendoredLock } from '../../src/lint/checks/vendored-lock.js';
import { makeRepo } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import { contextFor } from '../helpers/lint.js';

describe('mode: link', () => {
  it('symlinks the producer root instead of copying, leaving content unrewritten', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const dest = join(repo, 'llmwiki', 'deps', 'a');
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);

    const pageContent = readFileSync(join(dest, 'topic.md'), 'utf-8');
    const producerContent = readFileSync(join(repo, 'node_modules', 'a', 'llmwiki', 'topic.md'), 'utf-8');
    expect(pageContent).toBe(producerContent);

    // The producer's own absolute links stay untouched — link mode cannot rewrite.
    const indexContent = readFileSync(join(dest, 'index.md'), 'utf-8');
    expect(indexContent).toContain('/llmwiki/topic.md');
    expect(indexContent).not.toContain('/llmwiki/deps/a/topic.md');
  });

  it('supports a scoped name, creating the parent scope directory first', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  "@scope/name": npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', '@scope', 'name'), { name: '@scope/name', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const dest = join(repo, 'llmwiki', 'deps', '@scope', 'name');
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);
  });

  it('rejects a resolved bundle that declares its own dependencies', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    writeProducer(join(repo, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });

    expect(() => syncDeps(repo, loadConfig(repo), { frozen: false })).toThrow(
      /link mode cannot rewrite cross-bundle links.*"a".*use mode: copy/,
    );
  });

  it('still writes a lock with the real content hash', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const lock = readLock(repo)!;
    expect(lock.bundles.a.upstreamHash).toBe(hashBundle(join(repo, 'node_modules', 'a', 'llmwiki')));
  });

  it('clearDeps removes the symlink without deleting the producer tree through it', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const producerFile = join(repo, 'node_modules', 'a', 'llmwiki', 'topic.md');
    expect(existsSync(producerFile)).toBe(true);

    clearDeps(repo, 'llmwiki');

    expect(existsSync(join(repo, 'llmwiki', 'deps', 'a'))).toBe(false);
    expect(existsSync(producerFile)).toBe(true);
  });

  it('passes check 9 on a linked tree', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nmode: link\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    expect(vendoredLock(contextFor(repo))).toEqual([]);
  });
});
