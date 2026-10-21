import type { CodexAdapter } from './adapters/codex.js';
import type { ProfileTarget } from './profile-target.js';
import { skillProfiles } from './skill-profiles.js';

export function codexProfiles(adapter: CodexAdapter): ProfileTarget {
  return skillProfiles({
    label: 'Codex',
    directory: adapter.configDir,
    scope:
      'User skills in ~/.agents/skills only; applies to Codex app and CLI. Repo, plugin and system skills are outside this profile.',
    scanSkills: () => adapter.scanSkills(),
    assertProfileSelection: (selected) => adapter.assertProfileSelection(selected),
    validateSkillChanges: (changes) => adapter.validateSkillChanges(changes),
    setSkillsEnabled: (changes) => adapter.setSkillsEnabled(changes),
  });
}
