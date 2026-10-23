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
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, nls } from '@theia/core';
import { CopilotCliLocator } from './copilot-cli-locator';
import { CopilotRuntimeEnv } from './copilot-runtime-env';
import type { CopilotClientConstructor, RuntimeConnectionFactory } from './copilot-sdk-types';

const execFileAsync = promisify(execFile);

/**
 * Time after which asking the Copilot CLI for its version is given up on. A CLI that is a single
 * executable unpacks its package when it is run for the first time, which can take a while.
 */
const CLI_VERSION_TIMEOUT_MS = 60_000;

/**
 * The part of the Copilot SDK this integration uses at runtime.
 */
export interface CopilotSdkApi {
    readonly CopilotClient: CopilotClientConstructor;
    readonly RuntimeConnection: RuntimeConnectionFactory;
}

/**
 * Provides the Copilot SDK that belongs to the Copilot CLI in use.
 *
 * The SDK is not a dependency of this extension. It is published as `@github/copilot-sdk`, but that
 * package depends on the CLI, which is a large proprietary binary that an application must not have
 * to ship, see {@link CopilotCliLocator}. The CLI carries its own copy of the SDK, so the one
 * belonging to the CLI that is actually going to serve the requests is loaded from there. What is used
 * of its API is mirrored in `copilot-sdk-types.ts` rather than taken from the package.
 *
 * An installed `@github/copilot-sdk` is used when the CLI does not carry one, so that an application
 * which does depend on the package keeps working.
 */
@injectable()
export class CopilotSdkLoader {

    @inject(CopilotCliLocator)
    protected readonly cliLocator: CopilotCliLocator;

    @inject(ILogger) @named('ai-copilot:CopilotSdkLoader')
    protected readonly logger: ILogger;

    protected loaded: Promise<CopilotSdkApi> | undefined;
    protected loadedFrom: string | undefined;

    /**
     * Loads the SDK, and remembers it for as long as the CLI it belongs to stays the same.
     */
    async load(): Promise<CopilotSdkApi> {
        const cli = await this.cliLocator.resolve();
        if (!this.loaded || this.loadedFrom !== cli) {
            this.loadedFrom = cli;
            this.loaded = this.doLoad(cli);
            // Don't remember a failed load: a different CLI can be configured while we are running.
            this.loaded.catch(() => {
                if (this.loadedFrom === cli) {
                    this.loaded = undefined;
                    this.loadedFrom = undefined;
                }
            });
        }
        return this.loaded;
    }

    protected async doLoad(cli: string): Promise<CopilotSdkApi> {
        const shipped = join(dirname(cli), 'copilot-sdk', 'index.js');
        const candidate = await this.importShipped(shipped) ?? await this.importUnpacked(cli) ?? this.tryImportInstalled();
        const api = this.toApi(candidate);
        if (!api) {
            throw new Error(nls.localize('theia/ai/copilot/sdkUnusable',
                'The GitHub Copilot CLI at {0} does not provide the interface this integration needs. '
                + 'Update it with `npm install -g @github/copilot`.', cli));
        }
        return api;
    }

    /**
     * Imports the copy of the SDK that ships with the CLI. It is an ES module, hence the import by URL.
     */
    protected async importShipped(entry: string): Promise<unknown | undefined> {
        try {
            const loaded = await this.dynamicImport(pathToFileURL(entry).href);
            this.logger.info(`Copilot: using the Copilot SDK at ${entry}.`);
            return loaded;
        } catch (error) {
            this.logger.info(`Copilot: no Copilot SDK at ${entry}:`, error);
            return undefined;
        }
    }

    /**
     * Imports the copy of the SDK of a CLI that is a single executable, which is how the platform packages
     * ship it since version 1.0.85. Such a CLI unpacks its package, the SDK included, into its package cache
     * when it is run. Asking it for its version does that as well, and tells which version to look for:
     * the CLI runs a newer version it has updated itself to, if there is one, rather than its own.
     */
    protected async importUnpacked(cli: string): Promise<unknown | undefined> {
        const version = await this.getCliVersion(cli);
        if (!version) {
            return undefined;
        }
        for (const directory of this.getPackageCacheDirectories()) {
            // The packages are kept per platform, for example `linux-x64`, and as `universal` for an update.
            const platforms = await fs.readdir(directory).catch(() => [] as string[]);
            for (const platform of platforms) {
                const entry = join(directory, platform, version, 'copilot-sdk', 'index.js');
                if (await fs.access(entry).then(() => true, () => false)) {
                    return this.importShipped(entry);
                }
            }
        }
        this.logger.info(`Copilot: no Copilot SDK of version ${version} in the package cache of the CLI at ${cli}.`);
        return undefined;
    }

    /**
     * The version the CLI reports, for example `1.0.103` of `GitHub Copilot CLI 1.0.103.`.
     */
    protected async getCliVersion(cli: string): Promise<string | undefined> {
        try {
            const { stdout } = await execFileAsync(cli, ['--version'], {
                timeout: CLI_VERSION_TIMEOUT_MS,
                windowsHide: true,
                env: CopilotRuntimeEnv.withoutTokens(process.env)
            });
            return /\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?/.exec(stdout)?.[0];
        } catch (error) {
            this.logger.info(`Copilot: could not determine the version of the CLI at ${cli}:`, error);
            return undefined;
        }
    }

    /**
     * The directories the CLI keeps its packages in, in the order in which the CLI searches them.
     */
    protected getPackageCacheDirectories(): string[] {
        const home = homedir();
        const directories = [
            process.env.COPILOT_PKG_CACHE_HOME,
            process.env.COPILOT_CACHE_HOME,
            // The cache directory of the platform, which is the next one on Linux.
            process.platform === 'darwin' ? join(home, 'Library', 'Caches', 'copilot') : undefined,
            process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(home, '.cache'), 'copilot') : undefined,
            join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'copilot'),
            process.env.COPILOT_HOME,
            join(home, '.copilot')
        ];
        return [...new Set(directories.filter((directory): directory is string => !!directory).map(directory => join(directory, 'pkg')))];
    }

    /**
     * Imports an installed SDK if there is one, so that a missing package is reported as the CLI not
     * providing what is needed rather than as a module that cannot be found.
     */
    protected tryImportInstalled(): unknown {
        try {
            return this.importInstalled();
        } catch (error) {
            this.logger.info('Copilot: no installed Copilot SDK either:', error);
            return undefined;
        }
    }

    /**
     * Imports an installed `@github/copilot-sdk`, for an application that depends on the package.
     */
    protected importInstalled(): unknown {
        // A real require is needed here: the ambient one is rewritten when the backend is bundled.
        return createRequire(__filename)('@github/copilot-sdk');
    }

    /**
     * Dynamic import through a constructed function, so that a bundler leaves it alone: what is
     * imported here is resolved on the machine running the backend, not at build time.
     */
    protected dynamicImport(url: string): Promise<unknown> {
        return new Function('url', 'return import(url)')(url);
    }

    /**
     * Checks that what was loaded provides what is used, so that an incompatible CLI is reported as
     * such instead of failing somewhere in the middle of a request.
     */
    protected toApi(loaded: unknown): CopilotSdkApi | undefined {
        const api = loaded as CopilotSdkApi | undefined;
        if (typeof api?.CopilotClient !== 'function' || typeof api?.RuntimeConnection?.forStdio !== 'function') {
            return undefined;
        }
        return api;
    }
}
