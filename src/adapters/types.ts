import type { ProfileTarget } from '../profile-target.js';

// src/adapters/types.ts

export interface AdapterSkill {
  name: string;
  status: 'active' | 'disabled';
  description: string;
  group?: string; // e.g., 'droid', 'command', 'shared'
}

export interface CliAdapter {
  readonly profiles?: ProfileTarget;
  readonly cliName: string;
  readonly displayName: string;
  readonly skillsDirs: string[]; // primary skill directories for this CLI
  isInstalled(): boolean;
  scanSkills(): AdapterSkill[];
  validateSkillChanges?(changes: ReadonlyMap<string, boolean>): void;
  disableSkill(name: string): void;
  enableSkill(name: string): void;
}
