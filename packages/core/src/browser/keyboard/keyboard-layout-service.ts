// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, optional } from 'inversify';
import type { IKeyboardLayoutInfo, ILinuxKeyMapping, IMacKeyMapping, IWindowsKeyMapping } from 'native-keymap';
import { isOSX, isWindows } from '../../common/os';
import {
    NativeKeyboardLayout, KeyboardLayoutProvider, KeyboardLayoutChangeNotifier, KeyValidator
} from '../../common/keyboard/keyboard-layout-provider';
import { Emitter, Event } from '../../common/event';
import {
    KeyCode, Key, LayoutModifiers, NormalizedKeyboardInput, layoutModifiersIncludeAltGraph, layoutModifiersIncludeShift
} from './keys';

/**
 * A physical key and keyboard-layout modifier layer that can produce a logical character.
 */
export interface KeyboardLayoutCandidate {
    readonly key: Key;
    readonly character: string;
    readonly layoutModifiers: LayoutModifiers;
}

export interface KeyboardLayout {
    readonly candidatesByCharacter: ReadonlyMap<string, readonly KeyboardLayoutCandidate[]>;
    readonly candidatesByFoldedCharacter: ReadonlyMap<string, readonly KeyboardLayoutCandidate[]>;
    /**
     * Mapping of KeyboardEvent codes to the characters shown on the user's keyboard
     * for the respective keys.
     */
    readonly code2Character: { [code: string]: string };
}

@injectable()
export class KeyboardLayoutService {

    @inject(KeyboardLayoutProvider)
    protected readonly layoutProvider: KeyboardLayoutProvider;

    @inject(KeyboardLayoutChangeNotifier)
    protected readonly layoutChangeNotifier: KeyboardLayoutChangeNotifier;

    @inject(KeyValidator) @optional()
    protected readonly keyValidator?: KeyValidator;

    // The transformed layout used for logical-character resolution and display.
    private currentLayout?: KeyboardLayout;
    // The provider's original layout data used to verify characters produced by key events.
    private currentNativeLayout?: NativeKeyboardLayout;
    private currentLayoutInfo?: IKeyboardLayoutInfo;

    get layoutInfo(): IKeyboardLayoutInfo | undefined {
        return this.currentLayoutInfo;
    }

    get layoutSource(): string {
        return this.layoutProvider.layoutSource ?? 'unknown';
    }

    protected updateLayout(newLayout: NativeKeyboardLayout): KeyboardLayout {
        const transformed = this.transformNativeLayout(newLayout);
        this.currentLayout = transformed;
        this.currentNativeLayout = newLayout;
        this.currentLayoutInfo = newLayout.info;
        this.keyboardLayoutChanged.fire(transformed);
        return transformed;
    }

    protected keyboardLayoutChanged = new Emitter<KeyboardLayout>();

    get onKeyboardLayoutChanged(): Event<KeyboardLayout> {
        return this.keyboardLayoutChanged.event;
    }

    async initialize(): Promise<void> {
        this.layoutChangeNotifier.onDidChangeNativeLayout(newLayout => this.updateLayout(newLayout));
        const initialLayout = await this.layoutProvider.getNativeLayout();
        this.updateLayout(initialLayout);
    }

