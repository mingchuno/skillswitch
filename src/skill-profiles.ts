import type { AdapterSkill } from './adapters/types.js';
import type { ProfileTarget } from './profile-target.js';
import { importProfile, readProfileStore, recordProfileActivation } from './profiles.js';

// Profiles for adapters that manage a flat set of skills without plugins.
export interface SkillProfileSource {
  readonly label: string;
  readonly directory: string;
  readonly scope: string;
  scanSkills(): AdapterSkill[];
  assertProfileSelection?(selected: ReadonlySet<string>): void;
  validateSkillChanges(changes: ReadonlyMap<string, boolean>): void;
  setSkillsEnabled(changes: ReadonlyMap<string, boolean>): void;
}

function skillChanges(diff: { toEnable: string[]; toDisable: string[] }): Map<string, boolean> {
  return new Map([
    ...diff.toEnable.map((skill) => [skill, true] as const),
    ...diff.toDisable.map((skill) => [skill, false] as const),
  ]);
}

export function skillProfiles(source: SkillProfileSource): ProfileTarget {
  const { directory, label } = source;
  const pluginsUnsupported = `${label} profiles do not support plugins`;
  function getProfile(name: string) {
    const profile = readProfileStore(directory).profiles[name];
    if (!profile) throw new Error(`Profile "${name}" does not exist`);
    if (profile.plugins.length) throw new Error(pluginsUnsupported);
    return profile;
  }

  function validate(name: string) {
    const profile = getProfile(name);
    const inventory = new Set(source.scanSkills().map((skill) => skill.name));
    return {
      validSkills: profile.skills.filter((skill) => inventory.has(skill)),
      ghostSkills: profile.skills.filter((skill) => !inventory.has(skill)),
    };
  }

  function diff(name: string) {
    const profile = getProfile(name);
    const selected = new Set(profile.skills);
    const inventory = source.scanSkills();
    source.assertProfileSelection?.(selected);
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
    source.validateSkillChanges(skillChanges(changes));
    return changes;
  }

  return {
    directory,
    scope: source.scope,
    snapshot: () => ({
      skills: source
        .scanSkills()
        .filter((skill) => skill.status === 'active')
        .map((skill) => skill.name),
      plugins: [],
    }),
    diff,
    validate,
    async activate(name) {
      const changes = diff(name);
      source.setSkillsEnabled(skillChanges(changes));
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
        throw new Error(pluginsUnsupported);
      }
      return importProfile(json, directory);
    },
  };
}
