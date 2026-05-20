// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type URI from '@theia/core/lib/common/uri';

/** Build phases tracked by {@link QaapProjectBootstrapService}. */
export type QaapBootstrapPhase =
    | 'idle'
    | 'detected'
    | 'installing'
    | 'install-failed'
    | 'ready-to-run'
    | 'starting'
    | 'running'
    | 'run-failed'
    | 'dismissed';

/** Package manager understood by the detector. */
export type QaapPackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/** Likely framework guess (used for UI labels and port hints). */
export type QaapProjectKind =
    | 'node-vite'
    | 'node-next'
    | 'node-cra'
    | 'node-astro'
    | 'node-remix'
    | 'node-svelte'
    | 'node-nuxt'
    | 'node-generic'
    | 'unknown';

/** Sub-package inside a monorepo with its own runnable dev script. */
export interface QaapMonorepoAppCandidate {
    /** Folder of the app (where `package.json` lives). */
    readonly rootUri: URI;
    /** Relative path from the workspace root, e.g. `apps/web`. */
    readonly relativePath: string;
    /** Resolved name (from `package.json.name` or folder name). */
    readonly name: string;
    /** Best-guess framework. */
    readonly kind: QaapProjectKind;
    /** Concrete dev command (`pnpm run dev`, …). Cwd is the app's `rootUri`. */
    readonly devCommand: string;
    /** Same as {@link devCommand}, surfaced separately so the banner can show it monospace. */
    readonly devCommandLabel: string;
    /** Default port hint for this framework, used when stdout parsing fails. */
    readonly expectedPort?: number;
}

/** Default HTTP port for `@theia/*` example apps (`theia start`). */
export const QAAP_THEIA_DEV_PORT = 3000;

/**
 * Layout hint inferred from the lockfile / config files. We only need the marker presence at this
 * level — the detector enumerates the actual sub-packages separately.
 */
export type QaapMonorepoFlavor =
    | 'pnpm-workspace'
    | 'npm-workspaces'
    | 'yarn-workspaces'
    | 'turborepo'
    | 'nx'
    | 'lerna'
    | 'implicit';

/** Result of a single workspace-root inspection. */
export interface QaapProjectDescriptor {
    /** Root URI used for the inspection. */
    readonly rootUri: URI;
    /** Human-readable workspace name, e.g. `qaap-store-web`. */
    readonly name: string;
    /** Best-guess project kind. */
    readonly kind: QaapProjectKind;
    /** Package manager to use (driven by lockfile, falls back to `npm`). */
    readonly packageManager: QaapPackageManager;
    /** `${packageManager} install` (or equivalent). */
    readonly installCommand: string;
    /** Dev script the user is asked to run, or `undefined` if none was confidently detected. */
    readonly devCommand?: string;
    /** Pretty label for the dev script, e.g. `npm run dev`. */
    readonly devCommandLabel?: string;
    /** Optional hint to seed port detection if stdout parsing fails. */
    readonly expectedPort?: number;
    /** True when `node_modules` already exists in the root (install can be skipped). */
    readonly nodeModulesPresent: boolean;
    /** Workspace layout flavor, when the project is a monorepo. */
    readonly monorepoFlavor?: QaapMonorepoFlavor;
    /** Sub-apps with a runnable dev script, empty unless the project is a monorepo. */
    readonly apps: QaapMonorepoAppCandidate[];
}

export function isMonorepoDescriptor(descriptor: QaapProjectDescriptor): boolean {
    return descriptor.apps.length > 0;
}

/**
 * A port observed in the dev-server stdout. We keep one entry per port (deduped by port number,
 * since `localhost` / `127.0.0.1` / `0.0.0.0` are equivalent endpoints), tagged with metadata that
 * the UI uses to render the strip and decide which pill is "active".
 */
export interface QaapForwardedPort {
    /** Numeric port (`3000`, `8080`, …). Used as the dedup key. */
    readonly port: number;
    /** The full URL as printed by the dev server, with the chosen host preserved. */
    readonly url: string;
    /** First time we saw this port, used to keep the strip sorted by appearance order. */
    readonly firstSeenAt: number;
    /** True when this port currently has an open mini-browser tab. */
    readonly previewOpen: boolean;
    /** Set on the entry the bootstrap auto-opened as the "main" preview. */
    readonly primary: boolean;
}

