/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { isOSX } from './os';

export declare type Accelerator = string[];

export const AcceleratorProvider = Symbol("AcceleratorProvider");

export interface AcceleratorProvider {
    getAccelerator(keyCode: KeyCode): Accelerator
}

/**
 * The key sequence for this binding. This key sequence should consist of one or more key strokes. Key strokes
 * consist of one or more keys held down at the same time. This should be zero or more modifier keys, and one other key.
 * Since `M2+M3+<Key>` (Alt+Shift+<Key>) is reserved on MacOS X for writing special characters, such bindings are commonly
 * undefined for platform MacOS X and redefined as `M1+M3+<Key>`. The rule applies on the `M3+M2+<Key>` sequence.
 */
export declare type Keystroke = { first: Key, modifiers?: Modifier[] };

/**
 * Representation of a platform independent key code.
 */
export class KeyCode {

    public readonly key: Key;
    public readonly ctrl: boolean;
    public readonly shift: boolean;
    public readonly alt: boolean;
    public readonly meta: boolean;

    // TODO: support chrods properly. Currently, second sequence is ignored.
    public constructor(public readonly keystroke: string) {
        // const chord = ((secondSequence & 0x0000ffff) << 16) >>> 0;
        // (firstSequence | chord) >>> 0;
        const parts = keystroke.split('+');
        this.key = Key.getKey(parts[0]);
        if (isOSX) {
            this.meta = parts.some(part => part === Modifier.M1);
            this.shift = parts.some(part => part === Modifier.M2);
            this.alt = parts.some(part => part === Modifier.M3);
            this.ctrl = parts.some(part => part === Modifier.M4);
        } else {
            this.meta = false;
            this.ctrl = parts.some(part => part === Modifier.M1);
            this.shift = parts.some(part => part === Modifier.M2);
            this.alt = parts.some(part => part === Modifier.M3);
        }
    }

    /**
     * Validates a string representation of a keybinding
     * @param keybinding Keybinding in the format 'Ctrl+KeyA'
     */
    isKeybindingValid(keybinding: string): boolean {
        const keys = keybinding.split('+');

        // Check to see if only unique elements are in the keyCode i.e 'Ctrl+T' is valid but 'Ctrl+T+T' isn't
        const valueArr = keys.map(function (item) { return item; });
        const isDuplicate = valueArr.some(function (item, idx) {
            return valueArr.indexOf(item) !== idx;
        });
        if (isDuplicate) {
            return false;
        }

        // Check to see if all keys are valid keycodes i.e 'Ctrl+T' is valid but 'Ctl+TT' isn't
        // replaceable by isKey?
        for (const keyString of keys) {
            const key = CODE_TO_KEY[keyString];
            if (key === undefined) {
                return false;
            }
        }

        return true;
    }

    /**
     * Parses a Keystroke object from a string.
     * @param keybinding String representation of a keybinding
     */
    public static parseKeystroke(keybinding: string): KeyCode | undefined {

        const sequence: string[] = [];
        const keys = keybinding.split('+');
        for (const keyString of keys) {
            const key = CODE_TO_KEY[keyString];
            if (Key.isKey(key)) {
                if (Key.isModifier(key.code)) {
                    sequence.push(MODIFIERS.filter(item => item.code === key.code)[0].code);
                } else {
                    sequence.push(key.code);
                }
            } else {
                return undefined;
            }
        }

        return new KeyCode(sequence.join('+'));
    }

    public static createKeyCode(event: KeyboardEvent | Keystroke): KeyCode {
        if (event instanceof KeyboardEvent) {
            const code = KeyCode.toCode(event);

            const sequence: string[] = [];
            if (!Key.isModifier(code)) {
                sequence.push(code);
            }

            // CTRL + COMMAND (M1)
            if ((isOSX && event.metaKey) || event.ctrlKey) {
                sequence.push(`${Modifier.M1}`);
            }

            // SHIFT (M2)
            if (event.shiftKey) {
                sequence.push(`${Modifier.M2}`);
            }

            // ALT (M3)
            if (event.altKey) {
                sequence.push(`${Modifier.M3}`);
            }

            // CTRL on MacOS X (M4)
            if (isOSX && !event.metaKey && event.ctrlKey) {
                sequence.push(`${Modifier.M4}`);
            }

            return new KeyCode(sequence.join('+'));
        } else {
            return new KeyCode([event.first.code]
                .concat((event.modifiers || []).sort().map(modifier => `${modifier}`))
                .join('+'));
        }
    }

    public static toCode(event: KeyboardEvent): string {
        if (event.keyCode) {
            const key = Key.getKey(event.keyCode);
            if (key) {
                return key.code;
            }
        }
        if (event.code) {
            return event.code;
        }
        // tslint:disable-next-line:no-any
        const e = event as any;
        if (e.keyIdentifier) {
            return e.keyIdentifier;
        }
        if (event.which) {
            const key = Key.getKey(event.which);
            if (key) {
                return key.code;
            }
        }
        throw new Error(`Cannot get key code from the keyboard event: ${event}.`);
    }

