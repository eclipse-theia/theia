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

/**
 * Timeout that will run its callback only once.
 *
 * Can be armed, rearmed and disarmed.
 */
export class RunOnceTimeout {

    protected done = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected timeout?: any;

    constructor(
        protected callback: () => void
    ) { }

    /**
     * Schedule the callback to be run in {@link delay} ms.
     *
     * You may call this method several time to reschedule.
     *
     * @param delay ms
     * @throws if the callback was invoked once.
     */
    arm(delay: number): this {
        if (this.done) {
            throw new Error('this timeout completed');
        }
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.done = true;
            this.callback();
        }, delay);
        return this;
    }

    /**
     * Unschedule the execution of the callback.
     *
     * @returns `true` if this timeout was armed, `false` otherwise.
     */
    disarm(): boolean {
        if (this.done) {
            return false;
        }
        const armed = this.timeout !== undefined;
        clearTimeout(this.timeout);
        this.timeout = undefined;
        return armed;
    }
}
