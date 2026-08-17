// Runs as npm's `version` lifecycle hook: after `npm version` bumps
// package.json but before it makes the version commit. Mirrors the new
// version into .claude-plugin/plugin.json and stages it, so one
// `npm version patch` produces one atomic commit with both files in
// sync — the state test/plugin-manifest.test.ts pins.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const pluginPath = '.claude-plugin/plugin.json';
const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'));
plugin.version = version;
writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
execSync(`git add ${pluginPath}`);
console.log(`Synced ${pluginPath} to ${version}`);
