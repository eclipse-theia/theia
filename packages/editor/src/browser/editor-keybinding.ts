// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { isOSX, isWindows } from '@theia/core/lib/common/os';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { EditorCommands } from './editor-command';

@injectable()
export class EditorKeybindingContribution implements KeybindingContribution {

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybindings(
            {
                command: EditorCommands.GO_BACK.id,
                keybinding: isOSX ? 'ctrl+-' : isWindows ? 'alt+left' : /* isLinux */ 'ctrl+alt+-'
            },
            {
                command: EditorCommands.GO_FORWARD.id,
                keybinding: isOSX ? 'ctrl+shift+-' : isWindows ? 'alt+right' : /* isLinux */ 'ctrl+shift+-'
            },
            {
                command: EditorCommands.GO_LAST_EDIT.id,
                keybinding: 'ctrl+alt+q'
            },
            {
                command: EditorCommands.TOGGLE_WORD_WRAP.id,
                keybinding: 'alt+z'
            },
            {
                command: EditorCommands.REOPEN_CLOSED_EDITOR.id,
                keybinding: this.isElectron() ? 'ctrlcmd+shift+t' : 'alt+shift+t'
            }
        );
    }

    private isElectron(): boolean {
        return environment.electron.is();
    }

}
