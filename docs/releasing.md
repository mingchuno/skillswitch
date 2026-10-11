# Releasing @mingchuno/skillswitch

The `skillswitch` executable keeps its name. The public npm package is
`@mingchuno/skillswitch`; its repository is `mingchuno/skillswitch`.

## GitHub setup

1. Install the release GitHub App used by the reference projects on this repository
   (or create one). It needs repository **Contents**, **Pull requests**, and
   **Issues** permissions set to **Read and write**, plus Metadata read access.
2. Add Actions secrets `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY`. Organization
   secrets must grant this repository access. The App token lets release PRs
   trigger CI; using only `GITHUB_TOKEN` would suppress those workflow events.
3. Create the GitHub environment `npm`. Add required reviewers if you want an
   approval before each publication; permit the `main` deployment branch.
4. Keep the repository Actions variable `NPM_PUBLISH_ENABLED` unset or `false`
   until npm trusted publishing is configured. Set it to the literal `true`
   when ready. This gates publication, not release PRs or GitHub releases.
5. Allow the actions in `release.yml` through any organization Actions policy.
   Protect `main` and require the CI `verify` check before merging release PRs.

## npm setup and first publication

Use the npm account that owns `@mingchuno` (or has publish access to that scope).
Ensure the GitHub repository is public for npm provenance.

If the scoped package does not exist yet, publish its first version manually
before configuring a trusted publisher in its package settings:

1. Merge this configuration to `main` with a Conventional Commit. Let
   release-please create a release PR; review its version/changelog and merge it.
   Keep `NPM_PUBLISH_ENABLED=false` during this bootstrap.
2. In a clean checkout of the resulting `vX.Y.Z` release tag, use Node 24 and the
   pinned pnpm version. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm verify
   npm pack --pack-destination /tmp
   # Inspect the tarball contents and test an installation before publishing.
   npm login
   npm whoami
   npm publish /tmp/mingchuno-skillswitch-X.Y.Z.tgz --access public
   ```

   Replace `X.Y.Z` with the release version. Complete npm's account/2FA prompts.
   Local bootstrap publication does not generate GitHub Actions provenance.
   `prepack` builds the CLI, including when packing for this manual publication.
3. On npm, open `@mingchuno/skillswitch` → Settings → Trusted Publisher →
   GitHub Actions. Enter:

   | Field | Value |
   | --- | --- |
   | Organization or user | `mingchuno` |
   | Repository | `skillswitch` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions, if shown | Allow direct `npm publish` |

4. Set GitHub's `NPM_PUBLISH_ENABLED=true`. No `NPM_TOKEN` secret is needed.
   After confirming OIDC works, disallow token-based publishing in npm's package
   settings if available; keep account recovery and 2FA configured.

Trusted publishing requires npm >=11.5.1 and Node >=22.14.0. The workflow uses
Node 24 on a GitHub-hosted runner and grants `id-token: write` only to the
publication job. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Normal releases

Pushes to `main` first run CI. Release-please then updates the release PR using
Conventional Commits. Merging that PR creates a `vX.Y.Z` tag and GitHub release.
The publication job checks out that exact commit, validates its package version,
runs all checks, packs the package, installs it in a temporary directory, checks
`--version` and `--help`, and publishes that same tarball with provenance.

The manifest starts at the current `0.2.0`; `initial-version` is also `0.2.0`
for a repository without an earlier release. Review the first release PR's
proposed version before bootstrap. Subsequent versions are managed by
release-please. Its generic updater also updates the annotated CLI version in
`src/commands.ts`; the existing built-CLI test checks it against `package.json`.

`feat:` bumps the minor version; `fix:` bumps the patch. Before 1.0, breaking
changes bump the minor. Use `feat!:` or a `BREAKING CHANGE:` footer. Other commit
types alone do not normally trigger a release.

## Retrying or publishing a skipped release

Turning on the variable or rerunning release-please does not recreate its
`release_created` output for an existing release. Instead, open Actions →
Release → Run workflow, select **main**, and supply the existing `vX.Y.Z` tag
in the `tag` input. Leave the input empty to run release-please normally.

Manual publication requires the switch and environment approvals too. It accepts
only stable version tags with an existing non-draft GitHub release, matching
package metadata, and a commit reachable from `main`. It reruns verification and
package installation before publishing. npm rejects versions already published;
check npm before retrying after an ambiguous publication failure. Never delete
and recreate a published version.

To stop future npm publications, set `NPM_PUBLISH_ENABLED=false`. GitHub release
management continues independently.
