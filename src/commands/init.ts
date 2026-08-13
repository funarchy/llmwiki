import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CONFIG_FILENAME, DEFAULT_ROOT } from '../config.js';
import { packageRoot } from '../paths.js';
import { ask, confirm } from '../prompt.js';

export interface InitOptions {
  repoRoot: string;
  bundleRoot: string;
  installHook: boolean;
  /** Heading for the generated root index. */
  title: string;
}

export interface InitResult {
  bundleRoot: string;
  adoptedExisting: boolean;
  wrotePackageJson: boolean;
  hookInstalled: boolean;
  hookSkipped: boolean;
  foundDocsDir: boolean;
}

/** Directories that look like an existing bundle, in preference order. */
export const ADOPTION_CANDIDATES = ['llmwiki', 'wiki', join('docs', 'wiki')];

export function findAdoptableRoot(repoRoot: string): string | null {
  for (const candidate of ADOPTION_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate, 'index.md'))) return candidate;
  }
  return null;
}

function configYaml(bundleRoot: string): string {
  return [
    'version: 1',
    '',
    'bundle:',
    `  root: ${bundleRoot}`,
    '',
    'deps: {}',
    '',
    'vendor: {}',
    '',
    'skills: managed',
    'mode: copy',
    '',
  ].join('\n');
}

function updatePackageJson(repoRoot: string, bundleRoot: string): boolean {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) return false;

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    files?: string[];
    scripts?: Record<string, string>;
  };

  const files = new Set(pkg.files ?? []);
  files.add(bundleRoot);
  files.add(CONFIG_FILENAME);
  pkg.files = [...files];

  pkg.scripts = { ...pkg.scripts, 'llmwiki:lint': 'llmwiki lint' };

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

export function runInit(options: InitOptions): InitResult {
  const { repoRoot, bundleRoot, installHook, title } = options;

  if (existsSync(join(repoRoot, CONFIG_FILENAME))) {
    throw new Error(`${CONFIG_FILENAME} already exists in ${repoRoot} — nothing to initialize.`);
  }

  const absBundle = join(repoRoot, bundleRoot);
  const rootIndexPath = join(absBundle, 'index.md');
  const adoptedExisting = existsSync(rootIndexPath);

  mkdirSync(join(absBundle, '_meta', 'eval'), { recursive: true });

  if (!adoptedExisting) {
    const template = readFileSync(join(packageRoot(), 'templates', 'root-index.md'), 'utf-8');
    writeFileSync(rootIndexPath, template.replaceAll('{{BUNDLE_TITLE}}', title));
  }

  copyFileSync(
    join(packageRoot(), 'schemas', 'page.schema.json'),
    join(absBundle, '_meta', 'page.schema.json'),
  );

  const evalIndexPath = join(absBundle, '_meta', 'eval', 'index.md');
  if (!existsSync(evalIndexPath)) {
    copyFileSync(join(packageRoot(), 'templates', 'eval-index.md'), evalIndexPath);
  }

  writeFileSync(join(repoRoot, CONFIG_FILENAME), configYaml(bundleRoot));

  const wrotePackageJson = updatePackageJson(repoRoot, bundleRoot);

  let hookInstalled = false;
  let hookSkipped = false;
  const hooksDir = join(repoRoot, '.git', 'hooks');
  if (installHook && existsSync(hooksDir)) {
    const hookPath = join(hooksDir, 'pre-commit');
    if (existsSync(hookPath)) {
      hookSkipped = true;
    } else {
      copyFileSync(join(packageRoot(), 'templates', 'pre-commit.sh'), hookPath);
      chmodSync(hookPath, 0o755);
      hookInstalled = true;
    }
  }

  return {
    bundleRoot,
    adoptedExisting,
    wrotePackageJson,
    hookInstalled,
    hookSkipped,
    foundDocsDir: existsSync(join(repoRoot, 'docs')),
  };
}

export { DEFAULT_ROOT };

export interface InitCommandOptions {
  /** Skip prompts and take every default. */
  yes: boolean;
}

function titleFrom(repoRoot: string): string {
  const name = basename(repoRoot);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} knowledge base`;
}

export async function initCommand(cwd: string, options: InitCommandOptions): Promise<number> {
  const adoptable = findAdoptableRoot(cwd);
  const suggested = adoptable ?? DEFAULT_ROOT;

  let bundleRoot = suggested;
  let installHook = true;

  if (!options.yes) {
    if (adoptable) {
      console.log(`Found an existing bundle at ${adoptable}/ — it can be adopted as-is.`);
    }
    bundleRoot = await ask('Bundle root', suggested);
    installHook = await confirm('Install a git pre-commit hook that runs llmwiki lint?', true);
  }

  const result = runInit({ repoRoot: cwd, bundleRoot, installHook, title: titleFrom(cwd) });

  console.log(`${result.adoptedExisting ? 'Adopted' : 'Created'} bundle root: ${result.bundleRoot}/`);
  console.log(`Wrote ${CONFIG_FILENAME}`);
  if (result.wrotePackageJson) {
    console.log(`Added ${result.bundleRoot} and ${CONFIG_FILENAME} to package.json#files, plus an llmwiki:lint script`);
  }
  if (result.hookInstalled) console.log('Installed .git/hooks/pre-commit');
  if (result.hookSkipped) console.log('Left the existing .git/hooks/pre-commit in place');
  if (result.foundDocsDir) {
    console.log('Found a docs/ directory. Migrating it is the wiki-ingest skill\'s job — nothing was touched.');
  }
  console.log('Next: run `llmwiki lint`.');

  return 0;
}
