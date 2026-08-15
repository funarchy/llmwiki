import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { clearDeps, vendorBundle } from '../../src/vendor/copy.js';
import { makeRepo } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import type { ResolvedBundle } from '../../src/types.js';

function scopedBundle(producerDir: string): ResolvedBundle {
  return {
    name: '@x/scenepad',
    version: '1.0.0',
    source: 'npm',
    absDir: producerDir,
    producerRoot: 'wiki',
    declaredDeps: {},
    requiredBy: ['.'],
  };
}

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

describe('vendorBundle', () => {
  it('vendors a producer with a non-default root into deps/<scoped name>/ with rewritten links', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, {
      name: '@x/scenepad',
      root: 'wiki',
      files: {
        'index.md': '# scenepad\n\n* [Topic](/wiki/topic.md) - the one topic\n',
        'topic.md': '# Topic\n\n[a]: /wiki/index.md\n',
      },
    });
    const consumerRepo = makeRepo({});

    vendorBundle(consumerRepo, 'llmwiki', scopedBundle(producerDir));

    const destRoot = join(consumerRepo, 'llmwiki', 'deps', '@x', 'scenepad');
    expect(readFileSync(join(destRoot, 'index.md'), 'utf-8')).toBe(
      '# scenepad\n\n* [Topic](/llmwiki/deps/@x/scenepad/topic.md) - the one topic\n',
    );
    expect(readFileSync(join(destRoot, 'topic.md'), 'utf-8')).toBe(
      '# Topic\n\n[a]: /llmwiki/deps/@x/scenepad/index.md\n',
    );
  });

  it('copies an asset file byte-identical', () => {
    const producerDir = makeRepo({});
    const assetBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
    writeProducer(producerDir, {
      name: '@x/scenepad',
      root: 'wiki',
      files: {
        'index.md': '# scenepad\n',
      },
    });
    // writeProducer only writes text files; write the binary asset directly.
    const assetPath = join(producerDir, 'wiki', 'asset.png');
    writeFileSync(assetPath, assetBytes);
    const consumerRepo = makeRepo({});

    vendorBundle(consumerRepo, 'llmwiki', scopedBundle(producerDir));

    const destAsset = join(consumerRepo, 'llmwiki', 'deps', '@x', 'scenepad', 'asset.png');
    expect(readFileSync(destAsset)).toEqual(assetBytes);
  });

  it('does not vendor _meta/ or the producer bundle-root README.md', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, {
      name: '@x/scenepad',
      root: 'wiki',
      files: {
        'index.md': '# scenepad\n',
        '_meta/notes.md': 'internal notes',
        'README.md': '# Front door\n',
      },
    });
    const consumerRepo = makeRepo({});

    vendorBundle(consumerRepo, 'llmwiki', scopedBundle(producerDir));

    const destRoot = join(consumerRepo, 'llmwiki', 'deps', '@x', 'scenepad');
    expect(existsSync(join(destRoot, '_meta'))).toBe(false);
    expect(existsSync(join(destRoot, 'README.md'))).toBe(false);
  });

  it('prefixes rewrite warnings with name/relpath', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, {
      name: '@x/scenepad',
      root: 'wiki',
      files: {
        'index.md': '# scenepad\n\n[s]: /src/foo.ts\n',
      },
    });
    const consumerRepo = makeRepo({});

    const warnings = vendorBundle(consumerRepo, 'llmwiki', scopedBundle(producerDir));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^@x\/scenepad\/index\.md: /);
  });

  it('clearDeps removes everything and is safe when absent', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, { name: '@x/scenepad', root: 'wiki', files: { 'index.md': '# scenepad\n' } });
    const consumerRepo = makeRepo({});
    vendorBundle(consumerRepo, 'llmwiki', scopedBundle(producerDir));

    const depsDir = join(consumerRepo, 'llmwiki', 'deps');
    expect(existsSync(depsDir)).toBe(true);
    clearDeps(consumerRepo, 'llmwiki');
    expect(existsSync(depsDir)).toBe(false);

    // Safe to call again when already absent.
    expect(() => clearDeps(consumerRepo, 'llmwiki')).not.toThrow();
  });

  it('is reproducible: vendoring the same bundle into two fresh repos yields identical trees', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, {
      name: '@x/scenepad',
      root: 'wiki',
      files: {
        'index.md': '# scenepad\n\n* [Topic](/wiki/topic.md) - the one topic\n',
        'topic.md': '# Topic\n\n[a]: /wiki/index.md\n',
        'nested/page.md': '# Nested\n\n[b]: /wiki/topic.md\n',
      },
    });
    const repoA = makeRepo({});
    const repoB = makeRepo({});

    vendorBundle(repoA, 'llmwiki', scopedBundle(producerDir));
    vendorBundle(repoB, 'llmwiki', scopedBundle(producerDir));

    const rootA = join(repoA, 'llmwiki', 'deps');
    const rootB = join(repoB, 'llmwiki', 'deps');
    const filesA = walk(rootA);
    const filesB = walk(rootB);
    expect(filesA).toEqual(filesB);
    for (const rel of filesA) {
      expect(readFileSync(join(rootA, rel))).toEqual(readFileSync(join(rootB, rel)));
    }
  });
});
