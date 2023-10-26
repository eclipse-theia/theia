/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { CancellationToken, Emitter, Event, URI } from '@theia/core';
import { Range, Location, CancellationTokenSource } from '@theia/core/shared/vscode-languageserver-protocol';

import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { SimpleObservableCollection, TreeCollection, observableProperty } from '@theia/test/lib/common/collections';
import {
    TestController, TestExecutionState, TestFailure, TestItem,
    TestOutputItem, TestRun, TestRunProfile, TestState, TestStateChangedEvent
} from '@theia/test/lib/browser/test-service';
import { AccumulatingTreeDeltaEmitter, CollectionDelta, TreeDelta, TreeDeltaBuilder } from '@theia/test/lib/common/tree-delta';
import { timeout } from '@theia/core/lib/common/promise-util';

export class TestItemCollection extends TreeCollection<string, TestItemImpl, TestItemImpl | TestControllerImpl> {
    override add(item: TestItemImpl): TestItemImpl | undefined {
        item.realParent = this.owner;
        return super.add(item);
    }
}

export class TestItemImpl implements TestItem {
    constructor(readonly uri: URI, readonly id: string) {
        this._children = new TestItemCollection(this, (v: TestItemImpl) => v.path, (v: TestItemImpl) => v.deltaBuilder);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected notifyPropertyChange(property: keyof TestItemImpl, value: any): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        if (this.path) {
            this.deltaBuilder?.reportChanged(this.path, val);
        }
    }

    _deltaBuilder: TreeDeltaBuilder<string, TestItemImpl> | undefined;
    get deltaBuilder(): TreeDeltaBuilder<string, TestItemImpl> | undefined {
        if (this._deltaBuilder) {
            return this._deltaBuilder;
        } else if (this.realParent) {
            this._deltaBuilder = this.realParent.deltaBuilder;
            return this._deltaBuilder;
        } else {
            return undefined;
        }
    }

    _path: string[] | undefined;

    get path(): string[] {
        if (this._path) {
            return this._path;
        } else if (this.realParent instanceof TestItemImpl) {
            this._path = [...this.realParent.path, this.id];
            return this._path;
        } else {
            return [this.id];
        }
    };

    private _parent?: TestItemImpl | TestControllerImpl;
    get realParent(): TestItemImpl | TestControllerImpl | undefined {
        return this._parent;
    }

    set realParent(v: TestItemImpl | TestControllerImpl | undefined) {
        this.iterate(item => {
            item._path = undefined;
            return true;
        });
        this._parent = v;
    }

    get parent(): TestItem | undefined {
        const realParent = this.realParent;
        if (realParent instanceof TestItemImpl) {
            return realParent;
        }
        return undefined;
    }

    get controller(): TestControllerImpl | undefined {
        if (this.realParent instanceof TestItemImpl) {
            return this.realParent.controller;
        }
        return this.realParent;
    }

