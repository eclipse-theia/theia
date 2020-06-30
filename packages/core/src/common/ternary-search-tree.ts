/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/base/common/map.ts#L251

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/tslint/config */

import URI from './uri';
import { CharCode } from './char-code';
import { compareSubstringIgnoreCase, compare, compareSubstring } from './strings';

export interface IKeyIterator<K> {
    reset(key: K): this;
    next(): this;

    hasNext(): boolean;
    cmp(a: string): number;
    value(): string;
}

export class PathIterator implements IKeyIterator<string> {

    private _value!: string;
    private _from!: number;
    private _to!: number;

    constructor(
        private readonly _splitOnBackslash: boolean = true,
        private readonly _caseSensitive: boolean = true
    ) { }

    reset(key: string): this {
        this._value = key.replace(/\\$|\/$/, '');
        this._from = 0;
        this._to = 0;
        return this.next();
    }

    hasNext(): boolean {
        return this._to < this._value.length;
    }

    next(): this {
        // this._data = key.split(/[\\/]/).filter(s => !!s);
        this._from = this._to;
        let justSeps = true;
        for (; this._to < this._value.length; this._to++) {
            const ch = this._value.charCodeAt(this._to);
            if (ch === CharCode.Slash || this._splitOnBackslash && ch === CharCode.Backslash) {
                if (justSeps) {
                    this._from++;
                } else {
                    break;
                }
            } else {
                justSeps = false;
            }
        }
        return this;
    }

    cmp(a: string): number {
        return this._caseSensitive
            ? compareSubstring(a, this._value, 0, a.length, this._from, this._to)
            : compareSubstringIgnoreCase(a, this._value, 0, a.length, this._from, this._to);
    }

    value(): string {
        return this._value.substring(this._from, this._to);
    }
}

const enum UriIteratorState {
    Scheme = 1, Authority = 2, Path = 3, Query = 4, Fragment = 5
}

export class UriIterator implements IKeyIterator<URI> {

    private _pathIterator!: PathIterator;
    private _value!: URI;
    private _states: UriIteratorState[] = [];
    private _stateIdx: number = 0;

    constructor(
        protected readonly caseSensitive: boolean
    ) { }

    reset(key: URI): this {
        this._value = key;
        this._states = [];
        if (this._value.scheme) {
            this._states.push(UriIteratorState.Scheme);
        }
        if (this._value.authority) {
            this._states.push(UriIteratorState.Authority);
        }
        if (this._value.path) {
            this._pathIterator = new PathIterator(false, this.caseSensitive);
            this._pathIterator.reset(key.path.toString());
            if (this._pathIterator.value()) {
                this._states.push(UriIteratorState.Path);
            }
        }
        if (this._value.query) {
            this._states.push(UriIteratorState.Query);
        }
        if (this._value.fragment) {
            this._states.push(UriIteratorState.Fragment);
        }
        this._stateIdx = 0;
        return this;
    }

    next(): this {
        if (this._states[this._stateIdx] === UriIteratorState.Path && this._pathIterator.hasNext()) {
            this._pathIterator.next();
        } else {
            this._stateIdx += 1;
        }
        return this;
    }

    hasNext(): boolean {
        return (this._states[this._stateIdx] === UriIteratorState.Path && this._pathIterator.hasNext())
            || this._stateIdx < this._states.length - 1;
    }

    cmp(a: string): number {
        if (this._states[this._stateIdx] === UriIteratorState.Scheme) {
            return compareSubstringIgnoreCase(a, this._value.scheme);
        } else if (this._states[this._stateIdx] === UriIteratorState.Authority) {
            return compareSubstringIgnoreCase(a, this._value.authority);
        } else if (this._states[this._stateIdx] === UriIteratorState.Path) {
            return this._pathIterator.cmp(a);
        } else if (this._states[this._stateIdx] === UriIteratorState.Query) {
            return compare(a, this._value.query);
        } else if (this._states[this._stateIdx] === UriIteratorState.Fragment) {
            return compare(a, this._value.fragment);
        }
        throw new Error();
    }

    value(): string {
        if (this._states[this._stateIdx] === UriIteratorState.Scheme) {
            return this._value.scheme;
        } else if (this._states[this._stateIdx] === UriIteratorState.Authority) {
            return this._value.authority;
        } else if (this._states[this._stateIdx] === UriIteratorState.Path) {
            return this._pathIterator.value();
        } else if (this._states[this._stateIdx] === UriIteratorState.Query) {
            return this._value.query;
        } else if (this._states[this._stateIdx] === UriIteratorState.Fragment) {
            return this._value.fragment;
        }
        throw new Error();
    }
}

class TernarySearchTreeNode<K, V> {
    segment!: string;
    value: V | undefined;
    key!: K;
    left: TernarySearchTreeNode<K, V> | undefined;
    mid: TernarySearchTreeNode<K, V> | undefined;
    right: TernarySearchTreeNode<K, V> | undefined;

    isEmpty(): boolean {
        return !this.left && !this.mid && !this.right && !this.value;
    }
}

export class TernarySearchTree<K, V> {

    static forUris<E>(caseSensitive: boolean): TernarySearchTree<URI, E> {
        return new TernarySearchTree<URI, E>(new UriIterator(caseSensitive));
    }

