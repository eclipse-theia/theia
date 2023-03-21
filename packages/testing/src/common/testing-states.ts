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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testingStates.ts

import { TestResultState } from './test-types';

export interface TreeStateNode { statusNode: true; state: TestResultState; priority: number };

/**
 * List of display priorities for different run states. When tests update,
 * the highest-priority state from any of their children will be the state
 * reflected in the parent node.
 */
export const statePriority: { [K in TestResultState]: number } = {
    [TestResultState.Running]: 6,
    [TestResultState.Errored]: 5,
    [TestResultState.Failed]: 4,
    [TestResultState.Queued]: 3,
    [TestResultState.Passed]: 2,
    [TestResultState.Unset]: 1,
    [TestResultState.Skipped]: 0,
};

export const isFailedState = (s: TestResultState) => s === TestResultState.Errored || s === TestResultState.Failed;
export const isStateWithResult = (s: TestResultState) => s === TestResultState.Errored || s === TestResultState.Failed || s === TestResultState.Passed;

export const stateNodes = Object.entries(statePriority).reduce(
    (acc, [stateStr, priority]) => {
        const state = Number(stateStr) as TestResultState;
        acc[state] = { statusNode: true, state, priority };
        return acc;
    }, {} as { [K in TestResultState]: TreeStateNode }
);

export const cmpPriority = (a: TestResultState, b: TestResultState) => statePriority[b] - statePriority[a];

export const maxPriority = (...states: TestResultState[]) => {
    switch (states.length) {
        case 0:
            return TestResultState.Unset;
        case 1:
            return states[0];
        case 2:
            return statePriority[states[0]] > statePriority[states[1]] ? states[0] : states[1];
        default: {
            let max = states[0];
            for (let i = 1; i < states.length; i++) {
                if (statePriority[max] < statePriority[states[i]]) {
                    max = states[i];
                }
            }

            return max;
        }
    }
};

export const statesInOrder = Object.keys(statePriority).map(s => Number(s) as TestResultState).sort(cmpPriority);

export const isRunningState = (s: TestResultState) => s === TestResultState.Queued || s === TestResultState.Running;

/**
 * Some states are considered terminal; once these are set for a given test run, they
 * are not reset back to a non-terminal state, or to a terminal state with lower
 * priority.
 */
export const terminalStatePriorities: { [key in TestResultState]?: number } = {
    [TestResultState.Passed]: 0,
    [TestResultState.Skipped]: 1,
    [TestResultState.Failed]: 2,
    [TestResultState.Errored]: 3,
};
