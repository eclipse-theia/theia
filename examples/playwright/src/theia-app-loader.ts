// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { Page, PlaywrightWorkerArgs, _electron as electron } from '@playwright/test';
import { TheiaApp } from './theia-app';
import { TheiaWorkspace } from './theia-workspace';

export interface TheiaAppFactory<T extends TheiaApp> {
    new(page: Page, initialWorkspace: TheiaWorkspace, isElectron?: boolean): T;
}

// TODO this is just a sketch, we need a proper way to configure tests and pass this configuration to the `TheiaAppLoader`:
export interface TheiaPlaywrightTestConfig {
    useElectron?: {
        /** Path to the Theia Electron app package (absolute or relative to this package). */
        electronAppPath?: string,
        /** Path to the folder containing the plugins to load (absolute or relative to this package). */
        pluginsPath?: string,
        // eslint-disable-next-line max-len
        /** Electron launch options as [specified by Playwright](https://github.com/microsoft/playwright/blob/396487fc4c19bf27554eac9beea9db135e96cfb4/packages/playwright-core/types/types.d.ts#L14182). */
        launchOptions?: object,
    }
}

function theiaAppFactory<T extends TheiaApp>(factory?: TheiaAppFactory<T>): TheiaAppFactory<T> {
    return (factory ?? TheiaApp) as TheiaAppFactory<T>;
}

function initializeWorkspace(initialWorkspace?: TheiaWorkspace): TheiaWorkspace {
    const workspace = initialWorkspace ? initialWorkspace : new TheiaWorkspace();
    workspace.initialize();
    return workspace;
}

namespace TheiaBrowserAppLoader {

    export async function load<T extends TheiaApp>(
        page: Page,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>
    ): Promise<T> {
        const workspace = initializeWorkspace(initialWorkspace);
        return createAndLoad<T>(page, workspace, factory);
    }

    async function createAndLoad<T extends TheiaApp>(
        page: Page,
        workspace: TheiaWorkspace,
        factory?: TheiaAppFactory<T>
    ): Promise<T> {
        const appFactory = theiaAppFactory<T>(factory);
        const app = new appFactory(page, workspace, false);
        await loadOrReload(app, '/#' + app.workspace.pathAsPathComponent);
        await app.waitForShellAndInitialized();
        return app;
    }

    async function loadOrReload(app: TheiaApp, url: string): Promise<void> {
        if (app.page.url() === url) {
            await app.page.reload();
        } else {
            const wasLoadedAlready = await app.isShellVisible();
            await app.page.goto(url);
            if (wasLoadedAlready) {
                // Theia doesn't refresh on URL change only
                // So we need to reload if the app was already loaded before
                await app.page.reload();
            }
        }
    }
}

namespace TheiaElectronAppLoader {

    export async function load<T extends TheiaApp>(
        args: TheiaPlaywrightTestConfig & PlaywrightWorkerArgs,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>,
    ): Promise<T> {
        const workspace = initializeWorkspace(initialWorkspace);
        const electronConfig = args.useElectron ?? {
            electronAppPath: '../electron',
            pluginsPath: '../../plugins'
        };
        if (electronConfig === undefined || electronConfig.launchOptions === undefined && electronConfig.electronAppPath === undefined) {
            throw Error('The Theia Playwright configuration must either specify `useElectron.electronAppPath` or `useElectron.launchOptions`');
        }
        const appPath = electronConfig.electronAppPath!;
        const pluginsPath = electronConfig.pluginsPath;
        const launchOptions = electronConfig.launchOptions ?? {
            additionalArgs: ['--no-sandbox', '--no-cluster'],
            electronAppPath: appPath,
            pluginsPath: pluginsPath
        };
        const playwrightOptions = toPlaywrightOptions(launchOptions, workspace);
        console.log(`Launching Electron with options: ${JSON.stringify(playwrightOptions)}`);
        const electronApp = await electron.launch(playwrightOptions);
        const page = await electronApp.firstWindow();

        const appFactory = theiaAppFactory<T>(factory);
        const app = new appFactory(page, workspace, true);
        await app.waitForShellAndInitialized();
        return app;
    }

    export function toPlaywrightOptions(
        electronLaunchOptions: { additionalArgs: string[], electronAppPath: string, pluginsPath?: string } | object,
        workspace?: TheiaWorkspace
    ): {
        args: string[]
    } | object {
        if ('additionalArgs' in electronLaunchOptions && 'electronAppPath' in electronLaunchOptions) {
            const args = [
                electronLaunchOptions.electronAppPath,
                ...electronLaunchOptions.additionalArgs,
                `--app-project-path=${electronLaunchOptions.electronAppPath}`
            ];
            if (electronLaunchOptions.pluginsPath) {
                args.push(`--plugins=local-dir:${electronLaunchOptions.pluginsPath}`);
            }
            if (workspace) {
                args.push(workspace.path);
            }

            return {
                args: args
            };
        }
        return electronLaunchOptions;
    }
}

export namespace TheiaAppLoader {

    export async function load<T extends TheiaApp>(
        args: TheiaPlaywrightTestConfig & PlaywrightWorkerArgs,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>,
    ): Promise<T> {
        if (process.env.USE_ELECTRON === 'true') {
            // disable native elements and early window to avoid issues with the electron app
            process.env.THEIA_ELECTRON_DISABLE_NATIVE_ELEMENTS = '1';
            process.env.THEIA_ELECTRON_NO_EARLY_WINDOW = '1';
            process.env.THEIA_NO_SPLASH = 'true';
            return TheiaElectronAppLoader.load(args, initialWorkspace, factory);
        }
        const page = await args.browser.newPage();
        return TheiaBrowserAppLoader.load(page, initialWorkspace, factory);
    }
}