    protected iterate(toDo: (v: TestItemImpl) => boolean): boolean {
        if (toDo(this)) {
            for (let i = 0; i < this._children.values.length; i++) {
                if (!this._children.values[i].iterate(toDo)) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }

    @observableProperty('notifyPropertyChange')
    label: string = '';

    @observableProperty('notifyPropertyChange')
    range?: Range;

    @observableProperty('notifyPropertyChange')
    sortKey?: string | undefined;

    @observableProperty('notifyPropertyChange')
    tags: string[] = [];

    @observableProperty('notifyPropertyChange')
    busy: boolean = false;

    @observableProperty('notifyPropertyChange')
    canResolveChildren: boolean = false;

    @observableProperty('notifyPropertyChange')
    description?: string | undefined;

    @observableProperty('notifyPropertyChange')
    error?: string | MarkdownString | undefined;

    _children: TestItemCollection;
    get tests(): readonly TestItemImpl[] {
        return this._children.values;
    }

    resolveChildren(): void {
        // do nothing
    }
}

export class TestRunImpl implements TestRun {
    private testStates: Map<TestItem, TestState> = new Map();
    private outputIndices: Map<TestItem, number[]> = new Map();
    private outputs: TestOutputItem[] = [];
    private onDidChangePropertyEmitter = new Emitter<{ name?: string; isRunning?: boolean; }>();
    onDidChangeProperty: Event<{ name?: string; isRunning?: boolean; }> = this.onDidChangePropertyEmitter.event;
    private cts: CancellationTokenSource;

    constructor(readonly controller: TestControllerImpl, readonly id: string, name: string) {
        this.name = name;
        this.isRunning = false;
        this.start();
    }

    private start(): void {
        this.cts = new CancellationTokenSource();
        Promise.allSettled(this.collectTestsForRun().map(item => this.simulateTestRun(item, this.cts.token))).then(() => this.ended());
    }

    collectTestsForRun(): TestItemImpl[] {
        const result: TestItemImpl[] = [];
        this.collectTests(this.controller.tests, result);
        return result;
    }

    collectTests(tests: readonly TestItemImpl[], result: TestItemImpl[]): void {
        tests.forEach(test => this.collectTest(test, result));
    }

    collectTest(test: TestItemImpl, result: TestItemImpl[]): void {
        if (test.tests.length > 0) {
            this.collectTests(test.tests, result);
        } else if (Math.random() < 0.8) {
            result.push(test);
        }
    }

    simulateTestRun(item: TestItemImpl, token: CancellationToken): Promise<void> {
        let outputCounter = 0;
        let messageCounter = 0;
        return timeout(Math.random() * 3000, token)
            .then(() => this.setTestState(item, { state: TestExecutionState.Queued }))
            .then(() => timeout(Math.random() * 3000, token))
            .then(() => this.setTestState(item, { state: TestExecutionState.Running }))
            .then(() => timeout(Math.random() * 3000, token))
            .then(() => {
                this.appendOutput(`Output from Test ${item.label} nr ${outputCounter++}`);
            })
            .then(() => timeout(Math.random() * 3000, token))
            .then(() => {
                this.appendOutput(`Output from Test ${item.label} nr ${outputCounter++}`);
            })
            .then(() => timeout(Math.random() * 3000, token))
            .then(() => {
                this.appendOutput(`Output from Test ${item.label} nr ${outputCounter++}`);
            })
            .then(() => timeout(Math.random() * 3000, token))
            .then(() => {
                this.appendOutput(`Output from Test ${item.label} nr ${outputCounter++}`);
            }).then(() => {
                const random = Math.random();
                if (random > 0.9) {
                    this.setTestState(item, { state: TestExecutionState.Skipped });
                } else if (random > 0.8) {
                    const failure: TestFailure = {
                        state: TestExecutionState.Errored,
                        messages: [
                            {
                                message: {
                                    value: `**Error** from Test ${item.label} nr ${messageCounter++}`
                                },
                                location: {
                                    uri: item.uri.toString(),
                                    range: item.range!
                                },
                            }
                        ],
                        duration: 33
                    };
                    this.setTestState(item, failure);
                } else if (random > 0.7) {
                    const failure: TestFailure = {
                        state: TestExecutionState.Failed,
                        messages: [
                            {
                                message: {
                                    value: `**Failure** from Test ${item.label} nr ${messageCounter++}`
                                },
                                location: {
                                    uri: item.uri.toString(),
                                    range: item.range!
                                },
                            }
                        ],
                        duration: 33
                    };
                    this.setTestState(item, failure);
                } else {
                    this.setTestState(item, { state: TestExecutionState.Passed });
                }
            });
    }

    @observableProperty('notifyPropertyChange')
    isRunning: boolean;

    @observableProperty('notifyPropertyChange')
    name: string;

    protected notifyPropertyChange(property: 'name' | 'isRunning', value: unknown): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        this.onDidChangePropertyEmitter.fire(val);
    }

    cancel(): void {
        this.cts.cancel();
    }

    getTestState(item: TestItem): TestState | undefined {
        return this.testStates.get(item);
    }

    private onDidChangeTestStateEmitter: Emitter<TestStateChangedEvent[]> = new Emitter();
    onDidChangeTestState: Event<TestStateChangedEvent[]> = this.onDidChangeTestStateEmitter.event;

    getOutput(item?: TestItem | undefined): readonly TestOutputItem[] {
        if (!item) {
            return this.outputs;
        } else {
            const indices = this.outputIndices.get(item);
            if (!indices) {
                return [];
            } else {
                return indices.map(index => this.outputs[index]);
            }
        }
    }
    private onDidChangeTestOutputEmitter: Emitter<[TestItem | undefined, TestOutputItem][]> = new Emitter();
    onDidChangeTestOutput: Event<[TestItem | undefined, TestOutputItem][]> = this.onDidChangeTestOutputEmitter.event;

    setTestState<T extends TestState>(test: TestItemImpl, newState: TestState): void {
        const oldState = this.testStates.get(test);
        this.testStates.set(test, newState);
        this.onDidChangeTestStateEmitter.fire([{
            oldState: oldState, newState: newState, test: test
        }]);
    }

    appendOutput(text: string, location?: Location, item?: TestItem): void {
        const output = {
            output: text,
            location: location
        };
        this.outputs.push(output);
        if (item) {
            let indices = this.outputIndices.get(item);
            if (!indices) {
                indices = [];
                this.outputIndices.set(item, indices);
            }
            indices.push(this.outputs.length - 1);
        }
        this.onDidChangeTestOutputEmitter.fire([[item, output]]);
    }

    get items(): readonly TestItem[] {
        return [...this.testStates.keys()];
    }

    ended(): void {
        const stateEvents: TestStateChangedEvent[] = [];
        this.testStates.forEach((state, item) => {
            if (state.state <= TestExecutionState.Running) {
                stateEvents.push({
                    oldState: state,
                    newState: undefined,
                    test: item
                });
                this.testStates.delete(item);
            }
        });
        if (stateEvents.length > 0) {
            this.onDidChangeTestStateEmitter.fire(stateEvents);
        }
        this.isRunning = false;
    }
}

export class TestControllerImpl implements TestController {
    private _profiles = new SimpleObservableCollection<TestRunProfile>();
    private _runs = new SimpleObservableCollection<TestRun>();
    readonly deltaBuilder = new AccumulatingTreeDeltaEmitter<string, TestItemImpl>(300);
    items = new TestItemCollection(this, item => item.path, () => this.deltaBuilder);

    constructor(readonly id: string, readonly label: string) {
    }

    refreshTests(token: CancellationToken): Promise<void> {
        // not implemented
        return Promise.resolve();
    }

    get testRunProfiles(): readonly TestRunProfile[] {
        return this._profiles.values;
    }

    addProfile(profile: TestRunProfile): void {
        this._profiles.add(profile);
    }

    onProfilesChanged: Event<CollectionDelta<TestRunProfile, TestRunProfile>> = this._profiles.onChanged;

    get testRuns(): readonly TestRun[] {
        return this._runs.values;
    }

    addRun(run: TestRun): void {
        this._runs.add(run);
    }

    onRunsChanged: Event<CollectionDelta<TestRun, TestRun>> = this._runs.onChanged;
    get tests(): readonly TestItemImpl[] {
        return this.items.values;
    }
    onItemsChanged: Event<TreeDelta<string, TestItemImpl>[]> = this.deltaBuilder.onDidFlush;

    resolveChildren(item: TestItem): void {
        // nothing to do
    }

    clearRuns(): void {
        this._runs.clear();
    }
}
