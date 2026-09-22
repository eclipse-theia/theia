// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { execFile } from 'child_process';
import { constants, promises as fs } from 'fs';
import { createRequire } from 'module';
import { delimiter, dirname, join } from 'path';
import { promisify } from 'util';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, nls } from '@theia/core';

const execFileAsync = promisify(execFile);

/**
 * Environment variable that points at the Copilot CLI, honored by the Copilot SDK as well.
 */
export const COPILOT_CLI_PATH_ENV = 'COPILOT_CLI_PATH';

/**
 * Time after which looking up the global npm installation directory is given up on.
 */
const NPM_ROOT_TIMEOUT_MS = 5_000;

/**
 * Locates the executable of the GitHub Copilot CLI on the machine running the backend.
 *
 * The CLI is a native executable that GitHub ships in a platform-specific package. It is looked up
 * rather than bundled, because it is a large proprietary binary that an application does not
 * necessarily carry: a packaged application (for example an AppImage) cannot execute a binary from
 * inside its archive, and an installation may deliberately not ship it at all. Users install the CLI
 * themselves, the same way as for the Claude Code integration.
 *
 * The native executable is resolved rather than the `index.js` entry point of the same package, so
 * that it can be spawned directly. Spawning the JavaScript entry point would require a Node.js
 * executable, which the backend does not have at hand: `process.execPath` is the Electron binary in
 * an Electron application, and starting that would start a second application instead of the CLI.
 */
@injectable()
export class CopilotCliLocator {

    @inject(ILogger) @named('ai-copilot:CopilotCliLocator')
    protected readonly logger: ILogger;

    protected configuredPath: string | undefined;
    protected resolution: Promise<string> | undefined;

    /**
     * Sets the location the user configured, which takes precedence over every other source.
     * A changed value discards what was resolved before.
     */
    setConfiguredPath(path: string | undefined): void {
        const configured = path?.trim() || undefined;
        if (configured !== this.configuredPath) {
            this.configuredPath = configured;
            this.resolution = undefined;
        }
    }

    /**
     * Resolves the executable of the Copilot CLI, and remembers it for later calls.
     * Rejects with an explanation of where it was searched when there is none.
     */
    async resolve(): Promise<string> {
        if (!this.resolution) {
            const resolution = this.doResolve();
            this.resolution = resolution;
            // Don't remember a failed lookup: the CLI can be installed while the backend is running.
            // Only this lookup is forgotten, a later one may already be running.
            resolution.catch(() => {
                if (this.resolution === resolution) {
                    this.resolution = undefined;
                }
            });
        }
        return this.resolution;
    }

    protected async doResolve(): Promise<string> {
        if (this.configuredPath) {
            const configured = await this.resolveConfiguredPath(this.configuredPath);
            if (!configured) {
                throw new Error(nls.localize('theia/ai/copilot/cliNotFoundAt',
                    'The configured GitHub Copilot CLI does not exist or is not executable: {0}', this.configuredPath));
            }
            return configured;
        }

        const attempted: string[] = [];
        for (const source of [
            () => this.environmentCandidates(),
            () => this.bundledCandidates(),
            () => this.pathCandidates(),
            () => this.globalInstallCandidates()
        ]) {
            let candidates: string[];
            try {
                candidates = await source();
            } catch (error) {
                this.logger.warn('Copilot: failed to look for the Copilot CLI:', error);
                continue;
            }
            for (const candidate of candidates) {
                if (await this.isExecutable(candidate)) {
                    this.logger.info(`Copilot: using the Copilot CLI at ${candidate}.`);
                    return candidate;
                }
                attempted.push(candidate);
            }
        }

        this.logger.warn(`Copilot: no Copilot CLI found, searched:\n${attempted.join('\n')}`);
        throw new Error(nls.localize('theia/ai/copilot/cliNotFound',
            'Could not find the GitHub Copilot CLI on the machine running the backend. Install it with '
            + '`npm install -g @github/copilot`, or set the `ai-features.copilot.executablePath` preference to the location of '
            + 'its executable. {0} locations were searched, see the backend log for the full list.', attempted.length));
    }

