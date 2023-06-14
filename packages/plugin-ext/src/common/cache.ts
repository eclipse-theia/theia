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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// copied from https://github.com/microsoft/vscode/blob/53eac52308c4611000a171cc7bf1214293473c78/src/vs/workbench/api/common/cache.ts
export class Cache<T> {

    private static readonly enableDebugLogging = false;

    private readonly _data = new Map<number, readonly T[]>();
    private _idPool = 1;

    constructor(
        private readonly id: string
    ) { }

    add(item: readonly T[]): number {
        const id = this._idPool++;
        this._data.set(id, item);
        this.logDebugInfo();
        return id;
    }

    get(pid: number, id: number): T | undefined {
        return this._data.has(pid) ? this._data.get(pid)![id] : undefined;
    }

    delete(id: number): void {
        this._data.delete(id);
        this.logDebugInfo();
    }

    private logDebugInfo(): void {
        if (!Cache.enableDebugLogging) {
            return;
        }
        console.log(`${this.id} cache size — ${this._data.size}`);
    }
}
