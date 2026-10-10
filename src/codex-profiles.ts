import type { CodexAdapter } from './adapters/codex.js';
import type { ProfileTarget } from './profile-target.js';
import { importProfile, readProfileStore, recordProfileActivation } from './profiles.js';

function skillChanges(diff: { toEnable: string[]; toDisable: string[] }): Map<string, boolean> {
  return new Map([
    ...diff.toEnable.map((skill) => [skill, true] as const),
    ...diff.toDisable.map((skill) => [skill, false] as const),
  ]);
}

export function codexProfiles(adapter: CodexAdapter): ProfileTarget {
  const directory = adapter.configDir;
  function getProfile(name: string) {
    const profile = readProfileStore(directory).profiles[name];
    if (!profile) throw new Error(`Profile "${name}" does not exist`);
    if (profile.plugins.length) throw new Error('Codex profiles do not support plugins');
    return profile;
  }

  function validate(name: string) {
    const profile = getProfile(name);
    const inventory = new Set(adapter.scanSkills().map((skill) => skill.name));
    return {
      validSkills: profile.skills.filter((skill) => inventory.has(skill)),
      ghostSkills: profile.skills.filter((skill) => !inventory.has(skill)),
    };
  }

  function diff(name: string) {
    const profile = getProfile(name);
    const selected = new Set(profile.skills);
    const inventory = adapter.scanSkills();
    adapter.assertProfileSelection(selected);
    const missing = profile.skills.filter(
      (skill) => !inventory.some((entry) => entry.name === skill),
    );
    if (missing.length) throw new Error(`Profile has missing skills: ${missing.join(', ')}`);
    const changes = {
      toEnable: inventory
        .filter((skill) => selected.has(skill.name) && skill.status === 'disabled')
        .map((skill) => skill.name),
      toDisable: inventory
        .filter((skill) => !selected.has(skill.name) && skill.status === 'active')
        .map((skill) => skill.name),
      toBlock: [],
      toUnblock: [],
    };
    adapter.validateSkillChanges(skillChanges(changes));
    return changes;
  }

  return {
    directory,
    scope:
      'User skills in ~/.agents/skills only; applies to Codex app and CLI. Repo, plugin and system skills are outside this profile.',
    snapshot: () => ({
      skills: adapter
        .scanSkills()
        .filter((skill) => skill.status === 'active')
        .map((skill) => skill.name),
      plugins: [],
    }),
    diff,
    validate,
    async activate(name) {
      const changes = diff(name);
      adapter.setSkillsEnabled(skillChanges(changes));
      recordProfileActivation(name, directory);
      return { enabled: changes.toEnable, disabled: changes.toDisable, pluginsBlocked: [] };
    },
    import(json) {
      const profile: unknown = JSON.parse(json);
      if (
        profile !== null &&
        typeof profile === 'object' &&
        'plugins' in profile &&
        Array.isArray(profile.plugins) &&
        profile.plugins.length
      ) {
        throw new Error('Codex profiles do not support plugins');
      }
      return importProfile(json, directory);
    },
  };
}
