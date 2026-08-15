import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../../src/paths.js';

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

describe('llmwiki CLI', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: packageRoot(), stdio: 'ignore' });
  });

  it('init then lint succeeds on a fresh repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    const init = run(['init', '--yes'], cwd);
    expect(init.status).toBe(0);
    expect(existsSync(join(cwd, 'llmwiki.yaml'))).toBe(true);

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });

  it('init refuses to run twice', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    const second = run(['init', '--yes'], cwd);
    expect(second.status).toBe(1);
    expect(second.stdout).toMatch(/already exists/);
  });

  it('lint exits 1 and names the failing checks on a broken page', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    writeFileSync(join(cwd, 'llmwiki', 'badName.md'), '# No frontmatter\n');

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(1);
    expect(lint.stdout).toMatch(/kebab-case/);
    expect(lint.stdout).toMatch(/frontmatter/);
    expect(lint.stdout).toMatch(/orphans/);
  });

  it('gaps reports empty sections on a fresh bundle', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    const gaps = run(['gaps'], cwd);
    expect(gaps.status).toBe(0);
    expect(gaps.stdout).toMatch(/## Open gaps/);
  });

  it('every command fails clearly outside an initialized repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    for (const cmd of ['lint', 'gaps']) {
      const result = run([cmd], cwd);
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/llmwiki init/);
      expect(result.stdout).not.toMatch(/at .*\.js:\d/);
    }
  });

  it('runs from a nested subdirectory by walking up to the config', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    const nested = join(cwd, 'llmwiki');
    const lint = run(['lint'], nested);
    expect(lint.status).toBe(0);
  });
});
