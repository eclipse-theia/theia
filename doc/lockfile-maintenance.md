# Lockfile maintenance

Regenerate `package-lock.json` with a plain install:

```sh
npm install
```

Then check the result:

```sh
git diff --stat package-lock.json
node scripts/verify-lockfile-platforms.js
```

The verifier also runs in CI, so a lockfile that fails the checks below cannot be merged.

## Keeping `allowScripts` in sync

npm consults the `allowScripts` allowlist in the root `package.json` before running a dependency's install scripts. Adding, removing, or updating dependencies can therefore require an `allowScripts` change:

- A new dependency with an install script must be added with `true` if the script is required (native bindings, downloaded binaries) or `false` if it is cosmetic or unused. Recording it as `false` also keeps `npm install` free of notices.
- A dependency that no longer has an install script must be removed from the list.

npm 11 only prints a notice for an unlisted dependency and still runs its script, so an omission is easy to miss. `--strict-allow-scripts` turns that notice into a hard error and npm 12 is expected to make it the default, at which point a missing `true` entry stops a native module from building. The verifier cross-checks the allowlist against every lockfile entry with `hasInstallScript` and fails on unlisted or stale entries, so run it after changing dependencies.

## Platform-specific entries

The lockfile has to describe every platform CI builds on, not just the host that regenerated it:

1. **Platform-specific optional deps** such as `@esbuild/darwin-arm64`, `@parcel/watcher-linux-x64-musl` or `@nx/nx-win32-x64-msvc`. If missing, `npm ci` on the affected platform cannot resolve the package.
2. **`libc` fields** on Linux entries (`"libc": ["glibc"]` or `"libc": ["musl"]`). Without them, `npm ci` on Alpine or other musl-based images cannot pick the right binary.

npm 11.19, bundled with both Node 24 and Node 26, writes all of these regardless of the host. npm 10, which shipped with the no longer supported Node 22, pruned them instead and broke CI on the affected platforms even when it was green before. No supported Node version prunes anymore, but a globally installed older npm can still be used with a supported Node, so the verifier keeps asserting that the committed lockfile carries the `libc` fields. If that check fails, regenerate the lockfile with the npm bundled with a supported Node version.
