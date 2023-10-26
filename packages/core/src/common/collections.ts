// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

/**
 * A convenience class for managing a "map of maps" of arbitrary depth
 */
export class MultiKeyMap<K, V> {
    private rootMap = new Map();

    constructor(private readonly keyLength: number) {
    }

    static create<S, T>(keyLength: number, data: [S[], T][]): MultiKeyMap<S, T> {
        const result = new MultiKeyMap<S, T>(keyLength);
        for (const entry of data) {
            result.set(entry[0], entry[1]);
        }
        return result;
    }

    set(key: readonly K[], value: V): V | undefined {
        if (this.keyLength !== key.length) {
            throw new Error(`inappropriate key length: ${key.length}, should be ${this.keyLength}`);
        }
        let map = this.rootMap;
        for (let i = 0; i < this.keyLength - 1; i++) {
            let existing = map.get(key[i]);
            if (!existing) {
                existing = new Map();
                map.set(key[i], existing);
            }
            map = existing;
        }
        const oldValue = map.get(key[this.keyLength - 1]);
        map.set(key[this.keyLength - 1], value);
        return oldValue;
    }

    get(key: readonly K[]): V | undefined {
        if (this.keyLength !== key.length) {
            throw new Error(`inappropriate key length: ${key.length}, should be ${this.keyLength}`);
        }
        let map = this.rootMap;
        for (let i = 0; i < this.keyLength - 1; i++) {
            map = map.get(key[i]);
            if (!map) {
                return undefined;
            }
        }
        return map.get(key[this.keyLength - 1]);
    }

    /**
     * Checks whether the given key is present in the map
     * @param key the key to test. It can have a length < the key length
     * @returns whether the key exists
     */
    has(key: readonly K[]): boolean {
        if (this.keyLength < key.length) {
            throw new Error(`inappropriate key length: ${key.length}, should <= ${this.keyLength}`);
        }
        let map = this.rootMap;
        for (let i = 0; i < key.length - 1; i++) {
            map = map.get(key[i]);
            if (!map) {
                return false;
            }
        }
        return map.has(key[key.length - 1]);
    }

    /**
     * Deletes the value with the given key from the map
     * @param key the key to remove.  It can have a length < the key length
     * @returns whether the key was present in the map
     */
    delete(key: readonly K[]): boolean {
        if (this.keyLength < key.length) {
            throw new Error(`inappropriate key length: ${key.length}, should <= ${this.keyLength}`);
        }
        let map = this.rootMap;
        for (let i = 0; i < this.keyLength - 1; i++) {
            map = map.get(key[i]);
            if (!map) {
                return false;
            }
        }
        return map.delete(key[key.length - 1]);
    }

    /**
     * Iterates over all entries in the map. The ordering semantics are like iterating over a map of maps.
     * @param handler Handler for each entry
     */
    forEach(handler: (value: V, key: K[]) => void): void {
        this.doForeach(handler, this.rootMap, []);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private doForeach(handler: (value: V, key: K[]) => void, currentMap: Map<any, any>, keys: K[]): void {
        if (keys.length === this.keyLength - 1) {
            currentMap.forEach((v, k) => {
                handler(v, [...keys, k]);
            });
        } else {
            currentMap.forEach((v, k) => {
                this.doForeach(handler, v, [...keys, k]);
            });

        }
    }
}
