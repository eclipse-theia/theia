// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
describe('Output and editor focus', function () {
    this.timeout(15000);

    const { assert } = chai;

    const { timeout } = require('@theia/core/lib/common/promise-util');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { OutputChannelManager } = require('@theia/output/lib/browser/output-channel');
    const { OutputContribution } = require('@theia/output/lib/browser/output-contribution');

    const container = window.theia.container;
    const shell = container.get(ApplicationShell);
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const outputChannelManager = container.get(OutputChannelManager);
    const outputContribution = container.get(OutputContribution);

    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const firstFileUri = rootUri.resolve('package.json');
    const secondFileUri = rootUri.resolve('esbuild.mjs');

    const firstChannelName = 'Output Focus Test 1';
    const secondChannelName = 'Output Focus Test 2';

    /** @type {import('@theia/editor/lib/browser/editor-widget').EditorWidget} */
    let focusedEditor;

    /**
     * @param {() => unknown} condition
     * @param {string} message
     * @returns {Promise<void>}
     */
    async function waitFor(condition, message) {
        const endTime = Date.now() + 5000;
        while (!condition()) {
            if (Date.now() > endTime) {
                throw new Error(`Timed out waiting for: ${message}`);
            }
            await timeout(50);
        }
    }

    /**
     * @param {import('@theia/core/lib/browser').Widget | undefined} widget
     * @returns {boolean}
     */
    function hasFocus(widget) {
        return !!widget && widget.node.contains(document.activeElement);
    }

    /**
     * Resolves once the Output view is visible and displays the given channel. The widget activates itself, if
     * it does, synchronously after it has set the channel's model, so focus can be checked right after this.
     * @param {string} channelName
     */
    async function waitForOutputToShow(channelName) {
        const channelUri = outputChannelManager.getChannel(channelName).uri.toString();
        await waitFor(() => {
            const outputWidget = outputContribution.tryGetWidget();
            const model = outputWidget && outputWidget['editor']?.getControl().getModel();
            return outputWidget?.isVisible && model?.uri.toString() === channelUri;
        }, `the Output view to show '${channelName}'`);
        await timeout(100);
    }

    function assertEditorKeepsFocus() {
        assert.isTrue(hasFocus(focusedEditor), 'the editor should keep the focus');
        assert.isTrue(shell.activeWidget === focusedEditor, 'the editor should stay the active widget');
    }

    beforeEach(async () => {
        await editorManager.closeAll({ save: false });
        await outputContribution.closeView();
        focusedEditor = await editorManager.open(firstFileUri, { mode: 'activate' });
        await waitFor(() => hasFocus(focusedEditor), 'the editor to take the focus');
    });

    afterEach(async () => {
        outputChannelManager.deleteChannel(firstChannelName);
        outputChannelManager.deleteChannel(secondChannelName);
        await outputContribution.closeView();
        await editorManager.closeAll({ save: false });
    });

    describe('OutputChannel.show', () => {

        it('should reveal the Output view without taking the focus if preserveFocus is true', async () => {
            const channel = outputChannelManager.getChannel(firstChannelName);
            channel.appendLine('hello');
            channel.show({ preserveFocus: true });
            await waitForOutputToShow(firstChannelName);
            assertEditorKeepsFocus();
        });

        it('should activate the Output view if preserveFocus is not set', async () => {
            const channel = outputChannelManager.getChannel(firstChannelName);
            channel.appendLine('hello');
            channel.show();
            await waitForOutputToShow(firstChannelName);
            const outputWidget = outputContribution.tryGetWidget();
            await waitFor(() => hasFocus(outputWidget), 'the Output view to take the focus');
            assert.isTrue(shell.activeWidget === outputWidget, 'the Output view should be the active widget');
        });

    });

    describe('channel changes in a visible Output view', () => {

        beforeEach(async () => {
            outputChannelManager.getChannel(firstChannelName).show({ preserveFocus: true });
            await waitForOutputToShow(firstChannelName);
            assertEditorKeepsFocus();
        });

        it('should not take the focus when a channel is selected', async () => {
            const secondChannel = outputChannelManager.getChannel(secondChannelName);
            outputChannelManager.selectedChannel = secondChannel;
            await waitForOutputToShow(secondChannelName);
            assertEditorKeepsFocus();
        });

        it('should not take the focus when a channel is added', async () => {
            outputChannelManager.getChannel(secondChannelName);
            await timeout(200);
            assertEditorKeepsFocus();
        });

        it('should not take the focus when the selected channel is deleted', async () => {
            const secondChannel = outputChannelManager.getChannel(secondChannelName);
            outputChannelManager.selectedChannel = secondChannel;
            await waitForOutputToShow(secondChannelName);
            outputChannelManager.deleteChannel(secondChannelName);
            await waitFor(() => outputChannelManager.selectedChannel?.name !== secondChannelName, 'another channel to be selected');
            await timeout(200);
            assertEditorKeepsFocus();
        });

    });

    describe('MonacoEditor', () => {

        it('should not take the focus when it is revealed', async () => {
            const revealedEditor = await editorManager.open(secondFileUri, { mode: 'reveal', widgetOptions: { mode: 'split-right' } });
            await waitFor(() => revealedEditor.isVisible, 'the revealed editor to become visible');
            await timeout(100);
            assert.isFalse(MonacoEditor.get(revealedEditor)?.isFocused(), 'the revealed editor should not be focused');
            assertEditorKeepsFocus();
        });

        it('should take the focus when it is activated', async () => {
            const otherEditor = await editorManager.open(secondFileUri, { mode: 'activate' });
            await waitFor(() => hasFocus(otherEditor), 'the second editor to take the focus');
            assert.isFalse(focusedEditor.isVisible, 'the first editor should be hidden behind the second one');

            await editorManager.open(firstFileUri, { mode: 'activate' });
            await waitFor(() => hasFocus(focusedEditor), 'the first editor to take the focus back');
            assert.isTrue(MonacoEditor.get(focusedEditor)?.isFocused(), 'the first editor should have text focus');
        });

    });

});
