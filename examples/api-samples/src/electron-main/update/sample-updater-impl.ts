// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { SampleUpdater, UpdateStatus } from '../../common/updater/sample-updater';
import { RpcContext, RpcEvent, RpcServer } from '@theia/core';

@injectable()
export class SampleUpdaterImpl implements RpcServer<SampleUpdater>, ElectronMainApplicationContribution {

    protected inProgressTimer?: NodeJS.Timer;
    protected available = false;

    @inject(RpcEvent) $onReadyToInstall: RpcEvent<void>;

    onStart(application: ElectronMainApplication): void {
        // Called when the contribution is starting. You can use both async and sync code from here.
    }

    onStop(application: ElectronMainApplication): void {
        // Invoked when the contribution is stopping. You can clean up things here. You are not allowed call async code from here.
    }

    $updateAndRestart(): void {
        console.info("'Update and restart' was requested by the frontend.");
        // Here comes your install and restart implementation. For example: `autoUpdater.quitAndInstall();`
    }

    async $checkForUpdates(): Promise<{ status: UpdateStatus }> {
        if (this.inProgressTimer) {
            return { status: UpdateStatus.InProgress };
        }
        return { status: this.available ? UpdateStatus.Available : UpdateStatus.NotAvailable };
    }

    async $setUpdateAvailable(ctx: RpcContext, available: boolean): Promise<void> {
        if (this.inProgressTimer) {
            clearTimeout(this.inProgressTimer);
        }
        if (!available) {
            this.inProgressTimer = undefined;
            this.available = false;
        } else {
            this.inProgressTimer = setTimeout(() => {
                this.inProgressTimer = undefined;
                this.available = true;
                this.$onReadyToInstall.sendAll();
            }, 5000);
        }
    }
}
