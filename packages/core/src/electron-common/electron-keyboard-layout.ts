// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { NativeKeyboardLayout } from '../common/keyboard/keyboard-layout-provider';
import { createIpcNamespace, IpcEvent } from './electron-ipc';
import { preloadServiceIdentifier } from './preload';

export { NativeKeyboardLayout };

export const ELECTRON_KEYBOARD_LAYOUT_IPC = createIpcNamespace('theia-electron-keyboard-layout', channel => ({
    onKeyboardLayoutChanged: channel<(layout: NativeKeyboardLayout) => void>()
}));

export const ElectronKeyboardLayout = preloadServiceIdentifier<ElectronKeyboardLayout>('ElectronKeyboardLayout');
export interface ElectronKeyboardLayout {
    onKeyboardLayoutChanged: IpcEvent<NativeKeyboardLayout>;
}
