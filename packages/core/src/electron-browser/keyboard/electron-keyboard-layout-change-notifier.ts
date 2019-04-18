/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { postConstruct, injectable } from 'inversify';
import { ipcRenderer } from 'electron';
import { KeyboardLayoutChangeNotifier, NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { Emitter } from '../../common/event';

/**
 * Keyboard layout changes are detected by the native-keymap package. This must happen in the
 * main process of Electron. The events are sent to the renderer process using Electron IPC.
 */
@injectable()
export class ElectronKeyboardLayoutChangeNotifier implements KeyboardLayoutChangeNotifier {

    protected readonly nativeLayoutChanged = new Emitter<NativeKeyboardLayout>();

    get onDidChangeNativeLayout() {
        return this.nativeLayoutChanged.event;
    }

    @postConstruct()
    protected initialize(): void {
        ipcRenderer.on('keyboardLayoutChanged', (event: Event, newLayout: NativeKeyboardLayout) => this.nativeLayoutChanged.fire(newLayout));
    }

}
