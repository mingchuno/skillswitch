// src/adapters/factory.ts — Factory Droid adapter
// Droids:   ~/.factory/droids/<name>.md   (flat files, YAML frontmatter)
// Commands: ~/.factory/commands/<name>.md (flat files, YAML frontmatter)
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { disableFlatSkill, enableFlatSkill, findSkillDir, scanFlatSkills } from './helpers.js';
import type { AdapterSkill, CliAdapter } from './types.js';

const HOME = os.homedir();
const FACTORY_DIR = path.join(HOME, '.factory');

export class FactoryAdapter implements CliAdapter {
  readonly cliName = 'droid';
  readonly displayName = 'Factory Droid';
  readonly skillsDirs = [path.join(FACTORY_DIR, 'droids'), path.join(FACTORY_DIR, 'commands')];

  isInstalled(): boolean {
    return fs.existsSync(FACTORY_DIR);
  }

  scanSkills(): AdapterSkill[] {
    return [
      ...scanFlatSkills(this.skillsDirs[0], 'droid'),
      ...scanFlatSkills(this.skillsDirs[1], 'command'),
    ];
  }

  disableSkill(name: string): void {
    const dir = findSkillDir(name, this.skillsDirs, false);
    if (!dir) throw new Error(`Skill "${name}" not found in Factory Droid directories`);
    disableFlatSkill(name, dir);
  }

  enableSkill(name: string): void {
    const dir = findSkillDir(name, this.skillsDirs, false);
    if (!dir) throw new Error(`Skill "${name}" not found in Factory Droid directories`);
    enableFlatSkill(name, dir);
  }
}