    static forPaths<E>(): TernarySearchTree<string, E> {
        return new TernarySearchTree<string, E>(new PathIterator());
    }

    private _iter: IKeyIterator<K>;
    private _root: TernarySearchTreeNode<K, V> | undefined;

    constructor(segments: IKeyIterator<K>) {
        this._iter = segments;
    }

    clear(): void {
        this._root = undefined;
    }

    set(key: K, element: V): V | undefined {
        const iter = this._iter.reset(key);
        let node: TernarySearchTreeNode<K, V>;

        if (!this._root) {
            this._root = new TernarySearchTreeNode<K, V>();
            this._root.segment = iter.value();
        }

        node = this._root;
        while (true) {
            const val = iter.cmp(node.segment);
            if (val > 0) {
                // left
                if (!node.left) {
                    node.left = new TernarySearchTreeNode<K, V>();
                    node.left.segment = iter.value();
                }
                node = node.left;

            } else if (val < 0) {
                // right
                if (!node.right) {
                    node.right = new TernarySearchTreeNode<K, V>();
                    node.right.segment = iter.value();
                }
                node = node.right;

            } else if (iter.hasNext()) {
                // mid
                iter.next();
                if (!node.mid) {
                    node.mid = new TernarySearchTreeNode<K, V>();
                    node.mid.segment = iter.value();
                }
                node = node.mid;
            } else {
                break;
            }
        }
        const oldElement = node.value;
        node.value = element;
        node.key = key;
        return oldElement;
    }

    get(key: K): V | undefined {
        const iter = this._iter.reset(key);
        let node = this._root;
        while (node) {
            const val = iter.cmp(node.segment);
            if (val > 0) {
                // left
                node = node.left;
            } else if (val < 0) {
                // right
                node = node.right;
            } else if (iter.hasNext()) {
                // mid
                iter.next();
                node = node.mid;
            } else {
                break;
            }
        }
        return node ? node.value : undefined;
    }

    delete(key: K): void {

        const iter = this._iter.reset(key);
        const stack: [-1 | 0 | 1, TernarySearchTreeNode<K, V>][] = [];
        let node = this._root;

        // find and unset node
        while (node) {
            const val = iter.cmp(node.segment);
            if (val > 0) {
                // left
                stack.push([1, node]);
                node = node.left;
            } else if (val < 0) {
                // right
                stack.push([-1, node]);
                node = node.right;
            } else if (iter.hasNext()) {
                // mid
                iter.next();
                stack.push([0, node]);
                node = node.mid;
            } else {
                // remove element
                node.value = undefined;

                // clean up empty nodes
                while (stack.length > 0 && node.isEmpty()) {
                    const [dir, parent] = stack.pop()!;
                    switch (dir) {
                        case 1: parent.left = undefined; break;
                        case 0: parent.mid = undefined; break;
                        case -1: parent.right = undefined; break;
                    }
                    node = parent;
                }
                break;
            }
        }
    }

    findSubstr(key: K): V | undefined {
        const iter = this._iter.reset(key);
        let node = this._root;
        let candidate: V | undefined = undefined;
        while (node) {
            const val = iter.cmp(node.segment);
            if (val > 0) {
                // left
                node = node.left;
            } else if (val < 0) {
                // right
                node = node.right;
            } else if (iter.hasNext()) {
                // mid
                iter.next();
                candidate = node.value || candidate;
                node = node.mid;
            } else {
                break;
            }
        }
        return node && node.value || candidate;
    }

    findSuperstr(key: K): Iterator<V> | undefined {
        const iter = this._iter.reset(key);
        let node = this._root;
        while (node) {
            const val = iter.cmp(node.segment);
            if (val > 0) {
                // left
                node = node.left;
            } else if (val < 0) {
                // right
                node = node.right;
            } else if (iter.hasNext()) {
                // mid
                iter.next();
                node = node.mid;
            } else {
                // collect
                if (!node.mid) {
                    return undefined;
                } else {
                    return this._nodeIterator(node.mid);
                }
            }
        }
        return undefined;
    }

    private _nodeIterator(node: TernarySearchTreeNode<K, V>): Iterator<V> {
        let res: { done: false; value: V; };
        let idx: number;
        let data: V[];
        const next = (): IteratorResult<V> => {
            if (!data) {
                // lazy till first invocation
                data = [];
                idx = 0;
                this._forEach(node, value => data.push(value));
            }
            if (idx >= data.length) {
                return { done: true, value: undefined };
            }

            if (!res) {
                res = { done: false, value: data[idx++] };
            } else {
                res.value = data[idx++];
            }
            return res;
        };
        return { next };
    }

    forEach(callback: (value: V, index: K) => any) {
        this._forEach(this._root, callback);
    }

    private _forEach(node: TernarySearchTreeNode<K, V> | undefined, callback: (value: V, index: K) => any) {
        if (node) {
            // left
            this._forEach(node.left, callback);

            // node
            if (node.value) {
                // callback(node.value, this._iter.join(parts));
                callback(node.value, node.key);
            }
            // mid
            this._forEach(node.mid, callback);

            // right
            this._forEach(node.right, callback);
        }
    }
}
