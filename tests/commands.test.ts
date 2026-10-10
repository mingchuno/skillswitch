import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import {
  disableDirSkill,
  disableFlatSkill,
  enableDirSkill,
  enableFlatSkill,
  scanDirSkills,
  scanFlatSkills,
} from '../src/adapters/helpers.js';
import { CLI_NAMES } from '../src/adapters/index.js';
import type { CliAdapter } from '../src/adapters/types.js';
import type { CliRuntime, Terminal } from '../src/cli/context.js';
import { createInspectionHandlers } from '../src/cli/inspection.js';
import { createProfileHandlers } from '../src/cli/profiles.js';
import { createRuntime } from '../src/cli/runtime.js';
import { createSkillHandlers } from '../src/cli/skills.js';
import type { CommandHandlers } from '../src/commands.js';
import { createProgram } from '../src/commands.js';

let dir: string;
let output: string;
let errors: string;
let terminal: Terminal;
let runtime: CliRuntime;
let handlers: CommandHandlers;
// Real filesystem fixtures with injected adapter ports. Adapter-specific
// discovery and precedence are covered separately in adapters.test.ts.
function createFixtureAdapter(cli: string): CliAdapter {
  if (cli === 'claude') return new ClaudeAdapter(dir);
  const skillsDir = path.join(dir, 'adapters', cli);
  if (cli === 'codex') return new CodexAdapter(path.join(dir, 'codex'), skillsDir);
  const directory = ['gemini', 'amp'].includes(cli);
  const displayNames: Record<string, string> = {
    codex: 'Codex CLI (OpenAI)',
    gemini: 'Gemini CLI',
    amp: 'Amp (Sourcegraph)',
    aider: 'Aider',
    droid: 'Factory Droid',
  };
  return {
    cliName: cli,
    displayName: displayNames[cli],
    skillsDirs: [skillsDir],
    isInstalled: () => fs.existsSync(skillsDir),
    scanSkills: () => (directory ? scanDirSkills(skillsDir) : scanFlatSkills(skillsDir)),
    disableSkill: (name) =>
      directory ? disableDirSkill(name, skillsDir) : disableFlatSkill(name, skillsDir),
    enableSkill: (name) =>
      directory ? enableDirSkill(name, skillsDir) : enableFlatSkill(name, skillsDir),
  };
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-commands-'));
  fs.mkdirSync(path.join(dir, 'skills'));
  fs.writeFileSync(path.join(dir, 'skills', 'plan.md'), '# Plan\nPlanning work.');
  output = '';
  errors = '';
  terminal = {
    log: (message) => {
      output += `${message}\n`;
    },
    write: (message) => {
      output += message;
    },
    warn: (message) => {
      errors += `${message}\n`;
    },
    error: (message) => {
      errors += `${message}\n`;
    },
    writeError: (message) => {
      errors += message;
    },
    confirm: vi.fn(async () => false),
    exit: (code) => {
      throw new Error(`CLI exit ${code}`);
    },
  };
  runtime = createRuntime(terminal);
  const fixtureAdapters = new Map(CLI_NAMES.map((cli) => [cli, createFixtureAdapter(cli)]));
  runtime.adapters = {
    get: (cli) => {
      const adapter = fixtureAdapters.get(cli.toLowerCase());
      if (!adapter) throw new Error(`Unknown CLI "${cli}"`);
      return adapter;
    },
    all: () => [...fixtureAdapters.values()],
    aiderConfig: () => '# No active aider skills\n',
  };
  handlers = {
    skills: createSkillHandlers(runtime),
    profiles: createProfileHandlers(runtime),
    inspection: createInspectionHandlers(runtime),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function run(...args: string[]) {
  output = '';
  await createProgram(handlers, {
    defaultClaudeDir: dir,
    cliNames: CLI_NAMES,
  }).parseAsync(['--claude-dir', dir, ...args], { from: 'user' });
  return output;
}
it('lists and searches skills with JSON and status filters', async () => {
  expect(JSON.parse(await run('list', '--json')).standalone[0].name).toBe('plan');
  expect(await run('list', '--enabled')).toContain('plan');
  expect(JSON.parse(await run('search', 'planning', '--json'))[0].name).toBe('plan');
  expect(await run('search', 'plan')).toContain('Planning work.');
  expect(await run('search', 'missing')).toContain('No skills');
  expect(JSON.parse(await run('search', 'plan', '--status', 'disabled', '--json'))).toEqual([]);
});
it('dry runs preserve skills and quiet enable/disable moves them', async () => {
  const file = path.join(dir, 'skills', 'plan.md');
  expect(await run('disable', 'plan', '--exact', '--dry-run')).toContain('Would disable');
  expect(fs.existsSync(file)).toBe(true);
  expect(await run('disable', 'plan', '--exact', '--quiet')).toBe('');
  expect(fs.existsSync(file)).toBe(false);
  expect(JSON.parse(await run('list', '--disabled', '--json')).standalone[0].status).toBe(
    'disabled',
  );
  expect(await run('enable', 'plan', '--dry-run')).toContain('Would enable');
  expect(fs.existsSync(file)).toBe(false);
  expect(await run('enable', 'plan', '--quiet')).toBe('');
  expect(fs.existsSync(file)).toBe(true);
  expect(await run('disable', 'missing')).toContain('No active skills');
  expect(await run('enable', 'missing')).toContain('No disabled skills');
});
it('reports status and audits disabled skills', async () => {
  expect(JSON.parse(await run('status', '--json'))).toEqual({
    activeProfile: null,
    active: 1,
    disabled: 0,
    total: 1,
  });
  expect(await run('status')).toContain('Enabled skills : 1');
  expect(await run('audit')).toContain('No issues');
  await run('disable', 'plan');
  expect(JSON.parse(await run('audit', '--json')).disabledStandalone).toEqual(['plan']);
  expect(await run('audit')).toContain('plan');
});
it('creates, previews, activates, exports, imports, renames, copies, and deletes profiles', async () => {
  expect(await run('profile', 'list')).toContain('No profiles');
  expect(await run('profile', 'create', 'dev')).toContain('saved');
  expect(await run('profile', 'show', 'dev')).toContain('plan');
  expect(await run('profile', 'validate', 'dev')).toContain('valid');
  expect(await run('profile', 'diff', 'dev')).toContain('no changes');
  await run('disable', 'plan');
  expect(await run('profile', 'diff', 'dev')).toContain('Enable');
  expect(await run('profile', 'use', 'dev', '--dry-run')).toContain('Enable');
  expect(fs.existsSync(path.join(dir, 'skills', 'plan.md'))).toBe(false);
  expect(await run('profile', 'use', 'dev')).toContain('Activated');
  expect(JSON.parse(await run('status', '--json')).activeProfile).toBe('dev');
  expect(await run('profile', 'list')).toContain('[active]');
  expect(Object.keys(JSON.parse(await run('profile', 'list', '--json')).profiles)).toEqual(['dev']);
  expect(JSON.parse(await run('profile', 'export', 'dev'))).toHaveProperty('skills', ['plan']);
  const exported = path.join(dir, 'exported.json');
  await run('profile', 'export', 'dev', '--out', exported);
  expect(fs.existsSync(exported)).toBe(true);
  expect(await run('profile', 'import', exported)).toContain('imported');
  expect(await run('profile', 'copy', 'dev', 'copy')).toContain('copied');
  expect(await run('profile', 'rename', 'copy', 'renamed')).toContain('renamed');
  expect(await run('profile', 'delete', 'renamed')).toContain('deleted');
  expect(await run('profile', 'delete', 'dev', '--force')).toContain('deleted');
});
it('handles missing profiles and writes a catalog', async () => {
  expect(await run('profile', 'show', 'missing')).toContain('not found');
  expect(await run('profile', 'use', 'missing', '--dry-run')).toContain('not found');
  await run('catalog');
  expect(fs.readFileSync(path.join(dir, 'SKILLS.md'), 'utf8')).toContain('plan');
});

it.each(['codex', 'gemini', 'amp', 'aider', 'droid'])(
  'lists, searches, counts, and moves %s skills',
  async (cli) => {
    const adapter = runtime.adapters.get(cli);
    const directory = ['codex', 'gemini', 'amp'].includes(cli);
    const file = directory
      ? path.join(adapter.skillsDirs[0], 'ship', 'SKILL.md')
      : path.join(adapter.skillsDirs[0], 'ship.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Ship\nShipping releases.');
    expect(JSON.parse(await run('--for', cli, 'list', '--json'))[0].name).toBe('ship');
    expect(await run('--for', cli, 'list', '--enabled')).toContain('ship');
    expect(JSON.parse(await run('--for', cli, 'search', 'shipping', '--json'))[0].name).toBe(
      'ship',
    );
    expect(await run('--for', cli, 'search', 'ship')).toContain('Shipping releases.');
    expect(await run('--for', cli, 'search', 'missing')).toContain('No');
    expect(
      JSON.parse(await run('--for', cli, 'search', 'ship', '--status', 'disabled', '--json')),
    ).toEqual([]);
    expect(JSON.parse(await run('--for', cli, 'status', '--json')).active).toBe(1);
    expect(await run('--for', cli, 'status')).toContain('Enabled skills : 1');
    expect(await run('--for', cli, 'disable', 'ship', '--exact', '--dry-run')).toContain(
      'Would disable',
    );
    expect(fs.existsSync(file)).toBe(true);
    await run('--for', cli, 'disable', 'ship', '--quiet');
    expect(fs.existsSync(file)).toBe(cli === 'codex');
    expect(JSON.parse(await run('--for', cli, 'list', '--disabled', '--json'))[0].status).toBe(
      'disabled',
    );
    expect(await run('--for', cli, 'enable', 'ship', '--dry-run')).toContain('Would enable');
    await run('--for', cli, 'enable', 'ship', '--exact', '--quiet');
    expect(fs.existsSync(file)).toBe(true);
    expect(await run('--for', cli, 'disable', 'missing')).toContain('No active');
    expect(await run('--for', cli, 'enable', 'missing')).toContain('No disabled');
  },
);
it('detects installed CLIs and prints Aider configuration from the isolated home', async () => {
  expect(JSON.parse(await run('detect', '--json'))).toHaveLength(6);
  expect(await run('detect')).toContain('not found');
  expect(await run('aider-config')).toContain('No active aider skills');
});
it('previews plugin changes, blocks and unblocks plugins, and audits duplicates', async () => {
  const plugins = path.join(dir, 'plugins');
  const skills = path.join(plugins, 'cache', 'market', 'plugin', '1.0.0', 'skills');
  fs.mkdirSync(skills, { recursive: true });
  fs.writeFileSync(path.join(skills, 'plan.md'), '# Plan\nPlugin planning.');
  fs.writeFileSync(
    path.join(plugins, 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'plugin@market': {} } }),
  );
  expect(await run('list')).toContain('plugin@market');
  expect(JSON.parse(await run('audit', '--json')).duplicates).toEqual(['plan']);
  expect(await run('disable', 'plugin@market', '--plugin', '--exact', '--dry-run')).toContain(
    'Would block',
  );
  expect(fs.existsSync(path.join(plugins, 'blocklist.json'))).toBe(false);
  await run('disable', 'plugin@market', '--plugin', '--exact');
  expect(JSON.parse(await run('list', '--disabled', '--json')).plugins[0].status).toBe('disabled');
  expect(await run('list', '--disabled')).toContain('DISABLED');
  expect(await run('audit')).toContain('Blocked plugins');
  expect(await run('enable', 'plugin@market', '--plugin', '--dry-run')).toContain('Would unblock');
  expect(await run('enable', 'plugin@market', '--plugin', '--exact')).toContain('unblocked');
  expect(await run('enable', 'plugin@market', '--plugin')).toContain('not blocked');
  expect(await run('disable', 'missing', '--plugin')).toContain('No plugins');
  expect(await run('enable', 'missing', '--plugin')).toContain('No plugins');
});

