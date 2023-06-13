// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { shell } from '@theia/electron/shared/electron';
import { injectable, inject } from 'inversify';
import { ElectronMainWindowService } from '../electron-common/electron-main-window-service';
import { ElectronMainApplication } from './electron-main-application';
import { NewWindowOptions } from '../common/window';
import { RpcContext, RpcServer } from '../common';

@injectable()
export class ElectronMainWindowServiceImpl implements RpcServer<ElectronMainWindowService> {

    @inject(ElectronMainApplication)
    protected readonly app: ElectronMainApplication;

    async $openNewWindow(ctx: RpcContext, url: string, { external }: NewWindowOptions): Promise<void> {
        if (external) {
            shell.openExternal(url);
        } else {
            this.app.createWindow().then(electronWindow => {
                electronWindow.loadURL(url);
            });
        }
    }

    $openNewDefaultWindow(ctx: RpcContext): void {
        this.app.openDefaultWindow();
    }
}
