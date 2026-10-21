// src/adapters/copilot.ts — GitHub Copilot CLI adapter
// Skills: ~/.copilot/skills/<name>/SKILL.md  (personal skills)
// Copilot also reads ~/.agents/skills, which Codex and Amp share; that root is left untouched.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertMoveAllowed } from '../moves.js';
import type { ProfileTarget } from '../profile-target.js';
import { skillProfiles } from '../skill-profiles.js';
import { disableDirSkill, enableDirSkill, scanDirSkills } from './helpers.js';
import type { AdapterSkill, CliAdapter } from './types.js';

export class CopilotAdapter implements CliAdapter {
  readonly cliName = 'copilot';
  readonly displayName = 'GitHub Copilot CLI';
  readonly skillsDirs: string[];
  readonly profiles: ProfileTarget;

  constructor(readonly configDir = path.join(os.homedir(), '.copilot')) {
    this.skillsDirs = [path.join(configDir, 'skills')];
    this.profiles = skillProfiles({
      label: 'Copilot',
      directory: configDir,
      scope:
        'Personal skills in ~/.copilot/skills only. Shared ~/.agents/skills, repo and plugin skills are outside this profile.',
      scanSkills: () => this.scanSkills(),
      validateSkillChanges: (changes) => this.validateSkillChanges(changes),
      setSkillsEnabled: (changes) => this.setSkillsEnabled(changes),
    });
  }

  isInstalled(): boolean {
    return fs.existsSync(this.configDir);
  }

  scanSkills(): AdapterSkill[] {
    return scanDirSkills(this.skillsDirs[0]);
  }

  validateSkillChanges(changes: ReadonlyMap<string, boolean>): void {
    for (const [name, enable] of changes) {
      assertMoveAllowed(name, this.skillsDirs[0], enable, true);
    }
  }

  setSkillsEnabled(changes: ReadonlyMap<string, boolean>): void {
    this.validateSkillChanges(changes);
    for (const [name, enable] of changes) {
      if (enable) this.enableSkill(name);
      else this.disableSkill(name);
    }
  }

  disableSkill(name: string): void {
    disableDirSkill(name, this.skillsDirs[0]);
  }

  enableSkill(name: string): void {
    enableDirSkill(name, this.skillsDirs[0]);
  }
}