    /**
     * Resolve an authored keybinding stroke against the active layout.
     * Physical and non-printable strokes, and strokes resolved without an active layout, are returned unchanged. A logical
     * character missing from the active layout is returned with {@link KeyCode.supportedByLayout} set to `false`.
     * Authored Shift is always absorbed during logical-character resolution, so legacy and `[char:…]` spellings resolve identically.
     */
    resolveKeyCode(inCode: KeyCode): KeyCode {
        if (inCode.physical || !this.currentLayout || inCode.key && !this.isPrintableKey(inCode.key) && !inCode.character) {
            return inCode;
        }
        const usCharacter = inCode.key ? US_CHARACTER_BY_KEY.get(usCharacterIndex(inCode.key, inCode.shift)) : undefined;
        const character = inCode.character ?? usCharacter ?? inCode.key?.easyString;
        if (!character) {
            return inCode;
        }
        const exactCandidates = this.currentLayout.candidatesByCharacter.get(character);
        const candidate = exactCandidates?.[0] ?? this.currentLayout.candidatesByFoldedCharacter.get(character.toLocaleLowerCase())?.[0];
        if (!candidate) {
            return new KeyCode({
                key: inCode.key,
                meta: inCode.meta,
                ctrl: inCode.ctrl,
                shift: inCode.shift,
                alt: inCode.alt,
                character,
                authoredToken: inCode.authoredToken,
                supportedByLayout: false
            });
        }
        return new KeyCode({
            key: candidate.key,
            meta: inCode.meta,
            ctrl: inCode.ctrl,
            shift: false,
            alt: inCode.alt,
            character,
            layoutModifiers: candidate.layoutModifiers,
            interpretation: 'authored',
            authoredToken: inCode.authoredToken
        });
    }

    protected isPrintableKey(key: Key): boolean {
        return this.isPrintableCharacter(key.easyString);
    }

    protected isPrintableCharacter(character: string | undefined): character is string {
        return !!character && character !== ' ' && Array.from(character).length === 1;
    }

    /**
     * Detect the keyboard-layout modifier layer that produced an input character.
     * `undefined` means either that no layout modifiers were needed or that the input represents a dead key.
     */
    detectLayoutModifiers(input: NormalizedKeyboardInput): LayoutModifiers | undefined {
        if (input.isComposing || !input.code || !this.shouldIncludeKey(input.code) || !this.isPrintableCharacter(input.key)) {
            return undefined;
        }
        const mapping = this.currentNativeLayout?.mapping[input.code] as (ILinuxKeyMapping & Partial<IMacKeyMapping>) | undefined;
        if (!mapping) {
            return undefined;
        }
        if (input.shiftKey && mapping.withShiftAltGr === input.key && !mapping.withShiftAltGrIsDeadKey) {
            return 'shiftAltGraph';
        }
        if (input.shiftKey && !mapping.withShiftAltGr && mapping.withAltGr === input.key && !mapping.withAltGrIsDeadKey) {
            return 'shiftAltGraph';
        }
        if (!input.shiftKey && mapping.withAltGr === input.key && !mapping.withAltGrIsDeadKey) {
            return 'altGraph';
        }
        if (input.shiftKey && mapping.withShift && !mapping.withShiftIsDeadKey
            && mapping.withShift.toLocaleLowerCase() === input.key.toLocaleLowerCase()) {
            return 'shift';
        }
        return undefined;
    }

    /** Return all command- and layout-modifier interpretations of a normalized keyboard input. */
    getKeyCodeInterpretations(input: NormalizedKeyboardInput, eventDispatch: 'code' | 'keyCode'): KeyCode[] {
        const keyCode = KeyCode.createKeyCode(input, eventDispatch);
        if (eventDispatch === 'keyCode' || keyCode.isModifierOnly()) {
            return [keyCode];
        }
        const layoutModifiers = this.detectLayoutModifiers(input);
        if (isOSX) {
            return this.getMacKeyCodeInterpretations(keyCode, input, layoutModifiers);
        }
        if (isWindows) {
            return this.getWindowsKeyCodeInterpretations(keyCode, input, layoutModifiers);
        }
        return this.getLinuxKeyCodeInterpretations(keyCode, input, layoutModifiers);
    }

    protected getLinuxKeyCodeInterpretations(keyCode: KeyCode, input: NormalizedKeyboardInput, layoutModifiers: LayoutModifiers | undefined): KeyCode[] {
        if (!layoutModifiers || layoutModifiersIncludeAltGraph(layoutModifiers) && !input.altGraph) {
            return [keyCode];
        }
        return layoutModifiers === 'shift'
            ? this.shiftLayerInterpretations(keyCode, layoutModifiers)
            : [this.toLayoutModifiersKeyCode(keyCode, layoutModifiers)];
    }