    equals(event: KeyboardEvent | KeyCode): boolean {
        return (event instanceof KeyCode ? event : KeyCode.createKeyCode(event)).keystroke === this.keystroke;
    }

}

export enum Modifier {
    /**
     * M1 is the COMMAND key on MacOS X, and the CTRL key on most other platforms.
     */
    M1 = "M1",
    /**
     * M2 is the SHIFT key.
     */
    M2 = "M2",
    /**
     * M3 is the Option key on MacOS X, and the ALT key on most other platforms.
     */
    M3 = "M3",
    /**
     * M4 is the CTRL key on MacOS X, and is undefined on other platforms.
     */
    M4 = "M4"
}

export declare type Key = { code: string, keyCode: number };

const CODE_TO_KEY: { [code: string]: Key } = {};
const KEY_CODE_TO_KEY: { [keyCode: number]: Key } = {};
const MODIFIERS: Key[] = [];

export namespace Key {

    export function isKey(arg: any): arg is Key {
        return arg && (<Key>arg).code !== undefined && (<Key>arg).keyCode !== undefined;
    }

    export function getKey(arg: string | number) {
        if (typeof arg === "number") {
            return KEY_CODE_TO_KEY[arg] || {
                code: 'unknown',
                keyCode: arg
            };
        } else {
            return CODE_TO_KEY[arg];
        }
    }

    export function isModifier(arg: string | number) {
        if (typeof arg === "number") {
            return MODIFIERS.map(key => key.keyCode).indexOf(arg) > 0;
        }
        return MODIFIERS.map(key => key.code).indexOf(arg) > 0;
    }

    export const ENTER: Key = { code: "Enter", keyCode: 13 };
    export const SPACE: Key = { code: "Space", keyCode: 32 };
    export const TAB: Key = { code: "Tab", keyCode: 9 };
    export const BACKSPACE: Key = { code: "Backspace", keyCode: 8 };
    export const DELETE: Key = { code: "Delete", keyCode: 46 };
    export const END: Key = { code: "End", keyCode: 35 };
    export const HOME: Key = { code: "Home", keyCode: 36 };
    export const INSERT: Key = { code: "Insert", keyCode: 45 };
    export const PAGE_DOWN: Key = { code: "PageDown", keyCode: 34 };
    export const PAGE_UP: Key = { code: "PageUp", keyCode: 33 };
    export const ARROW_DOWN: Key = { code: "ArrowDown", keyCode: 40 };
    export const ARROW_LEFT: Key = { code: "ArrowLeft", keyCode: 37 };
    export const ARROW_RIGHT: Key = { code: "ArrowRight", keyCode: 39 };
    export const ARROW_UP: Key = { code: "ArrowUp", keyCode: 38 };
    export const ESCAPE: Key = { code: "Escape", keyCode: 27 };

    export const ALT_LEFT: Key = { code: "AltLeft", keyCode: 18 };
    export const ALT_RIGHT: Key = { code: "AltRight", keyCode: 18 };
    export const CAPS_LOCK: Key = { code: "CapsLock", keyCode: 20 };
    export const CONTROL_LEFT: Key = { code: "ControlLeft", keyCode: 17 };
    export const CONTROL_RIGHT: Key = { code: "ControlRight", keyCode: 17 };
    export const O_S_LEFT: Key = { code: "OSLeft", keyCode: 91 };
    export const O_S_RIGHT: Key = { code: "OSRight", keyCode: 92 };
    export const SHIFT_LEFT: Key = { code: "ShiftLeft", keyCode: 16 };
    export const SHIFT_RIGHT: Key = { code: "ShiftRight", keyCode: 16 };

    export const DIGIT1: Key = { code: "Digit1", keyCode: 49 };
    export const DIGIT2: Key = { code: "Digit2", keyCode: 50 };
    export const DIGIT3: Key = { code: "Digit3", keyCode: 51 };
    export const DIGIT4: Key = { code: "Digit4", keyCode: 52 };
    export const DIGIT5: Key = { code: "Digit5", keyCode: 53 };
    export const DIGIT6: Key = { code: "Digit6", keyCode: 54 };
    export const DIGIT7: Key = { code: "Digit7", keyCode: 55 };
    export const DIGIT8: Key = { code: "Digit8", keyCode: 56 };
    export const DIGIT9: Key = { code: "Digit9", keyCode: 57 };
    export const DIGIT0: Key = { code: "Digit0", keyCode: 48 };

