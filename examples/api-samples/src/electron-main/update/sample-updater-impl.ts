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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { SampleUpdater, SampleUpdaterClient, UpdateStatus } from '../../common/updater/sample-updater';

@injectable()
export class SampleUpdaterImpl implements SampleUpdater, ElectronMainApplicationContribution {

    protected clients: Array<SampleUpdaterClient> = [];
    protected inProgressTimer: NodeJS.Timeout | undefined;
    protected available = false;

    async checkForUpdates(): Promise<{ status: UpdateStatus }> {
        if (this.inProgressTimer) {
            return { status: UpdateStatus.InProgress };
        }
        return { status: this.available ? UpdateStatus.Available : UpdateStatus.NotAvailable };
    }

    onRestartToUpdateRequested(): void {
        console.info("[api-samples] 'Update to Restart' was requested by the frontend.");
        // Here comes your install and restart implementation. For example: `autoUpdater.quitAndInstall();`
    }

    async setUpdateAvailable(available: boolean): Promise<void> {
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
                for (const client of this.clients) {
                    client.notifyReadyToInstall();
                }
            }, 5000);
        }
    }

    onStart(application: ElectronMainApplication): void {
        // Called when the contribution is starting. You can use both async and sync code from here.
    }

    onStop(application: ElectronMainApplication): void {
        // Invoked when the contribution is stopping. You can clean up things here. You are not allowed call async code from here.
    }

    setClient(client: SampleUpdaterClient | undefined): void {
        if (client) {
            this.clients.push(client);
            console.info('[api-samples] Registered a new sample updater client.');
        } else {
            console.warn("[api-samples] Couldn't register undefined client.");
        }
    }

    disconnectClient(client: SampleUpdaterClient): void {
        const index = this.clients.indexOf(client);
        if (index !== -1) {
            this.clients.splice(index, 1);
            console.info('[api-samples] Disposed a sample updater client.');
        } else {
            console.warn("[api-samples] Couldn't dispose client; it was not registered.");
        }
    }

    dispose(): void {
        console.info('[api-samples] >>> Disposing sample updater service...');
        this.clients.forEach(this.disconnectClient.bind(this));
        console.info('[api-samples] >>> Disposed sample updater service.');
    }

}
