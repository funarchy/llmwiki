import { loadBundle } from '../bundle/load.js';
import { findRepoRoot, loadConfig } from '../config.js';
import { gitRemote } from '../git.js';
import { runLint, formatIssues, exitCodeFor, type LintContext } from '../lint/run.js';
import '../lint/checks/index.js';

export function buildContext(cwd: string): LintContext {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('No llmwiki.yaml found in this directory or any parent — run `llmwiki init` first.');
  }
  const config = loadConfig(repoRoot);
  return {
    repoRoot,
    config,
    bundle: loadBundle(repoRoot, config.bundle.root),
    gitRemote: gitRemote(repoRoot),
  };
}

export function lintCommand(cwd: string): number {
  const issues = runLint(buildContext(cwd));
  const output = formatIssues(issues);
  if (issues.length === 0) console.log(output);
  else console.error(output);
  return exitCodeFor(issues);
}
