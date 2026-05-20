// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { buildBootstrapInstallCommand } from './qaap-project-bootstrap-install';
import {
    parseDeclaredPackageManager,
    parseNpmrcPackageManager,
    parsePnpmWorkspaceYaml,
} from './qaap-project-bootstrap-pm-detect';
import {
    QAAP_THEIA_DEV_PORT,
    QaapMonorepoAppCandidate,
    QaapMonorepoFlavor,
    QaapPackageManager,
    QaapProjectDescriptor,
    QaapProjectKind,
} from './qaap-project-bootstrap-types';

interface PackageJsonShape {
    name?: unknown;
    scripts?: Record<string, unknown>;
    packageManager?: unknown;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    workspaces?: unknown;
}

/** Hard cap on sub-apps enumerated so we never freeze the UI on enormous monorepos. */
const MAX_MONOREPO_APPS = 32;

/** Fallback directories scanned when no explicit workspaces config exists ("implicit" layout). */
const IMPLICIT_MONOREPO_DIRS = ['apps', 'packages', 'examples', 'sites', 'services', 'artifacts'];

/** Scripts the detector will pick up as a "dev server" entry point, in priority order. */
const DEV_SCRIPT_PRIORITY = ['dev', 'start', 'serve', 'develop'];

const LOCKFILE_TO_PM: ReadonlyArray<readonly [string, QaapPackageManager]> = [
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
];

const FRAMEWORK_BY_DEP: ReadonlyArray<readonly [string, QaapProjectKind, number | undefined]> = [
    ['next', 'node-next', 3000],
    ['nuxt', 'node-nuxt', 3000],
    ['@remix-run/dev', 'node-remix', 3000],
    ['@remix-run/serve', 'node-remix', 3000],
    ['astro', 'node-astro', 4321],
    ['@sveltejs/kit', 'node-svelte', 5173],
    ['react-scripts', 'node-cra', 3000],
    ['vite', 'node-vite', 5173],
];

@injectable()
export class QaapProjectBootstrapDetector {

    @inject(FileService)
    protected readonly fileService: FileService;

    async detect(rootUri: URI): Promise<QaapProjectDescriptor | undefined> {
        const packageJsonUri = rootUri.resolve('package.json');
        if (!(await this.fileService.exists(packageJsonUri))) {
            return undefined;
        }

        let pkg: PackageJsonShape;
        try {
            const content = await this.fileService.read(packageJsonUri);
            pkg = JSON.parse(content.value || '{}') as PackageJsonShape;
        } catch {
            return undefined;
        }

        const name = typeof pkg.name === 'string' && pkg.name.trim().length > 0
            ? pkg.name.trim()
            : rootUri.path.base || 'project';

        const packageManager = await this.detectPackageManager(rootUri, pkg);
        const installCommand = buildBootstrapInstallCommand(packageManager);

        const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        const devScriptKey = this.pickDevScript(scripts);
        const { kind, expectedPort } = this.guessFramework(pkg);

        let devCommand: string | undefined;
        let devCommandLabel: string | undefined;
        if (devScriptKey) {
            devCommand = this.buildRunCommand(packageManager, devScriptKey);
            devCommandLabel = devCommand;
        }

        const { flavor, apps } = await this.detectMonorepo(rootUri, pkg, packageManager);
        const nodeModulesPresent = await this.resolveNodeModulesPresent(rootUri, kind, packageManager, apps);

        return {
            rootUri,
            name,
            kind,
            packageManager,
            installCommand,
            devCommand,
            devCommandLabel,
            expectedPort,
            nodeModulesPresent,
            monorepoFlavor: flavor,
            apps,
        };
    }

