/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import {
    Progress,
    ProgressUpdate,
    ProgressMessage
} from './message-service-protocol';
import { CancellationTokenSource } from './cancellation';
import { ProgressClient } from './progress-service-protocol';
import { MessageService } from './message-service';

@injectable()
export class ProgressService {

    @inject(ProgressClient) protected readonly client: ProgressClient;
    @inject(MessageService) protected readonly messageService: MessageService;

    async showProgress(message: ProgressMessage, onDidCancel?: () => void): Promise<Progress> {
        if (this.shouldDelegate(message)) {
            return this.messageService.showProgress(message, onDidCancel);
        }
        const id = this.newProgressId();
        const cancellationSource = new CancellationTokenSource();
        const report = (update: ProgressUpdate) => {
            this.client.reportProgress(id, update, message, cancellationSource.token);
        };
        const actions = new Set<string>(message.actions);
        if (ProgressMessage.isCancelable(message)) {
            actions.delete(ProgressMessage.Cancel);
            actions.add(ProgressMessage.Cancel);
        }
        const clientMessage = { ...message, actions: Array.from(actions) };
        const result = this.client.showProgress(id, clientMessage, cancellationSource.token);
        if (ProgressMessage.isCancelable(message) && typeof onDidCancel === 'function') {
            result.then(value => {
                if (value === ProgressMessage.Cancel) {
                    onDidCancel();
                }
            });
        }
        return {
            id,
            cancel: () => cancellationSource.cancel(),
            result,
            report
        };
    }
    protected shouldDelegate(message: ProgressMessage): boolean {
        const location = message.options && message.options.location;
        return location === 'notification';
    }

    private progressIdPrefix = Math.random().toString(36).substring(5);
    private counter = 0;
    protected newProgressId(): string {
        return `${this.progressIdPrefix}-${++this.counter}`;
    }

    async withProgress<T>(text: string, locationId: string, task: () => Promise<T>): Promise<T> {
        const progress = await this.showProgress({ text, options: { cancelable: true, location: locationId } });
        try {
            const result = task();
            return result;
        } catch (error) {
            throw error;
        } finally {
            progress.cancel();
        }
    }
}
