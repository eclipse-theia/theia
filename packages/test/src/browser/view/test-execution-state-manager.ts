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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TestController, TestExecutionState, TestItem, TestRun, TestService } from '../test-service';

/**
 * This class manages the state of "internal" nodes in the test tree
 */
@injectable()
export class TestExecutionStateManager {
    @inject(TestService)
    protected readonly testService: TestService;

    private executionStates = new Map<TestRun, TestExecutionStateMap>();

    @postConstruct()
    init(): void {
        this.testService.getControllers().forEach(controller => this.addController(controller));
        this.testService.onControllersChanged(controllerDelta => {
            controllerDelta.added?.forEach(controller => this.addController(controller));
        });
    }
    addController(controller: TestController): void {
        controller.testRuns.forEach(run => this.addRun(run));
        controller.onRunsChanged(runDelta => {
            runDelta.added?.forEach(run => this.addRun(run));
            runDelta.removed?.forEach(run => {
                this.executionStates.delete(run);
            });
        });
    }
    addRun(run: TestRun): void {
        this.executionStates.set(run, new TestExecutionStateMap);
        run.onDidChangeTestState(updates => {
            updates.forEach(update => {
                this.updateState(run, update.test, update.oldState?.state, update.newState?.state);
            });
        });
    }

    protected updateState(run: TestRun, item: TestItem, oldState: TestExecutionState | undefined, newState: TestExecutionState | undefined): void {
        const map = this.executionStates.get(run)!;
        map.reportState(item, oldState, newState);
    }

    getComputedState(run: TestRun, item: TestItem): TestExecutionState | undefined {
        return this.executionStates.get(run)?.getComputedState(item);
    }
}

class TestExecutionStateMap {
    reportState(item: TestItem, oldState: TestExecutionState | undefined, newState: TestExecutionState | undefined): void {
        if (oldState !== newState) {
            if (item.parent) {
                this.reportChildStateChanged(item.parent, oldState, newState);
            }
        }
    }
    reportChildStateChanged(parent: TestItem, oldState: TestExecutionState | undefined, newState: TestExecutionState | undefined): void {
        if (oldState !== newState) {
            const currentParentState = this.getComputedState(parent);
            let counts = this.stateCounts.get(parent);
            if (!counts) {
                counts = [];
                counts[TestExecutionState.Queued] = 0;
                counts[TestExecutionState.Running] = 0;
                counts[TestExecutionState.Passed] = 0;
                counts[TestExecutionState.Failed] = 0;
                counts[TestExecutionState.Skipped] = 0;
                counts[TestExecutionState.Errored] = 0;
                this.stateCounts.set(parent, counts);
            }
            if (oldState) {
                counts[oldState]--;
            }
            if (newState) {
                counts[newState]++;
            }
            const newParentState = this.getComputedState(parent);
            if (parent.parent && currentParentState !== newParentState) {
                this.reportChildStateChanged(parent.parent, currentParentState, newParentState!);
            }
        }
    }

    private stateCounts: Map<TestItem | TestController, number[]> = new Map();

    updateState(item: TestItem, oldState: TestExecutionState | undefined, newState: TestExecutionState): void {
        let parent = item.parent;
        while (parent && 'parent' in parent) { // parent is a test item
            let counts = this.stateCounts.get(parent);
            if (!counts) {
                counts = [];
                counts[TestExecutionState.Queued] = 0;
                counts[TestExecutionState.Running] = 0;
                counts[TestExecutionState.Passed] = 0;
                counts[TestExecutionState.Failed] = 0;
                counts[TestExecutionState.Skipped] = 0;
                counts[TestExecutionState.Errored] = 0;
                this.stateCounts.set(parent, counts);
            }
            if (oldState) {
                counts[oldState]--;
            }
            counts[newState]++;
            parent = parent.parent;
        }
    }

    getComputedState(item: TestItem): TestExecutionState | undefined {
        const counts = this.stateCounts.get(item);
        if (counts) {
            if (counts[TestExecutionState.Errored] > 0) {
                return TestExecutionState.Errored;
            } else if (counts[TestExecutionState.Failed] > 0) {
                return TestExecutionState.Failed;
            } else if (counts[TestExecutionState.Running] > 0) {
                return TestExecutionState.Running;
            } else if (counts[TestExecutionState.Queued] > 0) {
                return TestExecutionState.Queued;
            } else if (counts[TestExecutionState.Passed] > 0) {
                return TestExecutionState.Passed;
            } else if (counts[TestExecutionState.Skipped] > 0) {
                return TestExecutionState.Skipped;
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
    }
}

