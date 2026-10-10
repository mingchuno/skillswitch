// src/adapters/claude.ts — Claude Code adapter
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { disableSkill, enableSkill } from '../disable.js';
import { scanStandaloneSkills } from '../scanner.js';
import type { AdapterSkill, CliAdapter } from './types.js';

export class ClaudeAdapter implements CliAdapter {
  readonly cliName = 'claude';
  readonly displayName = 'Claude Code';
  readonly skillsDirs: string[];

  constructor(private readonly claudeDir = path.join(os.homedir(), '.claude')) {
    this.skillsDirs = [path.join(claudeDir, 'skills')];
  }

  isInstalled(): boolean {
    return fs.existsSync(this.claudeDir);
  }

  scanSkills(): AdapterSkill[] {
    return scanStandaloneSkills(this.claudeDir).map((s) => ({
      name: s.name,
      status: s.status,
      description: s.description,
    }));
  }

  disableSkill(name: string): void {
    disableSkill(name, this.claudeDir);
  }

  enableSkill(name: string): void {
    enableSkill(name, this.claudeDir);
  }
}
