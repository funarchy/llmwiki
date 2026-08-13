import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ask, confirm } from '../src/prompt.js';

function streams(input: string) {
  const stdin = Readable.from([input]) as unknown as NodeJS.ReadableStream;
  const chunks: string[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  }) as unknown as NodeJS.WritableStream;
  return { stdin, stdout, chunks };
}

describe('ask', () => {
  it('returns the typed answer', async () => {
    const { stdin, stdout } = streams('knowledge\n');
    await expect(ask('Bundle root', 'llmwiki', { stdin, stdout })).resolves.toBe('knowledge');
  });

  it('returns the default on an empty answer', async () => {
    const { stdin, stdout } = streams('\n');
    await expect(ask('Bundle root', 'llmwiki', { stdin, stdout })).resolves.toBe('llmwiki');
  });

  it('shows the default in the prompt text', async () => {
    const { stdin, stdout, chunks } = streams('\n');
    await ask('Bundle root', 'llmwiki', { stdin, stdout });
    expect(chunks.join('')).toContain('llmwiki');
  });
});

describe('confirm', () => {
  it('accepts y and n', async () => {
    const yes = streams('y\n');
    await expect(confirm('Install hook?', true, { stdin: yes.stdin, stdout: yes.stdout })).resolves.toBe(true);
    const no = streams('n\n');
    await expect(confirm('Install hook?', true, { stdin: no.stdin, stdout: no.stdout })).resolves.toBe(false);
  });

  it('returns the default on an empty answer', async () => {
    const { stdin, stdout } = streams('\n');
    await expect(confirm('Install hook?', false, { stdin, stdout })).resolves.toBe(false);
  });
});
