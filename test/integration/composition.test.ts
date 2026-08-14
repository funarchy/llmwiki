import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../../src/paths.js';
import { writeProducer } from '../helpers/producer.js';
import { page } from '../helpers/fixture.js';

const CLI = join(packageRoot(), 'dist', 'cli.js');

function run(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf-8' });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: `${e.stdout ?? ''}${e.stderr ?? ''}`, status: e.status ?? 1 };
  }
}

const DEPS_LINK = '\n* [Dependencies](/llmwiki/deps/index.md) - vendored knowledge\n';

/** Mirror what a user does on the `install`/`add` printed hint: wire the root index to deps/. */
function addDepsLink(cwd: string): void {
  const path = join(cwd, 'llmwiki', 'index.md');
  writeFileSync(path, readFileSync(path, 'utf-8') + DEPS_LINK);
}

function removeDepsLink(cwd: string): void {
  const path = join(cwd, 'llmwiki', 'index.md');
  writeFileSync(path, readFileSync(path, 'utf-8').replace(DEPS_LINK, ''));
}

describe('llmwiki composition (CLI end to end)', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: packageRoot(), stdio: 'ignore' });
  });

  it('init, add, amend the root index, then lint is clean', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    expect(run(['init', '--yes'], cwd).status).toBe(0);

    writeProducer(join(cwd, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const add = run(['add', 'a'], cwd);
    expect(add.status).toBe(0);
    expect(existsSync(join(cwd, 'llmwiki', 'deps', 'a', 'index.md'))).toBe(true);

    addDepsLink(cwd);

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });

  it('a hand-edited vendored page fails lint naming the file, and install heals it', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    run(['init', '--yes'], cwd);
    writeProducer(join(cwd, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    run(['add', 'a'], cwd);
    addDepsLink(cwd);
    expect(run(['lint'], cwd).status).toBe(0);

    const pagePath = join(cwd, 'llmwiki', 'deps', 'a', 'topic.md');
    writeFileSync(pagePath, 'HAND-EDITED CONTENT\n');

    const broken = run(['lint'], cwd);
    expect(broken.status).toBe(1);
    expect(broken.stdout).toMatch(/vendored-lock/);
    expect(broken.stdout).toContain('llmwiki/deps/a/topic.md');

    const install = run(['install'], cwd);
    expect(install.status).toBe(0);

    const healed = run(['lint'], cwd);
    expect(healed.status).toBe(0);
  });

  it('install --frozen succeeds on a fresh-checkout simulation and regenerates the tree, then fails after producer drift', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    run(['init', '--yes'], cwd);
    writeProducer(join(cwd, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    expect(run(['add', 'a'], cwd).status).toBe(0);

    // Simulate a fresh checkout: the generated tree is gitignored-worthy but the
    // lock is committed. Delete deps/, keep llmwiki-lock.json.
    rmSync(join(cwd, 'llmwiki', 'deps'), { recursive: true, force: true });
    expect(existsSync(join(cwd, 'llmwiki', 'deps'))).toBe(false);

    const frozenClean = run(['install', '--frozen'], cwd);
    expect(frozenClean.status).toBe(0);
    expect(existsSync(join(cwd, 'llmwiki', 'deps', 'a', 'index.md'))).toBe(true);

    // Now the producer's content itself changes after the lock was written.
    writeFileSync(join(cwd, 'node_modules', 'a', 'llmwiki', 'topic.md'), '# Topic\n\nChanged upstream.\n');
    const frozenStale = run(['install', '--frozen'], cwd);
    expect(frozenStale.status).toBe(1);
  });

  it('a transitive dependency hoists flat and its cross-bundle links resolve, lint clean overall', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    run(['init', '--yes'], cwd);

    writeProducer(join(cwd, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  b: npm\n',
      files: {
        'index.md': '# a\n\n* [Topic](/llmwiki/topic.md) - the one topic\n',
        'topic.md': page('Topic', 'See [B Topic][b-topic].\n\n[b-topic]: /llmwiki/deps/b/topic.md\n'),
      },
    });
    writeProducer(join(cwd, 'node_modules', 'a', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });

    const add = run(['add', 'a'], cwd);
    expect(add.status).toBe(0);

    // Transitive "b" hoisted flat, as a sibling of "a" under deps/, not nested under a/.
    expect(existsSync(join(cwd, 'llmwiki', 'deps', 'a', 'index.md'))).toBe(true);
    expect(existsSync(join(cwd, 'llmwiki', 'deps', 'b', 'index.md'))).toBe(true);
    expect(existsSync(join(cwd, 'llmwiki', 'deps', 'a', 'deps'))).toBe(false);

    const aTopic = readFileSync(join(cwd, 'llmwiki', 'deps', 'a', 'topic.md'), 'utf-8');
    expect(aTopic).toContain('/llmwiki/deps/b/topic.md');

    addDepsLink(cwd);
    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });

  it('install exits 1 naming both requirers on a genuine version conflict', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    run(['init', '--yes'], cwd);
    writeFileSync(join(cwd, 'llmwiki.yaml'), 'version: 1\nbundle:\n  root: llmwiki\ndeps:\n  c1: npm\n  c2: npm\n');

    writeProducer(join(cwd, 'node_modules', 'c1'), {
      name: 'c1',
      version: '1.0.0',
      configExtra: 'deps:\n  shared: npm\n',
    });
    writeProducer(join(cwd, 'node_modules', 'c1', 'node_modules', 'shared'), { name: 'shared', version: '1.0.0' });
    writeProducer(join(cwd, 'node_modules', 'c2'), {
      name: 'c2',
      version: '1.0.0',
      configExtra: 'deps:\n  shared: npm\n',
    });
    writeProducer(join(cwd, 'node_modules', 'c2', 'node_modules', 'shared'), { name: 'shared', version: '2.0.0' });

    const install = run(['install'], cwd);
    expect(install.status).toBe(1);
    expect(install.stdout).toContain('"shared"');
    expect(install.stdout).toContain('c1');
    expect(install.stdout).toContain('c2');
  });

  it('rm removes the vendored tree; lint is clean once the root-index link is removed too', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-comp-'));
    run(['init', '--yes'], cwd);
    writeProducer(join(cwd, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    run(['add', 'a'], cwd);
    addDepsLink(cwd);
    expect(run(['lint'], cwd).status).toBe(0);

    const rm = run(['rm', 'a'], cwd);
    expect(rm.status).toBe(0);
    expect(existsSync(join(cwd, 'llmwiki', 'deps'))).toBe(false);

    // The root index still links to deps/index.md, which no longer exists — the
    // user (here, the test) is responsible for removing that link too.
    removeDepsLink(cwd);
    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });
});
