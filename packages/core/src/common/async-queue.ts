/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { cancelled } from './cancellation';
import { Disposable } from './disposable';
import { Deferred } from './promise-util';
import { MaybePromise } from './types';

export interface AsyncQueueOptions {

    /**
     * Maximum amount of async tasks to run concurrently.
     *
     * Default to 1.
     */
    concurrency?: number
}

/**
 * Execute a set amount of async tasks concurrently.
 */
export class AsyncQueue implements Disposable {

    protected concurrency: number;
    protected end = new Deferred<void>();
    protected pending = new Array<() => Promise<unknown>>();
    protected running = new Map<symbol, Promise<unknown>>();
    protected _closed = false;

    /**
     * @returns an integer value greater than zero.
     */
    static toValidConcurrencyValue(value: number): number {
        return Number.isNaN(value) || value < 1
            ? 1
            : Math.floor(value);
    }

    constructor(options: AsyncQueueOptions = {}) {
        const {
            concurrency = 1,
        } = options;
        if (Number.isNaN(concurrency) || !Number.isInteger(concurrency) || concurrency < 1) {
            throw new Error('concurrency should be an integer greater than 0');
        }
        this.concurrency = concurrency;
    }

    get closed(): boolean {
        return this._closed;
    }

    /**
     * Schedule async tasks. The task will be ran as soon as it can.
     */
    push<T>(task: () => MaybePromise<T>): Promise<T> {
        if (this._closed) {
            throw new Error('queue is closed, cannot push anymore');
        }
        return new Promise((resolve, reject) => {
            const wrapper = () => Promise.resolve(task()).then(resolve, reject);
            if (this.running.size < this.concurrency) {
                this.run(wrapper);
            } else {
                this.pending.push(wrapper);
            }
        });
    }

    /**
     * Stop accepting new tasks and await all pending/running tasks to complete.
     */
    close(): Promise<void> {
        if (this._closed) {
            throw new Error('queue is closed, cannot close');
        }
        this._closed = true;
        if (this.running.size === 0 && this.pending.length === 0) {
            this.end.resolve();
        }
        return this.end.promise;
    }

    /**
     * Clear all pending tasks and closes this queue. Running tasks will keep going until settled.
     */
    dispose(): void {
        this.clear();
        this.end.reject(cancelled());
    }

    protected run(task: () => Promise<unknown>): void {
        const symbol = Symbol();
        const promise = task().then(
            () => {
                this.running.delete(symbol);
                const next = this.pending.pop();
                if (next) {
                    this.run(next);
                } else if (this._closed && this.running.size === 0) {
                    this.end.resolve();
                }
            },
            error => {
                this.clear();
                this.end.reject(error);
            }
        );
        this.running.set(symbol, promise);
    }

    protected clear(): void {
        this._closed = true;
        this.running.clear();
        this.pending.length = 0;
    }
}
