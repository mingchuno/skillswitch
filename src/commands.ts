import { Command, Option } from 'commander';
import type { CommandContext } from './cli/context.js';
import type { createInspectionHandlers } from './cli/inspection.js';
import type { createProfileHandlers } from './cli/profiles.js';
import type { createSkillHandlers } from './cli/skills.js';

export interface CommandHandlers {
  skills: ReturnType<typeof createSkillHandlers>;
  profiles: ReturnType<typeof createProfileHandlers>;
  inspection: ReturnType<typeof createInspectionHandlers>;
}
export interface CommandConfig {
  defaultClaudeDir: string;
  cliNames: string[];
}

export function createProgram(handlers: CommandHandlers, config: CommandConfig): Command {
  const program = new Command();
  const context = (): CommandContext => ({
    claudeDir: program.opts()['claudeDir'] ?? config.defaultClaudeDir,
    target: program.opts()['for'] ?? 'claude',
  });
  program
    .name('skillswitch')
    .description(
      `Manage AI CLI skills — Claude Code, Antigravity CLI, Codex CLI, GitHub Copilot CLI, Factory Droid, Amp, Aider`,
    )
    .version('0.5.0') // x-release-please-version
    .option('--claude-dir <path>', 'Override the Claude config directory (default: ~/.claude)')
    .option('--for <cli>', `Target CLI: ${config.cliNames.join(' | ')} (default: claude)`);

  program.hook('preAction', (_command, actionCommand) => {
    if (
      actionCommand.name() === 'catalog' ||
      actionCommand.name() === 'audit' ||
      (actionCommand.parent?.name() === 'profile' &&
        !['codex', 'copilot'].includes(context().target))
    ) {
      handlers.inspection.requireClaude(context());
    }
  });

  // list
  program
    .command('list')
    .description('Show all skills grouped by source')
    .option('--disabled', 'Show only disabled skills')
    .option('--enabled', 'Show only enabled (active) skills')
    .option('--json', 'Output as JSON')
    .action((opts) => handlers.skills.list(context(), opts));

  // search
  program
    .command('search <query>')
    .description('Search skills by name or description (substring match)')
    .option('--status <status>', 'Filter by status: active or disabled')
    .option('--json', 'Output as JSON')
    .action((query, opts) => handlers.skills.search(context(), query, opts));

  // status
  program
    .command('status')
    .description('Show active profile and skill counts')
    .option('--json', 'Output as JSON')
    .action((opts) => handlers.skills.status(context(), opts));

  // disable
  program
    .command('disable <name>')
    .description('Disable a skill (substring match) or a plugin (--plugin)')
    .option('--plugin', 'Treat <name> as a full plugin ID (name@source)')
    .option('--exact', 'Require exact name match instead of substring match')
    .addOption(
      new Option('--glob', 'Match the whole name using * and ? wildcards').conflicts('exact'),
    )
    .option('--dry-run', 'Preview without making changes')
    .option('--quiet', 'Suppress output except errors')
    .action((name, opts) => handlers.skills.disable(context(), name, opts));

  // enable
  program
    .command('enable <name>')
    .description('Enable a skill (substring match) or a plugin (--plugin)')
    .option('--plugin', 'Treat <name> as a full plugin ID (name@source)')
    .option('--exact', 'Require exact name match instead of substring match')
    .addOption(
      new Option('--glob', 'Match the whole name using * and ? wildcards').conflicts('exact'),
    )
    .option('--dry-run', 'Preview without making changes')
    .option('--quiet', 'Suppress output except errors')
    .action((name, opts) => handlers.skills.enable(context(), name, opts));

  // profile
  const profileCmd = program.command('profile').description('Manage skill profiles');

  profileCmd
    .command('create <name>')
    .description('Snapshot current enabled skills as a named profile')
    .action((name) => handlers.profiles.create(context(), name));

  profileCmd
    .command('use <name>')
    .description('Activate a profile')
    .option('--dry-run', 'Preview without making changes')
    .option('--quiet', 'Suppress output except errors')
    .action((name, opts) => handlers.profiles.use(context(), name, opts));

  profileCmd
    .command('list')
    .description('List saved profiles')
    .option('--json', 'Output as JSON')
    .action((opts) => handlers.profiles.list(context(), opts));

  profileCmd
    .command('show <name>')
    .description('Show skills in a profile')
    .action((name) => handlers.profiles.show(context(), name));

  profileCmd
    .command('delete <name>')
    .description('Delete a saved profile')
    .option('--force', 'Delete even if this is the active profile')
    .action((name, opts) => handlers.profiles.remove(context(), name, opts));

  profileCmd
    .command('rename <old> <new>')
    .description('Rename a profile')
    .action((oldName, newName) => handlers.profiles.rename(context(), oldName, newName));

  profileCmd
    .command('copy <src> <dst>')
    .description('Copy a profile to a new name')
    .action((srcName, dstName) => handlers.profiles.copy(context(), srcName, dstName));

  profileCmd
    .command('diff <name>')
    .description('Show what would change when activating a profile')
    .action((name) => handlers.profiles.diff(context(), name));

  profileCmd
    .command('export <name>')
    .description('Export a profile to stdout or a file')
    .option('--out <file>', 'Write to file instead of stdout')
    .action((name, opts) => handlers.profiles.exportTo(context(), name, opts));

  profileCmd
    .command('import <file>')
    .description('Import a profile from a JSON file')
    .action((file) => handlers.profiles.importFrom(context(), file));

  profileCmd
    .command('validate <name>')
    .description('Check a profile for ghost skills (no longer on disk)')
    .action((name) => handlers.profiles.validate(context(), name));

  // catalog
  program
    .command('catalog')
    .description('Generate ~/.claude/SKILLS.md catalog')
    .option('--out <path>', 'Write to custom path instead of ~/.claude/SKILLS.md')
    .action((opts) => handlers.inspection.catalog(context(), opts));

  // audit
  program
    .command('audit')
    .description('Report duplicates, disabled skill counts, and plugin orphans')
    .option('--json', 'Output as JSON')
    .action((opts) => handlers.inspection.audit(context(), opts));

  // detect
  program
    .command('detect')
    .description('Show which supported AI CLIs are installed')
    .option('--json', 'Output as JSON')
    .action((opts) => handlers.inspection.detect(opts));

  // aider-config
  program
    .command('aider-config')
    .description('Print the read: block to paste into ~/.aider.conf.yml for active Aider skills')
    .action(() => handlers.inspection.aiderConfig());

  return program;
}
