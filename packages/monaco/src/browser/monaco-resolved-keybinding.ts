// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { KeyCode as MonacoKeyCode } from '@theia/monaco-editor-core/esm/vs/base/common/keyCodes';
import {
    ResolvedKeybinding, ResolvedChord, SingleModifierChord, KeyCodeChord, Chord
} from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from '@theia/monaco-editor-core/esm/vs/base/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import * as MonacoPlatform from '@theia/monaco-editor-core/esm/vs/base/common/platform';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeyCode, KeySequence, Keystroke, Key, KeyModifier } from '@theia/core/lib/browser/keys';
import { isOSX } from '@theia/core/lib/common/os';
import { KEY_CODE_MAP } from './monaco-keycode-map';

export class MonacoResolvedKeybinding extends ResolvedKeybinding {

    protected readonly chords: ResolvedChord[];

    constructor(protected readonly keySequence: KeySequence, keybindingService: KeybindingRegistry) {
        super();
        this.chords = keySequence.map(keyCode => {
            // eslint-disable-next-line no-null/no-null
            const keyLabel = keyCode.key ? keybindingService.acceleratorForKey(keyCode.key) : null;
            const keyAriaLabel = keyLabel;
            return new ResolvedChord(
                keyCode.ctrl,
                keyCode.shift,
                keyCode.alt,
                keyCode.meta,
                keyLabel,
                keyAriaLabel
            );
        });
    }

    getLabel(): string | null {
        return UILabelProvider.toLabel(MonacoPlatform.OS, this.chords, p => p.keyLabel);
    }

    getAriaLabel(): string | null {
        return UILabelProvider.toLabel(MonacoPlatform.OS, this.chords, p => p.keyAriaLabel);
    }

    getElectronAccelerator(): string | null {
        if (this.hasMultipleChords()) {
            // Electron cannot handle chords
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return ElectronAcceleratorLabelProvider.toLabel(MonacoPlatform.OS, this.chords, p => p.keyLabel);
    }

    getUserSettingsLabel(): string | null {
        return UserSettingsLabelProvider.toLabel(MonacoPlatform.OS, this.chords, p => p.keyLabel);
    }

    isWYSIWYG(): boolean {
        return true;
    }

    hasMultipleChords(): boolean {
        return this.chords.length > 1;
    }

    getDispatchChords(): (string | null)[] {
        return this.keySequence.map(keyCode => USLayoutResolvedKeybinding.getDispatchStr(this.toKeybinding(keyCode)));
    }

    getSingleModifierDispatchChords(): (SingleModifierChord | null)[] {
        return this.keySequence.map(keybinding => this.getSingleModifierDispatchPart(keybinding));
    }

    protected getSingleModifierDispatchPart(code: KeyCode): SingleModifierChord | null {
        if (code.key?.keyCode === undefined) {
            return null; // eslint-disable-line no-null/no-null
        }
        if (KEY_CODE_MAP[code.key?.keyCode] === MonacoKeyCode.Ctrl && !code.shift && !code.alt && !code.meta) {
            return 'ctrl';
        }
        if (KEY_CODE_MAP[code.key?.keyCode] === MonacoKeyCode.Shift && !code.ctrl && !code.alt && !code.meta) {
            return 'shift';
        }
        if (KEY_CODE_MAP[code.key?.keyCode] === MonacoKeyCode.Alt && !code.shift && !code.ctrl && !code.meta) {
            return 'alt';
        }
        if (KEY_CODE_MAP[code.key?.keyCode] === MonacoKeyCode.Meta && !code.shift && !code.alt && !code.ctrl) {
            return 'meta';
        }
        return null; // eslint-disable-line no-null/no-null
    }

    private toKeybinding(keyCode: KeyCode): KeyCodeChord {
        return new KeyCodeChord(
            keyCode.ctrl,
            keyCode.shift,
            keyCode.alt,
            keyCode.meta,
            KEY_CODE_MAP[keyCode.key!.keyCode]
        );
    }

    public getChords(): ResolvedChord[] {
        return this.chords;
    }

    static toKeybinding(keybindings: Array<Chord>): string {
        return keybindings.map(binding => this.keyCode(binding)).join(' ');
    }

    static keyCode(keybinding: Chord): KeyCode {
        const keyCode = keybinding instanceof KeyCodeChord ? keybinding.keyCode : USLayoutResolvedKeybinding['_scanCodeToKeyCode'](keybinding.scanCode);
        const sequence: Keystroke = {
            first: Key.getKey(this.monaco2BrowserKeyCode(keyCode & 0xff)),
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

    static keySequence(keybinding: Chord[]): KeySequence {
        return keybinding.map(part => this.keyCode(part));
    }

    private static monaco2BrowserKeyCode(keyCode: MonacoKeyCode): number {
        for (let i = 0; i < KEY_CODE_MAP.length; i++) {
            if (KEY_CODE_MAP[i] === keyCode) {
                return i;
            }
        }
        return -1;
    }

}
