# Git access for the `repomix` git dependency

> Read in English | [Leer en español](GIT_ACCESS.es.md)

The website server package (`website/server/`) consumes this repository as a
**git dependency** rather than from the npm registry:

```json
"repomix": "github:DAW1BSergiomg26/manteka-repomix#main"
```

`package-lock.json` resolves it to a fixed commit over SSH:

```
git+ssh://git@github.com/DAW1BSergiomg26/manteka-repomix.git#0b3f82b401bbc520fd1aca67c06d24e40a868d3e
```

Pinning the commit is what makes CI test *this* branch's build instead of
whatever `#main` happens to point at. This document explains why fetching it is
not a plain `git clone`, and how CI solves it without anyone configuring a
secret by hand.

## Why the default fetch fails

Two independent obstacles stand between a hosted runner and this dependency.

**1. npm upgrades the spec to SSH.** npm resolves GitHub git dependencies over
`git+ssh://` regardless of the `github:` shorthand, so the runner is asked for
an SSH key it does not have:

```
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**2. The owner account is not readable anonymously.** As of the time of
writing, unauthenticated requests for the owner profile *and every repository
under it* return `404 Not Found`, even though the API reports the repository as
`public` when queried with credentials. Rewriting the URL onto plain HTTPS is
therefore not sufficient on its own:

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

For comparison, an unrelated public repository (`yamadashy/repomix`) still
resolves and clones anonymously, so this is specific to the owning account and
not a network or proxy problem. The responses do come from GitHub itself
(`Server: github.com`, real `X-GitHub-Request-Id`).

Because the account state can change, the fix below uses an authenticated fetch
whether or not the repository is anonymously readable. It is correct in both
cases.

## CI strategy

`.github/workflows/ci-website.yml` configures git in each of the three
website-server jobs (`lint-website-server`, `test-website-server`,
`bundle-website-server`) before running `npm ci`:

```bash
# Rewrite the SSH form npm insists on onto HTTPS ...
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
# ... and carry the token as an HTTP extraheader.
git config --global "http.https://github.com/.extraheader" \
  "AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
```

`GH_TOKEN` comes from the automatic runner token:

```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### No manual credentials

`GITHUB_TOKEN` is minted by GitHub Actions for every job — nobody creates,
rotates or uploads it. That satisfies the requirement that CI work on public and
private runners with no hand-configured secret.

Because the dependency points at the *same* repository the workflow runs in, the
automatic token is sufficient to read it. A token scoped to one repository
cannot reach a *different* private repository, so this would need rethinking if
the dependency ever moved to another owner; that case is out of scope here.

### Security properties

- The token is never echoed: it is passed through the step's `env`, and the
  only thing written to git config is the base64 form, which is never printed.
- `git config --global` writes to the ephemeral runner home and disappears with
  the runner.
- No token is committed to the repository, and no `PAT`/`PERSONAL_ACCESS_TOKEN`
  secret is referenced. A guard in `tests/workflows/ciInfrastructure.test.ts`
  fails the build if one is ever introduced.

## Local development

Running `npm ci` in `website/server` locally hits the same two obstacles.
Authenticate once with the GitHub CLI and apply the same SSH rewrite:

```bash
gh auth login
gh auth setup-git
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

`gh auth setup-git` points git at a credential helper, and the `insteadOf` rule
makes npm's SSH fetch land on HTTPS so the helper is actually consulted.

## npm version requirement

These jobs install **npm 11.4.0** before `npm ci`:

```bash
npm install -g npm@11.4.0
```

npm 12 cannot prepare the `github:` git dependency in this repository. Its
`prepare` child process re-reads `.npmrc`, where `min-release-age=7` collides
with npm's own `--before` flag. Setting `npm_config_min_release_age=0` does not
help, because `0` still counts as "provided". npm 11.4.0 predates the flag.
`website/server/Dockerfile` pins the same version for the same reason.

## Building the website server image

CI does not build `website/server/Dockerfile`, so the image build has no
credentials available to it. If that image is ever added to a pipeline, the
fetch will fail for the reasons above and the build needs the token passed
through a BuildKit secret — do not copy the `RUN`-time git config into a
`Dockerfile`, or the token risks being baked into a layer.

## Verifying the change

The workflow wiring is covered by guards:

```bash
npx vitest run tests/workflows/
```

They assert that all three jobs carry the SSH rewrite, the authenticated
HTTPS fetch and the automatic token, and that no manual-token secret crept in.

To reproduce the credential path end to end:

```bash
gh auth token > /dev/null   # confirms the CLI has a usable credential
cd website/server
npm ci
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Permission denied (publickey)` | npm resolved the dependency over SSH | Apply the `insteadOf` rewrite |
| `could not read Username for 'https://github.com'` | anonymous fetch rejected | Provide a token (CI) or `gh auth setup-git` (local) |
| `repository ... not found` on a visible repo | account not anonymously readable | Same as above; authenticated fetch still works |
| npm `--before` / `min-release-age` conflict | npm 12 in use | Install npm 11.4.0 first |
| `repomix resolves to ... instead of the local build` | the post-install alias did not take effect | See the alias verification in `ci-website.yml` |