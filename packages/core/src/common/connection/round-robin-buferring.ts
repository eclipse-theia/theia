// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Event } from '../event';
import { Connection } from './connection';

export interface RoundRobinOptions {
    drainTimeout?: number
}

export class RoundRobinBuffering<T> implements Connection<T> {

    protected queues = new Map<any, T[]>();
    protected drainTimeout: number;
    protected timeout?: NodeJS.Timeout;

    constructor(
        protected transport: Connection<T>,
        protected getQueueId: (message: T) => any,
        options?: RoundRobinOptions
    ) {
        this.drainTimeout = options?.drainTimeout ?? 0;
    }

    get state(): Connection.State {
        return this.transport.state;
    }

    get onClose(): Event<void> {
        return this.transport.onClose;
    }

    get onError(): Event<Error> {
        return this.transport.onError;
    }

    get onMessage(): Event<T> {
        return this.transport.onMessage;
    }

    get onOpen(): Event<void> {
        return this.transport.onOpen;
    }

    sendMessage(message: T): void {
        const id = this.getQueueId(message);
        let queue = this.queues.get(id);
        if (!queue) {
            this.queues.set(id, queue = []);
        }
        queue.push(message);
        this.timeout ??= setTimeout(() => this.drain(), this.drainTimeout);
    }

    close(): void {
        clearTimeout(this.timeout);
        this.transport.close();
        this.queues.clear();
    }

    protected drain(): void {
        while (this.queues.size > 0) {
            if (this.queues.size === 1) {
                // fast-path when only a single queue remains
                (this.queues.values().next().value as T[]).forEach(message => {
                    this.transport.sendMessage(message);
                });
                this.queues.clear();
            } else {
                // send one message from each queue
                this.queues.forEach((queue, id) => {
                    const message = queue.shift();
                    if (message) {
                        this.transport.sendMessage(message);
                    } else {
                        this.queues.delete(id);
                    }
                });
            }
        }
        this.timeout = undefined;
    }
}
