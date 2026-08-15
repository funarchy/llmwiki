import { createInterface } from 'node:readline/promises';

export interface PromptIO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
}

function defaultIO(): PromptIO {
  return { stdin: process.stdin, stdout: process.stdout };
}

/** Ask for a line of text, falling back to `fallback` on an empty answer. */
export async function ask(question: string, fallback: string, io: PromptIO = defaultIO()): Promise<string> {
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = await Promise.race([
      rl.question(`${question} [${fallback}]: `),
      // Stream ended before an answer (closed pipe, ctrl-D): take the default
      // rather than leaving the promise unsettled forever.
      new Promise<string>((resolve) => rl.once('close', () => resolve(''))),
    ]);
    return answer.trim() === '' ? fallback : answer.trim();
  } finally {
    rl.close();
  }
}

/** Ask a yes/no question. */
export async function confirm(question: string, fallback: boolean, io: PromptIO = defaultIO()): Promise<boolean> {
  const hint = fallback ? 'Y/n' : 'y/N';
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = (
      await Promise.race([
        rl.question(`${question} [${hint}]: `),
        // Stream ended before an answer (closed pipe, ctrl-D): take the default
        // rather than leaving the promise unsettled forever.
        new Promise<string>((resolve) => rl.once('close', () => resolve(''))),
      ])
    )
      .trim()
      .toLowerCase();
    if (answer === '') return fallback;
    return answer.startsWith('y');
  } finally {
    rl.close();
  }
}
