import type { CliAdapter } from './adapters/types.js';
import {
  type ActivateResult,
  activateProfile,
  diffProfile,
  importProfile,
  type ProfileDiff,
  type ValidationResult,
  validateProfile,
} from './profiles.js';
import { scanPlugins, scanStandaloneSkills } from './scanner.js';

export interface ProfileTarget {
  readonly directory: string;
  readonly scope?: string;
  snapshot(): { skills: string[]; plugins: string[] };
  diff(name: string): ProfileDiff;
  activate(name: string): Promise<ActivateResult>;
  validate(name: string): ValidationResult;
  import(json: string): string;
}

export function profileTarget(adapter: CliAdapter, claudeDir: string): ProfileTarget {
  if (adapter.profiles) return adapter.profiles;
  if (adapter.cliName !== 'claude')
    throw new Error('Profiles currently support only Claude, Codex and Copilot.');
  return {
    directory: claudeDir,
    snapshot: () => ({
      skills: scanStandaloneSkills(claudeDir)
        .filter((skill) => skill.status === 'active')
        .map((skill) => skill.name),
      plugins: scanPlugins(claudeDir)
        .filter((plugin) => plugin.status === 'active')
        .map((plugin) => plugin.id),
    }),
    diff: (name) => diffProfile(name, claudeDir),
    activate: (name) => activateProfile(name, claudeDir),
    validate: (name) => validateProfile(name, claudeDir),
    import: (json) => importProfile(json, claudeDir),
  };
}
