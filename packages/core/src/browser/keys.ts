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

import { isOSX } from '../common/os';

/**
 * The key sequence for this binding. This key sequence should consist of one or more key strokes. Key strokes
 * consist of one or more keys held down at the same time. This should be zero or more modifier keys, and zero or one other key.
 * Since `M2+M3+<Key>` (Alt+Shift+<Key>) is reserved on MacOS X for writing special characters, such bindings are commonly
 * undefined for platform MacOS X and redefined as `M1+M3+<Key>`. The rule applies on the `M3+M2+<Key>` sequence.
 */
export interface Keystroke {
    readonly first?: Key;
    readonly modifiers?: KeyModifier[];
}

export type KeySequence = KeyCode[];
export namespace KeySequence {

    export function equals(a: KeySequence, b: KeySequence) {
        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < a.length; i++) {
            if (a[i].equals(b[i]) === false) {
                return false;
            }
        }
        return true;
    }

    export enum CompareResult {
        NONE = 0,
        PARTIAL,
        SHADOW,
        FULL
    }

    /* Compares two KeySequences, returns:
     * FULL if the KeySequences are the same.
     * PARTIAL if the KeySequence a part of b.
     * SHADOW if the KeySequence b part of a.
     * NONE if the KeySequences are not the same at all.
     */
    export function compare(a: KeySequence, b: KeySequence): CompareResult {
        let first = a;
        let second = b;
        let shadow = false;

        if (b.length < a.length) {
            first = b;
            second = a;
            shadow = true;
        }

        for (let i = 0; i < first.length; i++) {
            if (first[i].equals(second[i]) === false) {
                return KeySequence.CompareResult.NONE;
            }
        }
        if (first.length < second.length) {
            if (shadow === false) {
                return KeySequence.CompareResult.PARTIAL;
            } else {
                return KeySequence.CompareResult.SHADOW;
            }
        }
        return KeySequence.CompareResult.FULL;
    }

    export function parse(keybinding: string): KeySequence {
        const keyCodes = [];
        const rawKeyCodes = keybinding.split(" ");
        for (const rawKeyCode of rawKeyCodes) {
            const keyCode = KeyCode.parse(rawKeyCode);
            if (keyCode !== undefined) {
                keyCodes.push(keyCode);
            }
        }
        return keyCodes;
    }

    /**
     * Return an array of strings representing the keys in this keysequence.
     * For example ['ctrlcmd p', 'ctrlcmd k'].  The character used between
     * keys can be overriden using `separator`.
     */
    export function acceleratorFor(keySequence: KeySequence, separator: string = " "): string[] {
        const result: string[] = [];
        for (const keyCode of keySequence) {
            let keyCodeResult = "";
            let previous = false;

            if (keyCode.meta && isOSX) {
                if (isOSX) {
                    keyCodeResult += "Cmd";
                    previous = true;
                }
            }

            if (keyCode.ctrl) {
                if (previous) {
                    keyCodeResult += separator;
                }
                keyCodeResult += "Ctrl";
                previous = true;
            }

            if (keyCode.alt) {
                if (previous) {
                    keyCodeResult += separator;
                }
                keyCodeResult += "Alt";
                previous = true;
            }

            if (keyCode.shift) {
                if (previous) {
                    keyCodeResult += separator;
                }
                keyCodeResult += "Shift";
                previous = true;
            }

            if (keyCode.key) {

                if (previous) {
                    keyCodeResult += separator;
                }

                const keyString = Key.getEasyKey(keyCode.key).easyString;

                if (keyCode.key.keyCode >= Key.KEY_A.keyCode && keyCode.key.keyCode <= Key.KEY_Z.keyCode ||
                    keyCode.key.keyCode >= Key.F1.keyCode && keyCode.key.keyCode <= Key.F24.keyCode) {
                    /* We want to capitalize single letters and function keys */
                    keyCodeResult += keyString.toUpperCase();
                } else if (Key.getEasyKey(keyCode.key).easyString.length > 1) {
                    /* We want to only capitalize the first letter */
                    keyCodeResult += keyString.charAt(0).toUpperCase() + keyString.slice(1);
                } else {
                    /* Return the symbol as is */
                    keyCodeResult += keyString;
                }
            }
            result.push(keyCodeResult);
        }
        return result;
    }
}

