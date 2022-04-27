// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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

import { Page } from '@playwright/test';
import { TheiaEditor } from './theia-editor';
import { DOT_FILES_FILTER, TheiaExplorerView } from './theia-explorer-view';
import { TheiaMenuBar } from './theia-main-menu';
import { TheiaPreferenceScope, TheiaPreferenceView } from './theia-preference-view';
import { TheiaQuickCommandPalette } from './theia-quick-command-palette';
import { TheiaStatusBar } from './theia-status-bar';
import { TheiaView } from './theia-view';
import { TheiaWorkspace } from './theia-workspace';

export interface TheiaAppData {
    loadingSelector: string;
    shellSelector: string;
};

export const DefaultTheiaAppData: TheiaAppData = {
    loadingSelector: '.theia-preload',
    shellSelector: '.theia-ApplicationShell'
};

export class TheiaApp {

    readonly statusBar = new TheiaStatusBar(this);
    readonly quickCommandPalette = new TheiaQuickCommandPalette(this);
    readonly menuBar = new TheiaMenuBar(this);
    public workspace: TheiaWorkspace;

    static async load(page: Page, initialWorkspace?: TheiaWorkspace): Promise<TheiaApp> {
        return this.loadApp(page, TheiaApp, initialWorkspace);
    }

    static async loadApp<T extends TheiaApp>(page: Page, appFactory: { new(page: Page, initialWorkspace?: TheiaWorkspace): T }, initialWorkspace?: TheiaWorkspace): Promise<T> {
        const app = new appFactory(page, initialWorkspace);
        await app.load();
        return app;
    }

    public constructor(public page: Page, initialWorkspace?: TheiaWorkspace, protected appData = DefaultTheiaAppData) {
        this.workspace = initialWorkspace ? initialWorkspace : new TheiaWorkspace();
        this.workspace.initialize();
    }

    protected async load(): Promise<void> {
        await this.loadOrReload(this.page, '/#' + this.workspace.urlEncodedPath);
        await this.page.waitForSelector(this.appData.loadingSelector, { state: 'detached' });
        await this.page.waitForSelector(this.appData.shellSelector);
        await this.waitForInitialized();
    }

    protected async loadOrReload(page: Page, url: string): Promise<void> {
        if (page.url() === url) {
            await page.reload();
        } else {
            const wasLoadedAlready = await page.isVisible(this.appData.shellSelector);
            await page.goto(url);
            if (wasLoadedAlready) {
                // Theia doesn't refresh on URL change only
                // So we need to reload if the app was already loaded before
                await page.reload();
            }
        }
    }

    async isMainContentPanelVisible(): Promise<boolean> {
        const contentPanel = await this.page.$('#theia-main-content-panel');
        return !!contentPanel && contentPanel.isVisible();
    }

    async openPreferences(viewFactory: { new(app: TheiaApp): TheiaPreferenceView }, preferenceScope = TheiaPreferenceScope.Workspace): Promise<TheiaPreferenceView> {
        const view = new viewFactory(this);
        if (await view.isTabVisible()) {
            await view.activate();
            return view;
        }
        await view.open(preferenceScope);
        return view;
    }

    async openView<T extends TheiaView>(viewFactory: { new(app: TheiaApp): T }): Promise<T> {
        const view = new viewFactory(this);
        if (await view.isTabVisible()) {
            await view.activate();
            return view;
        }
        await view.open();
        return view;
    }

    async openEditor<T extends TheiaEditor>(filePath: string, editorFactory: { new(filePath: string, app: TheiaApp): T },
        editorName?: string, expectFileNodes = true): Promise<T> {
        const explorer = await this.openView(TheiaExplorerView);
        if (!explorer) {
            throw Error('TheiaExplorerView could not be opened.');
        }
        if (expectFileNodes) {
            const fileStatElements = await explorer.visibleFileStatNodes(DOT_FILES_FILTER);
            if (fileStatElements.length < 1) {
                throw Error('TheiaExplorerView is empty.');
            }
        }
        const fileNode = await explorer.fileStatNode(filePath);
        if (!fileNode || ! await fileNode?.isFile()) {
            throw Error(`Specified path '${filePath}' could not be found or isn't a file.`);
        }

        const editor = new editorFactory(filePath, this);
        const contextMenu = await fileNode.openContextMenu();
        const editorToUse = editorName ? editorName : editor.name ? editor.name : undefined;
        if (editorToUse) {
            const menuItem = await contextMenu.menuItemByNamePath('Open With', editorToUse);
            if (!menuItem) {
                throw Error(`Editor named '${editorName}' could not be found in "Open With" menu.`);
            }
            await menuItem.click();
        } else {
            await contextMenu.clickMenuItem('Open');
        }

        await editor.waitForVisible();
        return editor;
    }

    async activateExistingEditor<T extends TheiaEditor>(filePath: string, editorFactory: { new(filePath: string, app: TheiaApp): T }): Promise<T> {
        const editor = new editorFactory(filePath, this);
        if (!await editor.isTabVisible()) {
            throw new Error(`Could not find opened editor for file ${filePath}`);
        }
        await editor.activate();
        await editor.waitForVisible();
        return editor;
    }

    /** Specific Theia apps may add additional conditions to wait for. */
    async waitForInitialized(): Promise<void> {
        // empty by default
    }

}
