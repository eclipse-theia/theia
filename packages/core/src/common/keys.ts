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
    getAccelerator(keyCode: TheiaKeyCodeUtils): Accelerator
}

/**
 * The key sequence for this binding. This key sequence should consist of one or more key strokes. Key strokes
 * consist of one or more keys held down at the same time. This should be zero or more modifier keys, and one other key.
 * Since `M2+M3+<Key>` (Alt+Shift+<Key>) is reserved on MacOS X for writing special characters, such bindings are commonly
 * undefined for platform MacOS X and redefined as `M1+M3+<Key>`. The rule applies on the `M3+M2+<Key>` sequence.
 */
export declare type Keystroke = { first: Key, modifiers?: Modifier[] };

export interface KeyCode {
    key: Key;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

/**
 * Representation of a platform independent key code.
 */
export class TheiaKeyCodeUtils {
    // TODO: support chrods properly. Currently, second sequence is ignored.
    /**
     * Parses a Keystroke object from a string.
     * @param keybinding String representation of a keybinding
     */
    public static parseKeystroke(keybinding: string): KeyCode | undefined {

        const keycode: KeyCode = {
            key: { code: "", keyCode: 0 },

            ctrl: false,
            shift: false,
            alt: false,
            meta: false
        };

        const keys = keybinding.split('+');
        for (const keyString of keys) {
            const key = EASY_TO_KEY[keyString];

            if (keyString === 'meta') {
                if (keycode.meta === true) {
                    return undefined; // meta+meta+ (2 times ctrl)
                } else {
                    keycode.meta = true;
                }
            }
            if (Key.isKey(key)) {
                if (Key.isModifier(key.code)) {
                    if (key.keyCode === EasyKey.CONTROL.keyCode) {
                        if (keycode.ctrl === true) {
                            return undefined; // ctrl+ctrl+ (2 times ctrl)
                        } else {
                            keycode.ctrl = true;
                        }
                    } else if (key.keyCode === EasyKey.SHIFT.keyCode) {
                        if (keycode.shift === true) {
                            return undefined; // shift+shift+ (2 times ctrl)
                        } else {
                            keycode.shift = true;
                        }
                    } else if (key.keyCode === EasyKey.ALT.keyCode) {
                        if (keycode.alt === true) {
                            return undefined; // alt+alt+ (2 times ctrl)
                        } else {
                            keycode.alt = true;
                        }
                    }
                } else {
                    if (keycode.key.code === "") {
                        keycode.key = key;

                        // There are two keys i.e Ctrl+A+B
                    } else {
                        return undefined;
                    }
                }
            } else {
                return undefined;
            }
        }

        return keycode;
    }

