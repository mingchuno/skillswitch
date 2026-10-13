import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertMoveAllowed, moveSkill } from '../moves.js';
import { findSkillDir, scanDirSkills } from './helpers.js';
import type { AdapterSkill, CliAdapter } from './types.js';

export class AntigravityAdapter implements CliAdapter {
  readonly cliName = 'agy';
  readonly displayName = 'Antigravity CLI';
  readonly skillsDirs: string[];

  constructor(
    home = os.homedir(),
    private readonly searchPath = process.env.PATH ?? '',
  ) {
    this.skillsDirs = [
      path.join(home, '.gemini', 'config', 'skills'),
      path.join(home, '.gemini', 'antigravity-cli', 'skills'),
    ];
  }

  isInstalled(): boolean {
    const windows = process.platform === 'win32';
    const extensions = windows ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
    return this.searchPath.split(path.delimiter).some((directory) => {
      if (!directory) return false;
      return extensions.some((extension) => {
        const executable = path.join(directory, `agy${extension.toLowerCase()}`);
        try {
          fs.accessSync(executable, windows ? fs.constants.F_OK : fs.constants.X_OK);
          return fs.statSync(executable).isFile();
        } catch {
          return false;
        }
      });
    });
  }

  scanSkills(): AdapterSkill[] {
    const skills = this.skillsDirs.flatMap((dir, index) =>
      scanDirSkills(dir, index === 0 ? undefined : 'cli'),
    );
    const seen = new Set<string>();
    for (const skill of skills) {
      if (seen.has(skill.name)) {
        throw new Error(
          `Ambiguous Antigravity skill "${skill.name}". Keep one copy across global skills and .disabled directories.`,
        );
      }
      seen.add(skill.name);
    }
    return skills;
  }

  disableSkill(name: string): void {
    this.moveBundle(name, false);
  }

  enableSkill(name: string): void {
    this.moveBundle(name, true);
  }

  private moveBundle(name: string, enable: boolean): void {
    const directory = this.skillDirectory(name);
    const { src, dst, disabled } = assertMoveAllowed(name, directory, enable, true);
    if (!fs.lstatSync(src).isSymbolicLink() || path.isAbsolute(fs.readlinkSync(src))) {
      moveSkill(name, directory, true, enable, `Skill "${name}" not found`);
      return;
    }
    const target = fs.readlinkSync(src);
    const parentPrefix = `..${path.sep}`;
    // Keep internal symlink/.. components intact: normalizing them changes
    // filesystem resolution. The parked link is exactly one level deeper.
    const adjustedTarget = enable
      ? target.startsWith(parentPrefix)
        ? target.slice(parentPrefix.length)
        : `.disabled${path.sep}${target}`
      : `${parentPrefix}${target}`;
    fs.mkdirSync(disabled, { recursive: true });
    // Create the adjusted link before removing the original so a failed write
    // leaves the active/parked source intact. Never move the target directory.
    fs.symlinkSync(adjustedTarget, dst, 'dir');
    try {
      fs.unlinkSync(src);
    } catch (error) {
      fs.unlinkSync(dst);
      throw error;
    }
  }

  private skillDirectory(name: string): string {
    this.scanSkills();
    const directory = findSkillDir(name, this.skillsDirs, true);
    if (!directory)
      throw new Error(`Skill "${name}" not found in Antigravity global skills directories`);
    return directory;
  }
}
