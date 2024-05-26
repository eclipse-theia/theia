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
describe('Monaco API', async function () {
    this.timeout(5000);

    const { assert } = chai;

    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { MonacoResolvedKeybinding } = require('@theia/monaco/lib/browser/monaco-resolved-keybinding');
    const { MonacoTextmateService } = require('@theia/monaco/lib/browser/textmate/monaco-textmate-service');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { KeyCodeChord, ResolvedChord } = require('@theia/monaco-editor-core/esm/vs/base/common/keybindings');
    const { IKeybindingService } = require('@theia/monaco-editor-core/esm/vs/platform/keybinding/common/keybinding');
    const { StandaloneServices } = require('@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices');
    const { TokenizationRegistry } = require('@theia/monaco-editor-core/esm/vs/editor/common/languages');
    const { MonacoContextKeyService } = require('@theia/monaco/lib/browser/monaco-context-key-service');
    const { URI } = require('@theia/monaco-editor-core/esm/vs/base/common/uri');
    const { animationFrame } = require('@theia/core/lib/browser/browser');

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const textmateService = container.get(MonacoTextmateService);
    /** @type {import('@theia/core/src/common/command').CommandRegistry} */
    const commands = container.get(CommandRegistry);
    /** @type {import('@theia/monaco/src/browser/monaco-context-key-service').MonacoContextKeyService} */
    const contextKeys = container.get(MonacoContextKeyService);

    /** @type {MonacoEditor} */
    let monacoEditor;

    before(async () => {
        const root = workspaceService.tryGetRoots()[0];
        const editor = await editorManager.open(root.resource.resolve('package.json'), {
            mode: 'reveal'
        });
        monacoEditor = /** @type {MonacoEditor} */ (MonacoEditor.get(editor));
    });

    after(async () => {
        await editorManager.closeAll({ save: false });
    });

    it('KeybindingService.resolveKeybinding', () => {
        const chord = new KeyCodeChord(true, true, true, true, 41 /* KeyCode.KeyK */);
        const chordKeybinding = chord.toKeybinding();
        assert.equal(chordKeybinding.chords.length, 1);
        assert.equal(chordKeybinding.chords[0], chord);

        const resolvedKeybindings = StandaloneServices.get(IKeybindingService).resolveKeybinding(chordKeybinding);
        assert.equal(resolvedKeybindings.length, 1);

        const resolvedKeybinding = resolvedKeybindings[0];
        if (resolvedKeybinding instanceof MonacoResolvedKeybinding) {
            const label = resolvedKeybinding.getLabel();
            const ariaLabel = resolvedKeybinding.getAriaLabel();
            const electronAccelerator = resolvedKeybinding.getElectronAccelerator();
            const userSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
            const WYSIWYG = resolvedKeybinding.isWYSIWYG();
            const parts = resolvedKeybinding.getChords();
            const dispatchParts = resolvedKeybinding.getDispatchChords().map(str => str === null ? '' : str);

            const platform = window.navigator.platform;
            let expected;
            if (platform.includes('Mac')) {
                // Mac os
                expected = {
                    label: '⌃⇧⌥⌘K',
                    ariaLabel: '⌃⇧⌥⌘K',
                    electronAccelerator: 'Ctrl+Shift+Alt+Cmd+K',
                    userSettingsLabel: 'ctrl+shift+alt+cmd+K',
                    WYSIWYG: true,
                    parts: [new ResolvedChord(
                        true,
                        true,
                        true,
                        true,
                        'K',
                        'K',
                    )],
                    dispatchParts: [
                        'ctrl+shift+alt+meta+K'
                    ]
                };
            } else {
                expected = {
                    label: 'Ctrl+Shift+Alt+K',
                    ariaLabel: 'Ctrl+Shift+Alt+K',
                    electronAccelerator: 'Ctrl+Shift+Alt+K',
                    userSettingsLabel: 'ctrl+shift+alt+K',
                    WYSIWYG: true,
                    parts: [new ResolvedChord(
                        true,
                        true,
                        true,
                        false,
                        'K',
                        'K'
                    )],
                    dispatchParts: [
                        'ctrl+shift+alt+K'
                    ]
                };
            }

            assert.deepStrictEqual({
                label, ariaLabel, electronAccelerator, userSettingsLabel, WYSIWYG, parts, dispatchParts
            }, expected);
        } else {
            assert.fail(`resolvedKeybinding must be of ${MonacoResolvedKeybinding.name} type`);
        }
    });

    it('TokenizationRegistry.getColorMap', async () => {
        if (textmateService['monacoThemeRegistry'].getThemeData().base !== 'vs') {
            const didChangeColorMap = new Promise(resolve => {
                const toDispose = TokenizationRegistry.onDidChange(() => {
                    toDispose.dispose();
                    resolve(undefined);
                });
            });
            textmateService['themeService'].setCurrentTheme('light');
            await didChangeColorMap;
        }

        const textMateColorMap = textmateService['grammarRegistry'].getColorMap();
        assert.notEqual(textMateColorMap.indexOf('#795E26'), -1, 'Expected custom toke colors for the light theme to be enabled.');

        const monacoColorMap = (TokenizationRegistry.getColorMap() || []).
            splice(0, textMateColorMap.length).map(c => c.toString().toUpperCase());
        assert.deepStrictEqual(monacoColorMap, textMateColorMap, 'Expected textmate colors to have the same index in the monaco color map.');
    });

    it('OpenerService.open', async () => {
        const hoverContribution = monacoEditor.getControl().getContribution('editor.contrib.hover');
        assert.isDefined(hoverContribution);
        if (!('_openerService' in hoverContribution)) {
            assert.fail('hoverContribution does not have OpenerService');
            return;
        }
        /** @type {import('@theia/monaco-editor-core/esm/vs/editor/browser/services/openerService').OpenerService} */
        const openerService = hoverContribution['_openerService'];

        let opened = false;
        const id = '__test:OpenerService.open';
        const unregisterCommand = commands.registerCommand({ id }, {
            execute: arg => (console.log(arg), opened = arg === 'foo')
        });
        try {
            await openerService.open(URI.parse('command:' + id + '?"foo"'));
            assert.isTrue(opened);
        } finally {
            unregisterCommand.dispose();
        }
    });

    it('Supports setting contexts using the command registry', async () => {
        const setContext = '_setContext';
        const key = 'monaco-api-test-context';
        const firstValue = 'first setting';
        const secondValue = 'second setting';
        assert.isFalse(contextKeys.match(`${key} == '${firstValue}'`));
        await commands.executeCommand(setContext, key, firstValue);
        assert.isTrue(contextKeys.match(`${key} == '${firstValue}'`));
        await commands.executeCommand(setContext, key, secondValue);
        assert.isTrue(contextKeys.match(`${key} == '${secondValue}'`));
    });

    it('Supports context key: inQuickOpen', async () => {
        const inQuickOpenContextKey = 'inQuickOpen';
        const quickOpenCommands = ['file-search.openFile', 'workbench.action.showCommands'];
        const CommandThatChangesFocus = 'workbench.files.action.focusFilesExplorer';

        for (const cmd of quickOpenCommands) {
            assert.isFalse(contextKeys.match(inQuickOpenContextKey));
            await commands.executeCommand(cmd);
            assert.isTrue(contextKeys.match(inQuickOpenContextKey));

            await commands.executeCommand(CommandThatChangesFocus);
            await animationFrame();
            assert.isFalse(contextKeys.match(inQuickOpenContextKey));
        }
    });

});
