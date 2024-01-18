// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { NotificationExt, NotificationMain } from '../../common';
import { ProgressService, Progress, ProgressMessage } from '@theia/core/lib/common';
import { interfaces } from '@theia/core/shared/inversify';
import { ProxyIdentifier, RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

export class BasicNotificationMainImpl implements NotificationMain, Disposable {
    protected readonly progressService: ProgressService;
    protected readonly progressMap = new Map<string, Progress>();
    protected readonly progress2Work = new Map<string, number>();
    protected readonly proxy: NotificationExt;

    protected readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as not disposed */ })
    );

    constructor(rpc: RPCProtocol, container: interfaces.Container, extIdentifier: ProxyIdentifier<NotificationExt>) {
        this.progressService = container.get(ProgressService);
        this.proxy = rpc.getProxy(extIdentifier);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $startProgress(options: NotificationMain.StartProgressOptions): Promise<string> {
        const onDidCancel = () => {
            // If the map does not contain current id, it has already stopped and should not be cancelled
            if (this.progressMap.has(id)) {
                this.proxy.$acceptProgressCanceled(id);
            }
        };

        const progressMessage = this.mapOptions(options);
        const progress = await this.progressService.showProgress(progressMessage, onDidCancel);
        const id = progress.id;
        this.progressMap.set(id, progress);
        this.progress2Work.set(id, 0);
        if (this.toDispose.disposed) {
            this.$stopProgress(id);
        } else {
            this.toDispose.push(Disposable.create(() => this.$stopProgress(id)));
        }
        return id;
    }
    protected mapOptions(options: NotificationMain.StartProgressOptions): ProgressMessage {
        const { title, location, cancellable } = options;
        return { text: title, options: { location, cancelable: cancellable } };
    }

    $stopProgress(id: string): void {
        const progress = this.progressMap.get(id);

        if (progress) {
            this.progressMap.delete(id);
            this.progress2Work.delete(id);
            progress.cancel();
        }
    }

    $updateProgress(id: string, item: NotificationMain.ProgressReport): void {
        const progress = this.progressMap.get(id);
        if (!progress) {
            return;
        }
        const done = Math.min((this.progress2Work.get(id) || 0) + (item.increment || 0), 100);
        this.progress2Work.set(id, done);
        progress.report({ message: item.message, work: done ? { done, total: 100 } : undefined });
    }
}
