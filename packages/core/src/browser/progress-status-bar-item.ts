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
import { CancellationToken } from 'vscode-ws-jsonrpc';
import { ProgressClient } from '../common';
import { ProgressMessage, ProgressUpdate } from '../common';
import { StatusBar, StatusBarAlignment } from './status-bar';
import { Deferred } from '../common/promise-util';
import throttle = require('lodash.throttle');

@injectable()
export class ProgressStatusBarItem implements ProgressClient {

    protected readonly id = 'theia-progress-status-bar-item';

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    protected messagesByProgress = new Map<string, string | undefined>();

    protected incomingQueue = new Array<string>();

    get currentProgress(): string | undefined {
        return this.incomingQueue.slice(-1)[0];
    }

    showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        const result = new Deferred<string | undefined>();
        cancellationToken.onCancellationRequested(() => {
            this.processEvent(progressId, 'done');
            result.resolve(ProgressMessage.Cancel);
        });
        this.processEvent(progressId, 'start', message.text);
        return result.promise;
    }

    protected processEvent(progressId: string, event: 'start' | 'done', message?: string): void {
        if (event === 'start') {
            this.incomingQueue.push(progressId);
            this.messagesByProgress.set(progressId, message);
        } else {
            this.incomingQueue = this.incomingQueue.filter(id => id !== progressId);
            this.messagesByProgress.delete(progressId);
        }
        this.triggerUpdate();
    }

    protected readonly triggerUpdate = throttle(() => this.update(this.currentProgress), 250, { leading: true, trailing: true });

    async reportProgress(progressId: string, update: ProgressUpdate, originalMessage: ProgressMessage, _cancellationToken: CancellationToken): Promise<void> {
        const newMessage = update.message ? `${originalMessage.text}: ${update.message}` : originalMessage.text;
        this.messagesByProgress.set(progressId, newMessage);
        this.triggerUpdate();
    }

    protected update(progressId: string | undefined): void {
        const message = progressId && this.messagesByProgress.get(progressId);
        if (!progressId || !message) {
            this.statusBar.removeElement(this.id);
            return;
        }
        const text = `$(refresh~spin) ${message}`;
        this.statusBar.setElement(this.id, {
            text,
            alignment: StatusBarAlignment.LEFT,
            priority: 1
        });
    }

}
