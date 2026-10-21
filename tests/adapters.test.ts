import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFirstLine, parseSkillMd, scanFlatSkills } from '../src/adapters/helpers.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-adapters-'));
  vi.mocked(os.homedir).mockReturnValue(home);
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

async function adapterFor(cli: string) {
  const { getAdapter } = await import('../src/adapters/index.js');
  return getAdapter(cli, path.join(home, '.claude'));
}
function writeSkill(dir: string, name: string, directory: boolean, description = 'Planning.') {
  const file = directory ? path.join(dir, name, 'SKILL.md') : path.join(dir, `${name}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n# Plan\nBody.\n`);
  return file;
}

describe.each(['claude', 'codex', 'copilot', 'agy', 'amp', 'aider', 'droid'])(
  '%s adapter',
  (cli) => {
    it('detects installation and round trips skill contents', async () => {
      const adapter = await adapterFor(cli);
      if (cli !== 'agy') expect(adapter.isInstalled()).toBe(false);
      const directory = ['codex', 'copilot', 'agy', 'amp'].includes(cli);
      const file = writeSkill(adapter.skillsDirs[0], 'plan', directory);
      if (cli === 'codex') fs.mkdirSync(path.join(home, '.codex'));
      if (cli !== 'agy') expect(adapter.isInstalled()).toBe(true);
      expect(adapter.scanSkills()).toEqual([
        expect.objectContaining({ name: 'plan', status: 'active' }),
      ]);
      const original = fs.readFileSync(file, 'utf8');
      adapter.disableSkill('plan');
      expect(fs.existsSync(file)).toBe(cli === 'codex');
      expect(adapter.scanSkills()[0].status).toBe('disabled');
      adapter.enableSkill('plan');
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
      expect(adapter.scanSkills()[0].status).toBe('active');
    });
    it('returns an empty inventory and rejects missing skills', async () => {
      const adapter = await adapterFor(cli);
      expect(adapter.scanSkills()).toEqual([]);
      expect(() => adapter.disableSkill('missing')).toThrow(/not found/);
      expect(() => adapter.enableSkill('missing')).toThrow(/not found|not.*disabled/);
    });
  },
);

