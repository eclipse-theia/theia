/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { isOSX } from '../../application/common/os';
import { isFirefox, isIE, isWebKit } from '../../application/browser';
import { Keybinding, KeybindingContribution, KeybindingRegistry } from '../../application/common/keybinding';
import { Accelerator, Key, KeyCode, Keystroke, Modifier } from '../../application/common/keys';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import KeybindingsRegistry = monaco.keybindings.KeybindingsRegistry;
import KeyCodeUtils = monaco.keybindings.KeyCodeUtils;
import IKeybindingItem = monaco.keybindings.IKeybindingItem;
import KeyMod = monaco.KeyMod;

const MONACO_KEY_CODE_MAP: { [keyCode: number]: number } = {};
(() => {
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PauseBreak] = 3; // VK_CANCEL 0x03 Control-break processing
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Backspace] = 8;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Tab] = 9;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Enter] = 13;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Shift] = 16;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Ctrl] = 17;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Alt] = 18;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PauseBreak] = 19;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.CapsLock] = 20;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Escape] = 27;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Space] = 32;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PageUp] = 33;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PageDown] = 34;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.End] = 35;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Home] = 36;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.LeftArrow] = 37;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.UpArrow] = 38;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.RightArrow] = 39;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.DownArrow] = 40;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Insert] = 45;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Delete] = 46;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_0] = 48;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_1] = 49;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_2] = 50;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_3] = 51;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_4] = 52;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_5] = 53;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_6] = 54;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_7] = 55;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_8] = 56;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_9] = 57;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_A] = 65;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_B] = 66;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_C] = 67;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_D] = 68;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_E] = 69;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_F] = 70;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_G] = 71;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_H] = 72;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_I] = 73;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_J] = 74;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_K] = 75;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_L] = 76;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_M] = 77;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_N] = 78;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_O] = 79;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_P] = 80;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Q] = 81;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_R] = 82;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_S] = 83;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_T] = 84;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_U] = 85;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_V] = 86;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_W] = 87;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_X] = 88;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Y] = 89;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Z] = 90;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.ContextMenu] = 93;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_0] = 96;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_1] = 97;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_2] = 98;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_3] = 99;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_4] = 100;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_5] = 101;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_6] = 102;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_7] = 103;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_8] = 104;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_9] = 105;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_MULTIPLY] = 106;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_ADD] = 107;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_SEPARATOR] = 108;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_SUBTRACT] = 109;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_DECIMAL] = 110;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_DIVIDE] = 111;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.F1] = 112;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F2] = 113;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F3] = 114;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F4] = 115;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F5] = 116;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F6] = 117;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F7] = 118;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F8] = 119;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F9] = 120;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F10] = 121;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F11] = 122;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F12] = 123;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F13] = 124;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F14] = 125;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F15] = 126;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F16] = 127;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F17] = 128;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F18] = 129;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F19] = 130;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.NumLock] = 144;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.ScrollLock] = 145;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SEMICOLON] = 186;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_EQUAL] = 187;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_COMMA] = 188;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_MINUS] = 189;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_DOT] = 190;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SLASH] = 191;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_BACKTICK] = 192;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_OPEN_SQUARE_BRACKET] = 219;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_BACKSLASH] = 220;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_CLOSE_SQUARE_BRACKET] = 221;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_QUOTE] = 222;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.OEM_8] = 223;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.OEM_102] = 226;

    if (isIE) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 91;
    } else if (isFirefox) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SEMICOLON] = 59;
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_EQUAL] = 107;
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_MINUS] = 109;
        if (isOSX) {
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 224;
        }
    } else if (isWebKit) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 91;
        if (isOSX) {
            // the two meta keys in the Mac have different key codes (91 and 93)
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 93;
        } else {
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 92;
        }
    }
})();

@injectable()
export class MonacoKeybindingContribution implements KeybindingContribution {

    registerKeyBindings(registry: KeybindingRegistry): void {

        const ids = MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command.id);
        const accelerator = (kb: IKeybindingItem): Accelerator => {
            const keyCode = kb.keybinding;
            let keys: string[] = [];
            if (keyCode & KeyMod.WinCtrl) {
                keys.push('Accel');
            }
            if (keyCode & KeyMod.Alt) {
                keys.push('Alt');
            }
            if (keyCode & KeyMod.CtrlCmd) {
                keys.push('Accel');
            }
            if (keyCode & KeyMod.Shift) {
                keys.push('Shift');
            }
            keys.push(KeyCodeUtils.toString(keyCode & 255));
            return [keys.join(' ')];
        }

        const keyCode = (kb: IKeybindingItem): KeyCode => {
            const keyCode = kb.keybinding;
            const sequence: Keystroke = {
                first: Key.getKey(MONACO_KEY_CODE_MAP[kb.keybinding & 255]),
                modifiers: []
            }
            // CTRL + COMMAND
            if ((keyCode & KeyMod.CtrlCmd) || (keyCode & KeyMod.WinCtrl)) {
                sequence.modifiers!.push(Modifier.M1);
            }
            // SHIFT
            if (keyCode & KeyMod.Shift) {
                sequence.modifiers!.push(Modifier.M2);
            }
            // ALT
            if (keyCode & KeyMod.Alt) {
                sequence.modifiers!.push(Modifier.M3);
            }
            // MacOS X CTRL
            if (isOSX && keyCode & KeyMod.WinCtrl) {
                sequence.modifiers!.push(Modifier.M4);
            }
            return KeyCode.createKeyCode(sequence);
        }

        const bindings: Keybinding[] = KeybindingsRegistry.getDefaultKeybindings()
            .filter(kb => ids.indexOf(kb.command) >= 0)
            .map(kb => {
                return {
                    commandId: kb.command,
                    keyCode: keyCode(kb),
                    accelerator: accelerator(kb),
                }
            });

        bindings.forEach(binding => {
            registry.registerKeyBinding(binding);
        })

    }

}