    export const KEY_A: Key = { code: "KeyA", keyCode: 65 };
    export const KEY_B: Key = { code: "KeyB", keyCode: 66 };
    export const KEY_C: Key = { code: "KeyC", keyCode: 67 };
    export const KEY_D: Key = { code: "KeyD", keyCode: 68 };
    export const KEY_E: Key = { code: "KeyE", keyCode: 69 };
    export const KEY_F: Key = { code: "KeyF", keyCode: 70 };
    export const KEY_G: Key = { code: "KeyG", keyCode: 71 };
    export const KEY_H: Key = { code: "KeyH", keyCode: 72 };
    export const KEY_I: Key = { code: "KeyI", keyCode: 73 };
    export const KEY_J: Key = { code: "KeyJ", keyCode: 74 };
    export const KEY_K: Key = { code: "KeyK", keyCode: 75 };
    export const KEY_L: Key = { code: "KeyL", keyCode: 76 };
    export const KEY_M: Key = { code: "KeyM", keyCode: 77 };
    export const KEY_N: Key = { code: "KeyN", keyCode: 78 };
    export const KEY_O: Key = { code: "KeyO", keyCode: 79 };
    export const KEY_P: Key = { code: "KeyP", keyCode: 80 };
    export const KEY_Q: Key = { code: "KeyQ", keyCode: 81 };
    export const KEY_R: Key = { code: "KeyR", keyCode: 82 };
    export const KEY_S: Key = { code: "KeyS", keyCode: 83 };
    export const KEY_T: Key = { code: "KeyT", keyCode: 84 };
    export const KEY_U: Key = { code: "KeyU", keyCode: 85 };
    export const KEY_V: Key = { code: "KeyV", keyCode: 86 };
    export const KEY_W: Key = { code: "KeyW", keyCode: 87 };
    export const KEY_X: Key = { code: "KeyX", keyCode: 88 };
    export const KEY_Y: Key = { code: "KeyY", keyCode: 89 };
    export const KEY_Z: Key = { code: "KeyZ", keyCode: 90 };

    export const F1: Key = { code: "F1", keyCode: 112 };
    export const F2: Key = { code: "F2", keyCode: 113 };
    export const F3: Key = { code: "F3", keyCode: 114 };
    export const F4: Key = { code: "F4", keyCode: 115 };
    export const F5: Key = { code: "F5", keyCode: 116 };
    export const F6: Key = { code: "F6", keyCode: 117 };
    export const F7: Key = { code: "F7", keyCode: 118 };
    export const F8: Key = { code: "F8", keyCode: 119 };
    export const F9: Key = { code: "F9", keyCode: 120 };
    export const F10: Key = { code: "F10", keyCode: 121 };
    export const F11: Key = { code: "F11", keyCode: 122 };
    export const F12: Key = { code: "F12", keyCode: 123 };
    export const F13: Key = { code: "F13", keyCode: 124 };
    export const F14: Key = { code: "F14", keyCode: 125 };
    export const F15: Key = { code: "F15", keyCode: 126 };
    export const F16: Key = { code: "F16", keyCode: 127 };
    export const F17: Key = { code: "F17", keyCode: 128 };
    export const F18: Key = { code: "F18", keyCode: 129 };
    export const F19: Key = { code: "F19", keyCode: 130 };
    export const F20: Key = { code: "F20", keyCode: 131 };
    export const F21: Key = { code: "F21", keyCode: 132 };
    export const F22: Key = { code: "F22", keyCode: 133 };
    export const F23: Key = { code: "F23", keyCode: 134 };
    export const F24: Key = { code: "F24", keyCode: 135 };

    export const COMMA: Key = { code: "Comma", keyCode: 188 };
    export const PERIOD: Key = { code: "Period", keyCode: 190 };
    export const SLASH: Key = { code: "Slash", keyCode: 191 };
    export const SEMICOLON: Key = { code: "Semicolon", keyCode: 186 };
    export const QUOTE: Key = { code: "Quote", keyCode: 222 };
    export const BRACKET_LEFT: Key = { code: "BracketLeft", keyCode: 219 };
    export const BRACKET_RIGHT: Key = { code: "BracketRight", keyCode: 221 };
    export const BACKQUOTE: Key = { code: "Backquote", keyCode: 192 };
    export const BACKSLASH: Key = { code: "Backslash", keyCode: 220 };
    export const MINUS: Key = { code: "Minus", keyCode: 189 };
    export const EQUAL: Key = { code: "Equal", keyCode: 187 };
    export const INTL_RO: Key = { code: "IntlRo", keyCode: 193 };
    export const INTL_YEN: Key = { code: "IntlYen", keyCode: 255 };

}

(() => {
    Object.keys(Key).map(prop => Reflect.get(Key, prop)).filter(key => Key.isKey(key)).forEach(key => {
        CODE_TO_KEY[key.code] = key;
        KEY_CODE_TO_KEY[key.keyCode] = key;
    });
    MODIFIERS.push(...[Key.ALT_LEFT, Key.ALT_RIGHT, Key.CONTROL_LEFT, Key.CONTROL_RIGHT, Key.O_S_LEFT, Key.O_S_RIGHT, Key.SHIFT_LEFT, Key.SHIFT_RIGHT]);
})();