it.each(['amp'])('%s prefers local skills and finds shared skills for moves', async (cli) => {
  const adapter = await adapterFor(cli);
  writeSkill(adapter.skillsDirs[0], 'plan', true, 'Local.');
  writeSkill(adapter.skillsDirs[1], 'plan', true, 'Shared duplicate.');
  const shared = writeSkill(adapter.skillsDirs[1], 'ship', true, 'Shared.');
  expect(adapter.scanSkills()).toEqual([
    { name: 'plan', status: 'active', description: 'Local.' },
    { name: 'ship', status: 'active', description: 'Shared.', group: 'shared' },
  ]);
  adapter.disableSkill('ship');
  expect(fs.existsSync(shared)).toBe(false);
  adapter.enableSkill('ship');
  expect(fs.existsSync(shared)).toBe(true);
});
it('Copilot manages only personal skills and leaves the shared root untouched', async () => {
  const adapter = await adapterFor('copilot');
  expect(adapter.skillsDirs).toEqual([path.join(home, '.copilot', 'skills')]);
  writeSkill(adapter.skillsDirs[0], 'plan', true);
  const shared = writeSkill(path.join(home, '.agents', 'skills'), 'ship', true);
  expect(adapter.scanSkills().map((skill) => skill.name)).toEqual(['plan']);
  expect(() => adapter.disableSkill('ship')).toThrow(/not found/);
  expect(fs.existsSync(shared)).toBe(true);
});
it('Copilot validates every move before changing any skill', async () => {
  const adapter = await adapterFor('copilot');
  if (!('setSkillsEnabled' in adapter) || typeof adapter.setSkillsEnabled !== 'function')
    throw new Error('Missing Copilot batch toggles');
  const plan = writeSkill(adapter.skillsDirs[0], 'plan', true);
  writeSkill(adapter.skillsDirs[0], 'ship', true);
  writeSkill(path.join(adapter.skillsDirs[0], '.disabled'), 'ship', true);
  const changes = new Map([
    ['plan', false],
    ['ship', false],
  ]);
  expect(() => adapter.validateSkillChanges?.(changes)).toThrow();
  expect(() => adapter.setSkillsEnabled(changes)).toThrow();
  expect(fs.existsSync(plan)).toBe(true);
});
it('Factory scans and moves commands as well as droids', async () => {
  const adapter = await adapterFor('droid');
  writeSkill(adapter.skillsDirs[0], 'plan', false);
  const command = writeSkill(adapter.skillsDirs[1], 'ship', false);
  expect(adapter.scanSkills().map(({ name, group }) => ({ name, group }))).toEqual([
    { name: 'plan', group: 'droid' },
    { name: 'ship', group: 'command' },
  ]);
  adapter.disableSkill('ship');
  expect(fs.existsSync(command)).toBe(false);
  adapter.enableSkill('ship');
  expect(fs.existsSync(command)).toBe(true);
});
it('Aider config contains only active skills and detects a config-only installation', async () => {
  const { AiderAdapter } = await import('../src/adapters/index.js');
  const adapter = new AiderAdapter();
  expect(adapter.generateAiderConfig()).toBe('# No active aider skills\n');
  fs.writeFileSync(path.join(home, '.aider.conf.yml'), '');
  expect(adapter.isInstalled()).toBe(true);
  const active = writeSkill(adapter.skillsDirs[0], 'plan', false);
  writeSkill(path.join(adapter.skillsDirs[0], '.disabled'), 'ship', false);
  expect(adapter.generateAiderConfig()).toBe(`read:\n  - ${active}\n`);
});
it('registry supports case-insensitive lookup and rejects unknown targets', async () => {
  const { getAdapter, getAllAdapters, CLI_NAMES } = await import('../src/adapters/index.js');
  expect(getAdapter('CODEX').cliName).toBe('codex');
  expect(getAllAdapters().map((adapter) => adapter.cliName)).toEqual(CLI_NAMES);
  expect(() => getAdapter('unknown')).toThrow(/Unknown CLI/);
});
it('parses metadata and skips frontmatter, headings, and blank lines for fallback descriptions', () => {
  expect(parseSkillMd('---\nname: plan\ndescription: Planning.\n---')).toEqual({
    name: 'plan',
    description: 'Planning.',
  });
  expect(parseSkillMd('# Plan')).toEqual({ name: '', description: '' });
  expect(parseSkillMd('---\nname: plan\n---').description).toBe('');
  expect(extractFirstLine('---\nname: plan\n---\n# Heading\n\nBody.')).toBe('Body.');
  expect(extractFirstLine('# Heading\n')).toBe('');
});
it('flat scanning ignores non-markdown files and directories and falls back to body text', () => {
  const dir = path.join(home, 'skills');
  fs.mkdirSync(path.join(dir, 'folder.md'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'notes');
  fs.writeFileSync(path.join(dir, 'plan.md'), '# Plan\n\nBody.');
  expect(scanFlatSkills(dir)).toEqual([{ name: 'plan', status: 'active', description: 'Body.' }]);
});

it('Codex toggles native configuration without moving shared skills or changing unrelated settings', async () => {
  const adapter = await adapterFor('codex');
  const file = writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, 'model = "example"\n[projects."/work"]\ntrust_level = "trusted"\n');
  fs.chmodSync(config, 0o600);
  adapter.disableSkill('plan');
  expect(fs.existsSync(file)).toBe(true);
  expect(adapter.scanSkills()).toEqual([
    expect.objectContaining({ name: 'plan', status: 'disabled' }),
  ]);
  const { parse } = await import('smol-toml');
  const disabled = parse(fs.readFileSync(config, 'utf8'));
  expect(disabled.model).toBe('example');
  expect(disabled.projects).toEqual({ '/work': { trust_level: 'trusted' } });
  expect(disabled.skills).toEqual({ config: [{ path: fs.realpathSync(file), enabled: false }] });
  expect(fs.statSync(config).mode & 0o777).toBe(0o600);
  adapter.enableSkill('plan');
  expect(adapter.scanSkills()[0].status).toBe('active');
  expect(fs.existsSync(file)).toBe(true);
});

