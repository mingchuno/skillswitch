import type { CliAdapter } from '../adapters/types.js';
import { blockPlugin, unblockPlugin } from '../blocklist.js';
import { countClaudeSkills, countSkills, searchSkills } from '../inventory.js';
import { createNameMatcher } from '../name-matcher.js';
import { readProfileStore } from '../profiles.js';
import { scanPlugins, scanStandaloneSkills } from '../scanner.js';
import type {
  CliRuntime,
  CommandContext,
  JsonOptions,
  ListOptions,
  MutationOptions,
  SearchOptions,
} from './context.js';

export function createSkillHandlers(runtime: Pick<CliRuntime, 'terminal' | 'adapters'>) {
  const { terminal, adapters } = runtime;

  function list(context: CommandContext, opts: ListOptions) {
    const cliTarget = context.target;

    if (cliTarget !== 'claude') {
      const adapter = adapters.get(cliTarget);
      const statusFilter = opts.disabled ? 'disabled' : opts.enabled ? 'active' : null;
      let skills = adapter.scanSkills();
      if (statusFilter) skills = skills.filter((s) => s.status === statusFilter);
      if (opts.json) {
        terminal.write(JSON.stringify(skills, null, 2) + '\n');
        return;
      }
      terminal.log(`\n${adapter.displayName} skills (${skills.length}):`);
      for (const s of skills)
        terminal.log(
          `  ${s.name}${s.group ? ` [${s.group}]` : ''}${s.status === 'disabled' ? ' [disabled]' : ''}`,
        );
      return;
    }

    const claudeDir = context.claudeDir;
    const standalone = scanStandaloneSkills(claudeDir);
    const plugins = scanPlugins(claudeDir);

    if (opts.json) {
      const filter = opts.disabled ? 'disabled' : opts.enabled ? 'active' : null;
      const ss = filter ? standalone.filter((s) => s.status === filter) : standalone;
      const pp = filter
        ? plugins.filter((p) => p.status === (filter === 'active' ? 'active' : 'disabled'))
        : plugins;
      terminal.write(JSON.stringify({ standalone: ss, plugins: pp }, null, 2) + '\n');
      return;
    }

    const statusFilter = opts.disabled ? 'disabled' : opts.enabled ? 'active' : null;
    const ss = statusFilter ? standalone.filter((s) => s.status === statusFilter) : standalone;
    terminal.log(`\nStandalone (${standalone.length} total):`);
    for (const s of ss) terminal.log(`  ${s.name}${s.status === 'disabled' ? ' [disabled]' : ''}`);
    const pp = statusFilter ? plugins.filter((p) => p.status === statusFilter) : plugins;
    for (const p of pp) {
      terminal.log(
        `\n${p.id}${p.status === 'disabled' ? ' [DISABLED]' : ''} (${p.skills.length} skills)`,
      );
      for (const s of p.skills)
        terminal.log(`  ${s.name}${s.status === 'disabled' ? ' [disabled]' : ''}`);
    }
  }

  function search(context: CommandContext, query: string, opts: SearchOptions) {
    const cliTarget = context.target;

    if (cliTarget !== 'claude') {
      const adapter = adapters.get(cliTarget);
      const matches = searchSkills(adapter.scanSkills(), query, opts.status);
      if (opts.json) {
        terminal.write(JSON.stringify(matches, null, 2) + '\n');
        return;
      }
      if (!matches.length) {
        terminal.log(`No ${adapter.displayName} skills matching "${query}".`);
        return;
      }
      terminal.log(`\n${matches.length} match(es) for "${query}" in ${adapter.displayName}:\n`);
      for (const s of matches) {
        terminal.log(`  ${s.name} [${s.status}]${s.group ? ` (${s.group})` : ''}`);
        if (s.description) terminal.log(`    ${s.description}`);
      }
      return;
    }

    const claudeDir = context.claudeDir;
    const standalone = scanStandaloneSkills(claudeDir);
    const plugins = scanPlugins(claudeDir);
    const matches = searchSkills(
      [...standalone, ...plugins.flatMap((plugin) => plugin.skills)],
      query,
      opts.status,
    );
    if (opts.json) {
      terminal.write(JSON.stringify(matches, null, 2) + '\n');
      return;
    }
    if (!matches.length) {
      terminal.log(`No skills matching "${query}".`);
      return;
    }
    terminal.log(`\n${matches.length} match(es) for "${query}":\n`);
    for (const s of matches) {
      terminal.log(`  ${s.name} [${s.status}]`);
      if (s.description) terminal.log(`    ${s.description}`);
    }
  }

  function status(context: CommandContext, opts: JsonOptions) {
    const cliTarget = context.target;

    if (cliTarget !== 'claude') {
      const adapter = adapters.get(cliTarget);
      const skills = adapter.scanSkills();
      const { active, disabled, total } = countSkills(skills);
      const profileState = adapter.profiles
        ? { activeProfile: readProfileStore(adapter.profiles.directory).active }
        : {};
      if (opts.json) {
        terminal.write(
          JSON.stringify(
            { cli: adapter.displayName, ...profileState, active, disabled, total },
            null,
            2,
          ) + '\n',
        );
        return;
      }
      terminal.log(`CLI            : ${adapter.displayName}`);
      if (adapter.profiles) {
        terminal.log(`Active profile : ${profileState.activeProfile ?? 'none'}`);
        terminal.log(`Scope: ${adapter.profiles.scope}`);
      }
      terminal.log(`Enabled skills : ${active}`);
      terminal.log(`Disabled skills: ${disabled}`);
      terminal.log(`Total          : ${total}`);
      return;
    }

    const claudeDir = context.claudeDir;
    const store = readProfileStore(claudeDir);
    const standalone = scanStandaloneSkills(claudeDir);
    const plugins = scanPlugins(claudeDir);
    const { active, disabled, total } = countClaudeSkills(standalone, plugins);

    if (opts.json) {
      terminal.write(
        JSON.stringify({ activeProfile: store.active, active, disabled, total }, null, 2) + '\n',
      );
      return;
    }
    terminal.log(`Active profile : ${store.active ?? 'none'}`);
    terminal.log(`Enabled skills : ${active}`);
    terminal.log(`Disabled skills: ${disabled}`);
    terminal.log(`Total          : ${total}`);
  }

  interface SkillTransition {
    fromStatus: 'active' | 'disabled';
    verb: 'Enable' | 'Disable';
    past: 'Enabled' | 'Disabled';
    apply(adapter: CliAdapter, name: string): void;
  }

  async function changeSkills(
    context: CommandContext,
    selection: { name: string; opts: MutationOptions },
    transition: SkillTransition,
  ): Promise<void> {
    const { name, opts } = selection;
    const adapter =
      context.target === 'claude'
        ? adapters.get(context.target, context.claudeDir)
        : adapters.get(context.target);
    const matchesName = createNameMatcher(name, opts);
    const matches = adapter
      .scanSkills()
      .filter((skill) => matchesName(skill.name) && skill.status === transition.fromStatus);
    if (!matches.length) {
      const label = context.target === 'claude' ? '' : `${adapter.displayName} `;
      terminal.log(`No ${transition.fromStatus} ${label}skills matching "${name}".`);
      return;
    }
    if (matches.length > 1) {
      terminal.log(`Matches: ${matches.map((skill) => skill.name).join(', ')}`);
      if (!(await terminal.confirm(`${transition.verb} all ${matches.length}? (y/N) `))) {
        terminal.log('Aborted.');
        return;
      }
    }
    adapter.validateSkillChanges?.(
      new Map(matches.map((skill) => [skill.name, transition.fromStatus === 'disabled'])),
    );
    for (const skill of matches) {
      if (!opts.dryRun) transition.apply(adapter, skill.name);
      if (!opts.quiet) {
        terminal.log(
          opts.dryRun
            ? `[dry-run] Would ${transition.verb.toLowerCase()}: ${skill.name}`
            : `${transition.past}: ${skill.name}`,
        );
      }
    }
    if (context.target === 'codex' && !opts.dryRun && !opts.quiet) {
      terminal.log('Restart Codex app / CLI to apply configuration changes.');
    }
  }

  function matchingPlugins(context: CommandContext, name: string, opts: MutationOptions) {
    const matchesName = createNameMatcher(name, opts);
    return scanPlugins(context.claudeDir).filter((plugin) => matchesName(plugin.id));
  }

  async function disablePlugins(
    context: CommandContext,
    name: string,
    opts: MutationOptions,
  ): Promise<void> {
    const matched = matchingPlugins(context, name, opts);
    if (!matched.length) {
      terminal.log(`No plugins matching "${name}".`);
      return;
    }
    if (matched.length > 1 && !opts.exact) {
      terminal.log(`Matches: ${matched.map((plugin) => plugin.id).join(', ')}`);
      if (!(await terminal.confirm(`Disable all ${matched.length} plugins? (y/N) `))) {
        terminal.log('Aborted.');
        return;
      }
    }
    for (const plugin of matched) {
      if (!opts.dryRun)
        await blockPlugin(plugin.id, 'skillswitch: manually disabled', context.claudeDir);
      if (!opts.quiet)
        terminal.log(
          opts.dryRun
            ? `[dry-run] Would block plugin: ${plugin.id}`
            : `Plugin blocked: ${plugin.id}`,
        );
    }
  }

  async function enablePlugins(
    context: CommandContext,
    name: string,
    opts: MutationOptions,
  ): Promise<void> {
    const matched = matchingPlugins(context, name, opts);
    if (!matched.length) {
      terminal.log(`No plugins matching "${name}".`);
      return;
    }
    if (opts.glob && matched.length > 1) {
      terminal.log(`Matches: ${matched.map((plugin) => plugin.id).join(', ')}`);
      if (!(await terminal.confirm(`Enable all ${matched.length} plugins? (y/N) `))) {
        terminal.log('Aborted.');
        return;
      }
    }
    for (const plugin of matched) {
      if (opts.dryRun) {
        if (!opts.quiet) terminal.log(`[dry-run] Would unblock plugin: ${plugin.id}`);
        continue;
      }
      const wasBlocked = await unblockPlugin(plugin.id, context.claudeDir);
      if (!opts.quiet)
        terminal.log(
          wasBlocked ? `Plugin unblocked: ${plugin.id}` : `Plugin was not blocked: ${plugin.id}`,
        );
    }
  }

  async function disable(
    context: CommandContext,
    name: string,
    opts: MutationOptions,
  ): Promise<void> {
    try {
      if (context.target === 'claude' && opts.plugin) {
        await disablePlugins(context, name, opts);
      } else {
        await changeSkills(
          context,
          { name, opts },
          {
            fromStatus: 'active',
            verb: 'Disable',
            past: 'Disabled',
            apply: (adapter, skill) => adapter.disableSkill(skill),
          },
        );
      }
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  async function enable(
    context: CommandContext,
    name: string,
    opts: MutationOptions,
  ): Promise<void> {
    try {
      if (context.target === 'claude' && opts.plugin) {
        await enablePlugins(context, name, opts);
      } else {
        await changeSkills(
          context,
          { name, opts },
          {
            fromStatus: 'disabled',
            verb: 'Enable',
            past: 'Enabled',
            apply: (adapter, skill) => adapter.enableSkill(skill),
          },
        );
      }
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  return { list, search, status, disable, enable };
}
