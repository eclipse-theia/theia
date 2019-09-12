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
import { KeybindingContribution, KeybindingRegistry, Key, KeyCode, Keystroke, KeyModifier, KeySequence } from '@theia/core/lib/browser';
import { EditorKeybindingContexts } from '@theia/editor/lib/browser';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { KEY_CODE_MAP } from './monaco-keycode-map';
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
        const defaultKeybindings = monaco.keybindings.KeybindingsRegistry.getDefaultKeybindings();
        // register in reverse order to align with Monaco dispatch logic:
        // https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/platform/keybinding/common/keybindingResolver.ts#L302
        for (let i = defaultKeybindings.length - 1; i >= 0; i--) {
            const item = defaultKeybindings[i];
            const command = this.commands.validate(item.command);
            if (command) {
                const raw = item.keybinding;
                const when = item.when && item.when.serialize();
                const keybinding = raw instanceof monaco.keybindings.SimpleKeybinding
                    ? this.keyCode(raw).toString()
                    : this.keySequence(raw as monaco.keybindings.ChordKeybinding).join(' ');
                registry.registerKeybinding({ command, keybinding, when });
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
            first: Key.getKey(monaco2BrowserKeyCode(keyCode & 0xff)),
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

    protected keySequence(keybinding: monaco.keybindings.ChordKeybinding): KeySequence {
        return keybinding.parts.map(part => this.keyCode(part));
    }
}