/**
 * Representation of a platform independent key code.
 */
export class KeyCode {

    public readonly key: Key | undefined = undefined;
    public readonly ctrl: boolean;
    public readonly shift: boolean;
    public readonly alt: boolean;
    public readonly meta: boolean;
    private static keybindings: { [key: string]: KeyCode } = {};

    public constructor(public readonly keystroke: string, public readonly character?: string) {
        const parts = keystroke.split('+');

        if (parts.every(KeyCode.isModifierString) === false) {
            this.key = Key.getKey(parts[0]);
        }

        if (isOSX) {
            this.meta = parts.some(part => part === KeyModifier.CtrlCmd);
            this.shift = parts.some(part => part === KeyModifier.Shift);
            this.alt = parts.some(part => part === KeyModifier.Alt);
            this.ctrl = parts.some(part => part === KeyModifier.MacCtrl);
        } else {
            this.meta = false;
            this.ctrl = parts.some(part => part === KeyModifier.CtrlCmd);
            this.shift = parts.some(part => part === KeyModifier.Shift);
            this.alt = parts.some(part => part === KeyModifier.Alt);
        }
    }

    /* Return true of string is a modifier M1 to M4 */
    public static isModifierString(key: string) {
        if (key === KeyModifier.CtrlCmd
            || key === KeyModifier.Shift
            || key === KeyModifier.Alt
            || key === KeyModifier.MacCtrl) {
            return true;
        }
        return false;
    }

