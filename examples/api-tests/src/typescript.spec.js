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
describe('TypeScript', function () {
    this.timeout(30000);

    const { assert } = chai;

    const Uri = require('@theia/core/lib/common/uri');
    const { DisposableCollection } = require('@theia/core/lib/common/disposable');
    const { BrowserMainMenuFactory } = require('@theia/core/lib/browser/menu/browser-menu-plugin');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { EditorWidget } = require('@theia/editor/lib/browser/editor-widget');
    const { EDITOR_CONTEXT_MENU } = require('@theia/editor/lib/browser/editor-menu');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { HostedPluginSupport } = require('@theia/plugin-ext/lib/hosted/browser/hosted-plugin');
    const { ContextKeyService } = require('@theia/core/lib/browser/context-key-service');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { KeybindingRegistry } = require('@theia/core/lib/browser/keybinding');
    const { OpenerService, open } = require('@theia/core/lib/browser/opener-service');
    const { EditorPreviewWidget } = require('@theia/editor-preview/lib/browser/editor-preview-widget');
    const { animationFrame } = require('@theia/core/lib/browser/browser');
    const { PreferenceService, PreferenceScope } = require('@theia/core/lib/browser/preferences/preference-service');
    const { ProgressStatusBarItem } = require('@theia/core/lib/browser/progress-status-bar-item');
    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { PluginViewRegistry } = require('@theia/plugin-ext/lib/main/browser/view/plugin-view-registry');
    const { Deferred } = require('@theia/core/lib/common/promise-util');

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const menuFactory = container.get(BrowserMainMenuFactory);
    const pluginService = container.get(HostedPluginSupport);
    const contextKeyService = container.get(ContextKeyService);
    const commands = container.get(CommandRegistry);
    const openerService = container.get(OpenerService);
    const keybindings = container.get(KeybindingRegistry);
    /** @type {import('@theia/core/lib/browser/preferences/preference-service').PreferenceService} */
    const preferences = container.get(PreferenceService);
    const progressStatusBarItem = container.get(ProgressStatusBarItem);
    const fileService = container.get(FileService);
    const pluginViewRegistry = container.get(PluginViewRegistry);

    const typescriptPluginId = 'vscode.typescript-language-features';
    const referencesPluginId = 'ms-vscode.references-view';
    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const serverUri = rootUri.resolve('src-gen/backend/test-server.js');
    const inversifyUri = rootUri.resolve('../../node_modules/inversify/dts/inversify.d.ts').normalizePath();
    const containerUri = rootUri.resolve('../../node_modules/inversify/dts/container/container.d.ts').normalizePath();

    before(async function () {
        await fileService.create(serverUri, `// @ts-check
require('reflect-metadata');
const path = require('path');
const express = require('express');
const { Container } = require('inversify');
const { BackendApplication, CliManager } = require('@theia/core/lib/node');
const { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');
const { messagingBackendModule } = require('@theia/core/lib/node/messaging/messaging-backend-module');
const { loggerBackendModule } = require('@theia/core/lib/node/logger-backend-module');

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start(port, host, argv) {
    if (argv === undefined) {
        argv = process.argv;
    }

    const cliManager = container.get(CliManager);
    return cliManager.initializeCli(argv).then(function () {
        const application = container.get(BackendApplication);
        application.use(express.static(path.join(__dirname, '../../lib')));
        application.use(express.static(path.join(__dirname, '../../lib/index.html')));
        return application.start(port, host);
    });
}

module.exports = (port, host, argv) => Promise.resolve()
    .then(function () { return Promise.resolve(require('@theia/process/lib/node/process-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/filesystem/lib/node/filesystem-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/filesystem/lib/node/download/file-download-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/workspace/lib/node/workspace-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/languages/lib/node/languages-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/terminal/lib/node/terminal-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/task/lib/node/task-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/debug/lib/node/debug-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/file-search/lib/node/file-search-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/git/lib/node/git-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/git/lib/node/env/git-env-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/json/lib/node/json-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/metrics/lib/node/metrics-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/mini-browser/lib/node/mini-browser-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/search-in-workspace/lib/node/search-in-workspace-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-ext/lib/plugin-ext-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-dev/lib/node/plugin-dev-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-ext-vscode/lib/node/plugin-vscode-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-metrics/lib/node/plugin-metrics-backend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/vsx-registry/lib/node/vsx-registry-backend-module')).then(load) })
    .then(() => start(port, host, argv)).catch(reason => {
        console.error('Failed to start the backend application.');
        if (reason) {
            console.error(reason);
        }
        throw reason;
    });
    `, { fromUserGesture: false, overwrite: true });
        await pluginService.didStart;
        await Promise.all([typescriptPluginId, referencesPluginId].map(async pluginId => {
            if (!pluginService.getPlugin(pluginId)) {
                throw new Error(pluginId + ' should be started');
            }
            await pluginService.activatePlugin(pluginId);
        }));
    });

    after(async function () {
        await fileService.delete(serverUri, { fromUserGesture: false });
    });

    beforeEach(async function () {
        await editorManager.closeAll({ save: false });
    });

    const toTearDown = new DisposableCollection();
    afterEach(async () => {
        toTearDown.dispose();
        await editorManager.closeAll({ save: false });
    });

    /**
     * @param {Uri.default} uri
     * @param {boolean} preview
     */
    async function openEditor(uri, preview = false) {
        const widget = await open(openerService, uri, { mode: 'activate', preview });
        const editorWidget = widget instanceof EditorPreviewWidget ? widget.editorWidget : widget instanceof EditorWidget ? widget : undefined;
        const editor = MonacoEditor.get(editorWidget);
        assert.isDefined(editor);

        // wait till tsserver is running, see:
        // https://github.com/microsoft/vscode/blob/93cbbc5cae50e9f5f5046343c751b6d010468200/extensions/typescript-language-features/src/extension.ts#L98-L103
        await waitForAnimation(() => contextKeyService.match('typescript.isManagedFile'));

        // wait till projects are loaded, see:
        // https://github.com/microsoft/vscode/blob/4aac84268c6226d23828cc6a1fe45ee3982927f0/extensions/typescript-language-features/src/typescriptServiceClient.ts#L911
        await waitForAnimation(() => !progressStatusBarItem.currentProgress);

        return /** @type {MonacoEditor} */ (editor);
    }

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

    /**
     * We ignore attributes on purprse since they are not stable.
     * But structure is important for us to see whether the plain text is rendered or markdown.
     *
     * @param {Element} element
     * @returns {string}
     */
    function nodeAsString(element, indentation = '') {
        const header = element.tagName;
        let body = '';
        const childIndentation = indentation + '  ';
        for (let i = 0; i < element.childNodes.length; i++) {
            const childNode = element.childNodes.item(i);
            if (childNode.nodeType === childNode.TEXT_NODE) {
                body += childIndentation + `"${childNode.textContent}"` + '\n';
            } else if (childNode instanceof HTMLElement) {
                body += childIndentation + nodeAsString(childNode, childIndentation) + '\n';
            }
        }
        const result = header + (body ? ' {\n' + body + indentation + '}' : '');
        if (indentation) {
            return result;
        }
        return `\n${result}\n`;
    }

    /**
     * @param {MonacoEditor} editor
     */
    async function assertPeekOpened(editor) {
        const referencesController = editor.getControl()._contributions['editor.contrib.referencesController'];
        await waitForAnimation(() => referencesController._widget && referencesController._widget._tree.getFocus().length);

        assert.isFalse(contextKeyService.match('editorTextFocus'));
        assert.isTrue(contextKeyService.match('referenceSearchVisible'));
        assert.isTrue(contextKeyService.match('listFocus'));
    }

    /**
     * @param {MonacoEditor} editor
     */
    async function openPeek(editor) {
        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('referenceSearchVisible'));
        assert.isFalse(contextKeyService.match('listFocus'));

        await commands.executeCommand('editor.action.peekDefinition');
        await assertPeekOpened(editor);
    }

    async function openReference() {
        keybindings.dispatchKeyDown('Enter');
        await waitForAnimation(() => contextKeyService.match('listFocus'));
        assert.isFalse(contextKeyService.match('editorTextFocus'));
        assert.isTrue(contextKeyService.match('referenceSearchVisible'));
        assert.isTrue(contextKeyService.match('listFocus'));
    }

    /**
     * @param {MonacoEditor} editor
     */
    async function closePeek(editor) {
        await assertPeekOpened(editor);

        keybindings.dispatchKeyDown('Escape');
        await waitForAnimation(() => !contextKeyService.match('listFocus'));
        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('referenceSearchVisible'));
        assert.isFalse(contextKeyService.match('listFocus'));
    }

    it('document formating should be visible and enabled', async function () {
        await openEditor(serverUri);
        const menu = menuFactory.createContextMenu(EDITOR_CONTEXT_MENU);
        const item = menu.items.find(i => i.command === 'editor.action.formatDocument');
        if (item) {
            assert.isTrue(item.isVisible);
            assert.isTrue(item.isEnabled);
        } else {
            assert.isDefined(item);
        }
    });

    describe('editor.action.revealDefinition', function () {
        for (const preview of [false, true]) {
            const from = 'an editor' + (preview ? ' preview' : '');
            it('within ' + from, async function () {
                const editor = await openEditor(serverUri, preview);
                // con|tainer.load(backendApplicationModule);
                editor.getControl().setPosition({ lineNumber: 12, column: 4 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

                await commands.executeCommand('editor.action.revealDefinition');

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.equal(editorManager.activeEditor.parent instanceof EditorPreviewWidget, preview);
                assert.equal(activeEditor.uri.toString(), serverUri.toString());
                // const |container = new Container();
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 11, column: 7 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'container');
            });

            it(`from ${from} to another editor`, async function () {
                await editorManager.open(inversifyUri, { mode: 'open' });

                const editor = await openEditor(serverUri, preview);
                // const { Cont|ainer } = require('inversify');
                editor.getControl().setPosition({ lineNumber: 5, column: 13 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

                await commands.executeCommand('editor.action.revealDefinition');

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.isFalse(editorManager.activeEditor.parent instanceof EditorPreviewWidget);
                assert.equal(activeEditor.uri.toString(), inversifyUri.toString());
                // export { |Container } from "./container/container";
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 3, column: 10 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');
            });

            it(`from ${from} to an editor preview`, async function () {
                const editor = await openEditor(serverUri);
                // const { Cont|ainer } = require('inversify');
                editor.getControl().setPosition({ lineNumber: 5, column: 13 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

                await commands.executeCommand('editor.action.revealDefinition');

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.isTrue(editorManager.activeEditor.parent instanceof EditorPreviewWidget);
                assert.equal(activeEditor.uri.toString(), inversifyUri.toString());
                // export { |Container } from "./container/container";
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 3, column: 10 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');
            });
        }
    });

    describe('editor.action.peekDefinition', function () {

        for (const preview of [false, true]) {
            const from = 'an editor' + (preview ? ' preview' : '');
            it('within ' + from, async function () {
                const editor = await openEditor(serverUri, preview);
                // con|tainer.load(backendApplicationModule);
                editor.getControl().setPosition({ lineNumber: 12, column: 4 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

                await openPeek(editor);
                await openReference();

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.equal(editorManager.activeEditor.parent instanceof EditorPreviewWidget, preview);
                assert.equal(activeEditor.uri.toString(), serverUri.toString());
                // const |container = new Container();
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 11, column: 7 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'container');

                await closePeek(activeEditor);
            });

            it(`from ${from} to another editor`, async function () {
                await editorManager.open(inversifyUri, { mode: 'open' });

                const editor = await openEditor(serverUri, preview);
                // const { Cont|ainer } = require('inversify');
                editor.getControl().setPosition({ lineNumber: 5, column: 13 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

                await openPeek(editor);
                await openReference();

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.isFalse(editorManager.activeEditor.parent instanceof EditorPreviewWidget);
                assert.equal(activeEditor.uri.toString(), inversifyUri.toString());
                // export { |Container } from "./container/container";
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 3, column: 10 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');

                await closePeek(activeEditor);
            });

            it(`from ${from} to an editor preview`, async function () {
                const editor = await openEditor(serverUri);
                // const { Cont|ainer } = require('inversify');
                editor.getControl().setPosition({ lineNumber: 5, column: 13 });
                // @ts-ignore
                assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

                await openPeek(editor);
                await openReference();

                const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
                // @ts-ignore
                assert.isTrue(editorManager.activeEditor.parent instanceof EditorPreviewWidget);
                assert.equal(activeEditor.uri.toString(), inversifyUri.toString());
                // export { |Container } from "./container/container";
                // @ts-ignore
                const { lineNumber, column } = activeEditor.getControl().getPosition();
                assert.deepEqual({ lineNumber, column }, { lineNumber: 3, column: 10 });
                // @ts-ignore
                assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');

                await closePeek(activeEditor);
            });
        }
    });

    it('editor.action.triggerSuggest', async function () {
        const editor = await openEditor(serverUri);
        // const { [|Container] } = require('inversify');
        editor.getControl().setPosition({ lineNumber: 5, column: 9 });
        editor.getControl().setSelection({ startLineNumber: 5, startColumn: 9, endLineNumber: 5, endColumn: 18 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('suggestWidgetVisible'));

        await commands.executeCommand('editor.action.triggerSuggest');
        await waitForAnimation(() => contextKeyService.match('suggestWidgetVisible'));

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isTrue(contextKeyService.match('suggestWidgetVisible'));

        keybindings.dispatchKeyDown('Enter');
        await waitForAnimation(() => !contextKeyService.match('suggestWidgetVisible'));

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('suggestWidgetVisible'));

        const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
        assert.equal(activeEditor.uri.toString(), serverUri.toString());
        // const { Container| } = require('inversify');
        // @ts-ignore
        const { lineNumber, column } = activeEditor.getControl().getPosition();
        assert.deepEqual({ lineNumber, column }, { lineNumber: 5, column: 18 });
        // @ts-ignore
        assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');
    });

    it('editor.action.triggerSuggest navigate', async function () {
        const editor = await openEditor(serverUri);
        // const { [|Container] } = require('inversify');
        editor.getControl().setPosition({ lineNumber: 5, column: 9 });
        editor.getControl().setSelection({ startLineNumber: 5, startColumn: 9, endLineNumber: 5, endColumn: 18 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'Container');

        const suggest = editor.getControl()._contributions['editor.contrib.suggestController'];
        const getFocusedLabel = () => {
            const focusedItem = suggest.widget.getValue().getFocusedItem();
            return focusedItem && focusedItem.item.completion.label;
        };

        assert.isUndefined(getFocusedLabel());
        assert.isFalse(contextKeyService.match('suggestWidgetVisible'));

        await commands.executeCommand('editor.action.triggerSuggest');
        await waitForAnimation(() => contextKeyService.match('suggestWidgetVisible') && getFocusedLabel() === 'Container');

        assert.equal(getFocusedLabel(), 'Container');
        assert.isTrue(contextKeyService.match('suggestWidgetVisible'));

        keybindings.dispatchKeyDown('ArrowDown');
        await waitForAnimation(() => contextKeyService.match('suggestWidgetVisible') && getFocusedLabel() === 'ContainerModule');

        assert.equal(getFocusedLabel(), 'ContainerModule');
        assert.isTrue(contextKeyService.match('suggestWidgetVisible'));

        keybindings.dispatchKeyDown('ArrowUp');
        await waitForAnimation(() => contextKeyService.match('suggestWidgetVisible') && getFocusedLabel() === 'Container');

        assert.equal(getFocusedLabel(), 'Container');
        assert.isTrue(contextKeyService.match('suggestWidgetVisible'));

        keybindings.dispatchKeyDown('Escape');
        await waitForAnimation(() => !contextKeyService.match('suggestWidgetVisible') && getFocusedLabel() === undefined);

        assert.isUndefined(getFocusedLabel());
        assert.isFalse(contextKeyService.match('suggestWidgetVisible'));
    });

    it('editor.action.rename', async function () {
        const editor = await openEditor(serverUri);
        // const |container = new Container();
        editor.getControl().setPosition({ lineNumber: 11, column: 7 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('renameInputVisible'));

        commands.executeCommand('editor.action.rename');
        await waitForAnimation(() => contextKeyService.match('renameInputVisible')
            && document.activeElement instanceof HTMLInputElement
            && document.activeElement.selectionEnd === 'container'.length);
        assert.isFalse(contextKeyService.match('editorTextFocus'));
        assert.isTrue(contextKeyService.match('renameInputVisible'));

        const input = document.activeElement;
        if (!(input instanceof HTMLInputElement)) {
            assert.fail('expected focused input, but: ' + input);
            return;
        }

        input.value = 'foo';
        keybindings.dispatchKeyDown('Enter', input);

        // all rename edits should be grouped in one edit operation and applied in the same tick
        const waitForApplyRenameEdits = new Deferred();
        editor.getControl().onDidChangeModelContent(waitForApplyRenameEdits.resolve);
        await waitForApplyRenameEdits.promise;

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('renameInputVisible'));

        const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
        assert.equal(activeEditor.uri.toString(), serverUri.toString());
        // const |foo = new Container();
        // @ts-ignore
        const { lineNumber, column } = activeEditor.getControl().getPosition();
        assert.deepEqual({ lineNumber, column }, { lineNumber: 11, column: 7 });
        // @ts-ignore
        assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'foo');
    });

    it('editor.action.triggerParameterHints', async function () {
        const editor = await openEditor(serverUri);
        // container.load(|backendApplicationModule);
        editor.getControl().setPosition({ lineNumber: 12, column: 16 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'backendApplicationModule');

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('parameterHintsVisible'));

        await commands.executeCommand('editor.action.triggerParameterHints');
        await waitForAnimation(() => contextKeyService.match('parameterHintsVisible'));

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isTrue(contextKeyService.match('parameterHintsVisible'));

        keybindings.dispatchKeyDown('Escape');
        await waitForAnimation(() => !contextKeyService.match('parameterHintsVisible'));

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(contextKeyService.match('parameterHintsVisible'));
    });

    it('editor.action.showHover', async function () {
        const editor = await openEditor(serverUri);
        // container.load(|backendApplicationModule);
        editor.getControl().setPosition({ lineNumber: 12, column: 16 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'backendApplicationModule');

        const hover = editor.getControl()._contributions['editor.contrib.hover'];

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(hover.contentWidget.isVisible);

        await commands.executeCommand('editor.action.showHover');
        await waitForAnimation(() => hover.contentWidget.isVisible);

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isTrue(hover.contentWidget.isVisible);

        assert.deepEqual(nodeAsString(hover.contentWidget._domNode), `
DIV {
  DIV {
    DIV {
      DIV {
        DIV {
          SPAN {
            DIV {
              SPAN {
                "const"
              }
              SPAN {
                " "
              }
              SPAN {
                "backendApplicationModule"
              }
              SPAN {
                ": "
              }
              SPAN {
                "ContainerModule"
              }
            }
          }
        }
      }
    }
  }
}
`);

        keybindings.dispatchKeyDown('Escape');
        await waitForAnimation(() => !hover.contentWidget.isVisible);

        assert.isTrue(contextKeyService.match('editorTextFocus'));
        assert.isFalse(hover.contentWidget.isVisible);
    });

    it('highligh semantic (write) occurences', async function () {
        const editor = await openEditor(serverUri);
        // const |container = new Container();
        const lineNumber = 11;
        const column = 7;
        const endColumn = column + 'container'.length;

        const hasWriteDecoration = () => {
            // @ts-ignore
            for (const decoration of editor.getControl().getModel().getLineDecorations(lineNumber)) {
                if (decoration.range.startColumn === column && decoration.range.endColumn === endColumn && decoration.options.className === 'wordHighlightStrong') {
                    return true;
                }
            }
            return false;
        };
        assert.isFalse(hasWriteDecoration());

        editor.getControl().setPosition({ lineNumber, column });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');
        // highlight occurences is not trigged on the explicit position change, so move a cursor as a user
        keybindings.dispatchKeyDown('ArrowRight');
        await waitForAnimation(() => hasWriteDecoration());

        assert.isTrue(hasWriteDecoration());
    });

    it('editor.action.goToImplementation', async function () {
        const editor = await openEditor(serverUri);
        // con|tainer.load(backendApplicationModule);
        editor.getControl().setPosition({ lineNumber: 12, column: 4 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

        await commands.executeCommand('editor.action.goToImplementation');

        const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
        assert.equal(activeEditor.uri.toString(), serverUri.toString());
        // const |container = new Container();
        // @ts-ignore
        const { lineNumber, column } = activeEditor.getControl().getPosition();
        assert.deepEqual({ lineNumber, column }, { lineNumber: 11, column: 7 });
        // @ts-ignore
        assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'container');
    });

    it('editor.action.goToTypeDefinition', async function () {
        const editor = await openEditor(serverUri);
        // con|tainer.load(backendApplicationModule);
        editor.getControl().setPosition({ lineNumber: 12, column: 4 });
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

        await commands.executeCommand('editor.action.goToTypeDefinition');

        const activeEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editorManager.activeEditor));
        assert.equal(activeEditor.uri.toString(), containerUri.toString());
        // declare class |Container implements interfaces.Container {
        // @ts-ignore
        const { lineNumber, column } = activeEditor.getControl().getPosition();
        assert.deepEqual({ lineNumber, column }, { lineNumber: 2, column: 15 });
        // @ts-ignore
        assert.equal(activeEditor.getControl().getModel().getWordAtPosition({ lineNumber, column }).word, 'Container');
    });

    it('run reference code lens', async function () {
        // @ts-ignore
        const globalValue = preferences.inspect('javascript.referencesCodeLens.enabled').globalValue;
        toTearDown.push({ dispose: () => preferences.set('javascript.referencesCodeLens.enabled', globalValue, PreferenceScope.User) });

        const editor = await openEditor(serverUri);

        const codeLens = editor.getControl()._contributions['css.editor.codeLens'];
        const codeLensNode = () => codeLens._lenses[0] && codeLens._lenses[0]._contentWidget && codeLens._lenses[0]._contentWidget._domNode;
        const codeLensNodeVisible = () => {
            const n = codeLensNode();
            return !!n && n.style.visibility !== 'hidden';
        };

        assert.isFalse(codeLensNodeVisible());

        // [export ]function load(raw) {
        const position = { lineNumber: 16, column: 1 };
        // @ts-ignore
        editor.getControl().getModel().applyEdits([{
            range: monaco.Range.fromPositions(position, position),
            forceMoveMarkers: false,
            text: 'export '
        }]);
        editor.getControl().revealPosition(position);
        await preferences.set('javascript.referencesCodeLens.enabled', true, PreferenceScope.User);
        await waitForAnimation(() => codeLensNodeVisible());

        assert.isTrue(codeLensNodeVisible());
        const node = codeLensNode();
        if (node) {
            assert.equal(nodeAsString(node), `
SPAN {
  A {
    "20 references"
  }
}
`);
            const link = node.getElementsByTagName('a').item(0);
            if (link) {
                link.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                await assertPeekOpened(editor);
                await closePeek(editor);
            } else {
                assert.isDefined(link);
            }
        } else {
            assert.isDefined(node);
        }
    });

    it('editor.action.quickFix', async function () {
        const column = 6;
        const lineNumber = 19;
        const editor = await openEditor(serverUri);
        // @ts-ignore
        const currentChar = () => editor.getControl().getModel().getLineContent(lineNumber).charAt(column - 1);

        // missing semicolon at
        //     )|
        editor.getControl().setPosition({ lineNumber, column });
        editor.getControl().revealPosition({ lineNumber, column });
        assert.equal(currentChar(), '');

        const quickFixController = editor.getControl()._contributions['editor.contrib.quickFixController'];
        const lightBulbNode = () => {
            const ui = quickFixController._ui.rawValue;
            const lightBulb = ui && ui._lightBulbWidget.rawValue;
            return lightBulb && lightBulb._domNode;
        };
        const lightBulbVisible = () => {
            const node = lightBulbNode();
            return !!node && node.style.visibility !== 'hidden';
        };

        assert.isFalse(lightBulbVisible());
        await waitForAnimation(() => lightBulbVisible());

        await commands.executeCommand('editor.action.quickFix');
        await waitForAnimation(() => !!document.querySelector('.p-Widget.p-Menu'));
        await animationFrame();

        keybindings.dispatchKeyDown('ArrowDown');
        keybindings.dispatchKeyDown('Enter');

        await waitForAnimation(() => currentChar() === ';');
        assert.equal(currentChar(), ';');

        await waitForAnimation(() => !lightBulbVisible());
        assert.isFalse(lightBulbVisible());
    });

    it('editor.action.formatDocument', async function () {
        const lineNumber = 5;
        const editor = await openEditor(serverUri);
        // @ts-ignore
        const originalLenght = editor.getControl().getModel().getLineLength(lineNumber);

        // const { Container[ ] } = require('inversify');
        // @ts-ignore
        editor.getControl().getModel().applyEdits([{
            range: monaco.Range.fromPositions({ lineNumber, column: 18 }, { lineNumber, column: 18 }),
            forceMoveMarkers: false,
            text: ' '
        }]);

        // @ts-ignore
        assert.equal(editor.getControl().getModel().getLineLength(lineNumber), originalLenght + 1);

        await commands.executeCommand('editor.action.formatDocument');

        // @ts-ignore
        assert.equal(editor.getControl().getModel().getLineLength(lineNumber), originalLenght);
    });

    it('editor.action.formatSelection', async function () {
        const lineNumber = 5;
        const editor = await openEditor(serverUri);
        // @ts-ignore
        const originalLenght = editor.getControl().getModel().getLineLength(lineNumber);

        // const { Container[  }  ]= require('inversify');
        // @ts-ignore
        editor.getControl().getModel().applyEdits([{
            range: monaco.Range.fromPositions({ lineNumber, column: 18 }, { lineNumber, column: 21 }),
            forceMoveMarkers: false,
            text: '  }  '
        }]);

        // @ts-ignore
        assert.equal(editor.getControl().getModel().getLineLength(lineNumber), originalLenght + 2);

        // [const { Container  }]  = require('inversify');
        editor.getControl().setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 21 });

        await commands.executeCommand('editor.action.formatSelection');

        // [const { Container }]  = require('inversify');
        // @ts-ignore
        assert.equal(editor.getControl().getModel().getLineLength(lineNumber), originalLenght + 1);
    });

    for (const referenceViewCommand of ['references-view.find', 'references-view.findImplementations']) {
        it(referenceViewCommand, async function () {
            const editor = await openEditor(serverUri);
            // const |container = new Container();
            editor.getControl().setPosition({ lineNumber: 11, column: 7 });
            // @ts-ignore
            assert.equal(editor.getControl().getModel().getWordAtPosition(editor.getControl().getPosition()).word, 'container');

            const view = await pluginViewRegistry.openView('references-view.tree');
            if (!view) {
                assert.isDefined(view);
                return;
            }

            await commands.executeCommand('references-view.clear');
            await waitForAnimation(() => view.title.label.toLowerCase() === 'results');
            assert.equal(view.title.label.toLowerCase(), 'results');

            await commands.executeCommand(referenceViewCommand);

            await waitForAnimation(() => view.title.label.toLowerCase() !== 'results');
            assert.notEqual(view.title.label.toLowerCase(), 'results');
        });
    }

});
