import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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

describe('wiki-sticky CLI', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: packageRoot(), stdio: 'ignore' });
  });

  it('init then lint succeeds on a fresh repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    const init = run(['init', '--yes'], cwd);
    expect(init.status).toBe(0);
    expect(existsSync(join(cwd, 'wiki-sticky.yaml'))).toBe(true);

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });

  it('init refuses to run twice', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    run(['init', '--yes'], cwd);
    const second = run(['init', '--yes'], cwd);
    expect(second.status).toBe(1);
    expect(second.stdout).toMatch(/already exists/);
  });

  it('lint exits 1 and names the failing checks on a broken page', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    run(['init', '--yes'], cwd);
    writeFileSync(join(cwd, 'wiki', 'badName.md'), '# No frontmatter\n');

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(1);
    expect(lint.stdout).toMatch(/kebab-case/);
    expect(lint.stdout).toMatch(/frontmatter/);
    expect(lint.stdout).toMatch(/orphans/);
  });

  it('gaps reports empty sections on a fresh bundle', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    run(['init', '--yes'], cwd);
    const gaps = run(['gaps'], cwd);
    expect(gaps.status).toBe(0);
    expect(gaps.stdout).toMatch(/## Open gaps/);
  });

  it('init --no-install leaves the dep out and says how to arm the hook (#14)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    writeFileSync(join(cwd, 'package.json'), '{ "name": "consumer" }\n');
    const init = run(['init', '--yes', '--no-install'], cwd);
    expect(init.status).toBe(0);
    expect(init.stdout).toMatch(/Skipped self-install/);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as {
      devDependencies?: Record<string, string>;
    };
    expect(pkg.devDependencies?.['wiki-sticky']).toBeUndefined();
  });

  it('init without package.json says the hook is not wired (#14)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    const init = run(['init', '--yes'], cwd);
    expect(init.status).toBe(0);
    expect(init.stdout).toMatch(/NOT wired/);
  });

  it('every command fails clearly outside an initialized repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    for (const cmd of ['lint', 'gaps']) {
      const result = run([cmd], cwd);
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/wiki-sticky init/);
      expect(result.stdout).not.toMatch(/at .*\.js:\d/);
    }
  });

  it('runs from a nested subdirectory by walking up to the config', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-e2e-'));
    run(['init', '--yes'], cwd);
    const nested = join(cwd, 'wiki');
    const lint = run(['lint'], nested);
    expect(lint.status).toBe(0);
  });
});
