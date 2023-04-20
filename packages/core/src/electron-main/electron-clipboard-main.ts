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

import { clipboard } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { ELECTRON_CLIPBOARD_IPC as ipc, TheiaIpcMain, TheiaIpcMainInvokeEvent } from '../electron-common';
import { ElectronMainApplicationContribution } from './electron-main-application';

@injectable()
export class ElectronClipboardMain implements ElectronMainApplicationContribution {

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    onStart(): void {
        this.ipcMain.handle(ipc.readClipboard, this.handleReadText, this);
        this.ipcMain.handle(ipc.writeClipboard, this.handleWriteText, this);
    }

    protected async handleReadText(event: TheiaIpcMainInvokeEvent): Promise<string> {
        return clipboard.readText();
    }

    protected async handleWriteText(event: TheiaIpcMainInvokeEvent, value: string): Promise<void> {
        clipboard.writeText(value);
    }
}
