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

import { session } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { TheiaIpcMain, ELECTRON_SECURITY_TOKEN_IPC as ipc, TheiaIpcMainInvokeEvent, ElectronSecurityToken, TheiaIpcMainEvent } from '../electron-common';
import { ElectronMainApplicationContribution } from './electron-main-application';

@injectable()
export class ElectronSecurityTokenServiceMain implements ElectronMainApplicationContribution {

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(ElectronSecurityToken)
    protected token: ElectronSecurityToken;

    onStart(): void {
        this.ipcMain.handle(ipc.getSecurityToken, this.onGetSecurityToken, this);
        this.ipcMain.handle(ipc.attachSecurityToken, this.handleAttachSecurityToken, this);
    }

    protected onGetSecurityToken(event: TheiaIpcMainEvent): string {
        return this.token.value;
    }

    protected async handleAttachSecurityToken(event: TheiaIpcMainInvokeEvent, endpoint: string): Promise<void> {
        await session.defaultSession.cookies.set({
            url: endpoint,
            name: ElectronSecurityToken,
            value: JSON.stringify(this.token),
            httpOnly: true,
            sameSite: 'no_restriction'
        });
    }
}
