// src/adapters/codex.ts — OpenAI Codex CLI adapter
// Skills: ~/.agents/skills/<name>/SKILL.md  (canonical shared path)
// Only shared user skills are managed; repo, plugin and legacy Codex roots are outside scope.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseDocument } from 'yaml';
import { CodexConfig } from '../codex-config.js';
import { codexProfiles } from '../codex-profiles.js';
import { validateSkillName } from '../moves.js';
import type { ProfileTarget } from '../profile-target.js';
import { scanDirSkills } from './helpers.js';
import type { AdapterSkill, CliAdapter } from './types.js';

export class CodexAdapter implements CliAdapter {
  readonly cliName = 'codex';
  readonly displayName = 'Codex CLI (OpenAI)';
  readonly skillsDirs: string[];
  readonly profiles: ProfileTarget;

  constructor(
    readonly configDir = path.resolve(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')),
    skillsDir = path.join(os.homedir(), '.agents', 'skills'),
  ) {
    this.skillsDirs = [skillsDir];
    this.profiles = codexProfiles(this);
  }

  isInstalled(): boolean {
    return fs.existsSync(this.configDir);
  }

  scanSkills(): AdapterSkill[] {
    const config = new CodexConfig(this.configDir);
    return scanDirSkills(this.skillsDirs[0]).map((skill) => ({
      ...skill,
      status:
        skill.status === 'disabled' ||
        config.isDisabled(this.skillFile(skill.name), this.manifestName(skill.name))
          ? 'disabled'
          : 'active',
    }));
  }

  private skillFile(name: string): string {
    validateSkillName(name);
    return path.join(this.skillsDirs[0], name, 'SKILL.md');
  }

  private manifestName(name: string): string {
    const file = this.skillFile(name);
    if (!fs.existsSync(file)) return name;
    const frontmatter = fs
      .readFileSync(file, 'utf8')
      .match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:[ \t]*(?:\r?\n|$))/);
    if (!frontmatter) return name;
    const document = parseDocument(frontmatter[1]);
    if (document.errors.length)
      throw new Error(`Invalid skill metadata in ${file}: ${document.errors[0].message}`);
    const metadata: unknown = document.toJS({ maxAliasCount: 20 });
    if (metadata === null || typeof metadata !== 'object' || !('name' in metadata)) return name;
    if (typeof metadata.name !== 'string')
      throw new Error(`Skill name must be a string in ${file}`);
    return metadata.name;
  }

  assertProfileSelection(selected: ReadonlySet<string>): void {
    const targets = new Map<string, boolean>();
    for (const skill of this.scanSkills()) {
      const file = this.skillFile(skill.name);
      if (!fs.existsSync(file)) continue;
      const target = fs.realpathSync(file);
      const enabled = selected.has(skill.name);
      if (targets.has(target) && targets.get(target) !== enabled) {
        throw new Error(`Profile selects conflicting aliases of the same skill: ${skill.name}`);
      }
      targets.set(target, enabled);
    }
  }

  private prepareSkillChanges(changes: ReadonlyMap<string, boolean>): CodexConfig {
    const config = new CodexConfig(this.configDir);
    for (const [name, enabled] of changes) {
      const file = this.skillFile(name);
      if (!fs.existsSync(file)) {
        if (fs.existsSync(path.join(this.skillsDirs[0], '.disabled', name, 'SKILL.md'))) {
          throw new Error(
            `Skill "${name}" is parked in .disabled; restore its folder before enabling it`,
          );
        }
        throw new Error(`Skill "${name}" not found in Codex skills directory`);
      }
      config.setEnabled(file, this.manifestName(name), enabled);
    }
    return config;
  }

  validateSkillChanges(changes: ReadonlyMap<string, boolean>): void {
    this.prepareSkillChanges(changes);
  }

  setSkillsEnabled(changes: ReadonlyMap<string, boolean>): void {
    const config = this.prepareSkillChanges(changes);
    if (changes.size) config.write();
  }

  disableSkill(name: string): void {
    this.setSkillsEnabled(new Map([[name, false]]));
  }

  enableSkill(name: string): void {
    this.setSkillsEnabled(new Map([[name, true]]));
  }
}