    protected getWindowsKeyCodeInterpretations(keyCode: KeyCode, input: NormalizedKeyboardInput, layoutModifiers: LayoutModifiers | undefined): KeyCode[] {
        if (!layoutModifiers) {
            return [keyCode];
        }
        if (!layoutModifiersIncludeAltGraph(layoutModifiers)) {
            return this.shiftLayerInterpretations(keyCode, layoutModifiers);
        }
        if (input.altGraph) {
            return [this.toLayoutModifiersKeyCode(keyCode, layoutModifiers, { ctrl: true, alt: true })];
        }
        if (input.ctrlKey && input.altKey) {
            return [
                new KeyCode({ ...keyCode, interpretation: 'commandModifiers' }),
                this.toLayoutModifiersKeyCode(keyCode, layoutModifiers, { alt: true })
            ];
        }
        return [keyCode];
    }

    protected getMacKeyCodeInterpretations(keyCode: KeyCode, input: NormalizedKeyboardInput, layoutModifiers: LayoutModifiers | undefined): KeyCode[] {
        if (!layoutModifiers) {
            return [keyCode];
        }
        if (!layoutModifiersIncludeAltGraph(layoutModifiers)) {
            return this.shiftLayerInterpretations(keyCode, layoutModifiers);
        }
        if (!input.altKey) {
            return [keyCode];
        }
        return [
            new KeyCode({ ...keyCode, interpretation: 'commandModifiers' }),
            this.toLayoutModifiersKeyCode(keyCode, layoutModifiers, { alt: true })
        ];
    }

    /** Interpret Shift either as a command modifier or as part of the keyboard layout. */
    protected shiftLayerInterpretations(keyCode: KeyCode, layoutModifiers: LayoutModifiers): KeyCode[] {
        if (!layoutModifiersIncludeShift(layoutModifiers)) {
            return [keyCode];
        }
        return [
            new KeyCode({ ...keyCode, interpretation: 'commandModifiers' }),
            this.toLayoutModifiersKeyCode(keyCode, layoutModifiers)
        ];
    }

    protected toLayoutModifiersKeyCode(keyCode: KeyCode, layoutModifiers: LayoutModifiers,
        consumed: { ctrl?: boolean, alt?: boolean } = {}): KeyCode {
        return new KeyCode({
            key: keyCode.key,
            character: keyCode.character,
            ctrl: consumed.ctrl ? false : keyCode.ctrl,
            meta: keyCode.meta,
            shift: false,
            alt: consumed.alt ? false : keyCode.alt,
            layoutModifiers,
            interpretation: 'layoutModifiers'
        });
    }

    /**
     * Return the character shown on the user's keyboard for the given key.
     * Use this to determine UI representations of keybindings.
     */
    getKeyboardCharacter(key: Key): string {
        const layout = this.currentLayout;
        if (layout) {
            const value = layout.code2Character[key.code]?.trim();
            // Special cases from native keymap
            if (value === '\u001b') {
                return 'escape';
            }
            if (value === '\u007f') {
                return 'delete';
            }
            if (value === '\u0008') {
                return 'backspace';
            }
            if (value?.replace(/[\n\r\t]/g, '')) {
                return value;
            }
        }
        return key.easyString;
    }

    /**
     * Called when a KeyboardEvent is processed by the KeybindingRegistry.
     * The KeyValidator may trigger a keyboard layout change.
     */
    validateKeyCode(keyCode: KeyCode, input: NormalizedKeyboardInput): void {
        const character = input.key;
        if (this.keyValidator && keyCode.key && this.isPrintableCharacter(character)) {
            this.keyValidator.validateKey({
                code: input.code ?? keyCode.key.code,
                character,
                shiftKey: input.shiftKey,
                ctrlKey: input.ctrlKey,
                altKey: input.altKey,
                altGraph: input.altGraph
            });
        }
    }

