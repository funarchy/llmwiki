#!/usr/bin/env node
import { Command } from 'commander';
import { lintCommand } from './commands/lint.js';
import { gapsCommand } from './commands/gaps.js';
import { initCommand } from './commands/init.js';
import { installCommand } from './commands/install.js';
import { addCommand } from './commands/add.js';
import { rmCommand } from './commands/rm.js';
import { updateCommand } from './commands/update.js';
import { skillsCommand } from './commands/skills.js';

/**
 * Run a command body, turning any thrown error into a message plus exit code 1.
 * Every action goes through this — a command that throws must never surface as
 * an unhandled rejection or a stack trace.
 */
async function runAction(work: () => number | Promise<number>): Promise<void> {
  try {
    process.exitCode = await work();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('llmwiki')
  .description('OKF knowledge bundles with dependencies')
  .showHelpAfterError();

program
  .command('init')
  .description('scaffold an llmwiki bundle in this repository')
  .option('-y, --yes', 'accept all defaults without prompting', false)
  .action(async (opts: { yes: boolean }) => {
    await runAction(() => initCommand(process.cwd(), { yes: opts.yes }));
  });

program
  .command('lint')
  .description("run the mechanical checks over this repository's bundle")
  .action(async () => {
    await runAction(() => lintCommand(process.cwd()));
  });

program
  .command('install')
  .description("resolve, vendor and lock this bundle's dependencies")
  .option('--frozen', 'fail instead of updating the lock (CI mode)', false)
  .action(async (opts: { frozen: boolean }) => {
    await runAction(() => installCommand(process.cwd(), { frozen: opts.frozen }));
  });

program
  .command('add <pkg>')
  .description('add a dependency, then resolve, vendor and lock it')
  .option('--path <dir>', 'resolve as a path: dependency instead of npm')
  .action(async (pkg: string, opts: { path?: string }) => {
    await runAction(() => addCommand(process.cwd(), pkg, { path: opts.path }));
  });

program
  .command('rm <pkg>')
  .description('remove a dependency and re-sync (a bundle still required transitively stays vendored)')
  .action(async (pkg: string) => {
    await runAction(() => rmCommand(process.cwd(), pkg));
  });

program
  .command('update [pkg]')
  .description(
    're-resolve and report the knowledge diff; sync is always whole-tree (partial vendoring would break flat-hoist invariants) — pkg only narrows the printed report',
  )
  .action(async (pkg: string | undefined) => {
    await runAction(() => updateCommand(process.cwd(), pkg));
  });

program
  .command('skills <sub>')
  .description('manage installed agent skills (subcommands: sync)')
  .action(async (sub: string) => {
    await runAction(() => skillsCommand(process.cwd(), sub));
  });

program
  .command('gaps')
  .description('list unresolved eval cases and pages marked **Stub.**')
  .action(async () => {
    await runAction(() => gapsCommand(process.cwd()));
  });

await program.parseAsync();
