/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// @ts-check
describe('Find and Replace', function () {

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

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const commands = container.get(CommandRegistry);
    const keybindings = container.get(KeybindingRegistry);
    const contextKeyService = container.get(ContextKeyService);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const shell = container.get(ApplicationShell);

    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const fileUri = rootUri.resolve('webpack.config.js');

    const toTearDown = new DisposableCollection();

    /**
     * @template T
     * @param {() => Promise<T> | T} condition
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

    before(() => {
        shell.leftPanelHandler.collapse();
    });

    beforeEach(async function () {
        await navigatorContribution.closeView();
        await editorManager.closeAll({ save: false });
    });

    afterEach(async () => {
        toTearDown.dispose();
        await navigatorContribution.closeView();
        await editorManager.closeAll({ save: false });
    });

    after(() => {
        shell.leftPanelHandler.collapse();
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
            await navigatorContribution.openView({ activate: true });

            await editorManager.open(fileUri, { mode: 'activate' });

            await assertEditorFindReplace(command);
        });

        it(command.label + ' in the active explorer without the current editor', async function () {
            await navigatorContribution.openView({ activate: true });

            // should not throw
            await commands.executeCommand(command.id);
        });

        it(command.label + ' in the active explorer with the current editor', async function () {
            await editorManager.open(fileUri, { mode: 'activate' });

            await navigatorContribution.openView({ activate: true });

            await assertEditorFindReplace(command);
        });

    }

});
