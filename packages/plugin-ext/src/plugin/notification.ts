/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { PLUGIN_RPC_CONTEXT, NotificationExt, NotificationMain } from '../api/plugin-api';
import { CancellationToken, Progress, ProgressOptions } from '@theia/plugin';
import { Thenable } from 'es6-promise';
import { RPCProtocol } from '../api/rpc-protocol';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

export class NotificationExtImpl implements NotificationExt {
    private readonly proxy: NotificationMain;

    private readonly onCancelEmitter: Emitter<string> = new Emitter();
    private readonly onCancel: Event<string> = this.onCancelEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN);
    }

    async withProgress<R>(
        options: ProgressOptions,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => Thenable<R>
    ): Promise<R> {
        const message = options.title ? options.title : '';
        const id = await this.proxy.$startProgress(message);
        if (id) {
            const token = new CancellationTokenImpl(id, this.onCancel);
            const thenable = await task(new ProgressCallback(id, this.proxy), token);
            this.proxy.$stopProgress(id);
            token.dispose();
            return thenable;
        } else {
            throw new Error('Failed to create progress notification');
        }
    }

    $onCancel(id: string): void {
        this.onCancelEmitter.fire(id);
    }
}

class ProgressCallback<T> implements Progress<{ message?: string, increment?: number }> {

    private readonly id: string | undefined;
    private readonly proxy: NotificationMain;

    constructor(id: string | undefined, proxy: NotificationMain) {
        this.id = id;
        this.proxy = proxy;
    }
    report(item: { message?: string, increment?: number }) {
        if (this.id) {
            this.proxy.$updateProgress(this.id, item);
        }
    }
}

class CancellationTokenImpl implements CancellationToken, Disposable {

    private readonly disposableCollection = new DisposableCollection();
    private readonly onCancellationRequestedEmitter: Emitter<string> = new Emitter<string>();

    isCancellationRequested: boolean = false;
    readonly onCancellationRequested: Event<string> = this.onCancellationRequestedEmitter.event;

    constructor(id: string, onCancel: Event<string>) {
        this.disposableCollection.push(onCancel(cancelId => {
            if (cancelId === id) {
                this.onCancellationRequestedEmitter.fire(cancelId);
                this.isCancellationRequested = true;
                this.dispose();
            }
        }));
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }
}