    public static createKeyCode(event: KeyboardEvent | Keystroke): KeyCode {
        const keycode: KeyCode = {
            key: { code: "", keyCode: 0 },

            ctrl: false,
            shift: false,
            alt: false,
            meta: false
        };

        if (event instanceof KeyboardEvent) {
            const code = TheiaKeyCodeUtils.toCode(event);

            if (!Key.isModifier(code)) {
                keycode.key = CODE_TO_KEY[code];
            }

            if (isOSX) {
                // META key on OS X
                if (event.metaKey) {
                    keycode.meta = true;
                }

                // CTRL on OS X (M4)
                if (!event.metaKey && event.ctrlKey) {
                    keycode.ctrl = true;
                }
            } else {
                // CTRL on Windows/Linux
                if (event.ctrlKey) {
                    keycode.ctrl = true;
                }
            }

            // SHIFT (M2)
            if (event.shiftKey) {
                keycode.shift = true;
            }

            // ALT (M3)
            if (event.altKey) {
                keycode.alt = true;
            }

            return keycode;
        } else {
            keycode.key = Key.getKey(event.first.code);
            if (event.modifiers) {
                for (const mod of event.modifiers) {
                    if (isOSX) {
                        if (mod === Modifier.M1) {
                            keycode.meta = true;
                        } else if (mod === Modifier.M2) {
                            keycode.shift = true;
                        } else if (mod === Modifier.M3) {
                            keycode.alt = true;
                        } else if (mod === Modifier.M4) {
                            keycode.ctrl = true;
                        }
                    } else {
                        if (mod === Modifier.M1) {
                            keycode.ctrl = true;
                        } else if (mod === Modifier.M2) {
                            keycode.shift = true;
                        } else if (mod === Modifier.M3) {
                            keycode.alt = true;
                        }
                    }
                }
            }
        }
        return keycode;
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

    public static equals(keycode1: KeyCode, keycode2: KeyCode): boolean {
        return keycode1.alt === keycode2.alt &&
            keycode1.ctrl === keycode2.ctrl &&
            keycode1.key.code === keycode2.key.code &&
            keycode1.key.keyCode === keycode2.key.keyCode &&
            keycode1.meta === keycode2.meta &&
            keycode1.shift === keycode2.shift;
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
export declare type EasyKey = { keyCode: number, easyString: string };

const CODE_TO_KEY: { [code: string]: Key } = {};
const KEY_CODE_TO_KEY: { [keyCode: number]: Key } = {};
const KEY_CODE_TO_EASY: { [keyCode: number]: EasyKey } = {};
const EASY_TO_KEY: { [code: string]: Key } = {}; // From 'ctrl' to Key structure
const MODIFIERS: Key[] = [];

export namespace EasyKey {
    export const ENTER: EasyKey = { keyCode: 13, easyString: 'enter' };
    export const SPACE: EasyKey = { keyCode: 32, easyString: 'space' };
    export const TAB: EasyKey = { keyCode: 9, easyString: 'tab' };
    export const DELETE: EasyKey = { keyCode: 46, easyString: 'delete' };
    export const END: EasyKey = { keyCode: 35, easyString: 'end' };
    export const HOME: EasyKey = { keyCode: 36, easyString: 'home' };
    export const INSERT: EasyKey = { keyCode: 45, easyString: 'insert' };
    export const PAGE_DOWN: EasyKey = { keyCode: 34, easyString: 'pagedown' };
    export const PAGE_UP: EasyKey = { keyCode: 33, easyString: 'pageup' };
    export const ARROW_DOWN: EasyKey = { keyCode: 40, easyString: 'down' };
    export const ARROW_LEFT: EasyKey = { keyCode: 37, easyString: 'left' };
    export const ARROW_RIGHT: EasyKey = { keyCode: 39, easyString: 'right' };
    export const ARROW_UP: EasyKey = { keyCode: 38, easyString: 'up' };
    export const ESCAPE: EasyKey = { keyCode: 27, easyString: 'escape' };

    export const ALT: EasyKey = { keyCode: 18, easyString: 'alt' };
    export const CAPS_LOCK: EasyKey = { keyCode: 20, easyString: 'capslock' };
    export const CONTROL: EasyKey = { keyCode: 17, easyString: 'ctrl' };
    export const OS: EasyKey = { keyCode: 91, easyString: 'super' };
    export const SHIFT: EasyKey = { keyCode: 16, easyString: 'shift' };

    export const DIGIT1: EasyKey = { keyCode: 49, easyString: '1' };
    export const DIGIT2: EasyKey = { keyCode: 50, easyString: '2' };
    export const DIGIT3: EasyKey = { keyCode: 51, easyString: '3' };
    export const DIGIT4: EasyKey = { keyCode: 52, easyString: '4' };
    export const DIGIT5: EasyKey = { keyCode: 53, easyString: '5' };
    export const DIGIT6: EasyKey = { keyCode: 54, easyString: '6' };
    export const DIGIT7: EasyKey = { keyCode: 55, easyString: '7' };
    export const DIGIT8: EasyKey = { keyCode: 56, easyString: '8' };
    export const DIGIT9: EasyKey = { keyCode: 57, easyString: '9' };
    export const DIGIT0: EasyKey = { keyCode: 48, easyString: '0' };

    export const KEY_A: EasyKey = { keyCode: 65, easyString: 'a' };
    export const KEY_B: EasyKey = { keyCode: 66, easyString: 'b' };
    export const KEY_C: EasyKey = { keyCode: 67, easyString: 'c' };
    export const KEY_D: EasyKey = { keyCode: 68, easyString: 'd' };
    export const KEY_E: EasyKey = { keyCode: 69, easyString: 'e' };
    export const KEY_F: EasyKey = { keyCode: 70, easyString: 'f' };
    export const KEY_G: EasyKey = { keyCode: 71, easyString: 'g' };
    export const KEY_H: EasyKey = { keyCode: 72, easyString: 'h' };
    export const KEY_I: EasyKey = { keyCode: 73, easyString: 'i' };
    export const KEY_J: EasyKey = { keyCode: 74, easyString: 'j' };
    export const KEY_K: EasyKey = { keyCode: 75, easyString: 'k' };
    export const KEY_L: EasyKey = { keyCode: 76, easyString: 'l' };
    export const KEY_M: EasyKey = { keyCode: 77, easyString: 'm' };
    export const KEY_N: EasyKey = { keyCode: 78, easyString: 'n' };
    export const KEY_O: EasyKey = { keyCode: 79, easyString: 'o' };
    export const KEY_P: EasyKey = { keyCode: 80, easyString: 'p' };
    export const KEY_Q: EasyKey = { keyCode: 81, easyString: 'q' };
    export const KEY_R: EasyKey = { keyCode: 82, easyString: 'r' };
    export const KEY_S: EasyKey = { keyCode: 83, easyString: 's' };
    export const KEY_T: EasyKey = { keyCode: 84, easyString: 't' };
    export const KEY_U: EasyKey = { keyCode: 85, easyString: 'u' };
    export const KEY_V: EasyKey = { keyCode: 86, easyString: 'v' };
    export const KEY_W: EasyKey = { keyCode: 87, easyString: 'w' };
    export const KEY_X: EasyKey = { keyCode: 88, easyString: 'x' };
    export const KEY_Y: EasyKey = { keyCode: 89, easyString: 'y' };
    export const KEY_Z: EasyKey = { keyCode: 90, easyString: 'z' };

    export const F1: EasyKey = { keyCode: 112, easyString: 'f1' };
    export const F2: EasyKey = { keyCode: 113, easyString: 'f2' };
    export const F3: EasyKey = { keyCode: 114, easyString: 'f3' };
    export const F4: EasyKey = { keyCode: 115, easyString: 'f4' };
    export const F5: EasyKey = { keyCode: 116, easyString: 'f5' };
    export const F6: EasyKey = { keyCode: 117, easyString: 'f6' };
    export const F7: EasyKey = { keyCode: 118, easyString: 'f7' };
    export const F8: EasyKey = { keyCode: 119, easyString: 'f8' };
    export const F9: EasyKey = { keyCode: 120, easyString: 'f9' };
    export const F10: EasyKey = { keyCode: 121, easyString: 'f10' };
    export const F11: EasyKey = { keyCode: 122, easyString: 'f11' };
    export const F12: EasyKey = { keyCode: 123, easyString: 'f12' };
    export const F13: EasyKey = { keyCode: 124, easyString: 'f13' };
    export const F14: EasyKey = { keyCode: 125, easyString: 'f14' };
    export const F15: EasyKey = { keyCode: 126, easyString: 'f15' };
    export const F16: EasyKey = { keyCode: 127, easyString: 'f16' };
    export const F17: EasyKey = { keyCode: 128, easyString: 'f17' };
    export const F18: EasyKey = { keyCode: 129, easyString: 'f18' };
    export const F19: EasyKey = { keyCode: 130, easyString: 'f19' };
    export const F20: EasyKey = { keyCode: 131, easyString: 'f20' };
    export const F21: EasyKey = { keyCode: 132, easyString: 'f21' };
    export const F22: EasyKey = { keyCode: 133, easyString: 'f22' };
    export const F23: EasyKey = { keyCode: 134, easyString: 'f23' };
    export const F24: EasyKey = { keyCode: 135, easyString: 'f24' };

    export const COMMA: EasyKey = { keyCode: 188, easyString: ',' };
    export const PERIOD: EasyKey = { keyCode: 190, easyString: '.' };
    export const SEMICOLON: EasyKey = { keyCode: 186, easyString: ';' };
    export const QUOTE: EasyKey = { keyCode: 222, easyString: '\'' };
    export const BRACKET_LEFT: EasyKey = { keyCode: 219, easyString: '[' };
    export const BRACKET_RIGHT: EasyKey = { keyCode: 221, easyString: ']' };
    export const BACKQUOTE: EasyKey = { keyCode: 192, easyString: '\`' };
    export const BACKSLASH: EasyKey = { keyCode: 220, easyString: '\\' };
    export const MINUS: EasyKey = { keyCode: 189, easyString: '-' };
    export const EQUAL: EasyKey = { keyCode: 187, easyString: '=' };
}

export namespace Key {

    export function isKey(arg: any): arg is Key {
        return !!arg && ('code' in arg) && ('keyCode' in arg);
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

    Object.keys(EasyKey).map(prop => Reflect.get(EasyKey, prop)).forEach(easykey => {
        EASY_TO_KEY[easykey.easyString] = KEY_CODE_TO_KEY[easykey.keyCode];
        KEY_CODE_TO_EASY[easykey.code] = easykey;
    });
})();
