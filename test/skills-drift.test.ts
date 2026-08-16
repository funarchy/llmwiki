import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

/**
 * Registered top-level CLI commands, sourced by regexing `src/cli.ts` for
 * `.command('...')` calls and stripping any `<arg>`/`[arg]` suffix —
 * brittle-but-honest at this scale (spec Task 3).
 */
function registeredCommands(): Set<string> {
  const cli = readFileSync(join(REPO_ROOT, 'src', 'cli.ts'), 'utf-8');
  const names = new Set<string>();
  for (const match of cli.matchAll(/\.command\('([^']+)'\)/g)) {
    const word = match[1].split(/\s+/)[0];
    names.add(word);
  }
  return names;
}

/** Every `` `wiki-sticky <word>` `` mention in a SKILL.md body. */
function mentionedCommands(skillContent: string): string[] {
  return [...skillContent.matchAll(/`wiki-sticky ([a-zA-Z-]+)/g)].map((m) => m[1]);
}

describe('skills drift guard', () => {
  it('every `wiki-sticky <cmd>` mentioned in a SKILL.md names a real registered CLI command', () => {
    const commands = registeredCommands();
    expect(commands.size).toBeGreaterThan(0);

    const skillsDir = join(REPO_ROOT, 'skills');
    const skillNames = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(skillNames.length).toBeGreaterThan(0);

    const unknown: string[] = [];
    for (const name of skillNames) {
      const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');
      for (const word of mentionedCommands(content)) {
        if (!commands.has(word)) unknown.push(`${name}/SKILL.md mentions unknown command "wiki-sticky ${word}"`);
      }
    }

    expect(unknown).toEqual([]);
  });
});
