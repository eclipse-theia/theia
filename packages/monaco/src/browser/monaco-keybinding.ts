/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { KeybindingContribution, KeybindingRegistry, Key, KeyCode, Keystroke, KeyModifier } from '@theia/core/lib/browser';
import { EditorKeybindingContexts } from '@theia/editor/lib/browser';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { KEY_CODE_MAP } from './monaco-keycode-map';
import KeybindingsRegistry = monaco.keybindings.KeybindingsRegistry;
import { isOSX } from '@theia/core';

function monaco2BrowserKeyCode(keyCode: monaco.KeyCode): number {
    for (let i = 0; i < KEY_CODE_MAP.length; i++) {
        if (KEY_CODE_MAP[i] === keyCode) {
            return i;
        }
    }
    return -1;
}

@injectable()
export class MonacoKeybindingContribution implements KeybindingContribution {

    @inject(MonacoCommandRegistry)
    protected readonly commands: MonacoCommandRegistry;

    registerKeybindings(registry: KeybindingRegistry): void {
        for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
            const command = this.commands.validate(item.command);
            if (command) {
                const raw = item.keybinding;
                if (raw.type === monaco.keybindings.KeybindingType.Simple) {
                    let keybinding = raw as monaco.keybindings.SimpleKeybinding;
                    // TODO: remove this temporary workaround after updating to monaco including the fix for https://github.com/Microsoft/vscode/issues/49225
                    if (command === 'monaco.editor.action.refactor' && !isOSX) {
                        keybinding = { ...keybinding, ctrlKey: true, metaKey: false };
                    }
                    // TODO: remove this temporary workaround with a holistic solution.
                    if (command === 'monaco.editor.action.commentLine' && isOSX) {
                        keybinding = { ...keybinding, ctrlKey: true, metaKey: false };
                    }
                    const isInDiffEditor = item.when && /(^|[^!])\bisInDiffEditor\b/gm.test(item.when.serialize());
                    registry.registerKeybinding({
                        command,
                        keybinding: this.keyCode(keybinding).toString(),
                        context: isInDiffEditor ? EditorKeybindingContexts.diffEditorTextFocus : EditorKeybindingContexts.strictEditorTextFocus

                    });
                } else {
                    // FIXME support chord keybindings properly, KeyCode does not allow it right now
                }
            }
        }

        // `Select All` is not an editor action just like everything else.
        const selectAllCommand = this.commands.validate(MonacoCommands.SELECTION_SELECT_ALL);
        if (selectAllCommand) {
            registry.registerKeybinding({
                command: selectAllCommand,
                keybinding: 'ctrlcmd+a',
                context: EditorKeybindingContexts.editorTextFocus
            });
        }
    }

    protected keyCode(keybinding: monaco.keybindings.SimpleKeybinding): KeyCode {
        const keyCode = keybinding.keyCode;
        const sequence: Keystroke = {
            first: Key.getKey(monaco2BrowserKeyCode(keyCode & 255)),
            modifiers: []
        };
        if (keybinding.ctrlKey) {
            if (isOSX) {
                sequence.modifiers!.push(KeyModifier.MacCtrl);
            } else {
                sequence.modifiers!.push(KeyModifier.CtrlCmd);
            }
        }
        if (keybinding.shiftKey) {
            sequence.modifiers!.push(KeyModifier.Shift);
        }
        if (keybinding.altKey) {
            sequence.modifiers!.push(KeyModifier.Alt);
        }
        if (keybinding.metaKey && sequence.modifiers!.indexOf(KeyModifier.CtrlCmd) === -1) {
            sequence.modifiers!.push(KeyModifier.CtrlCmd);
        }
        return KeyCode.createKeyCode(sequence);
    }
}