it('Codex distinguishes duplicate manifest names by path and follows skill symlinks', async () => {
  const adapter = await adapterFor('codex');
  const first = writeSkill(adapter.skillsDirs[0], 'first', true);
  const second = writeSkill(adapter.skillsDirs[0], 'second', true);
  fs.writeFileSync(first, '---\nname: shared\ndescription: First\n---\n');
  fs.writeFileSync(second, '---\nname: shared\ndescription: Second\n---\n');
  const target = writeSkill(path.join(home, 'outside'), 'linked', true);
  fs.symlinkSync(path.dirname(target), path.join(adapter.skillsDirs[0], 'linked'));
  adapter.disableSkill('first');
  adapter.disableSkill('linked');
  expect(adapter.scanSkills().map(({ name, status }) => ({ name, status }))).toEqual([
    { name: 'first', status: 'disabled' },
    { name: 'linked', status: 'disabled' },
    { name: 'second', status: 'active' },
  ]);
  adapter.enableSkill('linked');
  expect(fs.lstatSync(path.join(adapter.skillsDirs[0], 'linked')).isSymbolicLink()).toBe(true);
  expect(fs.readFileSync(target, 'utf8')).toContain('name: linked');
});

it('Codex rejects a profile selecting conflicting aliases of the same symlink target before writing', async () => {
  const adapter = await adapterFor('codex');
  const file = writeSkill(adapter.skillsDirs[0], 'first', true);
  fs.symlinkSync(path.dirname(file), path.join(adapter.skillsDirs[0], 'alias'));
  const profile = { name: 'one', skills: ['first'], plugins: [] };
  const profiles = adapter.profiles;
  if (!profiles) throw new Error('Missing Codex profile support');
  profiles.import(JSON.stringify(profile));
  await expect(profiles.activate('one')).rejects.toThrow(/same|alias/);
  expect(fs.existsSync(path.join(home, '.codex', 'config.toml'))).toBe(false);
});

it('Codex preserves unrelated selectors and reads relative paths through a symlinked config file', async () => {
  const adapter = await adapterFor('codex');
  const file = writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  const target = path.join(home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    `model = "example"\nlarge = 9223372036854775807\nfloat = 1.0\n[[skills.config]]\npath = "../.agents/skills/plan/SKILL.md"\nenabled = false\n[[skills.config]]\npath = "/outside/SKILL.md"\nenabled = false\n`,
  );
  expect(adapter.scanSkills()[0].status).toBe('active');
  fs.symlinkSync(target, config);
  expect(adapter.scanSkills()[0].status).toBe('disabled');
  adapter.enableSkill('plan');
  expect(fs.lstatSync(config).isSymbolicLink()).toBe(true);
  const { parse } = await import('smol-toml');
  const result = parse(fs.readFileSync(target, 'utf8'), { integersAsBigInt: true });
  expect(result).toMatchObject({ model: 'example', large: 9223372036854775807n, float: 1 });
  expect(result.skills).toEqual({ config: [{ path: '/outside/SKILL.md', enabled: false }] });
  expect(fs.existsSync(file)).toBe(true);
});

it('Codex rejects malformed configuration and conflicting name rules without changing files', async () => {
  const adapter = await adapterFor('codex');
  writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  for (const source of [
    'broken = [',
    '[skills]\nconfig = "invalid"',
    '[[skills.config]]\npath = 3\nenabled = false',
  ]) {
    fs.writeFileSync(config, source);
    expect(() => adapter.disableSkill('plan')).toThrow();
    expect(fs.readFileSync(config, 'utf8')).toBe(source);
  }
  const source = '[[skills.config]]\nname = "plan"\nenabled = false\n';
  fs.writeFileSync(config, source);
  expect(adapter.scanSkills()[0].status).toBe('disabled');
  expect(() => adapter.enableSkill('plan')).toThrow(/disabled by name/);
  expect(fs.readFileSync(config, 'utf8')).toBe(source);
});

it('Codex reports previously parked skills and asks to restore them before enabling', async () => {
  const adapter = await adapterFor('codex');
  writeSkill(path.join(adapter.skillsDirs[0], '.disabled'), 'old', true);
  expect(adapter.scanSkills()).toEqual([
    expect.objectContaining({ name: 'old', status: 'disabled' }),
  ]);
  expect(() => adapter.enableSkill('old')).toThrow(/restore its folder/);
});

it('Codex preserves the existing config if atomic replacement fails', async () => {
  const adapter = await adapterFor('codex');
  writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, 'model = "keep"\n');
  vi.mocked(fs.renameSync).mockImplementationOnce(() => {
    throw new Error('write failed');
  });
  expect(() => adapter.disableSkill('plan')).toThrow('write failed');
  expect(fs.readFileSync(config, 'utf8')).toBe('model = "keep"\n');
  expect(fs.readdirSync(path.dirname(config))).toEqual(['config.toml']);
});

