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

/*
* Utility for storing and sorting an array of most recently visited memory locations
*/
interface RecentsOptions {
    maxValues?: number;
}

export class Recents {
    protected maxValues: number;
    protected _values: string[] = [];
    get values(): string[] {
        return this._values;
    }

    constructor(initialVals?: string[], opts?: RecentsOptions) {
        this.maxValues = opts?.maxValues ?? 10;
        if (initialVals) {
            if (initialVals.length <= this.maxValues) {
                this._values = initialVals;
                return;
            }
            console.error('Initial values length is greater than allowed length, resetting to empty array');
        }
        this._values = [];
    }

    add(locationString: string): void {
        const indexOf = this.has(locationString);
        if (indexOf > -1) {
            this._values.splice(indexOf, 1);
        } else {
            if (this._values.length === this.maxValues) {
                this._values.shift();
            }
        }
        this._values.push(locationString);
    }

    has(locationString: string): number {
        return this._values.indexOf(locationString);
    }
}
