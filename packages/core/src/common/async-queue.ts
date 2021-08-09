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
     * 0 means all tasks will be running concurrently. `Infinity` can be used too when applicable.
     *
     * Defaults to 1.
     */
    concurrency?: number
}

/**
 * Execute a set amount of async tasks concurrently.
 */
export class AsyncQueue implements Disposable {

    readonly concurrency: number;

    protected end = new Deferred<void>();
    protected pending = new Array<() => Promise<unknown>>();
    protected _runningCount = 0;
    protected _closed = false;

    /**
     * @returns an integer value greater than zero.
     */
    static toValidConcurrencyValue(value: number): number {
        return Number.isNaN(value) || value < 0
            ? 1
            : Math.floor(value);
    }

    constructor(options: AsyncQueueOptions = {}) {
        const {
            concurrency = 1,
        } = options;
        if (Number.isNaN(concurrency) || !Number.isInteger(concurrency) || concurrency < 0) {
            throw new Error('concurrency should be an integer greater than or equal to 0');
        }
        this.concurrency = concurrency;
    }

    get pendingCount(): number {
        return this.pending.length;
    }

    get runningCount(): number {
        return this._runningCount;
    }

    get closed(): boolean {
        return this._closed;
    }

    /**
     * Schedule async tasks. The task will run as soon as it should to satisfy the concurrency limit.
     */
    push<T>(task: () => MaybePromise<T>): Promise<T> {
        if (this._closed) {
            throw new Error('queue is closed, cannot push anymore');
        }
        return new Promise((resolve, reject) => {
            const wrapper = () => Promise.resolve(task()).then(resolve, reject);
            if (this.concurrency === 0 || this.runningCount < this.concurrency) {
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
            return this.end.promise;
        }
        this._closed = true;
        if (this.runningCount === 0 && this.pendingCount === 0) {
            // We are closing while nothing is running, so we need to manually resolve the `end` lock:
            this.end.resolve();
        }
        return this.end.promise;
    }

    /**
     * Clears all pending tasks and closes this queue. Running tasks will keep going until settled.
     */
    dispose(): void {
        this.clear();
        this.end.reject(cancelled());
    }

    protected run(task: () => Promise<unknown>): void {
        this._runningCount += 1;
        task().then(
            () => {
                this._runningCount -= 1;
                // Pop the next task to run, `runningCount` will only really decrease if there's no pending task.
                const next = this.pending.pop();
                if (next) {
                    this.run(next);
                } else if (this._closed && this.runningCount === 0) {
                    // Queue is closed so no new tasks will be scheduled and no more tasks are running = Time to wrap up.
                    this.end.resolve();
                }
            },
            error => {
                this.clear();
                this.end.reject(error);
            }
        );
    }

    protected clear(): void {
        this._closed = true;
        this._runningCount = 0;
        this.pending.length = 0;
    }
}
