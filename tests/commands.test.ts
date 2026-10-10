import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});
let createProgram: typeof import('../src/commands.js').createProgram;

let dir: string;
let output: string;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-commands-'));
  fs.mkdirSync(path.join(dir, 'skills'));
  fs.writeFileSync(path.join(dir, 'skills', 'plan.md'), '# Plan\nPlanning work.');
  vi.mocked(os.homedir).mockReturnValue(dir);
  vi.resetModules();
  ({ createProgram } = await import('../src/commands.js'));
  output = '';
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    output += `${args.join(' ')}\n`;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((text) => {
    output += text;
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function run(...args: string[]) {
  output = '';
  await createProgram().parseAsync(['--claude-dir', dir, ...args], { from: 'user' });
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
    const { getAdapter } = await import('../src/adapters/index.js');
    const adapter = getAdapter(cli);
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
    expect(fs.existsSync(file)).toBe(false);
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('CLI exit');
    });
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