it.each(['', ' ', 'a'.repeat(65), '../outside', 'folder\\name'])(
  'rejects invalid profile name %j without creating a store',
  async (name) => {
    await expect(run('profile', 'create', name)).rejects.toThrow('CLI exit');
    expect(fs.existsSync(path.join(dir, 'skillctl'))).toBe(false);
  },
);
it('previews profile changes without writes and identifies deleted skills', async () => {
  await run('profile', 'create', 'dev');
  fs.writeFileSync(path.join(dir, 'skills', 'ship.md'), '# Ship\nShipping.');
  expect(await run('profile', 'use', 'dev', '--dry-run')).toContain('Disable');
  expect(fs.existsSync(path.join(dir, 'skills', 'ship.md'))).toBe(true);
  await run('profile', 'use', 'dev', '--quiet');
  expect(fs.existsSync(path.join(dir, 'skills', 'ship.md'))).toBe(false);
  expect(await run('profile', 'use', 'dev', '--dry-run')).toContain('no changes');
  fs.rmSync(path.join(dir, 'skills', 'plan.md'));
  expect(await run('profile', 'validate', 'dev')).toContain('ghost skill');
});

it.each([
  ['claude', 'disable', false],
  ['claude', 'disable', true],
  ['claude', 'enable', false],
  ['claude', 'enable', true],
  ['codex', 'disable', false],
  ['codex', 'disable', true],
  ['codex', 'enable', false],
  ['codex', 'enable', true],
] as const)(
  '%s %s confirms multiple matches before any moves (accept=%s)',
  async (cli, direction, accepted) => {
    const adapter = runtime.adapters.get(cli);
    const directory = cli === 'codex';
    if (cli === 'claude' && direction === 'enable') fs.rmSync(path.join(dir, 'skills', 'plan.md'));
    const base =
      direction === 'enable' && cli !== 'codex'
        ? path.join(adapter.skillsDirs[0], '.disabled')
        : adapter.skillsDirs[0];
    for (const name of ['plan', 'plan-more']) {
      const file = directory ? path.join(base, name, 'SKILL.md') : path.join(base, `${name}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `# ${name}\nExact bytes.`);
    }
    if (cli === 'codex' && direction === 'enable') {
      adapter.disableSkill('plan');
      adapter.disableSkill('plan-more');
    }
    vi.mocked(terminal.confirm).mockResolvedValue(accepted);
    const result = await run('--for', cli, direction, 'plan');
    expect(terminal.confirm).toHaveBeenCalledWith(
      `${direction === 'disable' ? 'Disable' : 'Enable'} all 2? (y/N) `,
    );
    expect(result).toContain(
      accepted ? (direction === 'disable' ? 'Disabled:' : 'Enabled:') : 'Aborted.',
    );
    const expectedStatus = accepted
      ? direction === 'disable'
        ? 'disabled'
        : 'active'
      : direction === 'disable'
        ? 'active'
        : 'disabled';
    expect(adapter.scanSkills().map((skill) => skill.status)).toEqual([
      expectedStatus,
      expectedStatus,
    ]);
  },
);
it('preserves confirmation behavior when disabling and enabling multiple plugins', async () => {
  const plugins = path.join(dir, 'plugins');
  fs.mkdirSync(plugins);
  fs.writeFileSync(
    path.join(plugins, 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'tool-one@market': {}, 'tool-two@market': {} } }),
  );
  expect(await run('disable', 'tool-', '--plugin')).toContain('Aborted.');
  expect(fs.existsSync(path.join(plugins, 'blocklist.json'))).toBe(false);
  vi.mocked(terminal.confirm).mockResolvedValue(true);
  await run('disable', 'tool-', '--plugin');
  expect(
    JSON.parse(fs.readFileSync(path.join(plugins, 'blocklist.json'), 'utf8')).plugins,
  ).toHaveLength(2);
  vi.mocked(terminal.confirm).mockClear();
  await run('enable', 'tool-', '--plugin');
  expect(terminal.confirm).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(plugins, 'blocklist.json'), 'utf8')).plugins).toEqual(
    [],
  );
});
it('passes injected adapter failures through the existing command error boundary', async () => {
  runtime.adapters.get = vi.fn(() => {
    throw new Error('adapter unavailable');
  });
  await expect(run('--for', 'codex', 'disable', 'plan')).rejects.toThrow('CLI exit 1');
  expect(errors).toBe('Error: adapter unavailable\n');
});
it('uses injected profile file access and keeps read errors on stderr', async () => {
  runtime.files.readText = vi.fn(() => {
    throw new Error('cannot read import');
  });
  await expect(run('profile', 'import', 'chosen.json')).rejects.toThrow('CLI exit 1');
  expect(runtime.files.readText).toHaveBeenCalledWith('chosen.json');
  expect(errors).toBe('Error: cannot read import\n');
});
it('uses configured directory defaults and explicit overrides without environment mocks', async () => {
  const configured = createProgram(handlers, { defaultClaudeDir: dir, cliNames: CLI_NAMES });
  await configured.parseAsync(['list', '--json'], { from: 'user' });
  expect(JSON.parse(output).standalone[0].name).toBe('plan');
  output = '';
  const emptyDir = path.join(dir, 'empty');
  await createProgram(handlers, { defaultClaudeDir: dir, cliNames: CLI_NAMES }).parseAsync(
    ['--claude-dir', emptyDir, 'list', '--json'],
    { from: 'user' },
  );
  expect(JSON.parse(output)).toEqual({ standalone: [], plugins: [] });
});
it('rejects unsupported targets using the injected terminal', async () => {
  await expect(run('--for', 'gemini', 'profile', 'list')).rejects.toThrow('CLI exit 1');
  expect(errors).toBe(
    'Error: catalog and audit support only Claude; profiles support Claude and Codex.\n',
  );
});
it('preserves forced deletion output for a dangling active profile and leaves its store intact', async () => {
  const file = path.join(dir, 'skillctl', 'profiles.json');
  fs.mkdirSync(path.dirname(file));
  const bytes = JSON.stringify({ active: 'missing', previous: null, profiles: {} });
  fs.writeFileSync(file, bytes);
  expect(await run('profile', 'delete', 'missing', '--force')).toBe(
    'Profile "missing" not found.\n',
  );
  expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
});
it('counts plugin skills using plugin status while retaining standalone totals', async () => {
  const plugins = path.join(dir, 'plugins');
  const skills = path.join(plugins, 'cache', 'market', 'tool', '1.0.0', 'skills');
  fs.mkdirSync(skills, { recursive: true });
  fs.writeFileSync(path.join(skills, 'ship.md'), '# Ship\nShipping.');
  fs.writeFileSync(
    path.join(plugins, 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'tool@market': {} } }),
  );
  expect(JSON.parse(await run('status', '--json'))).toMatchObject({
    active: 2,
    disabled: 0,
    total: 2,
  });
  await run('disable', 'tool@market', '--plugin');
  expect(JSON.parse(await run('status', '--json'))).toMatchObject({
    active: 1,
    disabled: 1,
    total: 2,
  });
});

