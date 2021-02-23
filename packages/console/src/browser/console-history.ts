/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class ConsoleHistory {

    static limit = 50;

    protected values: string[] = [];
    protected index = -1;

    push(value: string): void {
        this.delete(value);
        this.values.push(value);
        this.trim();
        this.index = this.values.length;
    }
    protected delete(value: string): void {
        const index = this.values.indexOf(value);
        if (index !== -1) {
            this.values.splice(index, 1);
        }
    }
    protected trim(): void {
        const index = this.values.length - ConsoleHistory.limit;
        if (index > 0) {
            this.values.slice(index);
        }
    }

    get current(): string | undefined {
        return this.values[this.index];
    }

    get previous(): string | undefined {
        this.index = Math.max(this.index - 1, -1);
        return this.current;
    }

    get next(): string | undefined {
        this.index = Math.min(this.index + 1, this.values.length);
        return this.current;
    }

    store(): ConsoleHistory.Data {
        const { values, index } = this;
        return { values, index };
    }

    restore(object: ConsoleHistory): void {
        this.values = object.values;
        this.index = object.index;
    }

}
export namespace ConsoleHistory {
    export interface Data {
        values: string[],
        index: number
    }
}
