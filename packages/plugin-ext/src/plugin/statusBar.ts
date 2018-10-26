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

import { PLUGIN_RPC_CONTEXT, StatusBarExt, StatusBarMain } from '../api/plugin-api';
import { CancellationToken, Progress, ProgressOptions } from '@theia/plugin';
import { Thenable } from 'es6-promise';
import { RPCProtocol } from '../api/rpc-protocol';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

export class StatusBarExtImpl implements StatusBarExt {
    private readonly proxy: StatusBarMain;

    private readonly onCancelEmitter: Emitter<void> = new Emitter<void>();
    private readonly onCancel: Event<void> = this.onCancelEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.STATUS_BAR_MAIN);
    }

    withProgress<R>(
        options: ProgressOptions,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => Thenable<R>
    ): Thenable<R> {
        const message = options.title ? options.title : '';
        const token = new CancellationTokenImpl(this.onCancel);
        const thenable = task(new ProgressCallback(message, this.proxy), token);
        this.proxy.$setProgressMessage(message).then(() => {
            thenable.then((() => {
                this.proxy.$removeProgressMessage().then(() => {
                    token.dispose();
                });
            }));
        });
        return thenable;
    }
}

class ProgressCallback<T> implements Progress<{ message?: string, increment?: number }> {

    private readonly message: string;
    private readonly proxy: StatusBarMain;

    constructor(message: string, proxy: StatusBarMain) {
        this.message = message;
        this.proxy = proxy;
    }
    report(item: { message?: string, increment?: number }) {
        this.proxy.$setProgressMessage(this.message + (item.message ? ': ' + ' ' + item.message : ''));
    }
}

class CancellationTokenImpl implements CancellationToken, Disposable {

    private readonly disposableCollection = new DisposableCollection();
    private readonly onCancellationRequestedEmitter: Emitter<void> = new Emitter<void>();

    isCancellationRequested: boolean = false;
    readonly onCancellationRequested: Event<void> = this.onCancellationRequestedEmitter.event;

    constructor(oncCancel: Event<void>) {
        this.disposableCollection.push(oncCancel(() => {
            this.onCancellationRequestedEmitter.fire(undefined);
            this.isCancellationRequested = true;
            this.dispose();
        }));
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }
}
