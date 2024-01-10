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
    ChordKeybinding, KeybindingModifier, ResolvedKeybinding, ResolvedKeybindingPart, ScanCodeBinding, SimpleKeybinding
} from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from '@theia/monaco-editor-core/esm/vs/base/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import * as MonacoPlatform from '@theia/monaco-editor-core/esm/vs/base/common/platform';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeyCode, KeySequence, Keystroke, Key, KeyModifier } from '@theia/core/lib/browser/keys';
import { isOSX } from '@theia/core/lib/common/os';
import { KEY_CODE_MAP } from './monaco-keycode-map';

export class MonacoResolvedKeybinding extends ResolvedKeybinding {

    protected readonly parts: ResolvedKeybindingPart[];

    constructor(protected readonly keySequence: KeySequence, keybindingService: KeybindingRegistry) {
        super();
        this.parts = keySequence.map(keyCode => {
            // eslint-disable-next-line no-null/no-null
            const keyLabel = keyCode.key ? keybindingService.acceleratorForKey(keyCode.key) : null;
            const keyAriaLabel = keyLabel;
            return new ResolvedKeybindingPart(
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
        return UILabelProvider.toLabel(MonacoPlatform.OS, this.parts, p => p.keyLabel);
    }

    getAriaLabel(): string | null {
        return UILabelProvider.toLabel(MonacoPlatform.OS, this.parts, p => p.keyAriaLabel);
    }

    getElectronAccelerator(): string | null {
        if (this.isChord()) {
            // Electron cannot handle chords
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return ElectronAcceleratorLabelProvider.toLabel(MonacoPlatform.OS, this.parts, p => p.keyLabel);
    }

    getUserSettingsLabel(): string | null {
        return UserSettingsLabelProvider.toLabel(MonacoPlatform.OS, this.parts, p => p.keyLabel);
    }

    isWYSIWYG(): boolean {
        return true;
    }

    isChord(): boolean {
        return this.parts.length > 1;
    }

    getDispatchParts(): (string | null)[] {
        return this.keySequence.map(keyCode => USLayoutResolvedKeybinding.getDispatchStr(this.toKeybinding(keyCode)));
    }

    getSingleModifierDispatchParts(): (KeybindingModifier | null)[] {
        return this.keySequence.map(keybinding => this.getSingleModifierDispatchPart(keybinding));
    }

    protected getSingleModifierDispatchPart(code: KeyCode): KeybindingModifier | null {
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

    private toKeybinding(keyCode: KeyCode): SimpleKeybinding {
        return new SimpleKeybinding(
            keyCode.ctrl,
            keyCode.shift,
            keyCode.alt,
            keyCode.meta,
            KEY_CODE_MAP[keyCode.key!.keyCode]
        );
    }

    public getParts(): ResolvedKeybindingPart[] {
        return this.parts;
    }

    static toKeybinding(keybindings: Array<SimpleKeybinding | ScanCodeBinding>): string {
        return keybindings.map(binding => this.keyCode(binding)).join(' ');
    }

    static keyCode(keybinding: SimpleKeybinding | ScanCodeBinding): KeyCode {
        const keyCode = keybinding instanceof SimpleKeybinding ? keybinding.keyCode : USLayoutResolvedKeybinding['_scanCodeToKeyCode'](keybinding.scanCode);
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

    static keySequence(keybinding: ChordKeybinding): KeySequence {
        return keybinding.parts.map(part => this.keyCode(part));
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