    /**
     * Returns the monorepo flavor (workspaces / turbo / nx / pnpm-workspace / …) and the runnable
     * sub-apps. Apps are filtered to ones that ship a `dev`-like script so the UI can offer them
     * as one-tap previews. When no marker is found and the workspace contains conventional
     * `apps/*` or `packages/*` folders with `package.json`, we treat it as an implicit monorepo.
     */
    protected async detectMonorepo(
        rootUri: URI,
        pkg: PackageJsonShape,
        pm: QaapPackageManager,
    ): Promise<{ flavor: QaapMonorepoFlavor | undefined; apps: QaapMonorepoAppCandidate[] }> {
        const { flavor, patterns } = await this.detectMonorepoLayout(rootUri, pkg);
        if (!flavor && patterns.length === 0) {
            return { flavor: undefined, apps: [] };
        }
        const candidateUris = await this.resolveWorkspacePatterns(rootUri, patterns);
        const apps: QaapMonorepoAppCandidate[] = [];
        for (const appUri of candidateUris) {
            if (apps.length >= MAX_MONOREPO_APPS) {
                break;
            }
            const candidate = await this.toAppCandidate(rootUri, appUri, pm);
            if (candidate) {
                apps.push(candidate);
            }
        }
        // Keep apps in a stable, predictable order: `apps/*` first, then alphabetically.
        apps.sort((a, b) => {
            const aIsApps = a.relativePath.startsWith('apps/') ? 0 : 1;
            const bIsApps = b.relativePath.startsWith('apps/') ? 0 : 1;
            if (aIsApps !== bIsApps) {
                return aIsApps - bIsApps;
            }
            return a.relativePath.localeCompare(b.relativePath);
        });
        if (apps.length === 0) {
            return { flavor, apps: [] };
        }
        return { flavor: flavor ?? 'implicit', apps };
    }

    /**
     * Resolves the workspace marker (pnpm-workspace.yaml, package.json `workspaces`, turbo.json,
     * nx.json, lerna.json) and returns the glob patterns to enumerate. Falls back to the
     * conventional `apps/*` / `packages/*` set when only a build-graph file (turbo/nx) is found
     * without an explicit packages list.
     */
    protected async detectMonorepoLayout(
        rootUri: URI,
        pkg: PackageJsonShape,
    ): Promise<{ flavor: QaapMonorepoFlavor | undefined; patterns: string[] }> {
        const pnpmWorkspace = rootUri.resolve('pnpm-workspace.yaml');
        if (await this.fileService.exists(pnpmWorkspace)) {
            try {
                const content = await this.fileService.read(pnpmWorkspace);
                let patterns = parsePnpmWorkspaceYaml(content.value || '');
                if (patterns.length === 0) {
                    patterns = this.parseNpmWorkspacesField(pkg.workspaces);
                }
                if (patterns.length === 0) {
                    patterns = await this.implicitMonorepoPatterns(rootUri);
                }
                return { flavor: 'pnpm-workspace', patterns };
            } catch {
                /* fall through */
            }
        }
        if (Array.isArray(pkg.workspaces) || (pkg.workspaces && typeof pkg.workspaces === 'object')) {
            const patterns = this.parseNpmWorkspacesField(pkg.workspaces);
            const flavor = await this.workspacesFlavorFromLockfiles(rootUri);
            return { flavor, patterns };
        }
        const lernaJson = rootUri.resolve('lerna.json');
        if (await this.fileService.exists(lernaJson)) {
            try {
                const content = await this.fileService.read(lernaJson);
                const parsed = JSON.parse(content.value || '{}');
                if (Array.isArray(parsed.packages)) {
                    return { flavor: 'lerna', patterns: this.coercePatternArray(parsed.packages) };
                }
            } catch {
                /* fall through */
            }
            // lerna without explicit `packages` defaults to packages/*.
            return { flavor: 'lerna', patterns: ['packages/*'] };
        }
        const turboJson = rootUri.resolve('turbo.json');
        if (await this.fileService.exists(turboJson)) {
            return { flavor: 'turborepo', patterns: ['apps/*', 'packages/*'] };
        }
        const nxJson = rootUri.resolve('nx.json');
        if (await this.fileService.exists(nxJson)) {
            return { flavor: 'nx', patterns: ['apps/*', 'packages/*', 'libs/*'] };
        }
        const implicitPatterns = await this.implicitMonorepoPatterns(rootUri);
        return { flavor: implicitPatterns.length ? 'implicit' : undefined, patterns: implicitPatterns };
    }

    protected async implicitMonorepoPatterns(rootUri: URI): Promise<string[]> {
        const implicitPatterns: string[] = [];
        for (const dir of IMPLICIT_MONOREPO_DIRS) {
            if (await this.fileService.exists(rootUri.resolve(dir))) {
                implicitPatterns.push(`${dir}/*`);
            }
        }
        return implicitPatterns;
    }

    protected async workspacesFlavorFromLockfiles(rootUri: URI): Promise<QaapMonorepoFlavor> {
        if (await this.fileService.exists(rootUri.resolve('pnpm-lock.yaml'))) {
            return 'pnpm-workspace';
        }
        if (await this.fileService.exists(rootUri.resolve('yarn.lock'))) {
            return 'yarn-workspaces';
        }
        return 'npm-workspaces';
    }

