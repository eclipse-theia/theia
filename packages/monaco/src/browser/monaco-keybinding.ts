/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/common/keybinding';
import { Accelerator, Key, TheiaKeyCodeUtils, KeyCode, Keystroke, Modifier } from '@theia/core/lib/common/keys';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { KEY_CODE_MAP } from './monaco-keycode-map';
import KeybindingsRegistry = monaco.keybindings.KeybindingsRegistry;
import KeyCodeUtils = monaco.keybindings.KeyCodeUtils;

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

    constructor(
        @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry
    ) { }

    registerDefaultKeyBindings(registry: KeybindingRegistry): void {
        for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
            const commandId = this.commands.validate(item.command);
            if (commandId) {
                const raw = item.keybinding;
                if (raw.type === monaco.keybindings.KeybindingType.Simple) {
                    const keybinding = raw as monaco.keybindings.SimpleKeybinding;
                    registry.registerDefaultKeyBinding({
                        commandId,
                        keyCode: this.keyCode(keybinding),
                        accelerator: this.accelerator(keybinding)
                    });
                } else {
                    // FIXME support chord keybindings properly, KeyCode does not allow it right now
                }
            }
        }

        // `Select All` is not an editor action just like everything else.
        const selectAllCommand = this.commands.validate(MonacoCommands.SELECTION_SELECT_ALL);
        if (selectAllCommand) {
            registry.registerDefaultKeyBinding({
                commandId: selectAllCommand,
                keyCode: TheiaKeyCodeUtils.createKeyCode({ first: Key.KEY_A, modifiers: [Modifier.M1] }),
                accelerator: ['Accel A']
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
            sequence.modifiers!.push(Modifier.M1);
        }
        if (keybinding.shiftKey) {
            sequence.modifiers!.push(Modifier.M2);
        }
        if (keybinding.altKey) {
            sequence.modifiers!.push(Modifier.M3);
        }
        if (keybinding.metaKey) {
            sequence.modifiers!.push(Modifier.M4);
        }
        return TheiaKeyCodeUtils.createKeyCode(sequence);
    }

    protected accelerator(keybinding: monaco.keybindings.SimpleKeybinding): Accelerator {
        const keyCode = keybinding.keyCode;
        const keys: string[] = [];
        if (keybinding.metaKey) {
            keys.push('Accel');
        }
        if (keybinding.altKey) {
            keys.push('Alt');
        }
        if (keybinding.ctrlKey) {
            keys.push('Accel');
        }
        if (keybinding.shiftKey) {
            keys.push('Shift');
        }
        keys.push(KeyCodeUtils.toString(keyCode & 255));
        return [keys.join(' ')];
    }

}