    /**
     * Returns true KeyCode only contains modifiers.
     */
    public isModifierOnly() {
        if (this.key === undefined) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Parses a string and returns a KeyCode object.
     * @param keybinding String representation of a keybinding
     */
    public static parse(keybinding: string): KeyCode {

        if (KeyCode.keybindings[keybinding]) {
            return KeyCode.keybindings[keybinding];
        }

        const sequence: string[] = [];
        const keys = keybinding.split('+');
        /* If duplicates i.e ctrl+ctrl+a or alt+alt+b or b+alt+b it is invalid */
        if (keys.length !== new Set(keys).size) {
            throw new Error(`Can't parse keybinding ${keybinding} Duplicate modifiers`);
        }

        for (let keyString of keys) {
            if (SPECIAL_ALIASES[keyString] !== undefined) {
                keyString = SPECIAL_ALIASES[keyString];
            }
            const key = EASY_TO_KEY[keyString];

            /* meta only works on macOS */
            if (keyString === SpecialCases.META) {
                if (isOSX) {
                    sequence.push(`${KeyModifier.CtrlCmd}`);
                } else {
                    throw new Error(`Can't parse keybinding ${keybinding} meta is for OSX only`);
                }
                /* ctrlcmd for M1 keybindings that work on both macOS and other platforms */
            } else if (keyString === SpecialCases.CTRLCMD) {
                sequence.push(`${KeyModifier.CtrlCmd}`);
            } else if (Key.isKey(key)) {
                if (Key.isModifier(key.code)) {
                    if (key.keyCode === EasyKey.CONTROL.keyCode) {
                        // CTRL on MacOS X (M4)
                        if (isOSX) {
                            sequence.push(`${KeyModifier.MacCtrl}`);
                        } else {
                            sequence.push(`${KeyModifier.CtrlCmd}`);
                        }
                    } else if (key.keyCode === EasyKey.SHIFT.keyCode) {
                        sequence.push(`${KeyModifier.Shift}`);
                    } else if (key.keyCode === EasyKey.ALT.keyCode) {
                        sequence.push(`${KeyModifier.Alt}`);
                    }
                } else {
                    sequence.unshift(key.code);
                }
            } else {
                throw new Error(`Unrecognized key <${keyString}> in <${keybinding}>`);
            }
        }

        // We need to sort the modifier keys, but on the modifiers, so it always keeps the M1 less than M2, M2 less than M3 and so on order.
        // We intentionally ignore other cases.
        sequence.sort((left: string, right: string) => KeyModifier.isModifier(left) && KeyModifier.isModifier(right) ? left.localeCompare(right) : 0);
        KeyCode.keybindings[keybinding] = new KeyCode(sequence.join('+'));
        return KeyCode.keybindings[keybinding];
    }

    public static createKeyCode(event: KeyboardEvent | Keystroke): KeyCode {
        if (KeyCode.isKeyboardEvent(event)) {
            const code = KeyCode.toCode(event);

            const sequence: string[] = [];
            if (!Key.isModifier(code)) {
                sequence.push(code);
            }

            // CTRL + COMMAND (M1)
            if ((isOSX && event.metaKey) || (!isOSX && event.ctrlKey)) {
                sequence.push(`${KeyModifier.CtrlCmd}`);
            }

            // SHIFT (M2)
            if (event.shiftKey) {
                sequence.push(`${KeyModifier.Shift}`);
            }

            // ALT (M3)
            if (event.altKey) {
                sequence.push(`${KeyModifier.Alt}`);
            }

            // CTRL on MacOS X (M4)
            if (isOSX && !event.metaKey && event.ctrlKey) {
                sequence.push(`${KeyModifier.MacCtrl}`);
            }

            return new KeyCode(sequence.join('+'), KeyCode.toCharacter(event));
        } else {
            const key = event.first ? [event.first.code] : [];
            return new KeyCode(key
                .concat((event.modifiers || []).sort().map(modifier => `${modifier}`))
                .join('+'));
        }
    }

    /**
     * Determine a code that can be turned into a Key using `Key.getKey()`.
     *
     * This function should consider the actual keyboard layout as much as possible, which is not supported
     * by the `code` property of `KeyboardEvent`. Some keyboard layouts contain keys that cannot be represented
     * with such a code (e.g. the &Ouml; key on German keyboards). In these cases this function often returns
     * the key code according to the US keyboard layout; `toCharacter()` might deliver a more appropriate hint
     * on which key was actually pressed.
     *
     * `keyIdentifier` is used to access this deprecated field:
     * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyIdentifier
     */
    public static toCode(event: KeyboardEvent & { readonly keyIdentifier?: string }): string {
        // A system and implementation dependent numerical code identifying the unmodified value of the pressed key.
        if (event.keyCode) {
            const key = Key.getKey(event.keyCode);
            if (key) {
                return key.code;
            }
        }
        // A "key identifier" string that can be used to determine what key was pressed.
        if (event.keyIdentifier) {
            const key = Key.getKey(event.keyIdentifier);
            if (key) {
                return key.code;
            }
        }
        // The numeric keyCode of the key pressed, or the character code (charCode) for an alphanumeric key pressed.
        if (event.which) {
            const key = Key.getKey(event.which);
            if (key) {
                return key.code;
            }
        }
        // A physical key on the keyboard, as opposed to the character generated by pressing the key.
        // This property returns a value which isn't altered by keyboard layout or the state of the modifier keys.
        if (event.code) {
            const key = Key.getKey(event.code);
            if (key) {
                return key.code;
            }
        }
        throw new Error(`Cannot get key code from the keyboard event: ${event}.`);
    }

    /**
     * Determine the actual printable character that is generated from a pressed key.
     * If the key does not correspond to a printable character, `undefined` is returned.
     * The result may be altered by modifier keys.
     */
    public static toCharacter(event: KeyboardEvent): string | undefined {
        const key = event.key;
        // Use the key property if it contains exactly one unicode character
        if (key && Array.from(key).length === 1) {
            return key;
        }
        const charCode = event.charCode;
        // Use the charCode property if it does not correspond to a unicode control character
        if (charCode && charCode > 0x1f && !(charCode >= 0x80 && charCode <= 0x9f)) {
            return String.fromCharCode(charCode);
        }
        return undefined;
    }

    public static equals(keyCode1: KeyCode, keyCode2: KeyCode): boolean {
        return JSON.stringify(keyCode1) === JSON.stringify(keyCode2);
    }

    equals(event: KeyboardEvent | KeyCode): boolean {
        return (event instanceof KeyCode ? event : KeyCode.createKeyCode(event)).keystroke === this.keystroke;
    }

    /* Reset the key hashmap, this is for testing purposes.  */
    public static resetKeyBindings() {
        KeyCode.keybindings = {};
    }

    /* Return a keybinding string compatible with the Keybinding.keybinding property.  */
    toString() {
        let result = "";
        let previous = false;

        if (this.meta) {
            result += SpecialCases.META;
            previous = true;
        }
        if (this.shift) {
            if (previous) {
                result += "+";
            }
            result += EasyKey.SHIFT.easyString;
            previous = true;
        }
        if (this.alt) {
            if (previous) {
                result += "+";
            }
            result += EasyKey.ALT.easyString;
            previous = true;
        }
        if (this.ctrl) {
            if (previous) {
                result += "+";
            }
            result += EasyKey.CONTROL.easyString;
            previous = true;
        }

        if (this.key) {
            if (previous) {
                result += "+";
            }

            result += KEY_CODE_TO_EASY[this.key.keyCode].easyString;
        }
        return result;
    }
}

export namespace KeyCode {