    protected transformNativeLayout(nativeLayout: NativeKeyboardLayout): KeyboardLayout {
        const candidatesByCharacter = new Map<string, KeyboardLayoutCandidate[]>();
        const code2Character: { [code: string]: string } = {};
        const mapping = nativeLayout.mapping;
        for (const code in mapping) {
            if (mapping.hasOwnProperty(code)) {
                const keyMapping = mapping[code];
                const mappedKey = Key.getKey(code);
                if (mappedKey && this.shouldIncludeKey(code)) {
                    if (isWindows) {
                        const windowsMapping = keyMapping as IWindowsKeyMapping & Partial<ILinuxKeyMapping>;
                        if (!windowsMapping.value && VKEY_TO_KEY[windowsMapping.vkey]) {
                            this.addKeyMapping(candidatesByCharacter, mappedKey, VKEY_TO_KEY[windowsMapping.vkey].easyString, 'none');
                        }
                    }
                    this.addKeyMappings(candidatesByCharacter, mappedKey, keyMapping as ILinuxKeyMapping & Partial<IMacKeyMapping>);
                }
                if (keyMapping.value) {
                    code2Character[code] = keyMapping.value;
                }
            }
        }
        for (const candidates of candidatesByCharacter.values()) {
            candidates.sort((left, right) => this.layoutModifierCost(left.layoutModifiers) - this.layoutModifierCost(right.layoutModifiers)
                || left.key.code.localeCompare(right.key.code));
        }
        const candidatesByFoldedCharacter = new Map<string, KeyboardLayoutCandidate[]>();
        for (const [character, candidates] of candidatesByCharacter) {
            const folded = character.toLocaleLowerCase();
            const existing = candidatesByFoldedCharacter.get(folded) ?? [];
            existing.push(...candidates);
            existing.sort((left, right) => this.layoutModifierCost(left.layoutModifiers) - this.layoutModifierCost(right.layoutModifiers)
                || left.key.code.localeCompare(right.key.code));
            candidatesByFoldedCharacter.set(folded, existing);
        }
        return { candidatesByCharacter, candidatesByFoldedCharacter, code2Character };
    }

    protected shouldIncludeKey(code: string): boolean {
        // Exclude all numpad keys because they produce values that are already found elsewhere on the keyboard.
        // This can cause problems, e.g. if `Numpad3` maps to `PageDown` then commands bound to `PageDown` would
        // be resolved to `Digit3` (`Numpad3` is associated with `Key.DIGIT3`), effectively blocking the user
        // from typing `3` in an editor.
        return !code.startsWith('Numpad');
    }

    protected layoutModifierCost(layoutModifiers: LayoutModifiers): number {
        return LAYOUT_MODIFIER_COST[layoutModifiers];
    }

    private addKeyMappings(candidatesByCharacter: Map<string, KeyboardLayoutCandidate[]>, mappedKey: Key,
        keyMapping: ILinuxKeyMapping & Partial<IMacKeyMapping>): void {
        // Dead keys await a following keystroke to compose a glyph and never produce a committed character. The flags are
        // currently reported only on macOS, but applying the guards uniformly keeps resolution and detection symmetric.
        if (keyMapping.value && !keyMapping.valueIsDeadKey) {
            this.addKeyMapping(candidatesByCharacter, mappedKey, keyMapping.value, 'none');
        }
        if (keyMapping.withShift && !keyMapping.withShiftIsDeadKey) {
            this.addKeyMapping(candidatesByCharacter, mappedKey, keyMapping.withShift, 'shift');
        }
        if (keyMapping.withAltGr && !keyMapping.withAltGrIsDeadKey) {
            this.addKeyMapping(candidatesByCharacter, mappedKey, keyMapping.withAltGr, 'altGraph');
        }
        if (keyMapping.withShiftAltGr && !keyMapping.withShiftAltGrIsDeadKey) {
            this.addKeyMapping(candidatesByCharacter, mappedKey, keyMapping.withShiftAltGr, 'shiftAltGraph');
        }
    }

