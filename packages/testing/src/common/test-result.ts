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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testResult.ts

/* eslint-disable import/no-extraneous-dependencies */

import { newWriteableBufferStream, VSBuffer, VSBufferReadableStream, VSBufferWriteableStream } from '@theia/monaco-editor-core/esm/vs/base/common/buffer';
import { Emitter } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { Lazy } from '@theia/monaco-editor-core/esm/vs/base/common/lazy';
import { DisposableStore } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { URI } from '@theia/monaco-editor-core/esm/vs/base/common/uri';
import { localize } from '@theia/monaco-editor-core/esm/vs/nls';
import { IComputedStateAccessor, refreshComputedState } from './get-computed-state';
import { IObservableValue, MutableObservableValue, staticObservableValue } from './observable-value';
import {
    IRichLocation,
    ISerializedTestResults,
    ITestItem,
    ITestMessage,
    ITestOutputMessage,
    ITestRunTask,
    ITestTaskState,
    ResolvedTestRunRequest,
    TestItemExpandState,
    TestMessageType,
    TestResultItem,
    TestResultState
} from './test-types';
import { TestCoverage } from './test-coverage';
import { maxPriority, statesInOrder, terminalStatePriorities } from './testing-states';
import { removeAnsiEscapeCodes } from '@theia/monaco-editor-core/esm/vs/base/common/strings';

export interface ITestRunTaskResults extends ITestRunTask {
    /**
     * Contains test coverage for the result, if it's available.
     */
    readonly coverage: IObservableValue<TestCoverage | undefined>;

    /**
     * Messages from the task not associated with any specific test.
     */
    readonly otherMessages: ITestOutputMessage[];
}

export interface ITestResult {
    /**
     * Count of the number of tests in each run state.
     */
    readonly counts: Readonly<TestStateCount>;

    /**
     * Unique ID of this set of test results.
     */
    readonly id: string;

    /**
     * If the test is completed, the unix milliseconds time at which it was
     * completed. If undefined, the test is still running.
     */
    readonly completedAt: number | undefined;

    /**
     * Whether this test result is triggered from an auto run.
     */
    readonly request: ResolvedTestRunRequest;

    /**
     * Human-readable name of the test result.
     */
    readonly name: string;

    /**
     * Gets all tests involved in the run.
     */
    tests: IterableIterator<TestResultItem>;

    /**
     * List of this result's subtasks.
     */
    tasks: ReadonlyArray<ITestRunTaskResults>;

    /**
     * Gets the state of the test by its extension-assigned ID.
     */
    getStateById(testExtId: string): TestResultItem | undefined;

    /**
     * Loads the output of the result as a stream.
     */
    getOutput(): Promise<VSBufferReadableStream>;

    /**
     * Loads an output of the result.
     */
    getOutputRange(offset: number, length: number): Promise<VSBuffer>;

    /**
     * Serializes the test result. Used to save and restore results
     * in the workspace.
     */
    toJSON(): ISerializedTestResults | undefined;
}

export const resultItemParents = function* (results: ITestResult, item: TestResultItem): Generator<TestResultItem, void, unknown> {
    let i: TestResultItem | undefined = item;
    while (i) {
        yield i;
        i = i.parent ? results.getStateById(i.parent) : undefined;
    }
};

/**
 * Count of the number of tests in each run state.
 */
export type TestStateCount = { [K in TestResultState]: number };

export const makeEmptyCounts = () => {
    const o: Partial<TestStateCount> = {};
    for (const state of statesInOrder) {
        o[state] = 0;
    }

    return o as TestStateCount;
};

export const sumCounts = (counts: Iterable<TestStateCount>) => {
    const total = makeEmptyCounts();
    for (const count of counts) {
        for (const state of statesInOrder) {
            total[state] += count[state];
        }
    }

    return total;
};

export const maxCountPriority = (counts: Readonly<TestStateCount>) => {
    for (const state of statesInOrder) {
        if (counts[state] > 0) {
            return state;
        }
    }

    return TestResultState.Unset;
};