    /**
     * Determines a `true` of `false` value for the key code argument.
     */
    export type Predicate = (keyCode: KeyCode) => boolean;

    /**
     * Different scopes have different execution environments. This means that they have different built-ins
     * (different global object, different constructors, etc.). This may result in unexpected results. For instance,
     * `[] instanceof window.frames[0].Array` will return `false`, because `Array.prototype !== window.frames[0].Array`
     * and arrays inherit from the former.
     * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof
     *
     * Note: just add another check if the current `event.type` checking is insufficient.
     */
    export function isKeyboardEvent(event: object & Readonly<{ type?: string }>): event is KeyboardEvent {
        if (event instanceof KeyboardEvent) {
            return true;
        }
        const { type } = event;
        if (type) {
            return type === 'keypress' || type === 'keydown' || type === 'keyup';
        }
        return false;
    }

}

export enum KeyModifier {
    /**
     * M1 is the COMMAND key on MacOS X, and the CTRL key on most other platforms.
     */
    CtrlCmd = "M1",
    /**
     * M2 is the SHIFT key.
     */
    Shift = "M2",
    /**
     * M3 is the Option key on MacOS X, and the ALT key on most other platforms.
     */
    Alt = "M3",
    /**
     * M4 is the CTRL key on MacOS X, and is undefined on other platforms.
     */
    MacCtrl = "M4"
}

export namespace KeyModifier {
    /**
     * The CTRL key, independently of the platform.
     * _Note:_ In general `KeyModifier.CtrlCmd` should be preferred over this constant.
     */
    export const CTRL = isOSX ? KeyModifier.MacCtrl : KeyModifier.CtrlCmd;
    /**
     * An alias for the SHIFT key (`KeyModifier.Shift`).
     */
    export const SHIFT = KeyModifier.Shift;

    /**
     * `true` if the argument represents a modifier. Otherwise, `false`.
     */
    export function isModifier(key: string | undefined): boolean {
        if (key) {
            switch (key) {
                case 'M1': // Fall through.
                case 'M2': // Fall through.
                case 'M3': // Fall through.
                case 'M4': return true;
                default: return false;
            }
        }
        return false;
    }
}

export interface Key {
    readonly code: string;
    readonly keyCode: number;
}

export interface EasyKey {
    readonly keyCode: number;
    readonly easyString: string;
}

const CODE_TO_KEY: { [code: string]: Key } = {};
const KEY_CODE_TO_KEY: { [keyCode: number]: Key } = {};
const KEY_CODE_TO_EASY: { [keyCode: number]: EasyKey } = {};
const EASY_TO_KEY: { [code: string]: Key } = {}; // From 'ctrl' to Key structure
const MODIFIERS: Key[] = [];

const SPECIAL_ALIASES: { [index: string]: string } = {
    'option': 'alt',
    'command': 'meta',
    'cmd': 'meta',
    'return': 'enter',
    'esc': 'escape',
    'mod': 'ctrl',
    'ins': 'insert',
    'del': 'delete',
    'control': 'ctrl',
};

export namespace SpecialCases {
    export const META = 'meta';
    export const CTRLCMD = 'ctrlcmd';
}

export namespace EasyKey {
    export const ENTER: EasyKey = { keyCode: 13, easyString: 'enter' };
    export const SPACE: EasyKey = { keyCode: 32, easyString: 'space' };
    export const BACKSPACE: EasyKey = { keyCode: 8, easyString: 'backspace' };
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

