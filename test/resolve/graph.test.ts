import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveGraph, ConflictError, CycleError } from '../../src/resolve/graph.js';
import { makeRepo } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import type { Config, DepSpec } from '../../src/types.js';

function config(deps: Record<string, DepSpec>): Config {
  return {
    version: 1,
    bundle: { root: 'wiki' },
    deps,
    vendor: {},
    skills: 'managed',
    mode: 'copy',
  };
}

describe('resolveGraph', () => {
  it('resolves a single npm dep', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const result = resolveGraph(repoRoot, config({ a: { source: 'npm' } }));
    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].name).toBe('a');
    expect(result.bundles[0].version).toBe('1.0.0');
    expect(result.bundles[0].requiredBy).toEqual(['.']);
    expect(result.warnings).toEqual([]);
  });

  it('hoists a dep-with-a-dep flat, naming the transitive requirer', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    writeProducer(join(repoRoot, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    const result = resolveGraph(repoRoot, config({ a: { source: 'npm' } }));
    const names = result.bundles.map((b) => b.name);
    expect(names).toEqual(['a', 'b']);
    const b = result.bundles.find((x) => x.name === 'b')!;
    expect(b.requiredBy).toEqual(['a']);
  });

  it('dedupes a diamond: two deps sharing one transitive at the same version merge requiredBy', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  shared: npm\n',
    });
    writeProducer(join(repoRoot, 'node_modules', 'c'), {
      name: 'c',
      version: '1.0.0',
      configExtra: 'deps:\n  shared: npm\n',
    });
    writeProducer(join(repoRoot, 'node_modules', 'shared'), { name: 'shared', version: '1.0.0' });

    const result = resolveGraph(repoRoot, config({ a: { source: 'npm' }, c: { source: 'npm' } }));
    expect(() => result).not.toThrow();
    const names = result.bundles.map((b) => b.name);
    expect(names).toEqual(['a', 'c', 'shared']);
    const shared = result.bundles.find((x) => x.name === 'shared')!;
    expect(shared.requiredBy).toEqual(['a', 'c']);
  });

  it('throws ConflictError naming both requirers on a genuine version conflict', () => {
    const repoRoot = makeRepo({});
    // producer a requires "b" only from its own nested node_modules, at v1.0.0 —
    // there is no top-level "b" at all.
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    writeProducer(join(repoRoot, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    // the consumer itself declares "b" directly as a path dep at v2.0.0 — no top-level winner exists.
    const bV2Dir = makeRepo({});
    writeProducer(bV2Dir, { name: 'b', version: '2.0.0' });

    expect(() =>
      resolveGraph(repoRoot, config({ a: { source: 'npm' }, b: { source: 'path', path: bV2Dir } })),
    ).toThrow(ConflictError);
    try {
      resolveGraph(repoRoot, config({ a: { source: 'npm' }, b: { source: 'path', path: bV2Dir } }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toMatch(/"b"/);
      expect((err as Error).message).toMatch(/v2\.0\.0/);
      expect((err as Error).message).toMatch(/v1\.0\.0/);
    }
  });

  it('throws CycleError naming the path on a two-bundle cycle', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    writeProducer(join(repoRoot, 'node_modules', 'a', 'node_modules', 'b'), {
      name: 'b',
      version: '1.0.0',
      configExtra: 'deps:\n  a: npm\n',
    });

    expect(() => resolveGraph(repoRoot, config({ a: { source: 'npm' } }))).toThrow(CycleError);
    try {
      resolveGraph(repoRoot, config({ a: { source: 'npm' } }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CycleError);
      expect((err as Error).message).toMatch(/a → b → a/);
    }
  });

  it('throws "not implemented" for a git: spec', () => {
    const repoRoot = makeRepo({});
    expect(() => resolveGraph(repoRoot, config({ a: { source: 'git', url: 'https://example.com/a.git' } }))).toThrow(
      /git resolution is not implemented/,
    );
  });

  it('resolves a transitive path: dep relative to the declaring producer\'s directory', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  sibling:\n    source: path\n    path: ../sibling\n',
    });
    // "../sibling" relative to a's own absDir (node_modules/a) is node_modules/sibling —
    // NOT relative to the consumer's repoRoot, which has no such directory.
    writeProducer(join(repoRoot, 'node_modules', 'sibling'), { name: 'sibling', version: '1.0.0' });

    const result = resolveGraph(repoRoot, config({ a: { source: 'npm' } }));
    const names = result.bundles.map((b) => b.name);
    expect(names).toEqual(['a', 'sibling']);
    const sibling = result.bundles.find((x) => x.name === 'sibling')!;
    expect(sibling.absDir).toBe(join(repoRoot, 'node_modules', 'sibling'));
    expect(sibling.requiredBy).toEqual(['a']);
  });

  it('sorts the result by name', () => {
    const repoRoot = makeRepo({});
    for (const name of ['z', 'a', 'm']) {
      writeProducer(join(repoRoot, 'node_modules', name), { name, version: '1.0.0' });
    }
    const result = resolveGraph(repoRoot, config({ z: { source: 'npm' }, a: { source: 'npm' }, m: { source: 'npm' } }));
    expect(result.bundles.map((b) => b.name)).toEqual(['a', 'm', 'z']);
  });

  it('propagates a nested-shadow warning into the graph result', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
    });
    // top-level "b" at v2.0.0 shadows a nested copy at v1.0.0 under "a".
    writeProducer(join(repoRoot, 'node_modules', 'b'), { name: 'b', version: '2.0.0' });
    writeProducer(join(repoRoot, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });

    const result = resolveGraph(repoRoot, config({ a: { source: 'npm' } }));
    const b = result.bundles.find((x) => x.name === 'b')!;
    expect(b.version).toBe('2.0.0');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/"b"/);
    expect(result.warnings[0]).toMatch(/v2\.0\.0/);
    expect(result.warnings[0]).toMatch(/v1\.0\.0/);
  });
});