    /**
     * Accepts the configured location either as the executable itself or as the directory holding it,
     * so that both what a user has on their `PATH` and what a package manager installed can be given.
     *
     * A configured launcher is followed to the executable it would start, because that is what `which`
     * or `whereis` report for a global installation. Starting the launcher would work as well, but only
     * for as long as a Node.js is on the `PATH` of the backend, which is nothing to rely on.
     */
    protected async resolveConfiguredPath(configured: string): Promise<string | undefined> {
        const candidates = [configured, ...this.getCliFileNames().map(name => join(configured, name))];
        for (const candidate of candidates) {
            if (!await this.isExecutable(candidate)) {
                continue;
            }
            const target = await fs.realpath(candidate).catch(() => candidate);
            for (const mapped of this.toCandidatesOnPath(target)) {
                if (await this.isExecutable(mapped)) {
                    return mapped;
                }
            }
            // A launcher that leads nowhere is not usable: it cannot be spawned without a Node.js, and
            // a Windows shim cannot be spawned without a shell, which the Copilot SDK does not do either.
            if (!this.isLauncher(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }

    /**
     * The location given in the environment, resolved the same way as a configured one.
     *
     * The variable is documented as doing what the preference does, so a directory or a launcher is
     * accepted here as well. A value that leads nowhere is reported and then left behind rather than
     * turned into an error, so that the remaining sources still get their chance.
     */
    protected async environmentCandidates(): Promise<string[]> {
        const configured = process.env[COPILOT_CLI_PATH_ENV]?.trim();
        if (!configured) {
            return [];
        }
        const resolved = await this.resolveConfiguredPath(configured);
        if (resolved) {
            return [resolved];
        }
        // A launcher that could not be followed is dropped rather than kept as a candidate, because it
        // would be spawned and cannot work. Everything else is kept, so that the error names it.
        this.logger.warn(`Copilot: ${COPILOT_CLI_PATH_ENV} does not point at a usable Copilot CLI: ${configured}`);
        return this.isLauncher(configured) ? [] : [configured];
    }

    /**
     * The executable of a platform package that was installed alongside this application, if any.
     *
     * Both the module paths of this file and those of the Copilot SDK are searched, so that the
     * package is found whether the installation hoisted it or nested it below the SDK.
     */
    protected async bundledCandidates(): Promise<string[]> {
        const candidates = [...this.resolvedCandidates(__filename)];
        try {
            const resolver = createRequire(__filename);
            candidates.push(...this.resolvedCandidates(resolver.resolve('@github/copilot-sdk')));
            for (const base of resolver.resolve.paths('@github/copilot') ?? []) {
                candidates.push(...this.toPlatformPackageCandidates(base));
            }
        } catch (error) {
            // The SDK is not installed next to us; what was resolved from this file remains.
        }
        return candidates;
    }

    /**
     * The executable of a platform package as Node.js resolves it from the given file.
     *
     * This is how the launcher of the CLI finds its own executable, and it is the only lookup that
     * covers every layout: an installation hoists the platform package next to the launcher, while a
     * global installation nests it below the launcher instead. The package points its main entry at
     * the executable, so the directory of what was resolved is the directory holding it.
     */
    protected resolvedCandidates(anchor: string): string[] {
        const candidates: string[] = [];
        for (const packageName of this.getCliPlatformPackageNames()) {
            try {
                candidates.push(join(dirname(createRequire(anchor).resolve(packageName)), this.getBinaryName()));
            } catch (error) {
                // No such package below this anchor.
            }
        }
        return candidates;
    }

    /**
     * The executable of a CLI that is on the `PATH` of the backend process.
     *
     * A global npm installation does not put the executable itself there but a launcher: a link to
     * the JavaScript entry point on Linux and macOS, and a `.cmd` shim on Windows. Such a hit is
     * therefore mapped to the platform package it belongs to, see {@link toCandidatesOnPath}.
     */
    protected async pathCandidates(): Promise<string[]> {
        const candidates: string[] = [];
        for (const entry of (process.env.PATH ?? '').split(delimiter)) {
            if (!entry) {
                continue;
            }
            for (const name of this.getCliFileNames()) {
                const candidate = join(entry, name);
                try {
                    candidates.push(...this.toCandidatesOnPath(await fs.realpath(candidate)));
                } catch (error) {
                    // No CLI of this name in this entry of the PATH.
                }
            }
        }
        return candidates;
    }

    /**
     * Interprets what a `copilot` on the `PATH` points at: a launcher of a global npm installation is
     * mapped to the executable of the platform package it would start, anything else is taken to be
     * the executable itself.
     */
    protected toCandidatesOnPath(target: string): string[] {
        if (this.isJsEntryPoint(target)) {
            // `<node_modules>/@github/copilot/npm-loader.js`, so resolve from the launcher itself and
            // fall back to `<node_modules>`, which is where a hoisting installation puts the package.
            return [...this.resolvedCandidates(target), ...this.moduleDirectoryCandidates(dirname(dirname(dirname(target))))];
        }
        if (this.isShim(target)) {
            // `<npm prefix>/copilot.cmd` on Windows, which is not a link to the entry point but a batch
            // file next to the module directory the installation wrote.
            return this.moduleDirectoryCandidates(join(dirname(target), 'node_modules'));
        }
        return [target];
    }

    /**
     * The executable of a globally installed CLI, for the case that the global binary directory is
     * not on the `PATH` of the backend process. That is common when the application was started from
     * a desktop launcher rather than from a shell.
     */
    protected async globalInstallCandidates(): Promise<string[]> {
        try {
            // Through a shell on Windows, where `npm` is a `.cmd` that cannot be spawned directly.
            const { stdout } = await execFileAsync('npm', ['root', '-g'], {
                timeout: NPM_ROOT_TIMEOUT_MS,
                windowsHide: true,
                shell: process.platform === 'win32'
            });
            return this.moduleDirectoryCandidates(stdout.trim());
        } catch (error) {
            this.logger.debug('Copilot: could not determine the global npm directory:', error);
            return [];
        }
    }

    /**
     * The executables a module directory can hold the CLI in.
     *
     * A global installation nests the platform package below the launcher rather than hoisting it, so
     * the launcher is used to resolve from, and the hoisted layout is tried as well.
     */
    protected moduleDirectoryCandidates(modules: string): string[] {
        if (!modules) {
            return [];
        }
        return [
            ...this.resolvedCandidates(join(modules, '@github', 'copilot', 'npm-loader.js')),
            ...this.toPlatformPackageCandidates(modules)
        ];
    }

    /**
     * The executables the platform packages of this host would have below the given module directory.
     */
    protected toPlatformPackageCandidates(base: string): string[] {
        if (!base) {
            return [];
        }
        return this.getCliPlatformPackageNames().map(packageName => join(base, ...packageName.split('/'), this.getBinaryName()));
    }

    /**
     * The platform-specific packages that can carry the CLI for this host.
     * On Linux both the glibc and the musl build are candidates.
     */
    protected getCliPlatformPackageNames(): string[] {
        const variants = process.platform === 'linux' ? ['linux', 'linuxmusl'] : [process.platform];
        return variants.map(variant => `@github/copilot-${variant}-${process.arch}`);
    }

    protected getBinaryName(): string {
        return process.platform === 'win32' ? 'copilot.exe' : 'copilot';
    }

    /**
     * The names a CLI can go by in a directory that is on the `PATH` or that a user configured: the
     * executable itself, and on Windows in addition the shim a global npm installation writes, since
     * that is the only entry it puts there.
     */
    protected getCliFileNames(): string[] {
        return process.platform === 'win32' ? [this.getBinaryName(), 'copilot.cmd'] : [this.getBinaryName()];
    }

    /**
     * Whether the given path is something that starts the CLI rather than the CLI itself, which is
     * either its JavaScript entry point or a shim of a global installation.
     */
    protected isLauncher(path: string): boolean {
        return this.isJsEntryPoint(path) || this.isShim(path);
    }

    protected isJsEntryPoint(path: string): boolean {
        return path.endsWith('.js') || path.endsWith('.mjs');
    }

    protected isShim(path: string): boolean {
        return /\.(cmd|bat|ps1)$/i.test(path);
    }

    protected async isExecutable(path: string): Promise<boolean> {
        try {
            const stats = await fs.stat(path);
            if (!stats.isFile()) {
                return false;
            }
            // The executable bit is not modelled on Windows, where every file passes this check.
            await fs.access(path, constants.X_OK);
            return true;
        } catch (error) {
            return false;
        }
    }
}
