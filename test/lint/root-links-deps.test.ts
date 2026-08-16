import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { rootLinksDeps } from '../../src/lint/checks/root-links-deps.js';
import { syncDeps } from '../../src/commands/install.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import { contextFor } from '../helpers/lint.js';

describe('check: root-links-deps', () => {
  it('flags a missing link from the root index to deps/index.md', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const issues = rootLinksDeps(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('passes when the root index links deps/index.md', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n\n* [Dependencies](/wiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    expect(rootLinksDeps(contextFor(repo))).toEqual([]);
  });

  it('stays silent when there are no deps and no vendor dir', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
    });
    expect(rootLinksDeps(contextFor(repo))).toEqual([]);
  });

  it('flags when the deps/index.md path only appears inside a code fence, not as a real link', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n\n```\n/wiki/deps/index.md\n```\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const issues = rootLinksDeps(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('flags a missing link from the root index to vendor/index.md', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\nvendor:\n  rn:\n    from: https://example.com/rn\n',
      'wiki/index.md': '# Root\n',
      'wiki/vendor/rn/index.md': '# RN\n',
      'wiki/vendor/index.md': '# Synthesized third-party knowledge\n\n* [rn](/wiki/vendor/rn/index.md) - from https://example.com/rn\n',
    });
    const issues = rootLinksDeps(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/vendor\/index\.md/);
  });
});