    private addKeyMapping(candidatesByCharacter: Map<string, KeyboardLayoutCandidate[]>, mappedKey: Key,
        value: string, layoutModifiers: LayoutModifiers): void {
        if (Array.from(value).length !== 1) {
            return;
        }
        const candidates = candidatesByCharacter.get(value) ?? [];
        candidates.push({ key: mappedKey, character: value, layoutModifiers });
        candidatesByCharacter.set(value, candidates);
    }

}

/**
 * Mapping of character values to the corresponding keys on a standard US keyboard layout.
 */
const VALUE_TO_KEY: { [value: string]: { key: Key, shift?: boolean } } = {
    '`': { key: Key.BACKQUOTE },
    '~': { key: Key.BACKQUOTE, shift: true },
    '1': { key: Key.DIGIT1 },
    '!': { key: Key.DIGIT1, shift: true },
    '2': { key: Key.DIGIT2 },
    '@': { key: Key.DIGIT2, shift: true },
    '3': { key: Key.DIGIT3 },
    '#': { key: Key.DIGIT3, shift: true },
    '4': { key: Key.DIGIT4 },
    '$': { key: Key.DIGIT4, shift: true },
    '5': { key: Key.DIGIT5 },
    '%': { key: Key.DIGIT5, shift: true },
    '6': { key: Key.DIGIT6 },
    '^': { key: Key.DIGIT6, shift: true },
    '7': { key: Key.DIGIT7 },
    '&': { key: Key.DIGIT7, shift: true },
    '8': { key: Key.DIGIT8 },
    '*': { key: Key.DIGIT8, shift: true },
    '9': { key: Key.DIGIT9 },
    '(': { key: Key.DIGIT9, shift: true },
    '0': { key: Key.DIGIT0 },
    ')': { key: Key.DIGIT0, shift: true },
    '-': { key: Key.MINUS },
    '_': { key: Key.MINUS, shift: true },
    '=': { key: Key.EQUAL },
    '+': { key: Key.EQUAL, shift: true },

    'a': { key: Key.KEY_A },
    'A': { key: Key.KEY_A, shift: true },
    'b': { key: Key.KEY_B },
    'B': { key: Key.KEY_B, shift: true },
    'c': { key: Key.KEY_C },
    'C': { key: Key.KEY_C, shift: true },
    'd': { key: Key.KEY_D },
    'D': { key: Key.KEY_D, shift: true },
    'e': { key: Key.KEY_E },
    'E': { key: Key.KEY_E, shift: true },
    'f': { key: Key.KEY_F },
    'F': { key: Key.KEY_F, shift: true },
    'g': { key: Key.KEY_G },
    'G': { key: Key.KEY_G, shift: true },
    'h': { key: Key.KEY_H },
    'H': { key: Key.KEY_H, shift: true },
    'i': { key: Key.KEY_I },
    'I': { key: Key.KEY_I, shift: true },
    'j': { key: Key.KEY_J },
    'J': { key: Key.KEY_J, shift: true },
    'k': { key: Key.KEY_K },
    'K': { key: Key.KEY_K, shift: true },
    'l': { key: Key.KEY_L },
    'L': { key: Key.KEY_L, shift: true },
    'm': { key: Key.KEY_M },
    'M': { key: Key.KEY_M, shift: true },
    'n': { key: Key.KEY_N },
    'N': { key: Key.KEY_N, shift: true },
    'o': { key: Key.KEY_O },
    'O': { key: Key.KEY_O, shift: true },
    'p': { key: Key.KEY_P },
    'P': { key: Key.KEY_P, shift: true },
    'q': { key: Key.KEY_Q },
    'Q': { key: Key.KEY_Q, shift: true },
    'r': { key: Key.KEY_R },
    'R': { key: Key.KEY_R, shift: true },
    's': { key: Key.KEY_S },
    'S': { key: Key.KEY_S, shift: true },
    't': { key: Key.KEY_T },
    'T': { key: Key.KEY_T, shift: true },
    'u': { key: Key.KEY_U },
    'U': { key: Key.KEY_U, shift: true },
    'v': { key: Key.KEY_V },
    'V': { key: Key.KEY_V, shift: true },
    'w': { key: Key.KEY_W },
    'W': { key: Key.KEY_W, shift: true },
    'x': { key: Key.KEY_X },
    'X': { key: Key.KEY_X, shift: true },
    'y': { key: Key.KEY_Y },
    'Y': { key: Key.KEY_Y, shift: true },
    'z': { key: Key.KEY_Z },
    'Z': { key: Key.KEY_Z, shift: true },

    '[': { key: Key.BRACKET_LEFT },
    '{': { key: Key.BRACKET_LEFT, shift: true },
    ']': { key: Key.BRACKET_RIGHT },
    '}': { key: Key.BRACKET_RIGHT, shift: true },
    ';': { key: Key.SEMICOLON },
    ':': { key: Key.SEMICOLON, shift: true },
    "'": { key: Key.QUOTE },
    '"': { key: Key.QUOTE, shift: true },
    ',': { key: Key.COMMA },
    '<': { key: Key.COMMA, shift: true },
    '.': { key: Key.PERIOD },
    '>': { key: Key.PERIOD, shift: true },
    '/': { key: Key.SLASH },
    '?': { key: Key.SLASH, shift: true },
    '\\': { key: Key.BACKSLASH },
    '|': { key: Key.BACKSLASH, shift: true },

    '\t': { key: Key.TAB },
    '\r': { key: Key.ENTER },
    '\n': { key: Key.ENTER },
    ' ': { key: Key.SPACE },
};

