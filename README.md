# skillswitch

[![npm version](https://img.shields.io/npm/v/@mingchuno/skillswitch?style=flat-square&color=F3F2EE&labelColor=0B0B0D)](https://www.npmjs.com/package/@mingchuno/skillswitch)
[![license](https://img.shields.io/badge/license-MIT-F3F2EE?style=flat-square&labelColor=0B0B0D)](LICENSE)
[![node](https://img.shields.io/node/v/@mingchuno/skillswitch?style=flat-square&color=F3F2EE&labelColor=0B0B0D)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-F3F2EE?style=flat-square&labelColor=0B0B0D)](CONTRIBUTING.md)

Manage AI CLI skills across Claude Code, Antigravity CLI, Codex CLI, GitHub Copilot CLI, Aider, Amp, and Factory Droid — profiles, disable/enable, catalog generation.

## Quick start

```bash
pnpm add -g @mingchuno/skillswitch
skillswitch detect                 # see which CLIs are installed
skillswitch status                 # skills active vs disabled (Claude Code by default)
skillswitch disable ads            # disable all skills matching "ads"
skillswitch profile create dev     # snapshot the current enabled set
skillswitch profile use dev        # activate it later
```

Running 100+ Claude Code skills? Your context window is leaking. Claude Code injects every installed skill name into every session. With 450 skills, that's thousands of tokens burned before your first message.

`skillswitch` fixes this — and works across every major AI CLI.

## What is Skillswitch?

**Skillswitch is a command-line skill manager for AI coding CLIs** — Claude Code, Antigravity CLI, Codex CLI, GitHub Copilot CLI, Aider, Amp, and Factory Droid. It disables the skills you're not using so they stop consuming your context window, and lets you snapshot enable/disable sets as named profiles you switch between per project.

### Why Skillswitch

Claude Code injects the name and description of every installed skill into every session. Install 100+ skills and you burn thousands of tokens before you type a word. Skillswitch turns skills off without deleting them (they move to a `.disabled/` folder — fully reversible), so a lean profile can run 40 skills instead of 400.

### Skillswitch vs the alternatives

- **vs. deleting skills manually** — deleting is destructive and you lose the skill. Skillswitch moves skills to `.disabled/` and restores them on `enable`. Nothing is lost.
- **vs. editing config by hand** — hand-editing `blocklist.json` or moving files works until you want a *different* set per project. Skillswitch stores profiles and switches the whole set in one command with a `--dry-run` preview.
- **vs. one-CLI tools** — most helpers target Claude Code only. Skillswitch uses the same commands across seven CLIs via `--for <cli>`.

### When to use Skillswitch

- You have 50+ skills or plugins installed and your context feels bloated.
- You want different active skill sets for different projects (a "dev" profile vs a "writing" profile).
- You use more than one AI CLI and want one tool to manage them.
- You want to see, in one command, exactly how many skills are active vs disabled.

### FAQ

**Does Skillswitch delete my skills?** No. Claude and other filesystem-based targets move standalone skills to `.disabled/`; Codex uses native `config.toml` settings without moving shared skill folders. Claude plugins use `blocklist.json`. Everything is reversible with `enable`.

**Does it send my data anywhere?** No telemetry, no auth, no network. It only reads and updates local files.

**Which CLIs does it support?** Claude Code, Antigravity CLI, Codex CLI, GitHub Copilot CLI, Aider, Amp (Sourcegraph), and Factory Droid. Default target is Claude Code; use `--for <cli>` for the rest.

**Profiles support Claude Code, Codex app / CLI and GitHub Copilot CLI.** Catalog and audit support Claude Code only. List, search, status, disable and enable support all listed targets.

**How do profiles work?** `skillswitch profile create dev` snapshots your current enabled set. `skillswitch profile use dev` activates it. `profile diff` and `--dry-run` show what changes before it happens.

**Will it help my context window?** It removes disabled skills' names and descriptions from what the CLI injects each session. Fewer active skills = fewer tokens spent on skill listings before your first message.

## Install

```bash
pnpm add -g @mingchuno/skillswitch
# or run without installing:
pnpm dlx @mingchuno/skillswitch <command>
```

## Supported CLIs

| CLI | Flag | Skill location |
|---|---|---|
| Claude Code | `--for claude` (default) | `~/.claude/skills/` + plugins |
| Antigravity CLI | `--for agy` | `~/.gemini/config/skills/` + `~/.gemini/antigravity-cli/skills/` |
| Codex app / CLI | `--for codex` | `~/.agents/skills/` |
| GitHub Copilot CLI | `--for copilot` | `~/.copilot/skills/` |
| Aider | `--for aider` | `~/.aider/skills/` (managed externally) |
| Amp (Sourcegraph) | `--for amp` | `~/.config/amp/skills/` + `~/.agents/skills/` |
| Factory Droid | `--for droid` | `~/.factory/droids/` + `~/.factory/commands/` |

## Commands

```
skillswitch detect                        # show which CLIs are installed

# Claude Code (default)
skillswitch status                        # how many skills are active vs disabled
skillswitch list                          # all skills by source
skillswitch list --disabled               # only disabled skills
skillswitch search <query>                # find skills by name or description

skillswitch disable <name>                # disable standalone skill (substring match)
skillswitch disable --plugin <id>         # disable entire plugin
skillswitch enable <name>                 # re-enable standalone skill
skillswitch enable --plugin <id>          # re-enable entire plugin

skillswitch profile create <name>         # snapshot current enabled set
skillswitch profile use <name>            # activate a profile
skillswitch profile use <name> --dry-run  # preview what would change
skillswitch profile list                  # list saved profiles
skillswitch profile show <name>           # see what's in a profile
skillswitch profile delete <name>         # remove a profile
skillswitch profile rename <old> <new>    # rename a profile
skillswitch profile copy <src> <dst>      # duplicate a profile
skillswitch profile diff <name>           # what changes on activate
skillswitch profile export <name>         # export profile to JSON
skillswitch profile import <file>         # import profile from JSON
skillswitch profile validate <name>       # detect ghost skills

skillswitch catalog                       # generate ~/.claude/SKILLS.md
skillswitch audit                         # find duplicates and stale disabled skills

# Other CLIs — use --for <cli>
skillswitch --for agy list
skillswitch --for codex disable tdd
skillswitch --for copilot disable tdd
skillswitch --for amp search coding
skillswitch --for droid status
skillswitch --for aider list
skillswitch aider-config                  # print the read: block for ~/.aider.conf.yml
```

## Matching skills and plugins

`enable` and `disable` use case-sensitive substring matching by default.
Use `--exact` for a literal full-name match, or `--glob` for a full-name
pattern: `*` matches zero or more characters and `?` matches one character.
All other characters are literal; character classes, braces, and extglobs
are not supported. `--glob` and `--exact` cannot be combined.

```bash
skillswitch disable research                     # names containing research
skillswitch disable research --exact             # only research
skillswitch disable 'research-*' --glob --dry-run # preview names starting research-
skillswitch enable 'research-????' --glob         # four characters after research-
skillswitch enable '*@market' --plugin --glob     # Claude plugin IDs ending @market
```

Quote patterns to prevent shell expansion. Glob selection works for skills
on every supported target and for Claude plugin IDs with `--plugin`.
Multiple skill matches require confirmation. Multiple plugin glob matches
also require confirmation for both enable and disable. `--dry-run` previews
changes without writing; it still prompts when multiple matches require confirmation.

## Typical workflow

```bash
# See what's installed
skillswitch detect

# Start with everything enabled (your current state)
skillswitch profile create full           # save the 450-skill state

# Trim down for dev work
skillswitch disable --plugin aso-skills@aso-skills
skillswitch disable ads                   # disables all skills with "ads" in the name
skillswitch profile create dev            # save the lean set

# Switch contexts
skillswitch profile use dev               # 48 skills active
skillswitch profile use full              # back to 450

# Manage skills for other CLIs
skillswitch --for agy list
skillswitch --for agy disable research
skillswitch --for codex disable tdd

# Discover what you have
skillswitch catalog                       # generates ~/.claude/SKILLS.md
# Then in Claude: @~/.claude/SKILLS.md
```

## Antigravity CLI

```bash
skillswitch --for agy list
skillswitch --for agy disable research --exact --dry-run
skillswitch --for agy disable research --exact
skillswitch --for agy enable research --exact
# In agy: /skills reload (or start a new session).
```

Manages immediate `<folder>/SKILL.md` bundles in both global roots listed above,
including skill-folder symlinks. Disable moves a bundle or link into that root's
`.disabled/`; enable restores it without moving a symlink's target. Duplicate
folder names across active/parked copies or global roots are rejected; resolve
those copies before running commands. `detect` checks for an executable `agy` on
PATH, not leftover Gemini configuration directories.

Project `.agents/skills`, shared `~/.agents/skills`, built-in skills, plugins,
and extra locations registered through `skills.json` are outside this managed
inventory. Counts describe these two folders, not agy's entire effective
inventory. Other Antigravity surfaces that share a managed folder can also be
affected by moves. Reload does not remove instructions already loaded into an
existing conversation.

Both roots and `.disabled/` exclusion were verified with `agy` 1.3.4 using
read-only `agy -p /skills --output-format json` discovery checks. Antigravity's bundled customization guide and
[public location documentation](https://antigravity.google/docs/skills/) can differ by version; verify discovery after upgrades.

Gemini support has been replaced: change `--for gemini` to `--for agy` after
migrating your skills. SkillSwitch does not automatically convert or move legacy
Gemini installations. Use Google's [migration guide](https://antigravity.google/docs/cli/gcli-migration/)
for onboarding and extension conversion. Retain legacy active and `.disabled`
bundles until migration is verified; do not overwrite same-named destination
skills or blindly merge shared directories. Existing parked skills can be copied
as whole bundles into a managed global root's `.disabled/` to retain their state.

## Codex profiles

```bash
skillswitch --for codex profile create full
skillswitch --for codex disable research --exact
skillswitch --for codex profile create dev
skillswitch --for codex profile use full --dry-run
skillswitch --for codex profile use full
# Restart Codex app / CLI after changing configuration.
```

Codex profiles manage immediate skill folders (including symlinks) in
`~/.agents/skills`. They apply across Codex app and CLI using the same
`CODEX_HOME`; each open chat does not have an independent selection.
Repository, plugin, system, and legacy `~/.codex/skills` skills are outside this
scope. Counts reflect the managed user folder and user configuration, not
Codex's effective inventory after other configuration layers.

Skill folder names identify profile entries; duplicate manifest names remain
separate when they point to different files. Conflicting selections of aliases
for the same file fail before writing. Existing name-based disable rules are
preserved; enabling a skill blocked by such a rule requires removing that rule
manually first. Missing profile skills also prevent activation; use
`profile validate` to find them.

Codex writes preserve unrelated TOML values, integer/float types, config symlinks,
and file permissions. Serialization normalizes formatting and removes comments.
The config update is atomic; updating the profile marker is a separate write.
Concurrent edits or an I/O failure can leave the marker out of sync with the
configuration. Entries combining `path` and `name` selectors are rejected as
unsupported. Other tools sharing `~/.agents/skills` retain their skill folders.

Skills parked by older versions in `~/.agents/skills/.disabled/` are still listed
as disabled. Restore those folders to `~/.agents/skills/` before enabling them;
Codex operations no longer move folders.

## Copilot profiles

```bash
skillswitch --for copilot profile create full
skillswitch --for copilot disable research --exact
skillswitch --for copilot profile create dev
skillswitch --for copilot profile use full --dry-run
skillswitch --for copilot profile use full
# Run /skills reload in an open Copilot CLI session, or start a new one.
```

Copilot profiles manage personal skill folders in `~/.copilot/skills` by moving
them to `~/.copilot/skills/.disabled/`. Copilot also reads `~/.agents/skills`,
but that root is shared with Codex and Amp, so skillswitch leaves it alone:
those skills are not listed, toggled or saved in Copilot profiles. Repository
(`.github/skills`) and plugin skills are also outside this scope. Every move is
checked before any folder changes; missing profile skills prevent activation.

## How it works

- **Standalone skills** (`~/.claude/skills/*.md`): disabled by moving to `.disabled/` subdirectory — always reversible, nothing deleted
- **Plugin skills** (`~/.claude/plugins/`): disabled by writing to Claude Code's native `blocklist.json`
- **Codex**: path-specific `[[skills.config]]` entries in `~/.codex/config.toml`; shared skill folders stay in place
- **Other CLIs**: skill files moved to `.disabled/` subdirectory inside their skills directory
- **Profiles** stored independently in `~/.claude/skillctl/profiles.json`, `$CODEX_HOME/skillctl/profiles.json` (default `~/.codex/skillctl/profiles.json`) and `~/.copilot/skillctl/profiles.json`

Moves reject existing destinations, invalid names and symlinked `.disabled/`
directories. Existing copies remain untouched. Corrupt or invalid profile and
blocklist JSON must be repaired before writes; it is never silently reset.
Profile activation validates inventory and planned moves before changing skills.
Concurrent filesystem changes or later I/O failures can still interrupt an
activation; this is not a transactional profile switch.

The CLI requires Node >=18. Development and tests require Node >=22 and
the pnpm version pinned in `package.json`.

No telemetry, no auth, no network — pure local filesystem tool.

## Contributing

Contributions welcome, especially adapters for new AI CLIs. See
[CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, repo layout, and how to add
a new CLI adapter. Please also read the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).

---

[npm](https://www.npmjs.com/package/@mingchuno/skillswitch) · [GitHub](https://github.com/mingchuno/skillswitch)
