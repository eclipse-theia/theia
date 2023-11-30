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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Page, PlaywrightWorkerArgs, _electron as electron } from '@playwright/test';
import { TheiaApp, TheiaAppMainPageObjects } from './theia-app';
import { TheiaWorkspace } from './theia-workspace';

export interface TheiaAppFactory<T extends TheiaApp> {
    new(page: Page, initialWorkspace?: TheiaWorkspace, mainPageObjects?: TheiaAppMainPageObjects): T;
}

function theiaAppFactory<T extends TheiaApp>(factory?: TheiaAppFactory<T>): TheiaAppFactory<T> {
    return (factory ?? TheiaApp) as TheiaAppFactory<T>;
}

function initializeWorkspace(initialWorkspace?: TheiaWorkspace): TheiaWorkspace {
    const workspace = initialWorkspace ? initialWorkspace : new TheiaWorkspace();
    workspace.initialize();
    return workspace;
}

export class TheiaBrowserAppLoader {

    static async load<T extends TheiaApp>(
        page: Page,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>
    ): Promise<T> {
        const workspace = initializeWorkspace(initialWorkspace);
        return this.createAndLoad<T>(page, workspace, factory);
    }

    protected static async createAndLoad<T extends TheiaApp>(
        page: Page,
        workspace: TheiaWorkspace,
        factory?: TheiaAppFactory<T>
    ): Promise<T> {
        const appFactory = theiaAppFactory<T>(factory);
        const app = new appFactory(page, workspace);
        await this.loadOrReload(app, '/#' + app.workspace.urlEncodedPath);
        await app.waitForShellAndInitialized();
        return app;
    }

    protected static async loadOrReload(app: TheiaApp, url: string): Promise<void> {
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

export class TheiaElectronAppLoader {

    static async load<T extends TheiaApp>(
        launchOptions: ElectronLaunchOptions | object,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>,
    ): Promise<T> {
        const workspace = initializeWorkspace(initialWorkspace);
        const playwrightOptions = this.toPlaywrightOptions(launchOptions, initialWorkspace);
        const electronApp = await electron.launch(playwrightOptions);
        const page = await electronApp.firstWindow();
        const appFactory = theiaAppFactory<T>(factory);
        const app = new appFactory(page, workspace);
        await app.waitForShellAndInitialized();
        return app;
    }

    protected static toPlaywrightOptions(
        electronLaunchOptions: ElectronLaunchOptions | object,
        workspace?: TheiaWorkspace
    ): object {
        if (electronLaunchOptions instanceof ElectronLaunchOptions) {
            return electronLaunchOptions.playwrightOptions(workspace);
        }
        return electronLaunchOptions;
    }
}

export class ElectronLaunchOptions {

    constructor(
        protected readonly electronAppPath: string,
        protected readonly pluginsPath?: string,
        protected readonly additionalArgs: string[] = ['--no-cluster']
    ) { }

    playwrightOptions(workspace?: TheiaWorkspace): object {
        const executablePath = this.electronAppPath + '/node_modules/.bin/electron';
        const args: string[] = [];
        args.push(this.electronAppPath);
        args.push(...this.additionalArgs);
        args.push(`--app-project-path=${this.electronAppPath}`);
        if (this.pluginsPath) {
            args.push(`--plugins=local-dir:${this.pluginsPath}`);
        };
        if (workspace) {
            args.push(workspace.path);
        }
        return { executablePath, args };
    }
}

// TODO this is just a sketch, we need a proper way to configure tests and pass this configuration to the `TheiaAppLoader`:

interface TheiaPlaywrightTestConfig {
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

export class TheiaAppLoader {
    static async load<T extends TheiaApp>(
        args: TheiaPlaywrightTestConfig & PlaywrightWorkerArgs,
        initialWorkspace?: TheiaWorkspace,
        factory?: TheiaAppFactory<T>,
    ): Promise<T> {
        if (args.useElectron) {
            return TheiaAppLoader.launchElectron<T>(args, factory, initialWorkspace);
        }
        const page = await args.browser.newPage();
        return TheiaBrowserAppLoader.load(page, initialWorkspace, factory);
    }

    private static launchElectron<T extends TheiaApp>(
        args: TheiaPlaywrightTestConfig & PlaywrightWorkerArgs,
        factory?: TheiaAppFactory<T>,
        initialWorkspace?: TheiaWorkspace
    ): Promise<T> {
        const electronConfig = args.useElectron;
        if (electronConfig === undefined || electronConfig.launchOptions === undefined && electronConfig.electronAppPath === undefined) {
            throw Error('The Theia Playwright configuration must either specify `useElectron.electronAppPath` or `useElectron.launchOptions`');
        }
        const appPath = electronConfig.electronAppPath!;
        const pluginsPath = electronConfig.pluginsPath;
        const launchOptions = electronConfig.launchOptions ?? new ElectronLaunchOptions(appPath, pluginsPath).playwrightOptions(initialWorkspace);
        return TheiaElectronAppLoader.load(launchOptions, initialWorkspace, factory);
    }
}
