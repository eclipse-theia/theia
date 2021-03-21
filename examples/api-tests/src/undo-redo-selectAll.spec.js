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
describe('Undo, Redo and Select All', function () {
    this.timeout(5000);

    const { assert } = chai;

    const { animationFrame } = require('@theia/core/lib/browser/browser');
    const { DisposableCollection } = require('@theia/core/lib/common/disposable');
    const { CommonCommands } = require('@theia/core/lib/browser/common-frontend-contribution');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { KeybindingRegistry } = require('@theia/core/lib/browser/keybinding');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { ScmContribution } = require('@theia/scm/lib/browser/scm-contribution');

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const commands = container.get(CommandRegistry);
    const keybindings = container.get(KeybindingRegistry);
    const navigatorContribution = container.get(FileNavigatorContribution);
    const shell = container.get(ApplicationShell);
    const scmContribution = container.get(ScmContribution);

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
        await scmContribution.closeView();
        await navigatorContribution.closeView();
        await editorManager.closeAll({ save: false });
    });

    afterEach(async () => {
        toTearDown.dispose();
        await scmContribution.closeView();
        await navigatorContribution.closeView();
        await editorManager.closeAll({ save: false });
    });

    after(() => {
        shell.leftPanelHandler.collapse();
    });

    /**
     * @param {import('@theia/editor/lib/browser/editor-widget').EditorWidget} widget
     */
    async function assertInEditor(widget) {
        const originalContent = widget.editor.document.getText();
        const editor = /** @type {MonacoEditor} */ (MonacoEditor.get(widget));
        editor.getControl().pushUndoStop();
        editor.getControl().executeEdits('test', [{
            range: new monaco.Range(1, 1, 1, 1),
            text: 'A'
        }]);
        editor.getControl().pushUndoStop();

        const modifiedContent = widget.editor.document.getText();
        assert.notEqual(modifiedContent, originalContent);

        keybindings.dispatchCommand(CommonCommands.UNDO.id);
        await waitForAnimation(() => widget.editor.document.getText() === originalContent);
        assert.equal(widget.editor.document.getText(), originalContent);

        keybindings.dispatchCommand(CommonCommands.REDO.id);
        await waitForAnimation(() => widget.editor.document.getText() === modifiedContent);
        assert.equal(widget.editor.document.getText(), modifiedContent);

        const originalSelection = widget.editor.selection;
        keybindings.dispatchCommand(CommonCommands.SELECT_ALL.id);
        await waitForAnimation(() => widget.editor.selection.end.line !== originalSelection.end.line);
        assert.notDeepEqual(widget.editor.selection, originalSelection);
    }

    it('in the active editor', async function () {
        await navigatorContribution.openView({ activate: true });

        const widget = await editorManager.open(fileUri, { mode: 'activate' });
        await assertInEditor(widget);
    });

    it('in the active explorer without the current editor', async function () {
        await navigatorContribution.openView({ activate: true });

        // should not throw
        await commands.executeCommand(CommonCommands.UNDO.id);
        await commands.executeCommand(CommonCommands.REDO.id);
        await commands.executeCommand(CommonCommands.SELECT_ALL.id);
    });

    it('in the active explorer with the current editor', async function () {
        const widget = await editorManager.open(fileUri, { mode: 'activate' });

        await navigatorContribution.openView({ activate: true });

        await assertInEditor(widget);
    });

    async function assertInScm() {
        const scmInput = document.activeElement;
        if (!(scmInput instanceof HTMLTextAreaElement)) {
            assert.isTrue(scmInput instanceof HTMLTextAreaElement);
            return;
        }

        const originalValue = scmInput.value;
        document.execCommand('insertText', false, 'A');
        await waitForAnimation(() => scmInput.value !== originalValue);
        const modifiedValue = scmInput.value;
        assert.notEqual(originalValue, modifiedValue);

        keybindings.dispatchCommand(CommonCommands.UNDO.id);
        await waitForAnimation(() => scmInput.value === originalValue);
        assert.equal(scmInput.value, originalValue);

        keybindings.dispatchCommand(CommonCommands.REDO.id);
        await waitForAnimation(() => scmInput.value === modifiedValue);
        assert.equal(scmInput.value, modifiedValue);

        const selection = document.getSelection();
        if (!selection) {
            assert.isDefined(selection);
            return;
        }

        selection.empty();
        assert.equal(selection.rangeCount, 0);

        keybindings.dispatchCommand(CommonCommands.SELECT_ALL.id);
        await waitForAnimation(() => !!selection.rangeCount);
        assert.notEqual(selection.rangeCount, 0);
        assert.isTrue(selection.containsNode(scmInput));
    }

    it('in the active scm in workspace without the current editor', async function () {
        await scmContribution.openView({ activate: true });
        await assertInScm();
    });

    it('in the active scm in workspace with the current editor', async function () {
        await editorManager.open(fileUri, { mode: 'activate' });

        await scmContribution.openView({ activate: true });
        await assertInScm();
    });

});
