import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeAll, expect, it } from 'vitest';

beforeAll(() => execFileSync('pnpm', ['run', 'build'], { stdio: 'pipe' }));

it('writes catalog only to --out and leaves default catalog intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-cli-'));
  try {
    fs.mkdirSync(path.join(dir, 'skills'));
    fs.writeFileSync(path.join(dir, 'SKILLS.md'), 'keep default');
    const out = path.join(dir, 'chosen.md');
    const result = spawnSync(
      process.execPath,
      ['dist/cli.js', '--claude-dir', dir, 'catalog', '--out', out],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toContain('Skills Catalog');
    expect(fs.readFileSync(path.join(dir, 'SKILLS.md'), 'utf8')).toBe('keep default');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it.each([['profile', 'list'], ['catalog'], ['audit']])(
  'rejects unsupported non-Claude target for %s',
  (...command) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-cli-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          'dist/cli.js',
          '--claude-dir',
          dir,
          '--for',
          command[0] === 'profile' ? 'agy' : 'codex',
          ...command,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Claude');
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

it('reports the manifest version from the actual built CLI', () => {
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const result = spawnSync(process.execPath, ['dist/cli.js', '--version'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(manifest.version);
});
it('forced profile deletion ignores predictable temporary symlinks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-cli-'));
  try {
    fs.mkdirSync(path.join(dir, 'skillctl'));
    const file = path.join(dir, 'skillctl', 'profiles.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        active: 'dev',
        previous: null,
        profiles: { dev: { created: 'fixture', skills: [], plugins: [] } },
      }),
    );
    const marker = path.join(dir, 'marker');
    fs.writeFileSync(marker, 'keep marker');
    fs.symlinkSync(marker, file + '.tmp');
    const result = spawnSync(
      process.execPath,
      ['dist/cli.js', '--claude-dir', dir, 'profile', 'delete', 'dev', '--force'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(fs.readFileSync(marker, 'utf8')).toBe('keep marker');
    expect(fs.lstatSync(file + '.tmp').isSymbolicLink()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).active).toBe(null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  ['create', '', 'Error: Profile name cannot be empty'],
  ['create', 'a'.repeat(65), 'Error: Profile name must be 64 characters or less'],
  ['rename', 'dev', '../bad', 'Error: Profile name cannot contain "/" or "\\"'],
  ['copy', 'dev', 'folder\\bad', 'Error: Profile name cannot contain "/" or "\\"'],
  ['delete', 'missing', 'Profile "missing" does not exist'],
])('preserves profile %s error output and exit status', (...fixture) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-errors-'));
  try {
    const expected = fixture.pop();
    const result = spawnSync(
      process.execPath,
      ['dist/cli.js', '--claude-dir', dir, 'profile', ...fixture],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(expected);
    expect(fs.readdirSync(dir)).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
it.each(['n\n', 'y\n'])(
  'preserves confirmation behavior on multiple matching skills with input %j',
  (input) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-confirm-'));
    try {
      fs.mkdirSync(path.join(dir, 'skills'));
      for (const name of ['plan', 'plan-more'])
        fs.writeFileSync(path.join(dir, 'skills', `${name}.md`), name);
      const result = spawnSync(
        process.execPath,
        ['dist/cli.js', '--claude-dir', dir, 'disable', 'plan'],
        { encoding: 'utf8', input },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Disable all 2? (y/N)');
      expect(result.stdout).toContain(input.startsWith('y') ? 'Disabled: plan' : 'Aborted.');
      expect(fs.existsSync(path.join(dir, 'skills', 'plan.md'))).toBe(!input.startsWith('y'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

it('uses the environment directory unless an explicit directory overrides it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-env-'));
  try {
    const configured = path.join(home, 'configured');
    const explicit = path.join(home, 'explicit');
    for (const [dir, name] of [
      [configured, 'configured'],
      [explicit, 'explicit'],
    ]) {
      fs.mkdirSync(path.join(dir, 'skills'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'skills', `${name}.md`), name);
    }
    const env = { ...process.env, SKILLSWITCH_CLAUDE_DIR: configured };
    const fallback = spawnSync(process.execPath, ['dist/cli.js', 'list', '--json'], {
      encoding: 'utf8',
      env,
    });
    expect(fallback.status).toBe(0);
    expect(JSON.parse(fallback.stdout).standalone[0].name).toBe('configured');
    const override = spawnSync(
      process.execPath,
      ['dist/cli.js', '--claude-dir', explicit, 'list', '--json'],
      { encoding: 'utf8', env },
    );
    expect(override.status).toBe(0);
    expect(JSON.parse(override.stdout).standalone[0].name).toBe('explicit');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
it.each([
  ['codex', '.agents/skills', true],
  ['copilot', '.copilot/skills', true],
  ['agy', '.gemini/config/skills', true],
  ['agy', '.gemini/antigravity-cli/skills', true],
  ['amp', '.config/amp/skills', true],
  ['aider', '.aider/skills', false],
  ['droid', '.factory/droids', false],
] as const)(
  'wires the real %s adapter into the built CLI with an isolated home',
  (cli, location, directory) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-adapter-cli-'));
    try {
      const file = path.join(home, location, directory ? 'ship/SKILL.md' : 'ship.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '# Ship\nShipping.');
      const env = {
        ...process.env,
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKILLSWITCH_CLAUDE_DIR: path.join(home, '.claude'),
      };
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ['dist/cli.js', '--for', cli, ...args], {
          encoding: 'utf8',
          env,
        });
      const listed = run('list', '--json');
      expect(listed.status).toBe(0);
      expect(JSON.parse(listed.stdout)).toEqual([
        expect.objectContaining({ name: 'ship', status: 'active' }),
      ]);
      expect(run('disable', 'ship', '--exact', '--dry-run').status).toBe(0);
      expect(fs.existsSync(file)).toBe(true);
      expect(run('disable', 'ship', '--exact').status).toBe(0);
      expect(fs.existsSync(file)).toBe(cli === 'codex');
      expect(run('enable', 'ship', '--exact').status).toBe(0);
      expect(fs.readFileSync(file, 'utf8')).toBe('# Ship\nShipping.');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  },
);

it.each(['enable', 'disable'])(
  'rejects conflicting match modes for %s before mutation',
  (command) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-glob-conflict-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['dist/cli.js', '--claude-dir', dir, command, 'plan*', '--glob', '--exact'],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("cannot be used with option '--exact'");
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

it('passes an intact glob pattern to the built CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswitch-glob-'));
  try {
    fs.mkdirSync(path.join(dir, 'skills'));
    fs.writeFileSync(path.join(dir, 'skills', 'plan-more.md'), '# More');
    const result = spawnSync(
      process.execPath,
      ['dist/cli.js', '--claude-dir', dir, 'disable', 'plan-*', '--glob', '--dry-run'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run] Would disable: plan-more');
    expect(fs.existsSync(path.join(dir, 'skills', 'plan-more.md'))).toBe(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('rejects Gemini invocations with migration guidance instead of retargeting them', () => {
  const result = spawnSync(process.execPath, ['dist/cli.js', '--for', 'gemini', 'list'], {
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Gemini support was removed. Use --for agy');
});
