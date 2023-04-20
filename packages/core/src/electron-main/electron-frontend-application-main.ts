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

import { WebContents } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { FrontendApplicationState, StopReason } from '../common/frontend-application-state';
import { ELECTRON_FRONTEND_APPLICATION_IPC as ipc, TheiaIpcMain, TheiaIpcMainEvent } from '../electron-common';
import { ElectronMainApplication, ElectronMainApplicationContribution } from './electron-main-application';

@injectable()
export class ElectronFrontendApplicationMain implements ElectronMainApplicationContribution {

    protected application: ElectronMainApplication;

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    onStart(application: ElectronMainApplication): void {
        this.application = application;
        this.ipcMain.on(ipc.updateApplicationState, this.onUpdateApplicationState, this);
        this.ipcMain.on(ipc.restart, this.onRestart, this);
    }

    canClose(webContents: WebContents, reason: StopReason): Promise<boolean> {
        return this.ipcMain.invoke(webContents, ipc.canClose, reason);
    }

    protected onUpdateApplicationState(event: TheiaIpcMainEvent, state: FrontendApplicationState): void {
        const theiaWindow = this.application.getTheiaElectronWindow(event.sender.id);
        if (theiaWindow) {
            theiaWindow.applicationState = state;
        }
    }

    protected onRestart(event: TheiaIpcMainEvent): void {
        this.application.restart(event.sender);
    }
}