    protected parseNpmWorkspacesField(field: unknown): string[] {
        if (Array.isArray(field)) {
            return this.coercePatternArray(field);
        }
        if (field && typeof field === 'object') {
            const packages = (field as { packages?: unknown }).packages;
            if (Array.isArray(packages)) {
                return this.coercePatternArray(packages);
            }
        }
        return [];
    }

    protected coercePatternArray(items: unknown[]): string[] {
        const out: string[] = [];
        for (const item of items) {
            if (typeof item === 'string' && item.trim().length > 0) {
                out.push(item.trim());
            }
        }
        return out;
    }

    /**
     * Expands the workspace globs into folder URIs. Only the trailing `*` pattern is supported
     * (`apps/*`, `packages/*`, `services/*`, …) — that covers virtually every monorepo we have
     * seen in the wild and avoids pulling in a glob dependency.
     */
    protected async resolveWorkspacePatterns(rootUri: URI, patterns: string[]): Promise<URI[]> {
        const seen = new Set<string>();
        const out: URI[] = [];
        for (const pattern of patterns) {
            const sanitized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
            if (sanitized.includes('**')) {
                // Skip deep globs; we deliberately keep this scan bounded.
                continue;
            }
            if (sanitized.endsWith('/*')) {
                const parentRel = sanitized.slice(0, -2);
                const parentUri = parentRel.length ? rootUri.resolve(parentRel) : rootUri;
                if (!(await this.fileService.exists(parentUri))) {
                    continue;
                }
                try {
                    const stat = await this.fileService.resolve(parentUri);
                    for (const child of stat.children ?? []) {
                        if (!child.isDirectory) {
                            continue;
                        }
                        if (child.name.startsWith('.') || child.name === 'node_modules') {
                            continue;
                        }
                        const key = child.resource.toString();
                        if (seen.has(key)) {
                            continue;
                        }
                        seen.add(key);
                        out.push(child.resource);
                    }
                } catch {
                    /* directory not readable — skip */
                }
                continue;
            }
            if (sanitized.includes('*')) {
                // Other wildcards aren't supported yet; ignore quietly.
                continue;
            }
            // Plain folder reference (no glob): treat as a single app.
            const direct = rootUri.resolve(sanitized);
            if (await this.fileService.exists(direct)) {
                const key = direct.toString();
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(direct);
                }
            }
        }
        return out;
    }

    protected async toAppCandidate(
        rootUri: URI,
        appUri: URI,
        rootPm: QaapPackageManager,
    ): Promise<QaapMonorepoAppCandidate | undefined> {
        const packageJsonUri = appUri.resolve('package.json');
        if (!(await this.fileService.exists(packageJsonUri))) {
            return undefined;
        }
        let pkg: PackageJsonShape;
        try {
            const content = await this.fileService.read(packageJsonUri);
            pkg = JSON.parse(content.value || '{}') as PackageJsonShape;
        } catch {
            return undefined;
        }
        const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        const devScriptKey = this.pickDevScript(scripts);
        if (!devScriptKey) {
            return undefined;
        }
        const { kind, expectedPort } = this.guessFramework(pkg);
        const pkgName = typeof pkg.name === 'string' && pkg.name.trim().length > 0
            ? pkg.name.trim()
            : appUri.path.base || 'app';
        const devCommand = this.buildMonorepoDevCommand(rootPm, devScriptKey, pkgName);
        const relativePath = this.relativePathFromRoot(rootUri, appUri) ?? pkgName;
        return {
            rootUri: appUri,
            relativePath,
            name: pkgName,
            kind,
            devCommand,
            devCommandLabel: devCommand,
            expectedPort,
        };
    }

    protected relativePathFromRoot(rootUri: URI, appUri: URI): string | undefined {
        const rel = rootUri.relative(appUri);
        if (!rel) {
            return undefined;
        }
        return rel.toString().replace(/\\/g, '/');
    }

    protected async detectPackageManager(rootUri: URI, pkg: PackageJsonShape): Promise<QaapPackageManager> {
        if (typeof pkg.packageManager === 'string') {
            const fromField = parseDeclaredPackageManager(pkg.packageManager);
            if (fromField) {
                return fromField;
            }
        }
        const npmrcUri = rootUri.resolve('.npmrc');
        if (await this.fileService.exists(npmrcUri)) {
            try {
                const npmrc = await this.fileService.read(npmrcUri);
                const fromNpmrc = parseNpmrcPackageManager(npmrc.value || '');
                if (fromNpmrc) {
                    return fromNpmrc;
                }
            } catch {
                /* ignore unreadable .npmrc */
            }
        }
        for (const [lockfile, pm] of LOCKFILE_TO_PM) {
            if (await this.fileService.exists(rootUri.resolve(lockfile))) {
                return pm;
            }
        }
        return 'npm';
    }

    protected async resolveNodeModulesPresent(
        rootUri: URI,
        kind: QaapProjectKind,
        pm: QaapPackageManager,
        apps: QaapMonorepoAppCandidate[],
    ): Promise<boolean> {
        const hasRootModules = await this.fileService.exists(rootUri.resolve('node_modules'));
        if (!hasRootModules) {
            return false;
        }
        if (pm === 'pnpm' && await this.fileService.exists(rootUri.resolve('node_modules/.pnpm'))) {
            return true;
        }
        if (apps.length > 0) {
            for (const app of apps) {
                if (await this.isDevToolingPresent(app.rootUri, app.kind, rootUri)) {
                    return true;
                }
            }
        }
        return this.isDevToolingPresent(rootUri, kind, rootUri);
    }

    /**
     * `node_modules` alone is not enough on Docker (NODE_ENV=production installs omit devDependencies).
     * Require the CLI shim the dev script needs when we can infer it.
     * Monorepo apps often hoist binaries to the workspace root (pnpm/npm workspaces).
     */
    protected async isDevToolingPresent(
        packageRootUri: URI,
        kind: QaapProjectKind,
        workspaceRootUri?: URI,
    ): Promise<boolean> {
        const bin = this.devToolBinaryForKind(kind);
        if (!bin) {
            return true;
        }
        if (await this.fileService.exists(packageRootUri.resolve(`node_modules/.bin/${bin}`))) {
            return true;
        }
        const workspaceRoot = workspaceRootUri ?? packageRootUri;
        if (workspaceRoot.toString() !== packageRootUri.toString()) {
            return this.fileService.exists(workspaceRoot.resolve(`node_modules/.bin/${bin}`));
        }
        return false;
    }

    protected devToolBinaryForKind(kind: QaapProjectKind): string | undefined {
        switch (kind) {
            case 'node-vite':
            case 'node-svelte':
                return 'vite';
            case 'node-next':
                return 'next';
            case 'node-nuxt':
                return 'nuxt';
            case 'node-astro':
                return 'astro';
            case 'node-remix':
                return 'remix';
            case 'node-cra':
                return 'react-scripts';
            default:
                return undefined;
        }
    }

    protected buildRunCommand(pm: QaapPackageManager, script: string): string {
        switch (pm) {
            case 'pnpm': return `pnpm run ${script}`;
            case 'yarn': return `yarn ${script}`;
            case 'bun': return `bun run ${script}`;
            default: return `npm run ${script}`;
        }
    }

    /**
     * pnpm workspaces must run from the repo root via `--filter`, not `pnpm run dev` inside the
     * package folder (Docker/VPS often only has pnpm via Corepack at the workspace root).
     */
    protected buildMonorepoDevCommand(pm: QaapPackageManager, script: string, packageName: string): string {
        if (pm === 'pnpm') {
            const quoted = packageName.replace(/'/g, `'\\''`);
            return `pnpm --filter '${quoted}' ${script}`;
        }
        return this.buildRunCommand(pm, script);
    }

    protected pickDevScript(scripts: Record<string, unknown>): string | undefined {
        const available = Object.keys(scripts).filter(k => typeof scripts[k] === 'string');
        for (const key of DEV_SCRIPT_PRIORITY) {
            if (available.includes(key)) {
                return key;
            }
        }
        return undefined;
    }

    protected guessFramework(pkg: PackageJsonShape): { kind: QaapProjectKind; expectedPort?: number } {
        const allDeps: Record<string, unknown> = {
            ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
            ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
        };
        for (const [dep, kind, port] of FRAMEWORK_BY_DEP) {
            if (dep in allDeps) {
                return { kind, expectedPort: port };
            }
        }
        if ('@theia/core' in allDeps || '@theia/cli' in allDeps) {
            return { kind: 'node-generic', expectedPort: QAAP_THEIA_DEV_PORT };
        }
        const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        const start = scripts.start;
        if (typeof start === 'string' && /\btheia\s+start\b/.test(start)) {
            return { kind: 'node-generic', expectedPort: QAAP_THEIA_DEV_PORT };
        }
        return { kind: 'node-generic' };
    }
}
