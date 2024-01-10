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
import { TestController, TestFailure, TestOutputItem, TestRun, TestService, TestState, TestStateChangedEvent } from '../test-service';
import { Disposable, Emitter, Event } from '@theia/core';
import { TestContextKeyService } from './test-context-key-service';

export interface ActiveRunEvent {
    controller: TestController;
    activeRun: TestRun | undefined
}

export interface TestOutputSource {
    readonly output: readonly TestOutputItem[];
    onDidAddTestOutput: Event<TestOutputItem[]>;
}

export interface ActiveTestStateChangedEvent {
    controller: TestController;
    testRun: TestRun;
    statedDelta: TestStateChangedEvent[];
}

interface ActiveTestRunInfo {
    run: TestRun;
    toDispose: Disposable;
}

@injectable()
export class TestOutputUIModel {
    @inject(TestContextKeyService) protected readonly testContextKeys: TestContextKeyService;
    @inject(TestService) protected testService: TestService;

    protected readonly activeRuns = new Map<string, ActiveTestRunInfo>();
    protected readonly controllerListeners = new Map<string, Disposable>();
    private _selectedOutputSource: TestOutputSource | undefined;
    private _selectedTestState: TestState | undefined;

    @postConstruct()
    init(): void {
        this.testService.getControllers().forEach(controller => this.addController(controller));
        this.testService.onControllersChanged(deltas => {
            deltas.added?.forEach(controller => this.addController(controller));
            deltas.removed?.forEach(controller => this.removeController(controller));
        });
    }

    protected removeController(id: string): void {
        this.controllerListeners.get(id)?.dispose();
        if (this.activeRuns.has(id)) {
            this.activeRuns.delete(id);
        }
    }

    protected addController(controller: TestController): void {
        this.controllerListeners.set(controller.id, controller.onRunsChanged(delta => {
            if (delta.added) {
                const currentRun = controller.testRuns[controller.testRuns.length - 1];
                if (currentRun) {
                    this.setActiveTestRun(currentRun);
                }
            } else {
                delta.removed?.forEach(run => {
                    if (run === this.getActiveTestRun(controller)) {
                        const currentRun = controller.testRuns[controller.testRuns.length - 1];
                        this.doSetActiveRun(controller, currentRun);
                    }
                });
            }
        }));
    }

    getActiveTestRun(controller: TestController): TestRun | undefined {
        return this.activeRuns.get(controller.id)?.run;
    }

    protected readonly onDidChangeActiveTestRunEmitter = new Emitter<ActiveRunEvent>();
    onDidChangeActiveTestRun: Event<ActiveRunEvent> = this.onDidChangeActiveTestRunEmitter.event;

    setActiveTestRun(run: TestRun): void {
        this.doSetActiveRun(run.controller, run);
    }

    doSetActiveRun(controller: TestController, run: TestRun | undefined): void {
        const old = this.activeRuns.get(controller.id);
        if (old !== run) {
            if (old) {
                old.toDispose.dispose();
            }
            if (run) {
                const toDispose = run.onDidChangeTestState(e => {
                    this.onDidChangeActiveTestStateEmitter.fire({
                        controller,
                        testRun: run,
                        statedDelta: e
                    });
                });
                this.activeRuns.set(controller.id, { run, toDispose });
            } else {
                this.activeRuns.delete(controller.id);
            }
            this.onDidChangeActiveTestRunEmitter.fire({ activeRun: run, controller: controller });
        }
    }

    private onDidChangeActiveTestStateEmitter: Emitter<ActiveTestStateChangedEvent> = new Emitter();
    onDidChangeActiveTestState: Event<ActiveTestStateChangedEvent> = this.onDidChangeActiveTestStateEmitter.event;

    get selectedOutputSource(): TestOutputSource | undefined {
        return this._selectedOutputSource;
    }

    set selectedOutputSource(element: TestOutputSource | undefined) {
        if (element !== this._selectedOutputSource) {
            this._selectedOutputSource = element;
            this.onDidChangeSelectedOutputSourceEmitter.fire(element);
        }
    }

    protected readonly onDidChangeSelectedOutputSourceEmitter = new Emitter<TestOutputSource | undefined>();
    readonly onDidChangeSelectedOutputSource: Event<TestOutputSource | undefined> = this.onDidChangeSelectedOutputSourceEmitter.event;

    get selectedTestState(): TestState | undefined {
        return this._selectedTestState;
    }

    set selectedTestState(element: TestState | undefined) {
        if (element !== this._selectedTestState) {
            this._selectedTestState = element;
            if (this._selectedTestState && TestFailure.is(this._selectedTestState.state)) {
                const message = this._selectedTestState.state.messages[0];
                this.testContextKeys.contextValue.set(message.contextValue);
            } else {
                this.testContextKeys.contextValue.reset();
            }
            this.onDidChangeSelectedTestStateEmitter.fire(element);
        }
    }

    protected readonly onDidChangeSelectedTestStateEmitter = new Emitter<TestState | undefined>();
    readonly onDidChangeSelectedTestState: Event<TestState | undefined> = this.onDidChangeSelectedTestStateEmitter.event;
}
