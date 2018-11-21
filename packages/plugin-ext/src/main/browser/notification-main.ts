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

import { MAIN_RPC_CONTEXT, NotificationExt, NotificationMain } from '../../api/plugin-api';
import { MessageService, Progress } from '@theia/core/lib/common';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../api/rpc-protocol';
import { Deferred } from '@theia/core/lib/common/promise-util';

export class NotificationMainImpl implements NotificationMain {

    private readonly proxy: NotificationExt;
    private readonly messageService: MessageService;
    private readonly progress = new Map<string, Progress>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTIFICATION_EXT);
        this.messageService = container.get(MessageService);
    }

    async $startProgress(message: string): Promise<string> {
        const deferredId = new Deferred<string>();
        const onDidClose = async () => this.proxy.$onCancel(await deferredId.promise);
        const progress = await this.messageService.showProgress({ text: message, options: { cancelable: true } }, onDidClose);
        deferredId.resolve(progress.id);
        this.progress.set(progress.id, progress);
        return progress.id;
    }

    $stopProgress(id: string): void {
        const progress = this.progress.get(id);
        if (progress) {
            progress.cancel();
        }
    }

    $updateProgress(id: string, item: { message?: string, increment?: number }): void {
        const progress = this.progress.get(id);
        if (progress) {
            progress.report({ value: item.message, increment: item.increment });
        }
    }
}
