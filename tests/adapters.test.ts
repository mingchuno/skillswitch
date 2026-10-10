import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFirstLine, parseSkillMd, scanFlatSkills } from '../src/adapters/helpers.js';

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

describe.each(['claude', 'codex', 'gemini', 'amp', 'aider', 'droid'])('%s adapter', (cli) => {
  it('detects installation and round trips skill contents', async () => {
    const adapter = await adapterFor(cli);
    expect(adapter.isInstalled()).toBe(false);
    const directory = ['codex', 'gemini', 'amp'].includes(cli);
    const file = writeSkill(adapter.skillsDirs[0], 'plan', directory);
    if (cli === 'codex') fs.mkdirSync(path.join(home, '.codex'));
    expect(adapter.isInstalled()).toBe(true);
    expect(adapter.scanSkills()).toEqual([
      expect.objectContaining({ name: 'plan', status: 'active' }),
    ]);
    const original = fs.readFileSync(file, 'utf8');
    adapter.disableSkill('plan');
    expect(fs.existsSync(file)).toBe(false);
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
});

it.each(['gemini', 'amp'])(
  '%s prefers local skills and finds shared skills for moves',
  async (cli) => {
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
  },
);
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
