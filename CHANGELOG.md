# Changelog

## [0.4.0](https://github.com/mingchuno/skillswitch/compare/v0.3.0...v0.4.0) (2026-10-12)


### Features

* Add glob selection for enable and disable ([087ff17](https://github.com/mingchuno/skillswitch/commit/087ff17b3a22027aeeeecc801787de7058e30e0a))

## [0.3.0](https://github.com/mingchuno/skillswitch/compare/v0.2.0...v0.3.0) (2026-10-11)


### Features

* add 40+ missing features across scanner, profiles, CLI, and tests\n\n- Fix semver version sort bug (1.0.10 vs 1.0.9)\n- Handle malformed JSON in scanner, blocklist, profiles gracefully\n- Per-file EACCES handling in scanner (warn and skip)\n- unblockPlugin returns boolean\n- enableSkill creates skills/ dir if missing\n- disableAllExcept continues on individual errors\n- Profile: updatedAt, previous tracking, renameProfile, copyProfile\n- Profile: diffProfile, exportProfile, importProfile, validateProfile\n- CLI: --claude-dir global option + SKILLSWITCH_CLAUDE_DIR env var\n- CLI: global unhandledRejection handler, all async actions try/caught\n- CLI: profile name validation, overwrite warning\n- list: --enabled, --json, plugin skills enumerated\n- search: --status, --json\n- status: --json\n- disable/enable: --exact, fuzzy --plugin, --quiet\n- profile use: shows names not just counts, dry-run uses diff\n- profile delete: --force for active profile\n- New: profile rename, copy, diff, export, import, validate\n- catalog: --out path option\n- audit: --json\n- Tests: 69 tests, up from ~40\n\nCo-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt; ([0cd5d45](https://github.com/mingchuno/skillswitch/commit/0cd5d45d4e59d998d3013192e9d35c149ca92e68))
* add blocklist manager ([6301c5d](https://github.com/mingchuno/skillswitch/commit/6301c5d0d245b26d617bdb555f3c51f865bd2309))
* add blocklist manager ([a7e95a6](https://github.com/mingchuno/skillswitch/commit/a7e95a69b8c1d7c0952f7a6c6c7e92293470f8c1))
* add multi-CLI adapter system\n\nAdd adapter layer with --for flag routing list/search/status/enable/disable\nthrough CLI-specific skill directories. Add detect and aider-config commands.\n\nCo-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt; ([1d6ee30](https://github.com/mingchuno/skillswitch/commit/1d6ee30a9b2e79b0e2e5a8a7244df9b6c26891d6))
* add shared TypeScript types ([4eaf4c1](https://github.com/mingchuno/skillswitch/commit/4eaf4c1f26e24c4b940c855d58998ad7ba708b46))
* catalog generator ([0396a0f](https://github.com/mingchuno/skillswitch/commit/0396a0fc4d0639d9321e9bca087271351b42372b))
* **codex:** Add native skill profiles ([4d220d4](https://github.com/mingchuno/skillswitch/commit/4d220d4bdea22b246ee1e3fff3edc53096bc021b))
* complete CLI — all commands wired ([3fa904c](https://github.com/mingchuno/skillswitch/commit/3fa904c7292472fa366248f33c63cfbe0020b42b))
* profile manager ([95980e0](https://github.com/mingchuno/skillswitch/commit/95980e0595048031f001c0e0ffdc449124b73574))
* scanner - plugin skills\n\nAdd scanPlugins + collectPluginSkills to scanner.ts with full TDD coverage.\n\nCo-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt; ([24c59a6](https://github.com/mingchuno/skillswitch/commit/24c59a6f3b1364acdbde5627539561c57e13c6f9))
* scanner — extractDescription + standalone skills ([c5fdd63](https://github.com/mingchuno/skillswitch/commit/c5fdd634d59800a029ee3db889b7c0a33f78ff5c))
* standalone skill disable/enable\n\nCo-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt; ([6f37feb](https://github.com/mingchuno/skillswitch/commit/6f37feb37223b604317d7e62e79d0e3b35b34864))
* **web:** add landing page Next.js app ([53ab367](https://github.com/mingchuno/skillswitch/commit/53ab3671800abaf46d7bb0649610541e5b798f2b))


### Bug Fixes

* atomic profile store writes, guard non-existent delete, escape pipe chars in catalog ([c222ec4](https://github.com/mingchuno/skillswitch/commit/c222ec4c50da978bb16a9500776712b84c56ad9a))
* **landing:** soften navbar — edge-faded hairline instead of hard border box ([0dfaa46](https://github.com/mingchuno/skillswitch/commit/0dfaa4610b3664a6ab770de3b4f208773de937ba))
* patch skillswitch development dependencies ([7afe047](https://github.com/mingchuno/skillswitch/commit/7afe047434569b2bef2ed5f8cd9eeb5904609ad1))
* validate blocklist JSON shape and use atomic writes ([fb94da8](https://github.com/mingchuno/skillswitch/commit/fb94da853cc493690b8216d0afeeabd12f36fc05))
