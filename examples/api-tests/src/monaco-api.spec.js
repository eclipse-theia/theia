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
describe.only('Monaco API', async function () {
    this.timeout(5000);

    const { assert } = chai;

    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');
    const { MonacoResolvedKeybinding } = require('@theia/monaco/lib/browser/monaco-resolved-keybinding');
    const { MonacoTextmateService } = require('@theia/monaco/lib/browser/textmate/monaco-textmate-service');
    const { MonacoThemeRegistry } = require('@theia/monaco/lib/browser/textmate/monaco-theme-registry');
    const { CommandRegistry } = require('@theia/core/lib/common/command');

    const container = window.theia.container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);
    const textmateService = container.get(MonacoTextmateService);
    const themeRegistry = container.get(MonacoThemeRegistry);
    const commands = container.get(CommandRegistry);

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
        const simpleKeybinding = new monaco.keybindings.SimpleKeybinding(true, true, true, true, monaco.KeyCode.KEY_K);
        const chordKeybinding = simpleKeybinding.toChord();
        assert.equal(chordKeybinding.parts.length, 1);
        assert.equal(chordKeybinding.parts[0], simpleKeybinding);

        const resolvedKeybindings = monacoEditor.getControl()._standaloneKeybindingService.resolveKeybinding(chordKeybinding);
        assert.equal(resolvedKeybindings.length, 1);

        const resolvedKeybinding = resolvedKeybindings[0];
        if (resolvedKeybinding instanceof MonacoResolvedKeybinding) {
            const label = resolvedKeybinding.getLabel();
            const ariaLabel = resolvedKeybinding.getAriaLabel();
            const electronAccelerator = resolvedKeybinding.getElectronAccelerator();
            const userSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
            const WYSIWYG = resolvedKeybinding.isWYSIWYG();
            const chord = resolvedKeybinding.isChord();
            const parts = resolvedKeybinding.getParts();
            const dispatchParts = resolvedKeybinding.getDispatchParts();

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
                    chord: false,
                    parts: [{
                        altKey: true,
                        ctrlKey: true,
                        keyAriaLabel: 'K',
                        keyLabel: 'K',
                        metaKey: true,
                        shiftKey: true
                    }],
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
                    chord: false,
                    parts: [{
                        altKey: true,
                        ctrlKey: true,
                        keyAriaLabel: 'K',
                        keyLabel: 'K',
                        metaKey: false,
                        shiftKey: true
                    }],
                    dispatchParts: [
                        'ctrl+shift+alt+K'
                    ]
                };
            }

            assert.deepStrictEqual({
                label, ariaLabel, electronAccelerator, userSettingsLabel, WYSIWYG, chord, parts, dispatchParts
            }, expected);
        } else {
            assert.fail(`resolvedKeybinding must be of ${MonacoResolvedKeybinding.name} type`);
        }
    });

    it('TokenizationRegistry.getColorMap', async () => {
        if (textmateService['monacoThemeRegistry'].getThemeData().base !== 'vs') {
            const didChangeColorMap = new Promise(resolve => {
                const toDispose = monaco.modes.TokenizationRegistry.onDidChange(() => {
                    toDispose.dispose();
                    resolve();
                });
            });
            textmateService['themeService'].setCurrentTheme('light');
            await didChangeColorMap;
        }

        const textMateColorMap = textmateService['grammarRegistry'].getColorMap();
        assert.notEqual(textMateColorMap.indexOf('#795E26'), -1, 'Expected custom token colors for the light theme to be enabled.');

        const monacoColorMap = (monaco.modes.TokenizationRegistry.getColorMap() || []).
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
        /** @type {monaco.services.OpenerService} */
        const openerService = hoverContribution['_openerService'];

        let opened = false;
        const id = '__test:OpenerService.open';
        const unregisterCommand = commands.registerCommand({ id }, {
            execute: arg => (console.log(arg), opened = arg === 'foo')
        });
        try {
            await openerService.open(monaco.Uri.parse('command:' + id + '?"foo"'));
            assert.isTrue(opened);
        } finally {
            unregisterCommand.dispose();
        }
    });

    describe('MonacoThemeRegistry', () => {

        describe('#normalizeColor', () => {

            it('should not normalize invalid colors', () => {
                assert.equal(themeRegistry['normalizeColor'](undefined), undefined);
                assert.equal(themeRegistry['normalizeColor']('#F'), undefined);
                assert.equal(themeRegistry['normalizeColor']('#FFFFFFFFFF'), undefined);
            });

            it('should normalize RGBA colors', () => {
                // Conversion assumes r, g, and b are in the set [0, 255].
                const rgba = new monaco.color.RGBA(255, 0, 0, 1);
                const color = new monaco.color.Color(rgba);
                assert.equal(themeRegistry['normalizeColor'](color), '#FF0000', 'Expected color to be red.');
            });

            it('should normalize HSLA colors', () => {
                // Conversion assumes h is in the set [0, 360] while s and l are contained in the set [0, 1].
                const hsla = new monaco.color.HSLA(0, 1, 0.5, 1);
                const color = new monaco.color.Color(hsla);
                assert.equal(themeRegistry['normalizeColor'](color), '#FF0000', 'Expected color to be red.');
            });

            it('should normalize color from a shorthand notation', () => {
                assert.equal(themeRegistry['normalizeColor']('#FFF'), '#FFFFFF');
                assert.equal(themeRegistry['normalizeColor']('#FC0'), '#FFCC00');
                assert.equal(themeRegistry['normalizeColor']('#00F'), '#0000FF');
            });

            it('should normalize colors with different notations', () => {
                assert.equal(themeRegistry['normalizeColor']('#FC0'), '#FFCC00');
                assert.equal(themeRegistry['normalizeColor']('#FC0C'), '#FFCC00CC');
                assert.equal(themeRegistry['normalizeColor']('#FFCC00'), '#FFCC00');
            });

        });

    });

});
