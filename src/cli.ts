#!/usr/bin/env node
import { CLI_NAMES } from './adapters/index.js';
import { createInspectionHandlers } from './cli/inspection.js';
import { createProfileHandlers } from './cli/profiles.js';
import { createRuntime } from './cli/runtime.js';
import { createSkillHandlers } from './cli/skills.js';
import { createProgram } from './commands.js';
import { defaultClaudeDir } from './scanner.js';

const runtime = createRuntime();
const handlers = {
  skills: createSkillHandlers(runtime),
  profiles: createProfileHandlers(runtime),
  inspection: createInspectionHandlers(runtime),
};

process.on('unhandledRejection', (err: unknown) => {
  runtime.terminal.writeError(`Error: ${(err as Error).message ?? err}\n`);
  runtime.terminal.exit(1);
});

await createProgram(handlers, {
  defaultClaudeDir: process.env['SKILLSWITCH_CLAUDE_DIR'] ?? defaultClaudeDir,
  cliNames: CLI_NAMES,
}).parseAsync();
