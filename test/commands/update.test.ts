import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateCommand, diffLocks } from '../../src/commands/update.js';
import { syncDeps } from '../../src/commands/install.js';
import { readLock } from '../../src/lock.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';

describe('diffLocks / updateCommand', () => {
  it('reports a version bump as ~ name vA → vB', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '2.0.0' });

    const lines: string[] = [];
    const orig = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      updateCommand(repo);
    } finally {
      console.log = orig;
    }
    expect(lines).toContain('~ a v1.0.0 → v2.0.0');
  });

  it('reports a content change at the same version (path dep edited in place)', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a:\n    source: path\n    path: ext-a\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'ext-a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    writeFileSync(join(repo, 'ext-a', 'wiki', 'topic.md'), '# Topic\n\nEdited in place, same version.\n');

    const lines: string[] = [];
    const orig = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      updateCommand(repo);
    } finally {
      console.log = orig;
    }
    expect(lines).toContain('~ a v1.0.0 (content changed, same version)');
  });

  it('reports added and removed bundles', () => {
    expect(
      diffLocks(
        { version: 1, bundles: { old: { source: 'npm', version: '1.0.0', resolvedFrom: '.', upstreamHash: 'h', requiredBy: ['.'] } }, skills: {} },
        {
          version: 1,
          bundles: { new: { source: 'npm', version: '1.0.0', resolvedFrom: '.', upstreamHash: 'h', requiredBy: ['.'] } },
          skills: {},
        },
      ),
    ).toEqual(['+ new v1.0.0', '- old v1.0.0']);
  });

  it('prints "Already up to date." when nothing changed', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n\n* [Dependencies](/wiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const lines: string[] = [];
    const orig = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      updateCommand(repo);
    } finally {
      console.log = orig;
    }
    expect(lines).toEqual(['Already up to date.']);
  });

  it('update <pkg> errors on an undeclared dep and filters the report to that dep when declared', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n  b: npm\n',
      'wiki/index.md': '# Root\n\n* [Dependencies](/wiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    writeProducer(join(repo, 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '2.0.0' });
    writeProducer(join(repo, 'node_modules', 'b'), { name: 'b', version: '2.0.0' });

    expect(() => updateCommand(repo, 'nope')).toThrow(/not a dependency/);

    const lines: string[] = [];
    const orig = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      updateCommand(repo, 'a');
    } finally {
      console.log = orig;
    }
    expect(lines).toEqual(['~ a v1.0.0 → v2.0.0']);

    // Whole-tree sync still happened: b's vendored tree updated too, despite the filtered report.
    const bIndex = readFileSync(join(repo, 'wiki', 'deps', 'b', 'index.md'), 'utf-8');
    expect(bIndex).toContain('/wiki/deps/b/topic.md');
    const lock = readLock(repo)!;
    expect(lock.bundles.b.version).toBe('2.0.0');
  });
});