/**
 * Deals with output of a {@link LiveTestResult}. By default we pass-through
 * data into the underlying write stream, but if a client requests to read it
 * we splice in the written data and then continue streaming incoming data.
 */
export class LiveOutputController {
    /** Set on close() to a promise that is resolved once closing is complete */
    private closed?: Promise<void>;
    /** Data written so far. This is available until the file closes. */
    private previouslyWritten: VSBuffer[] | undefined = [];

    private readonly dataEmitter = new Emitter<VSBuffer>();
    private readonly endEmitter = new Emitter<void>();
    private _offset = 0;

    /**
     * Gets the number of written bytes.
     */
    public get offset(): number {
        return this._offset;
    }

    constructor(
        private readonly writer: Lazy<[VSBufferWriteableStream, Promise<void>]>,
        private readonly reader: () => Promise<VSBufferReadableStream>,
        private readonly rangeReader: (offset: number, length: number) => Promise<VSBuffer>,
    ) { }

    /**
     * Appends data to the output.
     */
    public append(data: VSBuffer): Promise<void> | void {
        if (this.closed) {
            return this.closed;
        }

        this.previouslyWritten?.push(data);
        this.dataEmitter.fire(data);
        this._offset += data.byteLength;

        return this.writer.getValue()[0].write(data);
    }

    /**
     * Reads a range of data from the output.
     */
    public getRange(offset: number, length: number): Promise<VSBuffer> {
        if (!this.previouslyWritten) {
            return this.rangeReader(offset, length);
        }

        const buffer = VSBuffer.alloc(length);
        let pos = 0;
        for (const chunk of this.previouslyWritten) {
            if (pos + chunk.byteLength < offset) {
                // no-op
            } else if (pos > offset + length) {
                break;
            } else {
                const cs = Math.max(0, offset - pos);
                const bs = Math.max(0, pos - offset);
                buffer.set(chunk.slice(cs, cs + Math.min(length - bs, chunk.byteLength - cs)), bs);
            }

            pos += chunk.byteLength;
        }

        const trailing = (offset + length) - pos;
        return Promise.resolve(trailing > 0 ? buffer.slice(0, -trailing) : buffer);
    }

    /**
     * Reads the value of the stream.
     */
    public read(): Promise<VSBufferReadableStream> {
        if (!this.previouslyWritten) {
            return this.reader();
        }

        const stream = newWriteableBufferStream();
        for (const chunk of this.previouslyWritten) {
            stream.write(chunk);
        }

        const disposable = new DisposableStore();
        disposable.add(this.dataEmitter.event(d => stream.write(d)));
        disposable.add(this.endEmitter.event(() => stream.end()));
        stream.on('end', () => disposable.dispose());

        return Promise.resolve(stream);
    }

    /**
     * Closes the output, signalling no more writes will be made.
     * @returns a promise that resolves when the output is written
     */
    public close(): Promise<void> {
        if (this.closed) {
            return this.closed;
        }

        if (!this.writer.hasValue()) {
            this.closed = Promise.resolve();
        } else {
            const [stream, ended] = this.writer.getValue();
            stream.end();
            this.closed = ended;
        }

        this.endEmitter.fire();
        this.closed.then(() => {
            this.previouslyWritten = undefined;
            this.dataEmitter.dispose();
            this.endEmitter.dispose();
        });

        return this.closed;
    }
}

interface TestResultItemWithChildren extends TestResultItem {
    /** Children in the run */
    children: TestResultItemWithChildren[];
}

const itemToNode = (controllerId: string, item: ITestItem, parent: string | undefined): TestResultItemWithChildren => ({
    parent,
    controllerId,
    expand: TestItemExpandState.NotExpandable,
    item: { ...item },
    children: [],
    tasks: [],
    ownComputedState: TestResultState.Unset,
    computedState: TestResultState.Unset,
});

export const enum TestResultItemChangeReason {
    ComputedStateChange,
    OwnStateChange,
}

