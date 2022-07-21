// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

export class TerminalThrottler {

    protected timeout?: NodeJS.Timeout;
    protected queuedData: string = '';
    protected currentDuration: number = 4;

    constructor(readonly maxDuration: number, readonly maxBatchSize: number, protected readonly callback: (data: string) => void) { }

    throttle(data: string): void {
        if (this.queuedData.length + data.length > this.maxBatchSize) {
            this.flush();
        }
        this.queuedData += data;
        if (!this.timeout || this.currentDuration < this.maxDuration) {
            clearTimeout(this.timeout);
            this.timeout = setTimeout(() => this.flush(), this.currentDuration);
            this.increaseDuration();
        }
    }

    protected flush(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.callback(this.queuedData);
        this.queuedData = '';
        this.currentDuration = 4;
    }

    protected increaseDuration(): void {
        this.currentDuration = Math.min(this.currentDuration * 2, this.maxDuration);
    }

}
