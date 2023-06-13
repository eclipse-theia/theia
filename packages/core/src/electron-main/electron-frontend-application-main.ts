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
import { inject, injectable, named } from 'inversify';
import { ElectronMainContext, RpcContext, RpcServer } from '../common';
import { FrontendApplicationState, StopReason } from '../common/frontend-application-state';
import { ElectronFrontendApplication } from '../electron-common';
import { ElectronMainApplication, ElectronMainApplicationContribution } from './electron-main-application';
import { SenderWebContents } from './electron-main-rpc-context';

@injectable()
export class ElectronFrontendApplicationMain implements RpcServer<ElectronFrontendApplication>, ElectronMainApplicationContribution {

    protected application?: ElectronMainApplication;

    @inject(ProxyHandler) @named(ElectronMainContext)
    protected proxyHandler: ProxyHandler;

    onStart(application: ElectronMainApplication): void {
        this.application = application;
        this.proxyHandler.register(ElectronFrontendApplication, this);
    }

    async canClose(webContents: WebContents, reason: StopReason): Promise<boolean> {
        // return this.ipcMain.invoke(webContents, ipc.canClose, reason);
        return true;
    }

    $updateApplicationState(ctx: RpcContext, state: FrontendApplicationState): void {
        const theiaWindow = this.application!.getTheiaElectronWindow(ctx.require(SenderWebContents).id);
        if (theiaWindow) {
            theiaWindow.applicationState = state;
        }
    }

    $restart(ctx: RpcContext): void {
        this.application!.restart(ctx.require(SenderWebContents));
    }
}
