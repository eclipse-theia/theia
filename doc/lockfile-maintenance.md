# Lockfile maintenance

npm prunes optional-dependency metadata based on the host platform when it writes `package-lock.json`. On a glibc Linux host running `npm install`, two things typically get dropped:

1. **Platform-specific optional deps** such as `@esbuild/darwin-arm64`, `@parcel/watcher-linux-x64-musl`, `@nx/nx-win32-x64-msvc`, or nested optional deps like puppeteer's proxy packages. If missing, `npm ci` on the affected platform cannot resolve the package.
2. **`libc` fields** on Linux entries (`"libc": ["glibc"]` or `"libc": ["musl"]`). Without them, `npm ci` on Alpine or other musl-based images cannot pick the right binary.

Both npm 10 (Node 22) and npm 11 (Node 24) do this. CI then breaks on the affected platforms even when it was green before.

## Updating the lockfile

Do not run a bare `npm install` and commit the result. Use:

```sh
node scripts/npm-install-with-platforms.js
```

The script snapshots the committed lockfile, runs `npm install --include=optional`, and restores optional entries and `libc` fields that npm stripped.

Regenerate on **Node 22 (npm 10), not Node 24 (npm 11)**. npm 10 is stricter than npm 11 when validating `package-lock.json`, so a lockfile that passes on npm 10 also passes on npm 11 but not the other way around. If you regenerate on Node 24 and commit, CI on Node 22 will fail.

After running:

```sh
git diff --stat package-lock.json
node scripts/verify-lockfile-platforms.js
```

The verifier checks that known Linux entries still carry their `libc` field. It also runs in CI, so a lockfile that lost them cannot be merged.

## Outlook

Once upstream npm produces a stable, platform-agnostic lockfile format, most of this file can be deleted.
