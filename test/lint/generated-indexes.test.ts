import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { generatedIndexes } from '../../src/lint/checks/generated-indexes.js';
import { syncDeps } from '../../src/commands/install.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import { contextFor } from '../helpers/lint.js';

describe('check: generated-indexes', () => {
  it('passes when deps/index.md matches what install would produce', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    expect(generatedIndexes(contextFor(repo))).toEqual([]);
  });

  it('flags a hand-edited deps/index.md', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    writeFileSync(join(repo, 'llmwiki', 'deps', 'index.md'), '# Hand-edited\n');
    const issues = generatedIndexes(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].file).toBe('llmwiki/deps/index.md');
  });

  it('flags a stale index after the lock changed without regenerating it', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });

    const staleIndex = join(repo, 'llmwiki', 'deps', 'index.md');
    const before = readFileSync(staleIndex, 'utf-8');
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '2.0.0' });
    // Re-sync updates the lock but restore the pre-sync index to simulate staleness.
    syncDeps(repo, loadConfig(repo), { frozen: false });
    writeFileSync(staleIndex, before);

    const issues = generatedIndexes(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('flags a stale vendor/index.md while a user-authored dir exists, and stays silent when there is no vendor dir', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nvendor:\n  rn:\n    from: https://example.com/rn\n',
      'llmwiki/index.md': '# Root\n',
      'llmwiki/vendor/rn/index.md': '# RN\n',
    });
    // No vendor dir at all: no findings.
    const bare = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\n',
      'llmwiki/index.md': '# Root\n',
    });
    expect(generatedIndexes(contextFor(bare))).toEqual([]);

    // Vendor dir present but vendor/index.md missing/stale: flagged.
    const issues = generatedIndexes(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/vendor/index.md');
  });
});
