import type { Bundle, Config, Issue } from '../types.js';

export interface LintContext {
  repoRoot: string;
  config: Config;
  bundle: Bundle;
  /** Origin remote URL, or null when unavailable. Used by check 8. */
  gitRemote: string | null;
}

export type Check = (ctx: LintContext) => Issue[];

/** Registered checks, in report order. Plan 2 appends checks 9–11. */
export const CHECKS: Array<{ id: string; run: Check }> = [];

export function registerCheck(id: string, run: Check): void {
  CHECKS.push({ id, run });
}

export function runLint(ctx: LintContext): Issue[] {
  return CHECKS.flatMap(({ run }) => run(ctx));
}

export function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) return 'wiki-sticky lint ✓  no issues';

  const lines = issues.map((i) => {
    const where = i.line === undefined ? i.file : `${i.file}:${i.line}`;
    const mark = i.severity === 'warning' ? 'warn' : 'error';
    return `  ${mark}  ${where}  [${i.check}] ${i.message}`;
  });

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  lines.push('');
  lines.push(`wiki-sticky lint ✗  ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  return lines.join('\n');
}

/** Exit code: errors fail, warnings do not. */
export function exitCodeFor(issues: Issue[]): number {
  return issues.some((i) => i.severity === 'error') ? 1 : 0;
}
