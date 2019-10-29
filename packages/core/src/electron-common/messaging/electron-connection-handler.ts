/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { ConnectionHandler } from '../../common/messaging/handler';

/**
 * Name of the channel used with `ipcMain.on/emit`.
 */
export const THEIA_ELECTRON_IPC_CHANNEL_NAME = 'theia-electron-ipc';

/**
 * Electron-IPC-specific connection handler.
 * Use this if you want to establish communication between the frontend and the electron-main process.
 */
export const ElectronConnectionHandler = Symbol('ElectronConnectionHandler');
export interface ElectronConnectionHandler extends ConnectionHandler {
}
