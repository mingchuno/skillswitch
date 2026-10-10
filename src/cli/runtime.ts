import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { AiderAdapter, getAdapter, getAllAdapters } from '../adapters/index.js';
import type { CliRuntime, Terminal } from './context.js';

export function createTerminal(): Terminal {
  return {
    log: (message) => console.log(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
    write: (message) => {
      process.stdout.write(message);
    },
    writeError: (message) => {
      process.stderr.write(message);
    },
    exit: (code) => process.exit(code),
    confirm: (prompt) =>
      new Promise((resolve) => {
        const reader = readline.createInterface({ input: process.stdin, output: process.stdout });
        reader.question(prompt, (answer) => {
          reader.close();
          resolve(answer.toLowerCase() === 'y');
        });
      }),
  };
}

export function createRuntime(terminal: Terminal = createTerminal()): CliRuntime {
  return {
    terminal,
    adapters: {
      get: getAdapter,
      all: getAllAdapters,
      aiderConfig: () => new AiderAdapter().generateAiderConfig(),
    },
    files: {
      readText: (file) => fs.readFileSync(file, 'utf-8'),
      writeText: (file, content) => fs.writeFileSync(file, content),
    },
  };
}
