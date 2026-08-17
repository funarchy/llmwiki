import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../paths.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface SelfPinResult {
  installed: boolean;
  packageManager?: PackageManager;
  /** Why nothing was installed. Absent when `installed` is true. */
  skipped?: 'opted-out' | 'no-package-json' | 'already-present' | 'self' | 'failed';
}

export interface SelfPinOptions {
  /** `--no-install`: leave the repository unwired on purpose. */
  skip?: boolean;
  /** Injected for tests; defaults to a real child process. */
  exec?: (cmd: string, cwd: string) => void;
  /** Version to pin; defaults to the running CLI's own version. */
  version?: string;
}

/** Lockfiles betray the package manager; npm is the no-lockfile default. */
function detectPackageManager(repoRoot: string): PackageManager {
  if (existsSync(join(repoRoot, 'bun.lock')) || existsSync(join(repoRoot, 'bun.lockb'))) return 'bun';
  if (existsSync(join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(repoRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function addCommand(pm: PackageManager, spec: string): string {
  switch (pm) {
    case 'npm':
      return `npm install --save-dev ${spec}`;
    case 'pnpm':
      return `pnpm add -D ${spec}`;
    case 'yarn':
      return `yarn add -D ${spec}`;
    case 'bun':
      return `bun add -d ${spec}`;
  }
}

function ownVersion(): string {
  const pkg = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

/**
 * Make the wiring `init` just wrote actually live: add wiki-sticky itself as a
 * dev dependency of the repository, so the `wiki-sticky:lint` script and the
 * pre-commit hook's primary branch (`node_modules/.bin/wiki-sticky`) work
 * without a follow-up manual step. Never throws — init must finish its report
 * even when the package manager fails.
 */
export function selfPin(repoRoot: string, options: SelfPinOptions = {}): SelfPinResult {
  if (options.skip) return { installed: false, skipped: 'opted-out' };

  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) return { installed: false, skipped: 'no-package-json' };

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (pkg.name === 'wiki-sticky') return { installed: false, skipped: 'self' };
  if (pkg.dependencies?.['wiki-sticky'] || pkg.devDependencies?.['wiki-sticky']) {
    return { installed: false, skipped: 'already-present' };
  }

  const pm = detectPackageManager(repoRoot);
  const exec =
    options.exec ?? ((cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: 'inherit' }));
  try {
    exec(addCommand(pm, `wiki-sticky@^${options.version ?? ownVersion()}`), repoRoot);
  } catch {
    return { installed: false, packageManager: pm, skipped: 'failed' };
  }
  return { installed: true, packageManager: pm };
}
