// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

// @ts-check
describe('Explorer and Editor - open and close', function () {
    this.timeout(90_000);
    const { assert } = chai;

    const { DisposableCollection } = require('@theia/core/lib/common/disposable');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');
    const { ProgressStatusBarItem } = require('@theia/core/lib/browser/progress-status-bar-item');
    const { EXPLORER_VIEW_CONTAINER_ID } = require('@theia/navigator/lib/browser/navigator-widget-factory');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const shell = container.get(ApplicationShell);
    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const pluginService = container.get(HostedPluginSupport);
    const progressStatusBarItem = container.get(ProgressStatusBarItem);


    const fileUri = rootUri.resolve('webpack.config.js');
    const toTearDown = new DisposableCollection();

    function pause(ms = 500) {
        console.debug(`pause test for: ${ms} ms`);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    before(async () => {
        await pluginService.didStart;
        await editorManager.closeAll({ save: false });
    });

    afterEach(async () => {
        await editorManager.closeAll({ save: false });
        await navigatorContribution.closeView();
    });

    after(async () => {
        toTearDown.dispose();
    });

    for (var i = 0; i < 5; i++) {
        let ordering = 0;
        it('Open/Close explorer and editor - ordering: ' + ordering++ + ', iteration #' + i, async function () {
            await openExplorer();
            await openEditor();
            await closeEditor();
            await closeExplorer();
        });

        it('Open/Close explorer and editor - ordering: ' + ordering++ + ', iteration  #' + i, async function () {
            await openExplorer();
            await openEditor();
            await closeExplorer();
            await closeEditor();
        });

        it('Open/Close editor, explorer - ordering: ' + ordering++ + ', iteration  - #' + i, async function () {
            await openEditor();
            await openExplorer();
            await closeEditor();
            await closeExplorer();
        });

        it('Open/Close editor, explorer - ordering: ' + ordering++ + ', iteration  - #' + i, async function () {
            await openEditor();
            await openExplorer();
            await closeExplorer();
            await closeEditor();
        });

        it('Open/Close explorer #' + i, async function () {
            await openExplorer();
            await closeExplorer();
        });
    }

    it('open/close explorer in quick succession', async function () {
        for (let i = 0; i < 20; i++) {
            await openExplorer();
            await closeExplorer();
        }
    });

    it('open/close editor in quick succession', async function () {
        await openExplorer();
        for (let i = 0; i < 20; i++) {
            await openEditor();
            await closeEditor();
        }
    });

    async function openExplorer() {
        await navigatorContribution.openView({ activate: true });
        const widget = await shell.revealWidget(EXPLORER_VIEW_CONTAINER_ID);
        assert.isDefined(widget, 'Explorer widget should exist');
    }
    async function closeExplorer() {
        await navigatorContribution.closeView();
        assert.isUndefined(await shell.revealWidget(EXPLORER_VIEW_CONTAINER_ID), 'Explorer widget should not exist');
    }

    async function openEditor() {
        await editorManager.open(fileUri, { mode: 'activate' });
        const activeEditor = /** @type {MonacoEditor} */ MonacoEditor.get(editorManager.activeEditor);
        assert.isDefined(activeEditor);
        assert.equal(activeEditor.uri.resolveToAbsolute().toString(), fileUri.resolveToAbsolute().toString());
    }

    async function closeEditor() {
        await editorManager.closeAll({ save: false });
        const activeEditor = /** @type {MonacoEditor} */ MonacoEditor.get(editorManager.activeEditor);
        assert.isUndefined(activeEditor);
    }

});
