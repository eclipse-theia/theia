// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import debounce = require('@theia/core/shared/lodash.debounce');
import { Emitter } from '@theia/core/';

export interface CollectionDelta<K, T> {
    added?: T[];
    removed?: K[];
}

export enum DeltaKind {
    NONE, ADDED, REMOVED, CHANGED
}

export interface TreeDelta<K, T> {
    path: K[];
    type: DeltaKind;
    value?: Partial<T>;
    childDeltas?: TreeDelta<K, T>[];
}

export class TreeDeltaBuilder<K, T> {
    protected _currentDelta: TreeDelta<K, T>[] = [];

    get currentDelta(): TreeDelta<K, T>[] {
        return this._currentDelta;
    }

    reportAdded(path: K[], added: T): void {
        this.findNode(path, (parentCollection, nodeIndex, residual) => {
            if (residual.length === 0) {
                // we matched an exact node
                const child = parentCollection[nodeIndex];
                if (child.type === DeltaKind.REMOVED) {
                    child.type = DeltaKind.CHANGED;
                } else if (child.type === DeltaKind.NONE) {
                    child.type = DeltaKind.ADDED;
                }
                child.value = added;
            } else {
                this.insert(parentCollection, nodeIndex, {
                    path: residual,
                    type: DeltaKind.ADDED,
                    value: added,
                });
            }
        });
    }

    reportRemoved(path: K[]): void {
        this.findNode(path, (parentCollection, nodeIndex, residual) => {
            if (residual.length === 0) {
                // we matched an exact node
                const child = parentCollection[nodeIndex];
                if (child.type === DeltaKind.CHANGED) {
                    child.type = DeltaKind.REMOVED;
                    delete child.value;
                } else if (child.type === DeltaKind.ADDED) {
                    parentCollection.splice(nodeIndex, 1);
                } else if (child.type === DeltaKind.NONE) {
                    child.type = DeltaKind.REMOVED;
                }
            } else {
                this.insert(parentCollection, nodeIndex, {
                    path: residual,
                    type: DeltaKind.REMOVED,
                });
            }
        });

    }

    reportChanged(path: K[], change: Partial<T>): void {
        this.findNode(path, (parentCollection, nodeIndex, residual) => {
            if (residual.length === 0) {
                // we matched an exact node
                const child = parentCollection[nodeIndex];
                if (child.type === DeltaKind.NONE) {
                    child.type = DeltaKind.CHANGED;
                }
                if (child.type !== DeltaKind.REMOVED) {
                    child.value = { ...child.value, ...change };
                }
            } else {
                this.insert(parentCollection, nodeIndex, {
                    path: residual,
                    type: DeltaKind.CHANGED,
                    value: change,
                });
            }
        });

    }

    private insert(parentCollection: TreeDelta<K, T>[], nodeIndex: number, delta: TreeDelta<K, T>): void {
        if (nodeIndex < 0) {
            parentCollection.push(delta);
        } else {
            const child = parentCollection[nodeIndex];
            const prefixLength = computePrefixLength(delta.path, child.path);

            const newNode: TreeDelta<K, T> = {
                path: child.path.slice(0, prefixLength),
                type: DeltaKind.NONE,
                childDeltas: []
            };
            parentCollection[nodeIndex] = newNode;
            delta.path = delta.path.slice(prefixLength);
            newNode.childDeltas!.push(delta);
            child.path = child.path.slice(prefixLength);
            newNode.childDeltas!.push(child);
        }
    }

    private findNode(path: K[], handler: (parentCollection: TreeDelta<K, T>[], nodeIndex: number, residualPath: K[]) => void): void {
        doFindNode(this._currentDelta, path, handler);
    }
}

function doFindNode<K, T>(rootCollection: TreeDelta<K, T>[], path: K[],
    handler: (parentCollection: TreeDelta<K, T>[], nodeIndex: number, residualPath: K[]) => void): void {
    let commonPrefixLength = 0;
    const childIndex = rootCollection.findIndex(delta => {
        commonPrefixLength = computePrefixLength(delta.path, path);
        return commonPrefixLength > 0;
    });
    if (childIndex >= 0) {
        // we know which child to insert into
        const child = rootCollection[childIndex];
        if (commonPrefixLength === child.path.length) {
            // we matched a child
            if (commonPrefixLength === path.length) {
                // it's an exact match: we alread have a node for the given path
                handler(rootCollection, childIndex, []);
                return;
            }
            // we know the node is below the child
            if (child.type === DeltaKind.REMOVED || child.type === DeltaKind.ADDED) {
                // there will be no children deltas beneath added/remove nodes
                return;
            }
            if (!child.childDeltas) {
                child.childDeltas = [];
            }
            doFindNode(child.childDeltas, path.slice(child.path.length), handler);
        } else {
            handler(rootCollection, childIndex, path);
        }
    } else {
        // we have no node to insert into
        handler(rootCollection, -1, path);
    }
}

function computePrefixLength<K>(left: K[], right: K[]): number {
    let i = 0;
    while (i < left.length && i < right.length && left[i] === right[i]) {
        i++;
    }

    return i;
}

export class AccumulatingTreeDeltaEmitter<K, T> extends TreeDeltaBuilder<K, T> {
    emitDelta: () => void;

    emitter: Emitter<TreeDelta<K, T>[]> = new Emitter();

    constructor(timeoutMillis: number) {
        super();
        this.emitDelta = debounce(() => this.doEmitDelta(), timeoutMillis);
    }

    doEmitDelta(): void {
        this.emitter.fire(this._currentDelta);
        this._currentDelta = [];
    }

    override reportAdded(path: K[], added: T): void {
        super.reportAdded(path, added);
        this.emitDelta();
    }

    override reportChanged(path: K[], change: Partial<T>): void {
        super.reportChanged(path, change);
        this.emitDelta();
    }

    override reportRemoved(path: K[]): void {
        super.reportRemoved(path);
        this.emitDelta();
    }
}
