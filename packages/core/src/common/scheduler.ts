// *****************************************************************************
// Copyright (C) 2022 Bob and others.
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

export class ProcessTimeRunOnceScheduler {

    private runner: (() => void) | undefined;
    private timeout: number;

    private counter: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private intervalToken: any;
    private intervalHandler: () => void;

    constructor(runner: () => void, delay: number) {
        if (delay % 1000 !== 0) {
            console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
        }
        this.runner = runner;
        this.timeout = delay;
        this.counter = 0;
        this.intervalToken = -1;
        this.intervalHandler = this.onInterval.bind(this);
    }

    dispose(): void {
        this.cancel();
        this.runner = undefined;
    }

    cancel(): void {
        if (this.intervalToken !== -1) {
            clearInterval(this.intervalToken);
            this.intervalToken = -1;
        }
    }

    /**
     * Cancel previous runner (if any) & schedule a new runner.
     */
    schedule(delay = this.timeout): void {
        if (delay % 1000 !== 0) {
            console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
        }
        this.cancel();
        this.counter = Math.ceil(delay / 1000);
        this.intervalToken = setInterval(this.intervalHandler, 1000);
    }

    /**
     * Returns true if scheduled.
     */
    isScheduled(): boolean {
        return this.intervalToken !== -1;
    }

    private onInterval(): void {
        this.counter--;
        if (this.counter > 0) {
            // still need to wait
            return;
        }

        // time elapsed
        this.cancel();
        if (this.runner) {
            this.runner();
        }
    }
}