export type TestResultItemChange = { item: TestResultItem; result: ITestResult } & (
    | { reason: TestResultItemChangeReason.ComputedStateChange }
    | { reason: TestResultItemChangeReason.OwnStateChange; previousState: TestResultState; previousOwnDuration: number | undefined }
);

/**
 * Results of a test. These are created when the test initially started running
 * and marked as "complete" when the run finishes.
 */
export class LiveTestResult implements ITestResult {
    private readonly completeEmitter = new Emitter<void>();
    private readonly changeEmitter = new Emitter<TestResultItemChange>();
    private readonly testById = new Map<string, TestResultItemWithChildren>();
    private _completedAt?: number;

    public readonly onChange = this.changeEmitter.event;
    public readonly onComplete = this.completeEmitter.event;
    public readonly tasks: ITestRunTaskResults[] = [];
    public readonly name = localize('runFinished', 'Test run at {0}', new Date().toLocaleString());

    /**
     * @inheritdoc
     */
    public get completedAt(): number | undefined {
        return this._completedAt;
    }

    /**
     * @inheritdoc
     */
    public readonly counts: { [K in TestResultState]: number } = makeEmptyCounts();

    /**
     * @inheritdoc
     */
    public get tests(): IterableIterator<TestResultItemWithChildren> {
        return this.testById.values();
    }

    private readonly computedStateAccessor: IComputedStateAccessor<TestResultItemWithChildren> = {
        getOwnState: i => i.ownComputedState,
        getCurrentComputedState: i => i.computedState,
        setComputedState: (i, s) => i.computedState = s,
        getChildren: i => i.children,
        getParents: i => {
            const { testById: testByExtId } = this;
            // eslint-disable-next-line @typescript-eslint/tslint/config
            return (function* () {
                for (let parentId = i.parent; parentId;) {
                    const parent = testByExtId.get(parentId);
                    if (!parent) {
                        break;
                    }

                    yield parent;
                    parentId = parent.parent;
                }
            })();
        },
    };

    constructor(
        public readonly id: string,
        public readonly output: LiveOutputController,
        public readonly persist: boolean,
        public readonly request: ResolvedTestRunRequest,
    ) {
    }

    /**
     * @inheritdoc
     */
    public getStateById(extTestId: string): TestResultItemWithChildren | undefined {
        return this.testById.get(extTestId);
    }

    /**
     * Appends output that occurred during the test run.
     */
    public appendOutput(output: VSBuffer, taskId: string, location?: IRichLocation, testId?: string): void {
        const preview = output.byteLength > 100 ? output.slice(0, 100).toString() + '…' : output.toString();
        const message: ITestOutputMessage = {
            location,
            message: removeAnsiEscapeCodes(preview),
            offset: this.output.offset,
            length: output.byteLength,
            type: TestMessageType.Output,
        };

        this.output.append(output);

        const index = this.mustGetTaskIndex(taskId);
        if (testId) {
            this.testById.get(testId)?.tasks[index].messages.push(message);
        } else {
            this.tasks[index].otherMessages.push(message);
        }
    }

    /**
     * Adds a new run task to the results.
     */
    public addTask(task: ITestRunTask): void {
        const index = this.tasks.length;
        this.tasks.push({ ...task, coverage: new MutableObservableValue(undefined), otherMessages: [] });

        for (const test of this.tests) {
            test.tasks.push({ duration: undefined, messages: [], state: TestResultState.Unset });
            this.fireUpdateAndRefresh(test, index, TestResultState.Queued);
        }
    }

    /**
     * Add the chain of tests to the run. The first test in the chain should
     * be either a test root, or a previously-known test.
     */
    public addTestChainToRun(controllerId: string, chain: ReadonlyArray<ITestItem>): undefined {
        let parent = this.testById.get(chain[0].extId);
        if (!parent) { // must be a test root
            parent = this.addTestToRun(controllerId, chain[0], undefined);
        }

        for (let i = 1; i < chain.length; i++) {
            parent = this.addTestToRun(controllerId, chain[i], parent.item.extId);
        }

        for (let i = 0; i < this.tasks.length; i++) {
            this.fireUpdateAndRefresh(parent, i, TestResultState.Queued);
        }

        return undefined;
    }

