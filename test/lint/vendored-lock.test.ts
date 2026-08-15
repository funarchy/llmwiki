import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vendoredLock } from '../../src/lint/checks/vendored-lock.js';
import { runLint, exitCodeFor } from '../../src/lint/run.js';
import '../../src/lint/checks/index.js';
import { syncDeps } from '../../src/commands/install.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';
import { contextFor } from '../helpers/lint.js';

function setup() {
  const repo = makeRepo({
    // skills: off — this fixture is about vendored-dep lint conformance, not
    // skills sync state; check 12 would otherwise warn for five unlocked
    // shipped skills this fixture never installed.
    'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\nskills: off\ndeps:\n  a: npm\n',
    'llmwiki/index.md': '# Root\n\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n',
  });
  writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
  syncDeps(repo, loadConfig(repo), { frozen: false });
  return repo;
}

describe('check: vendored-lock', () => {
  it('passes on a clean install', () => {
    const repo = setup();
    expect(vendoredLock(contextFor(repo))).toEqual([]);
  });

  it('flags a hand-edited vendored page, naming the file', () => {
    const repo = setup();
    const pagePath = join(repo, 'llmwiki', 'deps', 'a', 'topic.md');
    writeFileSync(pagePath, 'HAND-EDITED\n');
    const issues = vendoredLock(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].file).toBe('llmwiki/deps/a/topic.md');
  });

  it('downgrades to a warning when the producer is no longer installed, and exit stays 0', () => {
    const repo = setup();
    rmSync(join(repo, 'node_modules', 'a'), { recursive: true, force: true });
    const issues = vendoredLock(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toMatch(/cannot verify vendored bundle "a"/);
    expect(issues[0].message).toMatch(/dependency not installed/);

    const allIssues = runLint(contextFor(repo));
    expect(allIssues).toEqual(issues);
    expect(exitCodeFor(allIssues)).toBe(0);
  });

  it('flags a stale hash when the producer content changed since install', () => {
    const repo = setup();
    writeFileSync(join(repo, 'node_modules', 'a', 'llmwiki', 'topic.md'), '# Topic\n\nChanged upstream.\n');
    const issues = vendoredLock(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toMatch(/stale/);
  });

  it('flags a hand-added bundle directory under deps/ not present in the lock', () => {
    const repo = setup();
    mkdirSync(join(repo, 'llmwiki', 'deps', 'extra'), { recursive: true });
    writeFileSync(join(repo, 'llmwiki', 'deps', 'extra', 'index.md'), '# Extra\n');
    const issues = vendoredLock(contextFor(repo));
    expect(issues.some((i) => i.severity === 'error' && i.file.includes('extra'))).toBe(true);
  });

  it('flags a lock entry whose vendored directory is missing', () => {
    const repo = setup();
    rmSync(join(repo, 'llmwiki', 'deps', 'a'), { recursive: true, force: true });
    const issues = vendoredLock(contextFor(repo));
    expect(issues.some((i) => i.severity === 'error' && i.file.includes('a'))).toBe(true);
  });

  it('flags a config dependency that has no lock entry', () => {
    const repo = setup();
    writeProducer(join(repo, 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    writeFileSync(join(repo, 'llmwiki.yaml'), 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n  b: npm\n');
    const issues = vendoredLock(contextFor(repo));
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('"b"'))).toBe(true);
  });

  it('flags a declared dep with no lock file at all (fresh init, never installed)', () => {
    const repo = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  a: npm\n',
      'llmwiki/index.md': '# Root\n',
    });
    // No node_modules, no install ever run: no llmwiki-lock.json exists.
    const issues = vendoredLock(contextFor(repo));
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('"a"') && /not locked/.test(i.message))).toBe(
      true,
    );
  });

  it('still flags vendored bundles with no lock file at all (no declared deps)', () => {
    const repo = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/deps/extra/index.md': '# Extra\n',
    });
    const issues = vendoredLock(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].file).toBe('llmwiki/deps');
    expect(issues[0].message).toMatch(/no llmwiki-lock\.json/);
  });
});
