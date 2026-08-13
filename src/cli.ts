#!/usr/bin/env node
import { Command } from 'commander';
import { lintCommand } from './commands/lint.js';
import { gapsCommand } from './commands/gaps.js';

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
  .command('lint')
  .description("run the mechanical checks over this repository's bundle")
  .action(async () => {
    await runAction(() => lintCommand(process.cwd()));
  });

program
  .command('gaps')
  .description('list unresolved eval cases and pages marked **Stub.**')
  .action(async () => {
    await runAction(() => gapsCommand(process.cwd()));
  });

await program.parseAsync();
