import { execFileSync } from 'node:child_process';

/** Origin remote URL, or null when git is unavailable or there is no remote. */
export function gitRemote(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

/** `owner/repo` for a GitHub remote, else null. */
export function parseGitHubSlug(remote: string | null): string | null {
  if (!remote) return null;
  // Trailing slashes defeat the `$` anchor, and would silently disable check 8.
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/*$/.exec(remote.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}
