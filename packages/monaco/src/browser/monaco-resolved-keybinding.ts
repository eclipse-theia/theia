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

import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeyCode, KeySequence, Keystroke, Key, KeyModifier } from '@theia/core/lib/browser/keys';
import { isOSX } from '@theia/core/lib/common/os';
import { KEY_CODE_MAP } from './monaco-keycode-map';

export class MonacoResolvedKeybinding extends monaco.keybindings.ResolvedKeybinding {

    protected readonly parts: monaco.keybindings.ResolvedKeybindingPart[];

    constructor(protected readonly keySequence: KeySequence, keybindingService: KeybindingRegistry) {
        super();
        this.parts = keySequence.map(keyCode => {
            // eslint-disable-next-line no-null/no-null
            const keyLabel = keyCode.key ? keybindingService.acceleratorForKey(keyCode.key) : null;
            const keyAriaLabel = keyLabel;
            return new monaco.keybindings.ResolvedKeybindingPart(
                keyCode.ctrl,
                keyCode.shift,
                keyCode.alt,
                keyCode.meta,
                keyLabel,
                keyAriaLabel
            );
        });
    }

    public getLabel(): string | null {
        return monaco.keybindings.UILabelProvider.toLabel(monaco.platform.OS, this.parts, p => p.keyLabel);
    }

    public getAriaLabel(): string | null {
        return monaco.keybindings.UILabelProvider.toLabel(monaco.platform.OS, this.parts, p => p.keyAriaLabel);
    }

    public getElectronAccelerator(): string | null {
        if (this.isChord()) {
            // Electron cannot handle chords
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return monaco.keybindings.ElectronAcceleratorLabelProvider.toLabel(monaco.platform.OS, this.parts, p => p.keyLabel);
    }

    public getUserSettingsLabel(): string | null {
        return monaco.keybindings.UserSettingsLabelProvider.toLabel(monaco.platform.OS, this.parts, p => p.keyLabel);
    }

    public isWYSIWYG(): boolean {
        return true;
    }

    public isChord(): boolean {
        return this.parts.length > 1;
    }

    public getDispatchParts(): (string | null)[] {
        return this.keySequence.map(keyCode => monaco.keybindings.USLayoutResolvedKeybinding.getDispatchStr(this.toKeybinding(keyCode)));
    }

    private toKeybinding(keyCode: KeyCode): monaco.keybindings.SimpleKeybinding {
        return new monaco.keybindings.SimpleKeybinding(
            keyCode.ctrl,
            keyCode.shift,
            keyCode.alt,
            keyCode.meta,
            KEY_CODE_MAP[keyCode.key!.keyCode]
        );
    }

    public getParts(): monaco.keybindings.ResolvedKeybindingPart[] {
        return this.parts;
    }

    static toKeybinding(keybinding: monaco.keybindings.Keybinding): string {
        return keybinding instanceof monaco.keybindings.SimpleKeybinding
            ? this.keyCode(keybinding).toString()
            : this.keySequence(keybinding as monaco.keybindings.ChordKeybinding).join(' ');
    }

    static keyCode(keybinding: monaco.keybindings.SimpleKeybinding): KeyCode {
        const keyCode = keybinding.keyCode;
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

    static keySequence(keybinding: monaco.keybindings.ChordKeybinding): KeySequence {
        return keybinding.parts.map(part => this.keyCode(part));
    }

    private static monaco2BrowserKeyCode(keyCode: monaco.KeyCode): number {
        for (let i = 0; i < KEY_CODE_MAP.length; i++) {
            if (KEY_CODE_MAP[i] === keyCode) {
                return i;
            }
        }
        return -1;
    }

}
