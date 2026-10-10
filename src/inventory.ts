import type { AdapterSkill } from './adapters/types.js';
import type { PluginEntry, StandaloneSkill } from './types.js';

export function searchSkills<T extends AdapterSkill>(
  skills: T[],
  query: string,
  status?: string,
): T[] {
  const normalizedQuery = query.toLowerCase();
  return skills.filter(
    (skill) =>
      (skill.name.includes(normalizedQuery) ||
        skill.description.toLowerCase().includes(normalizedQuery)) &&
      (!status || skill.status === status),
  );
}

export function countSkills(skills: AdapterSkill[]) {
  const active = skills.filter((skill) => skill.status === 'active').length;
  const disabled = skills.filter((skill) => skill.status === 'disabled').length;
  return { active, disabled, total: active + disabled };
}

export function countClaudeSkills(standalone: StandaloneSkill[], plugins: PluginEntry[]) {
  const counts = countSkills(standalone);
  const active =
    counts.active +
    plugins
      .filter((plugin) => plugin.status === 'active')
      .reduce((count, plugin) => count + plugin.skills.length, 0);
  const disabled =
    counts.disabled +
    plugins
      .filter((plugin) => plugin.status === 'disabled')
      .reduce((count, plugin) => count + plugin.skills.length, 0);
  return { active, disabled, total: active + disabled };
}

export function auditInventory(standalone: StandaloneSkill[], plugins: PluginEntry[]) {
  const standaloneNames = new Set(standalone.map((skill) => skill.name));
  const pluginBaseNames = plugins.flatMap((plugin) =>
    plugin.skills.map((skill) => skill.name.split(':').at(-1)),
  );
  return {
    duplicates: [...standaloneNames].filter((name) => pluginBaseNames.includes(name)),
    disabledStandalone: standalone
      .filter((skill) => skill.status === 'disabled')
      .map((skill) => skill.name),
    disabledPlugins: plugins
      .filter((plugin) => plugin.status === 'disabled')
      .map((plugin) => plugin.id),
  };
}
