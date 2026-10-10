#!/usr/bin/env node
import { createProgram } from './commands.js';

process.on('unhandledRejection', (err: unknown) => {
  process.stderr.write(`Error: ${(err as Error).message ?? err}\n`);
  process.exit(1);
});

await createProgram().parseAsync();