it('supplies the directory override only for the exact Claude target, preserving target dispatch', async () => {
  const originalGet = runtime.adapters.get;
  runtime.adapters.get = vi.fn(originalGet);
  await run('disable', 'missing');
  expect(runtime.adapters.get).toHaveBeenLastCalledWith('claude', dir);
  await run('--for', 'codex', 'disable', 'missing');
  expect(runtime.adapters.get).toHaveBeenLastCalledWith('codex');
  await run('--for', 'CLAUDE', 'disable', 'missing');
  expect(runtime.adapters.get).toHaveBeenLastCalledWith('CLAUDE');
});

it('Codex profiles snapshot native state, preview without writes, and switch independently of Claude', async () => {
  const adapter = runtime.adapters.get('codex');
  for (const name of ['plan', 'ship']) {
    const file = path.join(adapter.skillsDirs[0], name, 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${name} work\n---\n`);
  }
  await run('profile', 'create', 'dev');
  await run('--for', 'codex', 'profile', 'create', 'full');
  await run('--for', 'codex', 'disable', 'ship', '--exact');
  expect(await run('--for', 'codex', 'profile', 'create', 'dev')).toContain('1 skills');
  expect(JSON.parse(await run('--for', 'codex', 'profile', 'export', 'dev')).skills).toEqual([
    'plan',
  ]);
  await run('--for', 'codex', 'enable', 'ship', '--exact');
  const configFile = path.join(dir, 'codex', 'config.toml');
  const before = fs.readFileSync(configFile, 'utf8');
  expect(await run('--for', 'codex', 'profile', 'use', 'dev', '--dry-run')).toContain(
    'Disable : ship',
  );
  expect(fs.readFileSync(configFile, 'utf8')).toBe(before);
  expect(await run('--for', 'codex', 'profile', 'use', 'dev')).toContain('Restart Codex');
  expect(JSON.parse(await run('--for', 'codex', 'status', '--json'))).toMatchObject({
    activeProfile: 'dev',
    active: 1,
    disabled: 1,
  });
  expect(await run('--for', 'codex', 'profile', 'diff', 'dev')).toContain('no changes');
  expect(await run('--for', 'codex', 'profile', 'validate', 'dev')).toContain('valid');
  expect(JSON.parse(await run('profile', 'export', 'dev')).skills).toEqual(['plan']);
  await run('--for', 'codex', 'profile', 'use', 'full');
  expect(JSON.parse(await run('--for', 'codex', 'status', '--json'))).toMatchObject({
    activeProfile: 'full',
    active: 2,
    disabled: 0,
  });
  expect(JSON.parse(await run('--for', 'codex', 'profile', 'list', '--json')).previous).toBe('dev');
});

it('Codex supports the profile lifecycle and leaves stores unchanged on invalid imports and missing skills', async () => {
  const adapter = runtime.adapters.get('codex');
  const file = path.join(adapter.skillsDirs[0], 'plan', 'SKILL.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nname: plan\ndescription: Planning\n---\n');
  expect(await run('--for', 'codex', 'profile', 'list')).toContain('No profiles');
  expect(await run('--for', 'codex', 'profile', 'show', 'missing')).toContain('not found');
  expect(await run('--for', 'codex', 'profile', 'use', 'missing', '--dry-run')).toContain(
    'not found',
  );
  await run('--for', 'codex', 'profile', 'create', 'dev');
  await run('--for', 'codex', 'profile', 'copy', 'dev', 'copy');
  await run('--for', 'codex', 'profile', 'rename', 'copy', 'renamed');
  expect(await run('--for', 'codex', 'profile', 'show', 'renamed')).toContain('plan');
  const exported = path.join(dir, 'codex-profile.json');
  await run('--for', 'codex', 'profile', 'export', 'renamed', '--out', exported);
  await run('--for', 'codex', 'profile', 'delete', 'renamed');
  await run('--for', 'codex', 'profile', 'import', exported);
  await run('--for', 'codex', 'profile', 'use', 'dev', '--quiet');
  const storeFile = path.join(dir, 'codex', 'skillctl', 'profiles.json');
  const before = fs.readFileSync(storeFile, 'utf8');
  fs.writeFileSync(
    exported,
    JSON.stringify({ name: 'bad', skills: ['plan'], plugins: ['claude-plugin'] }),
  );
  await expect(run('--for', 'codex', 'profile', 'import', exported)).rejects.toThrow('CLI exit');
  expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
  fs.writeFileSync(exported, '{ malformed');
  await expect(run('--for', 'codex', 'profile', 'import', exported)).rejects.toThrow('CLI exit');
  fs.rmSync(file);
  expect(await run('--for', 'codex', 'profile', 'validate', 'dev')).toContain('ghost');
  await expect(run('--for', 'codex', 'profile', 'use', 'dev')).rejects.toThrow('CLI exit');
  expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
  expect(fs.existsSync(path.join(dir, 'codex', 'config.toml'))).toBe(false);
  await run('--for', 'codex', 'profile', 'delete', 'dev', '--force');
  expect(JSON.parse(await run('--for', 'codex', 'profile', 'list', '--json')).active).toBe(null);
});

it('Codex previews reject name-disabled skills that cannot be enabled without affecting other scopes', async () => {
  const adapter = runtime.adapters.get('codex');
  const file = path.join(adapter.skillsDirs[0], 'plan', 'SKILL.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nname: plan\ndescription: Planning\n---\n');
  await run('--for', 'codex', 'profile', 'create', 'dev');
  const config = path.join(dir, 'codex', 'config.toml');
  const source = '[[skills.config]]\nname = "plan"\nenabled = false\n';
  fs.writeFileSync(config, source);
  await expect(run('--for', 'codex', 'profile', 'use', 'dev', '--dry-run')).rejects.toThrow(
    'CLI exit',
  );
  expect(fs.readFileSync(config, 'utf8')).toBe(source);
  expect(JSON.parse(await run('--for', 'codex', 'profile', 'list', '--json')).active).toBe(null);
});

it('Codex individual toggle previews reject blocked and parked skills without writing', async () => {
  const adapter = runtime.adapters.get('codex');
  const file = path.join(adapter.skillsDirs[0], 'plan', 'SKILL.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nname: plan\ndescription: Planning\n---\n');
  const config = path.join(dir, 'codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  const source = '[[skills.config]]\nname = "plan"\nenabled = false\n';
  fs.writeFileSync(config, source);
  await expect(run('--for', 'codex', 'enable', 'plan', '--dry-run')).rejects.toThrow('CLI exit');
  expect(fs.readFileSync(config, 'utf8')).toBe(source);
  const parked = path.join(adapter.skillsDirs[0], '.disabled', 'old', 'SKILL.md');
  fs.mkdirSync(path.dirname(parked), { recursive: true });
  fs.writeFileSync(parked, '# Old\n');
  await expect(run('--for', 'codex', 'enable', 'old', '--dry-run')).rejects.toThrow('CLI exit');
  expect(fs.existsSync(parked)).toBe(true);
});
