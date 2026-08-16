import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shippedSkills } from '../src/commands/skills.js';
import { packageRoot } from '../src/paths.js';

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(packageRoot(), relPath), 'utf-8'));
}

describe('plugin manifests', () => {
  it('plugin.json parses and its version mirrors package.json', () => {
    const plugin = readJson('.claude-plugin/plugin.json') as { name: string; description: string; version: string };
    const pkg = readJson('package.json') as { version: string };

    expect(plugin.name).toBe('wiki-sticky');
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.description.length).toBeGreaterThan(0);
  });

  it('marketplace.json parses as a minimal single-entry marketplace', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json') as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };

    expect(marketplace.name).toBe('wiki-sticky');
    expect(marketplace.owner.name).toBe('funarchy');
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe('wiki-sticky');
    expect(marketplace.plugins[0].source).toBe('.');
    expect(marketplace.plugins[0].description.length).toBeGreaterThan(0);
  });

  it("the plugin's skills are the same files shippedSkills() returns", () => {
    // The plugin delivers skills from skills/ by convention — no explicit list
    // in the manifest. Pinning shippedSkills() here pins the shared source: if
    // a skill is ever added, renamed or removed, this test moves with it.
    expect(shippedSkills()).toEqual(['wiki-eval', 'wiki-ingest', 'wiki-review', 'wiki-search', 'wiki-vendor']);
  });

  it('package.json#files ships every directory packageRoot()-dependent code reads at runtime', () => {
    // A real `npm install` of the published tarball only contains what's
    // listed here. Every directory below is read via packageRoot() by src/
    // at runtime (schemas, templates, skills) or is otherwise required for
    // the package to run or install as a plugin (dist, .claude-plugin). If
    // one is missing from `files`, that class of feature silently breaks
    // post-publish while every test — which runs against the checkout, not
    // a packed tarball — stays green. This pins the class of bug, not just
    // the missing "skills" instance.
    const pkg = readJson('package.json') as { files: string[] };
    for (const dir of ['dist', 'schemas', 'templates', 'skills', '.claude-plugin']) {
      expect(pkg.files).toContain(dir);
    }
  });
});