    export const MULTIPLY: EasyKey = { keyCode: 106, easyString: 'multiply' };
    export const ADD: EasyKey = { keyCode: 107, easyString: 'add' };
    export const DECIMAL: EasyKey = { keyCode: 108, easyString: 'decimal' };
    export const SUBTRACT: EasyKey = { keyCode: 109, easyString: 'subtract' };
    export const DIVIDE: EasyKey = { keyCode: 111, easyString: 'divide' };

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

    export const NUM_LOCK: EasyKey = { keyCode: 144, easyString: 'numlock' };
    export const COMMA: EasyKey = { keyCode: 188, easyString: ',' };
    export const PERIOD: EasyKey = { keyCode: 190, easyString: '.' };
    export const SLASH: EasyKey = { keyCode: 191, easyString: '/' };
    export const SEMICOLON: EasyKey = { keyCode: 186, easyString: ';' };
    export const QUOTE: EasyKey = { keyCode: 222, easyString: '\'' };
    export const BRACKET_LEFT: EasyKey = { keyCode: 219, easyString: '[' };
    export const BRACKET_RIGHT: EasyKey = { keyCode: 221, easyString: ']' };
    export const BACKQUOTE: EasyKey = { keyCode: 192, easyString: '`' };
    export const BACKSLASH: EasyKey = { keyCode: 220, easyString: '\\' };
    export const MINUS: EasyKey = { keyCode: 189, easyString: '-' };
    export const EQUAL: EasyKey = { keyCode: 187, easyString: '=' };
    export const INTL_RO: EasyKey = { keyCode: 193, easyString: 'intlro' };
    export const INTL_YEN: EasyKey = { keyCode: 255, easyString: 'intlyen' };
}

export namespace Key {

    // tslint:disable-next-line:no-any
    export function isKey(arg: any): arg is Key {
        return !!arg && ('code' in arg) && ('keyCode' in arg);
    }

    export function getKey(arg: string | number): Key | undefined {
        if (typeof arg === "number") {
            return KEY_CODE_TO_KEY[arg];
        } else {
            return CODE_TO_KEY[arg];
        }
    }

    export function getEasyKey(key: Key): EasyKey {
        return KEY_CODE_TO_EASY[key.keyCode];
    }

    export function isModifier(arg: string | number): boolean {
        if (typeof arg === "number") {
            return MODIFIERS.map(key => key.keyCode).indexOf(arg) > 0;
        }
        return MODIFIERS.map(key => key.code).indexOf(arg) > 0;
    }

    export function equals(key: Key, keyCode: KeyCode): boolean {
        return !!keyCode.key && key.keyCode === keyCode.key.keyCode;
    }

    export const BACKSPACE: Key = { code: "Backspace", keyCode: 8 };
    export const TAB: Key = { code: "Tab", keyCode: 9 };
    export const ENTER: Key = { code: "Enter", keyCode: 13 };
    export const ESCAPE: Key = { code: "Escape", keyCode: 27 };
    export const SPACE: Key = { code: "Space", keyCode: 32 };
    export const PAGE_UP: Key = { code: "PageUp", keyCode: 33 };
    export const PAGE_DOWN: Key = { code: "PageDown", keyCode: 34 };
    export const END: Key = { code: "End", keyCode: 35 };
    export const HOME: Key = { code: "Home", keyCode: 36 };
    export const ARROW_LEFT: Key = { code: "ArrowLeft", keyCode: 37 };
    export const ARROW_UP: Key = { code: "ArrowUp", keyCode: 38 };
    export const ARROW_RIGHT: Key = { code: "ArrowRight", keyCode: 39 };
    export const ARROW_DOWN: Key = { code: "ArrowDown", keyCode: 40 };
    export const INSERT: Key = { code: "Insert", keyCode: 45 };
    export const DELETE: Key = { code: "Delete", keyCode: 46 };

