import { profileTarget } from '../profile-target.js';
import {
  copyProfile,
  deleteProfile,
  exportProfile,
  forceDeleteProfile,
  readProfileStore,
  renameProfile,
  saveProfile,
  validateProfileName,
} from '../profiles.js';
import type {
  ActivateOptions,
  CliRuntime,
  CommandContext,
  DeleteOptions,
  JsonOptions,
  OutputOptions,
} from './context.js';

export function createProfileHandlers(
  runtime: Pick<CliRuntime, 'terminal' | 'files' | 'adapters'>,
) {
  const { terminal, files, adapters } = runtime;
  function target(context: CommandContext) {
    return profileTarget(
      adapters.get(context.target, context.target === 'claude' ? context.claudeDir : undefined),
      context.claudeDir,
    );
  }
  function showScope(context: CommandContext) {
    const scope = target(context).scope;
    if (scope) terminal.log(`Scope: ${scope}`);
  }

  function create(context: CommandContext, name: string) {
    try {
      const directory = target(context).directory;
      validateProfileName(name);
      const { skills, plugins } = target(context).snapshot();
      showScope(context);
      const store = readProfileStore(directory);
      if (store.profiles[name]) terminal.log(`Overwriting existing profile "${name}".`);
      if (!skills.length && !plugins.length)
        terminal.warn(
          `Warning: no active skills or plugins found — profile may be empty by mistake.`,
        );
      saveProfile(name, skills, plugins, directory);
      terminal.log(`Profile "${name}" saved: ${skills.length} skills, ${plugins.length} plugins.`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  async function use(context: CommandContext, name: string, opts: ActivateOptions) {
    const directory = target(context).directory;
    try {
      if (!opts.quiet) showScope(context);
      if (opts.dryRun) {
        const store = readProfileStore(directory);
        const p = store.profiles[name];
        if (!p) {
          terminal.log(`Profile "${name}" not found.`);
          return;
        }
        const diff = target(context).diff(name);
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
      const result = await target(context).activate(name);
      if (!opts.quiet) {
        terminal.log(`Activated "${name}".`);
        if (context.target === 'codex')
          terminal.log('Restart Codex app / CLI to apply configuration changes.');
        if (context.target === 'copilot')
          terminal.log('Run /skills reload in Copilot CLI to apply changes.');
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
    const directory = target(context).directory;
    const store = readProfileStore(directory);
    const names = Object.keys(store.profiles);
    if (!opts.json) showScope(context);
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
    const directory = target(context).directory;
    const store = readProfileStore(directory);
    const p = store.profiles[name];
    if (!p) {
      terminal.log(`Profile "${name}" not found.`);
      return;
    }
    showScope(context);
    terminal.log(`Profile "${name}" (created ${p.created.slice(0, 10)}):`);
    terminal.log(`  Skills  (${p.skills.length}): ${p.skills.join(', ') || 'none'}`);
    terminal.log(`  Plugins (${p.plugins.length}): ${p.plugins.join(', ') || 'none'}`);
  }

  function remove(context: CommandContext, name: string, opts: DeleteOptions) {
    try {
      const directory = target(context).directory;
      if (opts.force) {
        const result = forceDeleteProfile(name, directory);
        terminal.log(
          result === 'not-found' ? `Profile "${name}" not found.` : `Profile "${name}" deleted.`,
        );
        return;
      }
      deleteProfile(name, directory);
      terminal.log(`Profile "${name}" deleted.`);
    } catch (err: unknown) {
      terminal.error((err as Error).message);
      terminal.exit(1);
    }
  }

  function rename(context: CommandContext, oldName: string, newName: string) {
    try {
      const directory = target(context).directory;
      validateProfileName(newName);
      renameProfile(oldName, newName, directory);
      terminal.log(`Profile "${oldName}" renamed to "${newName}".`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function copy(context: CommandContext, srcName: string, dstName: string) {
    try {
      const directory = target(context).directory;
      validateProfileName(dstName);
      copyProfile(srcName, dstName, directory);
      terminal.log(`Profile "${srcName}" copied to "${dstName}".`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function diff(context: CommandContext, name: string) {
    try {
      const diff = target(context).diff(name);
      showScope(context);
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
      const directory = target(context).directory;
      const json = exportProfile(name, directory);
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
      const json = files.readText(file);
      const name = target(context).import(json);
      terminal.log(`Profile "${name}" imported.`);
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function validate(context: CommandContext, name: string) {
    try {
      const result = target(context).validate(name);
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
