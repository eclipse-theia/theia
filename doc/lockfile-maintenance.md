# Lockfile maintenance

npm prunes optional-dependency metadata based on the host platform when it writes `package-lock.json`. On a glibc Linux host running `npm install`, two things typically get dropped:

1. **Platform-specific optional deps** such as `@esbuild/darwin-arm64`, `@parcel/watcher-linux-x64-musl`, `@nx/nx-win32-x64-msvc`, or nested optional deps like puppeteer's proxy packages. If missing, `npm ci` on the affected platform cannot resolve the package.
2. **`libc` fields** on Linux entries (`"libc": ["glibc"]` or `"libc": ["musl"]`). Without them, `npm ci` on Alpine or other musl-based images cannot pick the right binary.

npm 11, shipped with both Node 24 and Node 26, does this. CI then breaks on the affected platforms even when it was green before.

## Updating the lockfile

Do not run a bare `npm install` and commit the result. Use:

```sh
node scripts/npm-install-with-platforms.js
```

The script snapshots the committed lockfile, runs `npm install --include=optional`, and restores optional entries and `libc` fields that npm stripped.

Regenerate on the **oldest supported Node version (currently Node 24)**. An older npm is stricter than a newer one when validating `package-lock.json`, so a lockfile that passes on the oldest supported npm also passes on the newer ones but not the other way around. If you regenerate on the newest Node and commit, CI on the oldest one may fail.

After running:

```sh
git diff --stat package-lock.json
node scripts/verify-lockfile-platforms.js
```

The verifier checks that known Linux entries still carry their `libc` field, and that `allowScripts` is in sync (see below). It also runs in CI, so a lockfile that lost them cannot be merged.

## Keeping `allowScripts` in sync

npm 12 does not run dependency lifecycle scripts unless the package is listed in the `allowScripts` allowlist in the root `package.json`. Adding, removing, or updating dependencies can therefore require an `allowScripts` change:

- A new dependency with an install script must be added with `true` if the script is required (native bindings, downloaded binaries) or `false` if it is cosmetic or unused. Recording it as `false` also keeps `npm install` free of warnings.
- A dependency that no longer has an install script must be removed from the list.

Missing `true` entries are easy to overlook because `npm ci` still succeeds — the failure only shows up later, when a native module is loaded or a build step needs its binary. `node scripts/verify-lockfile-platforms.js` cross-checks the allowlist against every lockfile entry with `hasInstallScript` and fails on unlisted or stale entries, so run it after changing dependencies as well.

## Outlook

Once upstream npm produces a stable, platform-agnostic lockfile format, most of this file can be deleted.
