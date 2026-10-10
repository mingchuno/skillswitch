// src/adapters/index.ts

import * as os from 'node:os';
import * as path from 'node:path';
import { AiderAdapter } from './aider.js';
import { AmpAdapter } from './amp.js';
import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';
import { FactoryAdapter } from './factory.js';
import { GeminiAdapter } from './gemini.js';
import type { CliAdapter } from './types.js';

export { AiderAdapter } from './aider.js';
export type { AdapterSkill, CliAdapter } from './types.js';

const ADAPTERS: Record<string, (claudeDir?: string) => CliAdapter> = {
  claude: (claudeDir) => new ClaudeAdapter(claudeDir ?? path.join(os.homedir(), '.claude')),
  gemini: () => new GeminiAdapter(),
  codex: () => new CodexAdapter(),
  droid: () => new FactoryAdapter(),
  amp: () => new AmpAdapter(),
  aider: () => new AiderAdapter(),
};

export const CLI_NAMES = Object.keys(ADAPTERS);

export function getAdapter(cli: string, claudeDir?: string): CliAdapter {
  const factory = ADAPTERS[cli.toLowerCase()];
  if (!factory) throw new Error(`Unknown CLI "${cli}". Valid options: ${CLI_NAMES.join(', ')}`);
  return factory(claudeDir);
}

export function getAllAdapters(): CliAdapter[] {
  return CLI_NAMES.map((name) => ADAPTERS[name]());
}
