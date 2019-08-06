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

import { NotificationMain } from '../../common/plugin-api-rpc';
import { ProgressService, Progress, ProgressMessage } from '@theia/core/lib/common';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../common/rpc-protocol';

export class NotificationMainImpl implements NotificationMain {

    private readonly progressService: ProgressService;
    private readonly progressMap = new Map<string, Progress>();
    private readonly progress2Work = new Map<string, number>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.progressService = container.get(ProgressService);
    }

    async $startProgress(options: string | NotificationMain.StartProgressOptions): Promise<string> {
        const progressMessage = this.mapOptions(options);
        const progress = await this.progressService.showProgress(progressMessage);
        this.progressMap.set(progress.id, progress);
        this.progress2Work.set(progress.id, 0);
        return progress.id;
    }
    protected mapOptions(options: string | NotificationMain.StartProgressOptions): ProgressMessage {
        const text = typeof options === 'string' ? options : options.title;
        const location = typeof options === 'string' ? 'notification' : options.location;
        return { text, options: { location, cancelable: true } };
    }

    $stopProgress(id: string): void {
        const progress = this.progressMap.get(id);
        if (progress) {
            progress.cancel();
            this.progressMap.delete(id);
            this.progress2Work.delete(id);
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
