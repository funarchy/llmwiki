import { loadBundle } from '../../src/bundle/load.js';
import { loadConfig } from '../../src/config.js';
import type { LintContext } from '../../src/lint/run.js';

/** Build a LintContext from a fixture repo root. */
export function contextFor(repoRoot: string, gitRemote: string | null = null): LintContext {
  const config = loadConfig(repoRoot);
  return {
    repoRoot,
    config,
    bundle: loadBundle(repoRoot, config.bundle.root),
    gitRemote,
  };
}
