// src/catalog.ts

import * as os from 'node:os';
import * as path from 'node:path';
import { writeAtomicSync } from './atomic.js';
import { scanPlugins, scanStandaloneSkills } from './scanner.js';

export const defaultClaudeDir = path.join(os.homedir(), '.claude');

export function generateCatalog(
  claudeDir = defaultClaudeDir,
  outPath = path.join(claudeDir, 'SKILLS.md'),
): string {
  const standalone = scanStandaloneSkills(claudeDir);
  const plugins = scanPlugins(claudeDir);

  const activeStandalone = standalone.filter((s) => s.status === 'active');
  const disabledStandalone = standalone.filter((s) => s.status === 'disabled');
  const activePlugins = plugins.filter((p) => p.status === 'active');
  const disabledPlugins = plugins.filter((p) => p.status === 'disabled');

  const totalActive =
    activeStandalone.length + activePlugins.reduce((n, p) => n + p.skills.length, 0);
  const totalDisabled =
    disabledStandalone.length + disabledPlugins.reduce((n, p) => n + p.skills.length, 0);

  const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = (skills: Array<{ name: string; description: string }>) =>
    skills.map((s) => `| ${escapeCell(s.name)} | ${escapeCell(s.description || '—')} |`).join('\n');

  const sections: string[] = [
    `# Skills Catalog`,
    `Generated: ${new Date().toISOString().slice(0, 10)} | Active: ${totalActive} | Disabled: ${totalDisabled}`,
    '',
  ];

  if (activeStandalone.length > 0) {
    sections.push(
      `## Standalone — active (${activeStandalone.length})`,
      '| Skill | Description |',
      '|-------|-------------|',
      rows(activeStandalone),
      '',
    );
  }
  if (disabledStandalone.length > 0) {
    sections.push(
      `## Standalone — disabled (${disabledStandalone.length})`,
      '| Skill | Description |',
      '|-------|-------------|',
      rows(disabledStandalone),
      '',
    );
  }
  for (const p of activePlugins) {
    sections.push(
      `## Plugin: ${p.name} — active (${p.skills.length})`,
      '| Skill | Description |',
      '|-------|-------------|',
      rows(p.skills),
      '',
    );
  }
  for (const p of disabledPlugins) {
    sections.push(
      `## Plugin: ${p.name} — DISABLED (${p.skills.length})`,
      '| Skill | Description |',
      '|-------|-------------|',
      rows(p.skills),
      '',
    );
  }

  const content = sections.join('\n');
  writeAtomicSync(outPath, content);
  return content;
}