    export const SHIFT_LEFT: Key = { code: "ShiftLeft", keyCode: 16 };
    export const SHIFT_RIGHT: Key = { code: "ShiftRight", keyCode: 16 };
    export const CONTROL_LEFT: Key = { code: "ControlLeft", keyCode: 17 };
    export const CONTROL_RIGHT: Key = { code: "ControlRight", keyCode: 17 };
    export const ALT_LEFT: Key = { code: "AltLeft", keyCode: 18 };
    export const ALT_RIGHT: Key = { code: "AltRight", keyCode: 18 };
    export const CAPS_LOCK: Key = { code: "CapsLock", keyCode: 20 };
    export const OS_LEFT: Key = { code: "OSLeft", keyCode: 91 };
    export const OS_RIGHT: Key = { code: "OSRight", keyCode: 92 };

    export const DIGIT0: Key = { code: "Digit0", keyCode: 48 };
    export const DIGIT1: Key = { code: "Digit1", keyCode: 49 };
    export const DIGIT2: Key = { code: "Digit2", keyCode: 50 };
    export const DIGIT3: Key = { code: "Digit3", keyCode: 51 };
    export const DIGIT4: Key = { code: "Digit4", keyCode: 52 };
    export const DIGIT5: Key = { code: "Digit5", keyCode: 53 };
    export const DIGIT6: Key = { code: "Digit6", keyCode: 54 };
    export const DIGIT7: Key = { code: "Digit7", keyCode: 55 };
    export const DIGIT8: Key = { code: "Digit8", keyCode: 56 };
    export const DIGIT9: Key = { code: "Digit9", keyCode: 57 };

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

    export const MULTIPLY: Key = { code: "NumpadMultiply", keyCode: 106 };
    export const ADD: Key = { code: "NumpadAdd", keyCode: 107 };
    export const DECIMAL: Key = { code: "NumpadDecimal", keyCode: 108 };
    export const SUBTRACT: Key = { code: "NumpadSubtract", keyCode: 109 };
    export const DIVIDE: Key = { code: "NumpadDivide", keyCode: 111 };

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

