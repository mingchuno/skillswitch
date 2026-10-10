import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify, type TomlTable } from 'smol-toml';
import { writeAtomicSync } from './atomic.js';

interface SkillConfig {
  path?: string;
  name?: string;
  enabled: boolean;
}

function isTable(value: unknown): value is TomlTable {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalPath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path.resolve(file);
    throw error;
  }
}

function configWritePath(file: string): string {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return file;
    throw error;
  }
  // A dangling symlink must fail, rather than being replaced as a missing file.
  return stat.isSymbolicLink() ? fs.realpathSync(file) : file;
}

// One read/modify/write per profile switch, preserving unrelated TOML values.
export class CodexConfig {
  private readonly document: TomlTable;
  private readonly entries: SkillConfig[];
  private readonly file: string;
  private readonly selectorBase: string;

  constructor(directory: string) {
    this.selectorBase = path.resolve(directory);
    this.file = configWritePath(path.join(directory, 'config.toml'));
    let source = '';
    try {
      source = fs.readFileSync(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.document = parse(source, { integersAsBigInt: true });
    const skills = this.document.skills;
    if (skills !== undefined && !isTable(skills)) throw new Error('Invalid Codex skills table');
    const entries = skills?.config ?? [];
    if (
      !Array.isArray(entries) ||
      !entries.every(
        (entry) =>
          isTable(entry) &&
          typeof entry.enabled === 'boolean' &&
          (entry.path === undefined || typeof entry.path === 'string') &&
          (entry.name === undefined || typeof entry.name === 'string') &&
          (typeof entry.path === 'string') !== (typeof entry.name === 'string'),
      )
    ) {
      throw new Error('Invalid Codex skills.config entries');
    }
    this.entries = entries as unknown as SkillConfig[];
  }

  private matchesPath(entry: SkillConfig, file: string): boolean {
    return (
      entry.path !== undefined &&
      canonicalPath(path.resolve(this.selectorBase, entry.path)) === canonicalPath(file)
    );
  }

  isDisabled(file: string, skillName: string): boolean {
    return this.entries.some(
      (entry) => !entry.enabled && (this.matchesPath(entry, file) || entry.name === skillName),
    );
  }

  setEnabled(file: string, skillName: string, enabled: boolean): void {
    if (enabled && this.entries.some((entry) => !entry.enabled && entry.name === skillName)) {
      throw new Error(
        `Skill "${skillName}" is disabled by name in config.toml; remove that rule first`,
      );
    }
    // Replace only selectors for this exact file. Name rules can affect skills
    // outside our managed root, so leave them intact.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.matchesPath(this.entries[i], file)) this.entries.splice(i, 1);
    }
    if (!enabled) this.entries.push({ path: canonicalPath(file), enabled: false });
  }

  write(): void {
    const skills = (this.document.skills ?? {}) as TomlTable;
    skills.config = this.entries as unknown as TomlTable['config'];
    this.document.skills = skills;
    writeAtomicSync(this.file, stringify(this.document, { numbersAsFloat: true }));
  }
}
