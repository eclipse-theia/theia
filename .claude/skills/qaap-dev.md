---
name: qaap-dev
description: Build, test, and verify changes in the QAAP Theia monorepo. Use when making code changes, before reporting a task complete, when unsure which build command to run, or when a shell command related to compilation or testing fails.
version: 1.0.0
---

# QAAP Development Workflow

## Critical rules

- **Never run `.ts` source files directly** with `npx tsx`, `ts-node`, or `node`. Packages import each other's compiled `lib/` output — running source fails with module-not-found errors.
- **`npm run compile` ≠ UI updated.** Compile only produces `.js` in `lib/`. To see changes in the running browser app you must also run `npm run build:browser`.
- **Editing an upstream Theia package?** That's a drift violation. Extract the behaviour to `packages/qaap-*` instead. Check with `node scripts/qaap-drift-check.js`.

## Build commands

```bash
npm run compile              # TypeScript only (fast, ~30s)
npm run build:browser        # Full webpack bundle (slow, ~2min) — required for UI testing
npx lerna run compile --scope @theia/package-name   # Single package
```

## Test commands

```bash
npm run test                                              # All tests
npx lerna run test --scope @theia/package-name            # One package
npx mocha ./packages/core/lib/browser/some-file.spec.js  # Single test file (compile first)
```

## Verify sequence after a code change

1. `npm run compile` — catch TypeScript errors
2. `node scripts/qaap-drift-check.js` — ensure no unauthorized upstream edits
3. `npm run build:browser` — only if you need to verify UI behaviour
4. `npm run start:browser` — smoke test at localhost:3000

## Common failure causes

| Symptom | Root cause | Fix |
|---|---|---|
| `Cannot find module '@theia/...'` when running a file | Running `.ts` source directly | Compile first: `npm run compile` |
| UI unchanged after compile | Webpack bundle not rebuilt | Run `npm run build:browser` |
| `drift check failed` | Edited an upstream file | Revert or extract to `qaap-*` package |
| TypeScript error on new file | File not in tsconfig | Check `tsconfig.json` in the package |
| `Exit code 1` on bash command | Read the full error output before retrying | Check stderr for the real cause |
