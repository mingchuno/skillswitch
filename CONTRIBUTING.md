# Contributing to skillswitch

## Dev setup

```bash
git clone https://github.com/nikolas-sapa/skillswitch.git
cd skillswitch
corepack enable
pnpm install --frozen-lockfile
pnpm dev status       # run the CLI from source (tsx, no build)
pnpm build            # bundle to dist/ via tsup
pnpm test             # run the vitest suite
pnpm test:watch       # watch mode
```

Development requires Node >= 22 and the pnpm version pinned in `package.json`.
The published CLI retains its Node >= 18 runtime requirement.

## Checks and coverage

Run `pnpm check` for Biome formatting, linting, and import checks; use
`pnpm check:fix` to apply safe fixes. Run `pnpm typecheck` separately.

`pnpm test:coverage` reports all executable source modules, including modules
not imported by tests. Minimum coverage is 85% for statements, functions, and
lines, and 80% for branches. Open `coverage/index.html` for details; LCOV and
Cobertura reports are also generated. Type-only interfaces are excluded.
CLI subprocess tests verify the built artifact but do not contribute to
in-process source coverage.

GitHub Actions runs on pushes and pull requests, installs from the frozen
lockfile, runs all checks, and uploads JUnit results and coverage reports
(including on test failures).
`pnpm test:ci` runs the same test reporting command locally.

## Repo layout

```
src/
  cli.ts            # runtime composition and executable entrypoint
  commands.ts       # command definitions and handler wiring
  cli/
    context.ts      # handler inputs and dependency contracts
    runtime.ts      # terminal, adapter, and file implementations
    skills.ts       # skill query and mutation handlers
    profiles.ts     # profile command handlers
    inspection.ts   # catalog, audit, and detection handlers
  inventory.ts      # pure search, count, and audit queries
  adapters/          # one file per supported CLI
    types.ts         # CliAdapter interface all adapters implement
    helpers.ts        # shared dir-scanning / enable-disable helpers
    claude.ts, gemini.ts, codex.ts, aider.ts, amp.ts, factory.ts
    index.ts          # adapter registry (getAdapter, getAllAdapters)
  scanner.ts          # skill discovery
  disable.ts           # enable/disable logic
  profiles.ts          # profile snapshot/switch/diff
  catalog.ts            # SKILLS.md generation
  blocklist.ts           # Claude Code plugin blocklist.json handling
tests/                    # vitest, one file per src module
```

Keep `commands.ts` limited to command definitions, option adaptation, and
handler wiring. Compose runtime dependencies in `cli.ts`; handlers receive
explicit terminal, adapter, and file ports. Domain modules own validation and
persistence. Test handlers with injected ports and temporary filesystem
fixtures; keep built-CLI tests for output, exit status, and interactive behavior.

## Adding support for a new AI CLI

This is the most common contribution. Steps:

1. Create `src/adapters/<cli>.ts` implementing the `CliAdapter` interface from `src/adapters/types.ts`:
   - `cliName`, `displayName`, `skillsDirs`
   - `isInstalled()` — detect the CLI (e.g. check for its config dir)
   - `scanSkills()` — return `AdapterSkill[]`
   - `disableSkill(name)` / `enableSkill(name)`
2. Reuse `scanDirSkills`, `disableDirSkill`, `enableDirSkill`, `findSkillDir` from `src/adapters/helpers.ts` if the CLI stores skills as one directory per skill (most do) — see `src/adapters/codex.ts` for the minimal example.
3. Register the adapter in `src/adapters/index.ts` (`ADAPTERS` map).
4. Add `tests/<cli>.test.ts` covering scan, disable, enable, and `isInstalled` against a temp directory.
5. Add the CLI to the "Supported CLIs" table in `README.md`.

Look at `src/adapters/claude.ts` if the target CLI has a plugin/blocklist system in addition to standalone skill files; otherwise `codex.ts` or `gemini.ts` are simpler templates.

## PR expectations

- `pnpm check`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm build` pass.
- One logical change per PR; keep unrelated formatting out of the diff.
- New adapters or commands include tests.
- No new dependencies without discussion first — this is a local-only, no-telemetry tool by design.
- Update `README.md` when behavior or commands change.

## Reporting bugs / requesting features

Use the GitHub issue templates. Security issues go to niksapa150@gmail.com instead (see `SECURITY.md`), not a public issue.