it('Codex refuses to replace a dangling config symlink', async () => {
  const adapter = await adapterFor('codex');
  writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.symlinkSync(path.join(home, 'missing.toml'), config);
  expect(() => adapter.disableSkill('plan')).toThrow();
  expect(fs.lstatSync(config).isSymbolicLink()).toBe(true);
});

it('Codex reads name disable rules with valid YAML comments and CRLF frontmatter', async () => {
  const adapter = await adapterFor('codex');
  const file = writeSkill(adapter.skillsDirs[0], 'folder', true);
  fs.writeFileSync(file, '---\r\nname: "plan" # human note\r\ndescription: Planning\r\n---\r\n');
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  const source = '[[skills.config]]\nname = "plan"\nenabled = false\n';
  fs.writeFileSync(config, source);
  expect(adapter.scanSkills()[0].status).toBe('disabled');
  expect(() => adapter.enableSkill('folder')).toThrow(/disabled by name/);
  expect(fs.readFileSync(config, 'utf8')).toBe(source);
});

it('Codex rejects entries combining path and name selectors rather than inventing disabled state', async () => {
  const adapter = await adapterFor('codex');
  const file = writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  const source = `[[skills.config]]\npath = "${file}"\nname = "plan"\nenabled = false\n`;
  fs.writeFileSync(config, source);
  expect(() => adapter.scanSkills()).toThrow(/skills.config/);
  expect(() => adapter.disableSkill('plan')).toThrow(/skills.config/);
  expect(fs.readFileSync(config, 'utf8')).toBe(source);
});

it('Codex preserves existing config permissions under a stricter process umask', async () => {
  const adapter = await adapterFor('codex');
  writeSkill(adapter.skillsDirs[0], 'plan', true);
  const config = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, 'model = "keep"\n');
  fs.chmodSync(config, 0o640);
  const previous = process.umask(0o077);
  try {
    adapter.disableSkill('plan');
    expect(fs.statSync(config).mode & 0o777).toBe(0o640);
  } finally {
    process.umask(previous);
  }
});

it('Antigravity manages global standalone skills and restores parked bundles', async () => {
  const adapter = await adapterFor('agy');
  expect(adapter.skillsDirs).toEqual([
    path.join(home, '.gemini', 'config', 'skills'),
    path.join(home, '.gemini', 'antigravity-cli', 'skills'),
  ]);
  const file = writeSkill(adapter.skillsDirs[0], 'plan', true);
  const shared = writeSkill(path.join(home, '.agents', 'skills'), 'shared', true);
  const legacy = writeSkill(path.join(home, '.gemini', 'skills'), 'legacy', true);
  adapter.disableSkill('plan');
  expect(adapter.scanSkills()).toEqual([
    { name: 'plan', status: 'disabled', description: 'Planning.' },
  ]);
  expect(fs.existsSync(file)).toBe(false);
  expect([shared, legacy].every((file) => fs.existsSync(file))).toBe(true);
  adapter.enableSkill('plan');
  expect(fs.readFileSync(file, 'utf8')).toContain('Planning.');
});

it('Antigravity detects an executable on PATH without relying on leftover config directories', async () => {
  const { AntigravityAdapter } = await import('../src/adapters/antigravity.js');
  const bin = path.join(home, 'bin');
  const adapter = new AntigravityAdapter(home, bin);
  fs.mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true });
  expect(adapter.isInstalled()).toBe(false);
  fs.mkdirSync(bin);
  const executable = path.join(bin, process.platform === 'win32' ? 'agy.exe' : 'agy');
  fs.mkdirSync(executable);
  expect(adapter.isInstalled()).toBe(false);
  fs.rmdirSync(executable);
  fs.writeFileSync(executable, '');
  if (process.platform !== 'win32') expect(adapter.isInstalled()).toBe(false);
  fs.chmodSync(executable, 0o755);
  expect(adapter.isInstalled()).toBe(true);
});

it('rejects the removed Gemini target with explicit migration guidance', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  expect(() => getAdapter('GEMINI')).toThrow(/Gemini support was removed.*--for agy/);
});

