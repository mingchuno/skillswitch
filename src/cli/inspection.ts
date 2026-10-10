import { generateCatalog } from '../catalog.js';
import { auditInventory } from '../inventory.js';
import { scanPlugins, scanStandaloneSkills } from '../scanner.js';
import type { CliRuntime, CommandContext, JsonOptions, OutputOptions } from './context.js';

export function createInspectionHandlers(runtime: Pick<CliRuntime, 'terminal' | 'adapters'>) {
  const { terminal, adapters } = runtime;

  function catalog(context: CommandContext, opts: OutputOptions) {
    try {
      const claudeDir = context.claudeDir;
      generateCatalog(claudeDir, opts.out);
      if (opts.out) {
        terminal.log(`Catalog written to ${opts.out}`);
      } else {
        terminal.log('Catalog written to ~/.claude/SKILLS.md');
        terminal.log('Tip: use @~/.claude/SKILLS.md in any Claude session to reference it.');
      }
    } catch (err: unknown) {
      terminal.error(`Error: ${(err as Error).message}`);
      terminal.exit(1);
    }
  }

  function audit(context: CommandContext, opts: JsonOptions) {
    const claudeDir = context.claudeDir;
    const standalone = scanStandaloneSkills(claudeDir);
    const plugins = scanPlugins(claudeDir);

    const report = auditInventory(standalone, plugins);
    const { duplicates, disabledStandalone, disabledPlugins } = report;

    if (opts.json) {
      terminal.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }

    let found = false;
    if (duplicates.length) {
      found = true;
      terminal.log(`\nPotential duplicates (standalone name matches plugin skill name):`);
      duplicates.forEach((d) => {
        terminal.log(`  ${d}`);
      });
    }
    if (disabledStandalone.length) {
      found = true;
      terminal.log(
        `\nDisabled standalone skills (${disabledStandalone.length}) — review for removal:`,
      );
      disabledStandalone.forEach((s) => {
        terminal.log(`  ${s}`);
      });
    }
    if (disabledPlugins.length) {
      found = true;
      terminal.log(`\nBlocked plugins (${disabledPlugins.length}):`);
      disabledPlugins.forEach((p) => {
        terminal.log(`  ${p}`);
      });
    }
    if (!found) terminal.log('No issues found.');
  }

  function detect(opts: JsonOptions) {
    const installedAdapters = adapters.all();
    const results = installedAdapters.map((a) => ({
      cli: a.cliName,
      name: a.displayName,
      installed: a.isInstalled(),
    }));
    if (opts.json) {
      terminal.write(JSON.stringify(results, null, 2) + '\n');
      return;
    }
    terminal.log('\nDetected CLIs:');
    for (const r of results) {
      terminal.log(`  ${r.name.padEnd(20)} ${r.installed ? 'installed' : 'not found'}`);
    }
  }

  function aiderConfig() {
    terminal.write(adapters.aiderConfig());
  }

  function requireClaude(context: CommandContext): void {
    if (context.target === 'claude') return;
    terminal.writeError(
      'Error: catalog and audit support only Claude; profiles support Claude and Codex.\n',
    );
    terminal.exit(1);
  }

  return { catalog, audit, detect, aiderConfig, requireClaude };
}