function usCharacterIndex(key: Key, shift = false): string {
    return `${key.code}:${shift}`;
}

const LAYOUT_MODIFIER_COST: Record<LayoutModifiers, number> = {
    none: 0,
    shift: 1,
    altGraph: 2,
    shiftAltGraph: 3
};

const US_CHARACTER_BY_KEY = new Map<string, string>();
for (const [character, value] of Object.entries(VALUE_TO_KEY)) {
    US_CHARACTER_BY_KEY.set(usCharacterIndex(value.key, !!value.shift), character);
}

/**
 * Mapping of Windows Virtual Keys to the corresponding keys on a standard US keyboard layout.
 */
const VKEY_TO_KEY: { [value: string]: Key } = {
    VK_SHIFT: Key.SHIFT_LEFT,
    VK_LSHIFT: Key.SHIFT_LEFT,
    VK_RSHIFT: Key.SHIFT_RIGHT,
    VK_CONTROL: Key.CONTROL_LEFT,
    VK_LCONTROL: Key.CONTROL_LEFT,
    VK_RCONTROL: Key.CONTROL_RIGHT,
    VK_MENU: Key.ALT_LEFT,
    VK_COMMAND: Key.OS_LEFT,
    VK_LWIN: Key.OS_LEFT,
    VK_RWIN: Key.OS_RIGHT,

    VK_0: Key.DIGIT0,
    VK_1: Key.DIGIT1,
    VK_2: Key.DIGIT2,
    VK_3: Key.DIGIT3,
    VK_4: Key.DIGIT4,
    VK_5: Key.DIGIT5,
    VK_6: Key.DIGIT6,
    VK_7: Key.DIGIT7,
    VK_8: Key.DIGIT8,
    VK_9: Key.DIGIT9,
    VK_A: Key.KEY_A,
    VK_B: Key.KEY_B,
    VK_C: Key.KEY_C,
    VK_D: Key.KEY_D,
    VK_E: Key.KEY_E,
    VK_F: Key.KEY_F,
    VK_G: Key.KEY_G,
    VK_H: Key.KEY_H,
    VK_I: Key.KEY_I,
    VK_J: Key.KEY_J,
    VK_K: Key.KEY_K,
    VK_L: Key.KEY_L,
    VK_M: Key.KEY_M,
    VK_N: Key.KEY_N,
    VK_O: Key.KEY_O,
    VK_P: Key.KEY_P,
    VK_Q: Key.KEY_Q,
    VK_R: Key.KEY_R,
    VK_S: Key.KEY_S,
    VK_T: Key.KEY_T,
    VK_U: Key.KEY_U,
    VK_V: Key.KEY_V,
    VK_W: Key.KEY_W,
    VK_X: Key.KEY_X,
    VK_Y: Key.KEY_Y,
    VK_Z: Key.KEY_Z,

    VK_OEM_1: Key.SEMICOLON,
    VK_OEM_2: Key.SLASH,
    VK_OEM_3: Key.BACKQUOTE,
    VK_OEM_4: Key.BRACKET_LEFT,
    VK_OEM_5: Key.BACKSLASH,
    VK_OEM_6: Key.BRACKET_RIGHT,
    VK_OEM_7: Key.QUOTE,
    VK_OEM_PLUS: Key.EQUAL,
    VK_OEM_COMMA: Key.COMMA,
    VK_OEM_MINUS: Key.MINUS,
    VK_OEM_PERIOD: Key.PERIOD,

    VK_F1: Key.F1,
    VK_F2: Key.F2,
    VK_F3: Key.F3,
    VK_F4: Key.F4,
    VK_F5: Key.F5,
    VK_F6: Key.F6,
    VK_F7: Key.F7,
    VK_F8: Key.F8,
    VK_F9: Key.F9,
    VK_F10: Key.F10,
    VK_F11: Key.F11,
    VK_F12: Key.F12,
    VK_F13: Key.F13,
    VK_F14: Key.F14,
    VK_F15: Key.F15,
    VK_F16: Key.F16,
    VK_F17: Key.F17,
    VK_F18: Key.F18,
    VK_F19: Key.F19,

    VK_BACK: Key.BACKSPACE,
    VK_TAB: Key.TAB,
    VK_RETURN: Key.ENTER,
    VK_CAPITAL: Key.CAPS_LOCK,
    VK_ESCAPE: Key.ESCAPE,
    VK_SPACE: Key.SPACE,
    VK_PRIOR: Key.PAGE_UP,
    VK_NEXT: Key.PAGE_DOWN,
    VK_END: Key.END,
    VK_HOME: Key.HOME,
    VK_INSERT: Key.INSERT,
    VK_DELETE: Key.DELETE,
    VK_LEFT: Key.ARROW_LEFT,
    VK_UP: Key.ARROW_UP,
    VK_RIGHT: Key.ARROW_RIGHT,
    VK_DOWN: Key.ARROW_DOWN,

    VK_NUMLOCK: Key.NUM_LOCK,
    VK_NUMPAD0: Key.DIGIT0,
    VK_NUMPAD1: Key.DIGIT1,
    VK_NUMPAD2: Key.DIGIT2,
    VK_NUMPAD3: Key.DIGIT3,
    VK_NUMPAD4: Key.DIGIT4,
    VK_NUMPAD5: Key.DIGIT5,
    VK_NUMPAD6: Key.DIGIT6,
    VK_NUMPAD7: Key.DIGIT7,
    VK_NUMPAD8: Key.DIGIT8,
    VK_NUMPAD9: Key.DIGIT9,
    VK_MULTIPLY: Key.MULTIPLY,
    VK_ADD: Key.ADD,
    VK_SUBTRACT: Key.SUBTRACT,
    VK_DECIMAL: Key.DECIMAL,
    VK_DIVIDE: Key.DIVIDE
};