    export const NUM_LOCK: Key = { code: "NumLock", keyCode: 144 };
    export const SEMICOLON: Key = { code: "Semicolon", keyCode: 186 };
    export const EQUAL: Key = { code: "Equal", keyCode: 187 };
    export const COMMA: Key = { code: "Comma", keyCode: 188 };
    export const MINUS: Key = { code: "Minus", keyCode: 189 };
    export const PERIOD: Key = { code: "Period", keyCode: 190 };
    export const SLASH: Key = { code: "Slash", keyCode: 191 };
    export const BACKQUOTE: Key = { code: "Backquote", keyCode: 192 };
    export const INTL_RO: Key = { code: "IntlRo", keyCode: 193 };
    export const BRACKET_LEFT: Key = { code: "BracketLeft", keyCode: 219 };
    export const BACKSLASH: Key = { code: "Backslash", keyCode: 220 };
    export const BRACKET_RIGHT: Key = { code: "BracketRight", keyCode: 221 };
    export const QUOTE: Key = { code: "Quote", keyCode: 222 };
    export const INTL_YEN: Key = { code: "IntlYen", keyCode: 255 };

}

/*-------------------- Initialize the static key mappings --------------------*/
(() => {
    // Set the default key mappings from the constants in the Key namespace
    Object.keys(Key).map(prop => Reflect.get(Key, prop)).filter(key => Key.isKey(key)).forEach(key => {
        CODE_TO_KEY[key.code] = key;
        KEY_CODE_TO_KEY[key.keyCode] = key;
    });

    // Set additional key mappings
    CODE_TO_KEY['Numpad0'] = Key.DIGIT0;
    KEY_CODE_TO_KEY[96] = Key.DIGIT0;
    CODE_TO_KEY['Numpad1'] = Key.DIGIT1;
    KEY_CODE_TO_KEY[97] = Key.DIGIT1;
    CODE_TO_KEY['Numpad2'] = Key.DIGIT2;
    KEY_CODE_TO_KEY[98] = Key.DIGIT2;
    CODE_TO_KEY['Numpad3'] = Key.DIGIT3;
    KEY_CODE_TO_KEY[99] = Key.DIGIT3;
    CODE_TO_KEY['Numpad4'] = Key.DIGIT4;
    KEY_CODE_TO_KEY[100] = Key.DIGIT4;
    CODE_TO_KEY['Numpad5'] = Key.DIGIT5;
    KEY_CODE_TO_KEY[101] = Key.DIGIT5;
    CODE_TO_KEY['Numpad6'] = Key.DIGIT6;
    KEY_CODE_TO_KEY[102] = Key.DIGIT6;
    CODE_TO_KEY['Numpad7'] = Key.DIGIT7;
    KEY_CODE_TO_KEY[103] = Key.DIGIT7;
    CODE_TO_KEY['Numpad8'] = Key.DIGIT8;
    KEY_CODE_TO_KEY[104] = Key.DIGIT8;
    CODE_TO_KEY['Numpad9'] = Key.DIGIT9;
    KEY_CODE_TO_KEY[105] = Key.DIGIT9;
    CODE_TO_KEY['NumpadEnter'] = Key.ENTER;
    CODE_TO_KEY['NumpadEqual'] = Key.EQUAL;
    CODE_TO_KEY['IntlBackslash'] = Key.BACKSLASH;
    CODE_TO_KEY['MetaLeft'] = Key.OS_LEFT;   // Chrome, Safari
    KEY_CODE_TO_KEY[224] = Key.OS_LEFT;      // Firefox on Mac
    CODE_TO_KEY['MetaRight'] = Key.OS_RIGHT; // Chrome, Safari
    KEY_CODE_TO_KEY[93] = Key.OS_RIGHT;      // Chrome, Safari, Edge
    KEY_CODE_TO_KEY[225] = Key.ALT_RIGHT;    // Linux
    KEY_CODE_TO_KEY[110] = Key.DECIMAL;      // Mac, Windows
    KEY_CODE_TO_KEY[59] = Key.SEMICOLON;     // Firefox
    KEY_CODE_TO_KEY[61] = Key.EQUAL;         // Firefox
    KEY_CODE_TO_KEY[173] = Key.MINUS;        // Firefox
    KEY_CODE_TO_KEY[226] = Key.BACKSLASH;    // Chrome, Edge on Windows
    KEY_CODE_TO_KEY[60] = Key.BACKSLASH;     // Firefox on Linux

    // Set the default easy key mappings from the constants in the EasyKey namespace
    Object.keys(EasyKey).map(prop => Reflect.get(EasyKey, prop)).forEach(easyKey => {
        EASY_TO_KEY[easyKey.easyString] = KEY_CODE_TO_KEY[easyKey.keyCode];
        KEY_CODE_TO_EASY[easyKey.keyCode] = easyKey;
    });

    // Set additional easy key mappings
    KEY_CODE_TO_EASY[91] = EasyKey.OS;

    // Set the modifier keys
    MODIFIERS.push(...[Key.ALT_LEFT, Key.ALT_RIGHT, Key.CONTROL_LEFT, Key.CONTROL_RIGHT, Key.OS_LEFT, Key.OS_RIGHT, Key.SHIFT_LEFT, Key.SHIFT_RIGHT]);
})();

export type KeysOrKeyCodes = Key | KeyCode | (Key | KeyCode)[];
export namespace KeysOrKeyCodes {

    export const toKeyCode = (keyOrKeyCode: Key | KeyCode) =>
        keyOrKeyCode instanceof KeyCode ? keyOrKeyCode : KeyCode.createKeyCode({ first: keyOrKeyCode });

    export const toKeyCodes = (keysOrKeyCodes: KeysOrKeyCodes) => {
        if (keysOrKeyCodes instanceof KeyCode) {
            return [keysOrKeyCodes];
        } else if (Array.isArray(keysOrKeyCodes)) {
            return keysOrKeyCodes.slice().map(toKeyCode);
        }
        return [toKeyCode(keysOrKeyCodes)];
    };

}
