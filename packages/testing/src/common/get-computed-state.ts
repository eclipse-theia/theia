// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/getComputedState.ts

/* eslint-disable import/no-extraneous-dependencies */

import { Iterable } from '@theia/monaco-editor-core/esm/vs/base/common/iterator';
import { TestResultState } from './test-types';
import { maxPriority, statePriority } from './testing-states';

/**
 * Accessor for nodes in get and refresh computed state.
 */
export interface IComputedStateAccessor<T> {
    getOwnState(item: T): TestResultState | undefined;
    getCurrentComputedState(item: T): TestResultState;
    setComputedState(item: T, state: TestResultState): void;
    getChildren(item: T): Iterable<T>;
    getParents(item: T): Iterable<T>;
}

export interface IComputedStateAndDurationAccessor<T> extends IComputedStateAccessor<T> {
    getOwnDuration(item: T): number | undefined;
    getCurrentComputedDuration(item: T): number | undefined;
    setComputedDuration(item: T, duration: number | undefined): void;
}

export const isDurationAccessor = <T>(accessor: IComputedStateAccessor<T>): accessor is IComputedStateAndDurationAccessor<T> => 'getOwnDuration' in accessor;

/**
 * Gets the computed state for the node.
 * @param force whether to refresh the computed state for this node, even
 * if it was previously set.
 */

export const getComputedState = <T>(accessor: IComputedStateAccessor<T>, node: T, force = false) => {
    let computed = accessor.getCurrentComputedState(node);
    if (computed === undefined || force) {
        computed = accessor.getOwnState(node) ?? TestResultState.Unset;

        for (const child of accessor.getChildren(node)) {
            const childComputed = getComputedState(accessor, child);
            // If all children are skipped, make the current state skipped too if unset (#131537)
            computed = childComputed === TestResultState.Skipped && computed === TestResultState.Unset
                ? TestResultState.Skipped : maxPriority(computed, childComputed);
        }

        accessor.setComputedState(node, computed);
    }

    return computed;
};

export const getComputedDuration = <T>(accessor: IComputedStateAndDurationAccessor<T>, node: T, force = false): number | undefined => {
    let computed = accessor.getCurrentComputedDuration(node);
    if (computed === undefined || force) {
        const own = accessor.getOwnDuration(node);
        if (own !== undefined) {
            computed = own;
        } else {
            computed = undefined;
            for (const child of accessor.getChildren(node)) {
                const d = getComputedDuration(accessor, child);
                if (d !== undefined) {
                    computed = (computed || 0) + d;
                }
            }
        }

        accessor.setComputedDuration(node, computed);
    }

    return computed;
};

/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements cause `addUpdated` to be called.
 */
export const refreshComputedState = <T>(
    accessor: IComputedStateAccessor<T>,
    node: T,
    explicitNewComputedState?: TestResultState,
    refreshDuration = true,
) => {
    const oldState = accessor.getCurrentComputedState(node);
    const oldPriority = statePriority[oldState];
    const newState = explicitNewComputedState ?? getComputedState(accessor, node, true);
    const newPriority = statePriority[newState];
    const toUpdate = new Set<T>();

    if (newPriority !== oldPriority) {
        accessor.setComputedState(node, newState);
        toUpdate.add(node);

        if (newPriority > oldPriority) {
            // Update all parents to ensure they're at least this priority.
            for (const parent of accessor.getParents(node)) {
                const prev = accessor.getCurrentComputedState(parent);
                if (prev !== undefined && statePriority[prev] >= newPriority) {
                    break;
                }

                accessor.setComputedState(parent, newState);
                toUpdate.add(parent);
            }
        } else if (newPriority < oldPriority) {
            // Re-render all parents of this node whose computed priority might have come from this node
            for (const parent of accessor.getParents(node)) {
                const prev = accessor.getCurrentComputedState(parent);
                if (prev === undefined || statePriority[prev] > oldPriority) {
                    break;
                }

                accessor.setComputedState(parent, getComputedState(accessor, parent, true));
                toUpdate.add(parent);
            }
        }
    }

    if (isDurationAccessor(accessor) && refreshDuration) {
        for (const parent of Iterable.concat(Iterable.single(node), accessor.getParents(node))) {
            const oldDuration = accessor.getCurrentComputedDuration(parent);
            const newDuration = getComputedDuration(accessor, parent, true);
            if (oldDuration === newDuration) {
                break;
            }

            accessor.setComputedDuration(parent, newDuration);
            toUpdate.add(parent);
        }
    }

    return toUpdate;
};
