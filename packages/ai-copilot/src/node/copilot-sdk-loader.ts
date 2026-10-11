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

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, nls } from '@theia/core';
import { CopilotCliLocator } from './copilot-cli-locator';
import type { CopilotClientConstructor, RuntimeConnectionFactory } from './copilot-sdk-types';

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
        const candidate = await this.importShipped(shipped) ?? this.tryImportInstalled();
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
            this.logger.info(`Copilot: no Copilot SDK next to the CLI at ${entry}, falling back to an installed one:`, error);
            return undefined;
        }
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