    /**
     * Updates the state of the test by its internal ID.
     */
    public updateState(testId: string, taskId: string, state: TestResultState, duration?: number): void {
        const entry = this.testById.get(testId);
        if (!entry) {
            return;
        }

        const index = this.mustGetTaskIndex(taskId);

        const oldTerminalStatePrio = terminalStatePriorities[entry.tasks[index].state];
        const newTerminalStatePrio = terminalStatePriorities[state];

        // Ignore requests to set the state from one terminal state back to a
        // "lower" one, e.g. from failed back to passed:
        if (oldTerminalStatePrio !== undefined &&
            (newTerminalStatePrio === undefined || newTerminalStatePrio < oldTerminalStatePrio)) {
            return;
        }

        this.fireUpdateAndRefresh(entry, index, state, duration);
    }

    /**
     * Appends a message for the test in the run.
     */
    public appendMessage(testId: string, taskId: string, message: ITestMessage): void {
        const entry = this.testById.get(testId);
        if (!entry) {
            return;
        }

        entry.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
        this.changeEmitter.fire({
            item: entry,
            result: this,
            reason: TestResultItemChangeReason.OwnStateChange,
            previousState: entry.ownComputedState,
            previousOwnDuration: entry.ownDuration,
        });
    }

    /**
     * @inheritdoc
     */
    public getOutput(): Promise<VSBufferReadableStream> {
        return this.output.read();
    }

    /**
     * @inheritdoc
     */
    public getOutputRange(offset: number, bytes: number): Promise<VSBuffer> {
        return this.output.getRange(offset, bytes);
    }

    /**
     * Marks the task in the test run complete.
     */
    public markTaskComplete(taskId: string): void {
        this.tasks[this.mustGetTaskIndex(taskId)].running = false;
        this.setAllToState(
            TestResultState.Unset,
            taskId,
            t => t.state === TestResultState.Queued || t.state === TestResultState.Running,
        );
    }

    /**
     * Notifies the service that all tests are complete.
     */
    public markComplete(): void {
        if (this._completedAt !== undefined) {
            throw new Error('cannot complete a test result multiple times');
        }

        for (const task of this.tasks) {
            if (task.running) {
                this.markTaskComplete(task.id);
            }
        }

        this._completedAt = Date.now();
        this.completeEmitter.fire();
    }

    /**
     * @inheritdoc
     */
    public toJSON(): ISerializedTestResults | undefined {
        return this.completedAt && this.persist ? this.doSerialize.getValue() : undefined;
    }

    /**
     * Updates all tests in the collection to the given state.
     */
    protected setAllToState(state: TestResultState, taskId: string, when: (task: ITestTaskState, item: TestResultItem) => boolean): void {
        const index = this.mustGetTaskIndex(taskId);
        for (const test of this.testById.values()) {
            if (when(test.tasks[index], test)) {
                this.fireUpdateAndRefresh(test, index, state);
            }
        }
    }

    private fireUpdateAndRefresh(entry: TestResultItem, taskIndex: number, newState: TestResultState, newOwnDuration?: number): void {
        const previousOwnComputed = entry.ownComputedState;
        const previousOwnDuration = entry.ownDuration;
        const changeEvent: TestResultItemChange = {
            item: entry,
            result: this,
            reason: TestResultItemChangeReason.OwnStateChange,
            previousState: previousOwnComputed,
            previousOwnDuration: previousOwnDuration,
        };

        entry.tasks[taskIndex].state = newState;
        if (newOwnDuration !== undefined) {
            entry.tasks[taskIndex].duration = newOwnDuration;
            entry.ownDuration = Math.max(entry.ownDuration || 0, newOwnDuration);
        }

        const newOwnComputed = maxPriority(...entry.tasks.map(t => t.state));
        if (newOwnComputed === previousOwnComputed) {
            if (newOwnDuration !== previousOwnDuration) {
                this.changeEmitter.fire(changeEvent); // fire manually since state change won't do it
            }
            return;
        }

        entry.ownComputedState = newOwnComputed;
        this.counts[previousOwnComputed]--;
        this.counts[newOwnComputed]++;
        refreshComputedState(this.computedStateAccessor, entry).forEach(t =>
            this.changeEmitter.fire(t === entry ? changeEvent : {
                item: t,
                result: this,
                reason: TestResultItemChangeReason.ComputedStateChange,
            }),
        );
    }