it('Antigravity manages CLI-root skills and refuses ambiguous names across global roots', async () => {
  const adapter = await adapterFor('agy');
  const file = writeSkill(adapter.skillsDirs[1], 'ship', true);
  adapter.disableSkill('ship');
  expect(adapter.scanSkills()[0]).toMatchObject({ name: 'ship', status: 'disabled', group: 'cli' });
  adapter.enableSkill('ship');
  const duplicate = writeSkill(adapter.skillsDirs[0], 'ship', true);
  expect(() => adapter.scanSkills()).toThrow(/ambiguous.*ship/i);
  expect(() => adapter.disableSkill('ship')).toThrow(/ambiguous.*ship/i);
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.existsSync(duplicate)).toBe(true);
});

it('Antigravity preserves symlink targets and refuses to overwrite parked copies', async () => {
  const adapter = await adapterFor('agy');
  const target = writeSkill(path.join(home, 'outside'), 'linked', true);
  fs.mkdirSync(adapter.skillsDirs[0], { recursive: true });
  const link = path.join(adapter.skillsDirs[0], 'linked');
  fs.symlinkSync(path.dirname(target), link);
  adapter.disableSkill('linked');
  expect(fs.existsSync(target)).toBe(true);
  expect(
    fs.lstatSync(path.join(adapter.skillsDirs[0], '.disabled', 'linked')).isSymbolicLink(),
  ).toBe(true);
  adapter.enableSkill('linked');
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(fs.readFileSync(target, 'utf8')).toContain('Planning.');
  writeSkill(path.join(adapter.skillsDirs[0], '.disabled'), 'linked', true, 'Keep parked.');
  expect(() => adapter.disableSkill('linked')).toThrow(/ambiguous/i);
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
});

it('Antigravity preserves relative skill symlink targets across disable and enable', async () => {
  const adapter = await adapterFor('agy');
  const target = writeSkill(path.join(home, 'outside'), 'target', true);
  fs.mkdirSync(adapter.skillsDirs[0], { recursive: true });
  const link = path.join(adapter.skillsDirs[0], 'linked');
  const relativeTarget = path.relative(path.dirname(link), path.dirname(target));
  fs.symlinkSync(relativeTarget, link);
  adapter.disableSkill('linked');
  expect(adapter.scanSkills()).toEqual([
    expect.objectContaining({ name: 'linked', status: 'disabled' }),
  ]);
  const parked = path.join(adapter.skillsDirs[0], '.disabled', 'linked');
  expect(fs.readFileSync(path.join(parked, 'SKILL.md'), 'utf8')).toBe(
    fs.readFileSync(target, 'utf8'),
  );
  adapter.enableSkill('linked');
  expect(fs.readlinkSync(link)).toBe(relativeTarget);
  expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.dirname(target)));
});

it('Antigravity leaves a relative link intact if removing the source fails', async () => {
  const adapter = await adapterFor('agy');
  const target = writeSkill(path.join(home, 'outside'), 'target', true);
  fs.mkdirSync(adapter.skillsDirs[0], { recursive: true });
  const link = path.join(adapter.skillsDirs[0], 'linked');
  const relativeTarget = path.relative(path.dirname(link), path.dirname(target));
  fs.symlinkSync(relativeTarget, link);
  vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
    throw new Error('Source unlink failed');
  });
  expect(() => adapter.disableSkill('linked')).toThrow('Source unlink failed');
  expect(fs.readlinkSync(link)).toBe(relativeTarget);
  expect(fs.existsSync(path.join(adapter.skillsDirs[0], '.disabled', 'linked'))).toBe(false);
  expect(adapter.scanSkills()[0].status).toBe('active');
});

it('Antigravity preserves relative paths that traverse another directory symlink', async () => {
  const adapter = await adapterFor('agy');
  const target = writeSkill(path.join(home, 'outside'), 'target', true);
  const bridgeTarget = path.join(home, 'outside', 'bridge');
  fs.mkdirSync(bridgeTarget);
  fs.mkdirSync(adapter.skillsDirs[0], { recursive: true });
  fs.symlinkSync(bridgeTarget, path.join(adapter.skillsDirs[0], 'bridge'));
  const link = path.join(adapter.skillsDirs[0], 'linked');
  fs.symlinkSync('bridge/../target', link);
  adapter.disableSkill('linked');
  const parked = path.join(adapter.skillsDirs[0], '.disabled', 'linked');
  expect(fs.readFileSync(path.join(parked, 'SKILL.md'), 'utf8')).toBe(
    fs.readFileSync(target, 'utf8'),
  );
  adapter.enableSkill('linked');
  expect(fs.readlinkSync(link)).toBe('bridge/../target');
});
