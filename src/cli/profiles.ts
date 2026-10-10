import {
  activateProfile,
  copyProfile,
  deleteProfile,
  diffProfile,
  exportProfile,
  forceDeleteProfile,
  importProfile,
  readProfileStore,
  renameProfile,
  saveProfile,
  validateProfile,
  validateProfileName,
} from '../profiles.js';
import { scanPlugins, scanStandaloneSkills } from '../scanner.js';
import type {
  ActivateOptions,
  CliRuntime,
  CommandContext,
  DeleteOptions,
  JsonOptions,
  OutputOptions,
} from './context.js';

export function createProfileHandlers(runtime: Pick<CliRuntime, 'terminal' | 'files'>) {
  const { terminal, files } = runtime;

  function create(context: CommandContext, name: string) {
    try {
      const claudeDir = context.claudeDir;
      validateProfileName(name);
      const skills = scanStandaloneSkills(claudeDir)
        .filter((s) => s.status === 'active')
        .map((s) => s.name);
      const plugins = scanPlugins(claudeDir)
        .filter((p) => p.status === 'active')
        .map((p) => p.id);
      const store = readProfileStore(claudeDir);
      if (store.profiles[name]) terminal.log(`Overwriting existing profile "${name}".`);
      if (!skills.length && !plugins.length)
        terminal.warn(
          `Warning: no active skills or plugins found — profile may be empty by mistake.`,
        );
      saveProfile(name, skills, plugins, claudeDir);
      terminal.log(`Profile "${name}" saved: ${skills.length} skills, ${plugins.length} plugins.`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  async function use(context: CommandContext, name: string, opts: ActivateOptions) {
    const claudeDir = context.claudeDir;
    try {
      if (opts.dryRun) {
        const store = readProfileStore(claudeDir);
        const p = store.profiles[name];
        if (!p) {
          terminal.log(`Profile "${name}" not found.`);
          return;
        }
        const diff = diffProfile(name, claudeDir);
        terminal.log(`[dry-run] Activating "${name}":`);
        if (diff.toEnable.length) terminal.log(`  Enable  : ${diff.toEnable.join(', ')}`);
        if (diff.toDisable.length) terminal.log(`  Disable : ${diff.toDisable.join(', ')}`);
        if (diff.toBlock.length) terminal.log(`  Block   : ${diff.toBlock.join(', ')}`);
        if (diff.toUnblock.length) terminal.log(`  Unblock : ${diff.toUnblock.join(', ')}`);
        if (
          !diff.toEnable.length &&
          !diff.toDisable.length &&
          !diff.toBlock.length &&
          !diff.toUnblock.length
        ) {
          terminal.log('  (no changes)');
        }
        return;
      }
      const result = await activateProfile(name, claudeDir);
      if (!opts.quiet) {
        terminal.log(`Activated "${name}".`);
        if (result.enabled.length) terminal.log(`  Enabled : ${result.enabled.join(', ')}`);
        if (result.disabled.length) terminal.log(`  Disabled: ${result.disabled.join(', ')}`);
        if (result.pluginsBlocked.length)
          terminal.log(`  Blocked : ${result.pluginsBlocked.join(', ')}`);
      }
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function list(context: CommandContext, opts: JsonOptions) {
    const claudeDir = context.claudeDir;
    const store = readProfileStore(claudeDir);
    const names = Object.keys(store.profiles);
    if (opts.json) {
      terminal.write(
        JSON.stringify(
          { active: store.active, previous: store.previous, profiles: store.profiles },
          null,
          2,
        ) + '\n',
      );
      return;
    }
    if (!names.length) {
      terminal.log('No profiles saved.');
      return;
    }
    for (const name of names) {
      const p = store.profiles[name];
      const tag = store.active === name ? ' [active]' : '';
      terminal.log(`  ${name}${tag}: ${p.skills.length} skills, ${p.plugins.length} plugins`);
    }
  }

  function show(context: CommandContext, name: string) {
    const claudeDir = context.claudeDir;
    const store = readProfileStore(claudeDir);
    const p = store.profiles[name];
    if (!p) {
      terminal.log(`Profile "${name}" not found.`);
      return;
    }
    terminal.log(`Profile "${name}" (created ${p.created.slice(0, 10)}):`);
    terminal.log(`  Skills  (${p.skills.length}): ${p.skills.join(', ') || 'none'}`);
    terminal.log(`  Plugins (${p.plugins.length}): ${p.plugins.join(', ') || 'none'}`);
  }

  function remove(context: CommandContext, name: string, opts: DeleteOptions) {
    try {
      const claudeDir = context.claudeDir;
      if (opts.force) {
        const result = forceDeleteProfile(name, claudeDir);
        terminal.log(
          result === 'not-found' ? `Profile "${name}" not found.` : `Profile "${name}" deleted.`,
        );
        return;
      }
      deleteProfile(name, claudeDir);
      terminal.log(`Profile "${name}" deleted.`);
    } catch (err: unknown) {
      terminal.error((err as Error).message);
      terminal.exit(1);
    }
  }

  function rename(context: CommandContext, oldName: string, newName: string) {
    try {
      const claudeDir = context.claudeDir;
      validateProfileName(newName);
      renameProfile(oldName, newName, claudeDir);
      terminal.log(`Profile "${oldName}" renamed to "${newName}".`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function copy(context: CommandContext, srcName: string, dstName: string) {
    try {
      const claudeDir = context.claudeDir;
      validateProfileName(dstName);
      copyProfile(srcName, dstName, claudeDir);
      terminal.log(`Profile "${srcName}" copied to "${dstName}".`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function diff(context: CommandContext, name: string) {
    try {
      const claudeDir = context.claudeDir;
      const diff = diffProfile(name, claudeDir);
      if (
        !diff.toEnable.length &&
        !diff.toDisable.length &&
        !diff.toBlock.length &&
        !diff.toUnblock.length
      ) {
        terminal.log(`Profile "${name}" matches current state — no changes needed.`);
        return;
      }
      terminal.log(`Diff for profile "${name}":`);
      if (diff.toEnable.length) terminal.log(`  Enable  (+): ${diff.toEnable.join(', ')}`);
      if (diff.toDisable.length) terminal.log(`  Disable (-): ${diff.toDisable.join(', ')}`);
      if (diff.toBlock.length) terminal.log(`  Block   (-): ${diff.toBlock.join(', ')}`);
      if (diff.toUnblock.length) terminal.log(`  Unblock (+): ${diff.toUnblock.join(', ')}`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function exportTo(context: CommandContext, name: string, opts: OutputOptions) {
    try {
      const claudeDir = context.claudeDir;
      const json = exportProfile(name, claudeDir);
      if (opts.out) {
        files.writeText(opts.out, json);
        terminal.log(`Profile "${name}" exported to ${opts.out}`);
      } else {
        terminal.write(json + '\n');
      }
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function importFrom(context: CommandContext, file: string) {
    try {
      const claudeDir = context.claudeDir;
      const json = files.readText(file);
      const name = importProfile(json, claudeDir);
      terminal.log(`Profile "${name}" imported.`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function validate(context: CommandContext, name: string) {
    try {
      const claudeDir = context.claudeDir;
      const result = validateProfile(name, claudeDir);
      if (!result.ghostSkills.length) {
        terminal.log(
          `Profile "${name}" is valid — all ${result.validSkills.length} skills found on disk.`,
        );
        return;
      }
      terminal.log(`Profile "${name}" has ${result.ghostSkills.length} ghost skill(s):`);
      result.ghostSkills.forEach((s) => {
        terminal.log(`  ${s} (not found on disk)`);
      });
      if (result.validSkills.length)
        terminal.log(`${result.validSkills.length} skill(s) OK: ${result.validSkills.join(', ')}`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  return { create, use, list, show, remove, rename, copy, diff, exportTo, importFrom, validate };
}