    private addTestToRun(controllerId: string, item: ITestItem, parent: string | undefined): TestResultItemWithChildren {
        const node = itemToNode(controllerId, item, parent);
        this.testById.set(item.extId, node);
        this.counts[TestResultState.Unset]++;

        if (parent) {
            this.testById.get(parent)?.children.push(node);
        }

        if (this.tasks.length) {
            for (let i = 0; i < this.tasks.length; i++) {
                node.tasks.push({ duration: undefined, messages: [], state: TestResultState.Queued });
            }
        }

        return node;
    }

    private mustGetTaskIndex(taskId: string): number {
        const index = this.tasks.findIndex(t => t.id === taskId);
        if (index === -1) {
            throw new Error(`Unknown task ${taskId} in updateState`);
        }

        return index;
    }

    private readonly doSerialize = new Lazy((): ISerializedTestResults => ({
        id: this.id,
        completedAt: this.completedAt!,
        tasks: this.tasks.map(t => ({ id: t.id, name: t.name })),
        name: this.name,
        request: this.request,
        items: [...this.testById.values()].map(TestResultItem.serializeWithoutMessages),
    }));
}

/**
 * Test results hydrated from a previously-serialized test run.
 */
export class HydratedTestResult implements ITestResult {
    /**
     * @inheritdoc
     */
    public readonly counts = makeEmptyCounts();

    /**
     * @inheritdoc
     */
    public readonly id: string;

    /**
     * @inheritdoc
     */
    public readonly completedAt: number;

    /**
     * @inheritdoc
     */
    public readonly tasks: ITestRunTaskResults[];

    /**
     * @inheritdoc
     */
    public get tests(): IterableIterator<TestResultItem> {
        return this.testById.values();
    }

    /**
     * @inheritdoc
     */
    public readonly name: string;

    /**
     * @inheritdoc
     */
    public readonly request: ResolvedTestRunRequest;

    private readonly testById = new Map<string, TestResultItem>();

    constructor(
        private readonly serialized: ISerializedTestResults,
        private readonly outputLoader: () => Promise<VSBufferReadableStream>,
        private readonly outputRangeLoader: (offset: number, length: number) => Promise<VSBuffer>,
        private readonly persist = true,
    ) {
        this.id = serialized.id;
        this.completedAt = serialized.completedAt;
        this.tasks = serialized.tasks.map((task, i) => ({
            id: task.id,
            name: task.name,
            running: false,
            coverage: staticObservableValue(undefined),
            otherMessages: []
        }));
        this.name = serialized.name;
        this.request = serialized.request;

        for (const item of serialized.items) {
            const cast: TestResultItem = { ...item } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            cast.item.uri = URI.revive(cast.item.uri);
            cast.retired = true;
            this.counts[item.ownComputedState]++;
            this.testById.set(item.item.extId, cast);
        }
    }

    /**
     * @inheritdoc
     */
    public getOutputRange(offset: number, bytes: number): Promise<VSBuffer> {
        return this.outputRangeLoader(offset, bytes);
    }

    /**
     * @inheritdoc
     */
    public getStateById(extTestId: string): TestResultItem | undefined {
        return this.testById.get(extTestId);
    }

    /**
     * @inheritdoc
     */
    public getOutput(): Promise<VSBufferReadableStream> {
        return this.outputLoader();
    }

    /**
     * @inheritdoc
     */
    public toJSON(): ISerializedTestResults | undefined {
        return this.persist ? this.serialized : undefined;
    }
}
