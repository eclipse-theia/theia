// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
describe('Find and Replace', function () {
    this.timeout(20_000);
    const { assert } = chai;

    const { animationFrame } = require('@theia/core/lib/browser/browser');
    const { DisposableCollection } = require('@theia/core/lib/common/disposable');
    const { CommonCommands } = require('@theia/core/lib/browser/common-frontend-contribution');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { KeybindingRegistry } = require('@theia/core/lib/browser/keybinding');
    const { ContextKeyService } = require('@theia/core/lib/browser/context-key-service');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');
    const { ProgressStatusBarItem } = require('@theia/core/lib/browser/progress-status-bar-item');
    const { EXPLORER_VIEW_CONTAINER_ID } = require('@theia/navigator/lib/browser/navigator-widget-factory');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const commands = container.get(CommandRegistry);
    const keybindings = container.get(KeybindingRegistry);
    const contextKeyService = container.get(ContextKeyService);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const shell = container.get(ApplicationShell);
    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const pluginService = container.get(HostedPluginSupport);
    const progressStatusBarItem = container.get(ProgressStatusBarItem);
    const fileUri = rootUri.resolve('../api-tests/test-ts-workspace/demo-file.ts');

    const toTearDown = new DisposableCollection();

    function pause(ms = 500) {
        console.debug(`pause test for: ${ms} ms`);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * @template T
     * @param {() => Promise<T> | T} condition
     * @returns {Promise<T>}
     */
    function waitForAnimation(condition) {
        return new Promise(async (resolve, dispose) => {
            toTearDown.push({ dispose });
            do {
                await animationFrame();
            } while (!condition());
            resolve();
        });
    }

    before(async () => {
        await pluginService.didStart;
        await shell.leftPanelHandler.collapse();
        await editorManager.closeAll({ save: false });
    });

    beforeEach(async function () {
        await navigatorContribution.closeView();
    });

    afterEach(async () => {
        await editorManager.closeAll({ save: false });
    });

    after(async () => {
        await shell.leftPanelHandler.collapse();
        toTearDown.dispose();
    });

    /**
     * @param {import('@theia/core/lib/common/command').Command} command
     */
    async function assertEditorFindReplace(command) {
        assert.isFalse(contextKeyService.match('findWidgetVisible'));
        assert.isFalse(contextKeyService.match('findInputFocussed'));
        assert.isFalse(contextKeyService.match('replaceInputFocussed'));

        keybindings.dispatchCommand(command.id);
        await waitForAnimation(() => contextKeyService.match('findInputFocussed'));

        assert.isTrue(contextKeyService.match('findWidgetVisible'));
        assert.isTrue(contextKeyService.match('findInputFocussed'));
        assert.isFalse(contextKeyService.match('replaceInputFocussed'));

        keybindings.dispatchKeyDown('Tab');
        await waitForAnimation(() => !contextKeyService.match('findInputFocussed'));
        assert.isTrue(contextKeyService.match('findWidgetVisible'));
        assert.isFalse(contextKeyService.match('findInputFocussed'));
        assert.equal(contextKeyService.match('replaceInputFocussed'), command === CommonCommands.REPLACE);
    }

    for (const command of [CommonCommands.FIND, CommonCommands.REPLACE]) {
        it(command.label + ' in the active editor', async function () {
            await openExplorer();

            await openEditor();

            await assertEditorFindReplace(command);
        });

        it(command.label + ' in the active explorer without the current editor', async function () {
            await openExplorer();

            // should not throw
            await commands.executeCommand(command.id);
        });

        it(command.label + ' in the active explorer with the current editor', async function () {
            await openEditor();

            await openExplorer();

            await assertEditorFindReplace(command);
        });

    }

    async function openExplorer() {
        await navigatorContribution.openView({ activate: true });
        const widget = await shell.revealWidget(EXPLORER_VIEW_CONTAINER_ID);
        assert.isDefined(widget, 'Explorer widget should exist');
    }

    async function openEditor() {
        await editorManager.open(fileUri, { mode: 'activate' });
        const activeEditor = /** @type {MonacoEditor} */ MonacoEditor.get(editorManager.activeEditor);
        assert.isDefined(activeEditor);
        // @ts-ignore
        assert.equal(activeEditor.uri.resolveToAbsolute().toString(), fileUri.resolveToAbsolute().toString());
    }
});
