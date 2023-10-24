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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testTypes.ts

/* eslint-disable import/no-extraneous-dependencies */

import { IRange, Range } from './range';
import { IPosition } from './position';
import { URI as Uri } from '@theia/core/shared/vscode-uri';
import { UriComponents } from '@theia/core/lib/common/uri';
import { IMarkdownString } from '@theia/monaco-editor-core/esm/vs/base/common/htmlContent';
import { MarshalledId } from './marshalling-ids';

export const enum TestResultState {
    Unset = 0,
    Queued = 1,
    Running = 2,
    Passed = 3,
    Failed = 4,
    Skipped = 5,
    Errored = 6
}

export const enum TestRunProfileBitset {
    Run = 1 << 1,
    Debug = 1 << 2,
    Coverage = 1 << 3,
    HasNonDefaultProfile = 1 << 4,
    HasConfigurable = 1 << 5,
}

/**
 * List of all test run profile bitset values.
 */
export const testRunProfileBitsetList = [
    TestRunProfileBitset.Run,
    TestRunProfileBitset.Debug,
    TestRunProfileBitset.Coverage,
    TestRunProfileBitset.HasNonDefaultProfile,
];

/**
 * DTO for a controller's run profiles.
 */
export interface ITestRunProfile {
    controllerId: string;
    profileId: number;
    label: string;
    group: TestRunProfileBitset;
    isDefault: boolean;
    tag: string | undefined;
    hasConfigurationHandler: boolean;
}

/**
 * A fully-resolved request to run tests, passsed between the main thread
 * and extension host.
 */
export interface ResolvedTestRunRequest {
    targets: {
        testIds: string[];
        controllerId: string;
        profileGroup: TestRunProfileBitset;
        profileId: number;
    }[];
    exclude?: string[];
    isAutoRun?: boolean;
    /** Whether this was trigged by a user action in UI. Default=true */
    isUiTriggered?: boolean;
}

/**
 * Request to the main thread to run a set of tests.
 */
export interface ExtensionRunTestsRequest {
    id: string;
    include: string[];
    exclude: string[];
    controllerId: string;
    profile?: { group: TestRunProfileBitset; id: number };
    persist: boolean;
}

/**
 * Request from the main thread to run tests for a single controller.
 */
export interface RunTestForControllerRequest {
    runId: string;
    controllerId: string;
    profileId: number;
    excludeExtIds: string[];
    testIds: string[];
}

export interface RunTestForControllerResult {
    error?: string;
}

/**
 * Location with a fully-instantiated Range and Uri.
 */
export interface IRichLocation {
    range: Range;
    uri: Uri;
}

export namespace IRichLocation {
    export interface Serialize {
        range: IRange;
        uri: UriComponents;
    }

    export const serialize = (location: IRichLocation): Serialize => ({
        range: location.range.toJSON(),
        uri: location.uri.toJSON(),
    });

    export const deserialize = (location: Serialize): IRichLocation => ({
        range: Range.lift(location.range),
        uri: Uri.revive(location.uri),
    });
}

export const enum TestMessageType {
    Error,
    Output
}

export interface ITestErrorMessage {
    message: string | IMarkdownString;
    type: TestMessageType.Error;
    expected: string | undefined;
    actual: string | undefined;
    location: IRichLocation | undefined;
}

export namespace ITestErrorMessage {
    export interface Serialized {
        message: string | IMarkdownString;
        type: TestMessageType.Error;
        expected: string | undefined;
        actual: string | undefined;
        location: IRichLocation.Serialize | undefined;
    }

    export const serialize = (message: ITestErrorMessage): Serialized => ({
        message: message.message,
        type: TestMessageType.Error,
        expected: message.expected,
        actual: message.actual,
        location: message.location && IRichLocation.serialize(message.location),
    });

    export const deserialize = (message: Serialized): ITestErrorMessage => ({
        message: message.message,
        type: TestMessageType.Error,
        expected: message.expected,
        actual: message.actual,
        location: message.location && IRichLocation.deserialize(message.location),
    });
}

export interface ITestOutputMessage {
    message: string;
    type: TestMessageType.Output;
    offset: number;
    length: number;
    location: IRichLocation | undefined;
}

export namespace ITestOutputMessage {
    export interface Serialized {
        message: string;
        offset: number;
        length: number;
        type: TestMessageType.Output;
        location: IRichLocation.Serialize | undefined;
    }

    export const serialize = (message: ITestOutputMessage): Serialized => ({
        message: message.message,
        type: TestMessageType.Output,
        offset: message.offset,
        length: message.length,
        location: message.location && IRichLocation.serialize(message.location),
    });

    export const deserialize = (message: Serialized): ITestOutputMessage => ({
        message: message.message,
        type: TestMessageType.Output,
        offset: message.offset,
        length: message.length,
        location: message.location && IRichLocation.deserialize(message.location),
    });
}

export type ITestMessage = ITestErrorMessage | ITestOutputMessage;

export namespace ITestMessage {
    export type Serialized = ITestErrorMessage.Serialized | ITestOutputMessage.Serialized;

    export const serialize = (message: ITestMessage): Serialized =>
        message.type === TestMessageType.Error ? ITestErrorMessage.serialize(message) : ITestOutputMessage.serialize(message);

    export const deserialize = (message: Serialized): ITestMessage =>
        message.type === TestMessageType.Error ? ITestErrorMessage.deserialize(message) : ITestOutputMessage.deserialize(message);
}

export interface ITestTaskState {
    state: TestResultState;
    duration: number | undefined;
    messages: ITestMessage[];
}

export namespace ITestTaskState {
    export interface Serialized {
        state: TestResultState;
        duration: number | undefined;
        messages: ITestMessage.Serialized[];
    }

    export const serializeWithoutMessages = (state: ITestTaskState): Serialized => ({
        state: state.state,
        duration: state.duration,
        messages: [],
    });

    export const serialize = (state: ITestTaskState): Serialized => ({
        state: state.state,
        duration: state.duration,
        messages: state.messages.map(ITestMessage.serialize),
    });

    export const deserialize = (state: Serialized): ITestTaskState => ({
        state: state.state,
        duration: state.duration,
        messages: state.messages.map(ITestMessage.deserialize),
    });
}

export interface ITestRunTask {
    id: string;
    name: string | undefined;
    running: boolean;
}

export interface ITestTag {
    readonly id: string;
}

const testTagDelimiter = '\0';

export const namespaceTestTag =
    (ctrlId: string, tagId: string) => ctrlId + testTagDelimiter + tagId;

export const denamespaceTestTag = (namespaced: string) => {
    const index = namespaced.indexOf(testTagDelimiter);
    return { ctrlId: namespaced.slice(0, index), tagId: namespaced.slice(index + 1) };
};

export interface ITestTagDisplayInfo {
    id: string;
}

/**
 * The TestItem from .d.ts, as a plain object without children.
 */
export interface ITestItem {
    /** ID of the test given by the test controller */
    extId: string;
    label: string;
    tags: string[];
    busy: boolean;
    children?: never;
    uri: Uri | undefined;
    range: Range | undefined;
    description: string | undefined;
    error: string | IMarkdownString | undefined;
    sortText: string | undefined;
}

export namespace ITestItem {
    export interface Serialized {
        extId: string;
        label: string;
        tags: string[];
        busy: boolean;
        children?: never;
        uri: UriComponents | undefined;
        range: IRange | undefined;
        description: string | undefined;
        error: string | IMarkdownString | undefined;
        sortText: string | undefined;
    }

    export const serialize = (item: ITestItem): Serialized => ({
        extId: item.extId,
        label: item.label,
        tags: item.tags,
        busy: item.busy,
        children: undefined,
        uri: item.uri?.toJSON(),
        range: item.range?.toJSON() || undefined,
        description: item.description,
        error: item.error,
        sortText: item.sortText
    });

    export const deserialize = (serialized: Serialized): ITestItem => ({
        extId: serialized.extId,
        label: serialized.label,
        tags: serialized.tags,
        busy: serialized.busy,
        children: undefined,
        uri: serialized.uri ? Uri.revive(serialized.uri) : undefined,
        range: serialized.range ? Range.lift(serialized.range) : undefined,
        description: serialized.description,
        error: serialized.error,
        sortText: serialized.sortText
    });
}

export const enum TestItemExpandState {
    NotExpandable,
    Expandable,
    BusyExpanding,
    Expanded,
}

/**
 * TestItem-like shape, butm with an ID and children as strings.
 */
export interface InternalTestItem {
    /** Controller ID from whence this test came */
    controllerId: string;
    /** Expandability state */
    expand: TestItemExpandState;
    /** Parent ID, if any */
    parent: string | undefined;
    /** Raw test item properties */
    item: ITestItem;
}

export namespace InternalTestItem {
    export interface Serialized {
        controllerId: string;
        expand: TestItemExpandState;
        parent: string | undefined;
        item: ITestItem.Serialized;
    }

    export const serialize = (item: InternalTestItem): Serialized => ({
        controllerId: item.controllerId,
        expand: item.expand,
        parent: item.parent,
        item: ITestItem.serialize(item.item)
    });

    export const deserialize = (serialized: Serialized): InternalTestItem => ({
        controllerId: serialized.controllerId,
        expand: serialized.expand,
        parent: serialized.parent,
        item: ITestItem.deserialize(serialized.item)
    });
}

/**
 * A partial update made to an existing InternalTestItem.
 */
export interface ITestItemUpdate {
    extId: string;
    expand?: TestItemExpandState;
    item?: Partial<ITestItem>;
}

export namespace ITestItemUpdate {
    export interface Serialized {
        extId: string;
        expand?: TestItemExpandState;
        item?: Partial<ITestItem.Serialized>;
    }

    export const serialize = (u: ITestItemUpdate): Serialized => {
        let item: Partial<ITestItem.Serialized> | undefined;
        if (u.item) {
            item = {};
            if (u.item.label !== undefined) { item.label = u.item.label; }
            if (u.item.tags !== undefined) { item.tags = u.item.tags; }
            if (u.item.busy !== undefined) { item.busy = u.item.busy; }
            if (u.item.uri !== undefined) { item.uri = u.item.uri?.toJSON(); }
            if (u.item.range !== undefined) { item.range = u.item.range?.toJSON(); }
            if (u.item.description !== undefined) { item.description = u.item.description; }
            if (u.item.error !== undefined) { item.error = u.item.error; }
            if (u.item.sortText !== undefined) { item.sortText = u.item.sortText; }
        }

        return { extId: u.extId, expand: u.expand, item };
    };

    export const deserialize = (u: Serialized): ITestItemUpdate => {
        let item: Partial<ITestItem> | undefined;
        if (u.item) {
            item = {};
            if (u.item.label !== undefined) { item.label = u.item.label; }
            if (u.item.tags !== undefined) { item.tags = u.item.tags; }
            if (u.item.busy !== undefined) { item.busy = u.item.busy; }
            if (u.item.range !== undefined) { item.range = u.item.range ? Range.lift(u.item.range) : undefined; }
            if (u.item.description !== undefined) { item.description = u.item.description; }
            if (u.item.error !== undefined) { item.error = u.item.error; }
            if (u.item.sortText !== undefined) { item.sortText = u.item.sortText; }
        }

        return { extId: u.extId, expand: u.expand, item };
    };

}

export const applyTestItemUpdate = (internal: InternalTestItem | ITestItemUpdate, patch: ITestItemUpdate) => {
    if (patch.expand !== undefined) {
        internal.expand = patch.expand;
    }
    if (patch.item !== undefined) {
        internal.item = internal.item ? Object.assign(internal.item, patch.item) : patch.item;
    }
};

/**
 * Test result item used in the main thread.
 */
export interface TestResultItem extends InternalTestItem {
    /** State of this test in various tasks */
    tasks: ITestTaskState[];
    /** State of this test as a computation of its tasks */
    ownComputedState: TestResultState;
    /** Computed state based on children */
    computedState: TestResultState;
    /** Max duration of the item's tasks (if run directly) */
    ownDuration?: number;
    /** Whether this test item is outdated */
    retired?: boolean;
}

export namespace TestResultItem {
    /** Serialized version of the TestResultItem */
    export interface Serialized extends InternalTestItem.Serialized {
        tasks: ITestTaskState.Serialized[];
        ownComputedState: TestResultState;
        computedState: TestResultState;
        retired?: boolean;
    }

    export const serializeWithoutMessages = (original: TestResultItem): Serialized => ({
        ...InternalTestItem.serialize(original),
        ownComputedState: original.ownComputedState,
        computedState: original.computedState,
        tasks: original.tasks.map(ITestTaskState.serializeWithoutMessages),
        retired: original.retired,
    });

    export const serialize = (original: TestResultItem): Serialized => ({
        ...InternalTestItem.serialize(original),
        ownComputedState: original.ownComputedState,
        computedState: original.computedState,
        tasks: original.tasks.map(ITestTaskState.serialize),
        retired: original.retired,
    });
}

export interface ISerializedTestResults {
    /** ID of these test results */
    id: string;
    /** Time the results were compelted */
    completedAt: number;
    /** Subset of test result items */
    items: TestResultItem.Serialized[];
    /** Tasks involved in the run. */
    tasks: { id: string; name: string | undefined }[];
    /** Human-readable name of the test run. */
    name: string;
    /** Test trigger informaton */
    request: ResolvedTestRunRequest;
}

export interface ITestCoverage {
    files: IFileCoverage[];
}

export interface ICoveredCount {
    covered: number;
    total: number;
}

export interface IFileCoverage {
    uri: Uri;
    statement: ICoveredCount;
    branch?: ICoveredCount;
    function?: ICoveredCount;
    details?: CoverageDetails[];
}

export const enum DetailType {
    Function,
    Statement,
}

export type CoverageDetails = IFunctionCoverage | IStatementCoverage;

export interface IBranchCoverage {
    count: number;
    location?: IRange | IPosition;
}

export interface IFunctionCoverage {
    type: DetailType.Function;
    count: number;
    location?: IRange | IPosition;
}

export interface IStatementCoverage {
    type: DetailType.Statement;
    count: number;
    location: IRange | IPosition;
    branches?: IBranchCoverage[];
}

export const enum TestDiffOpType {
    /** Adds a new test (with children) */
    Add,
    /** Shallow-updates an existing test */
    Update,
    /** Ranges of some tests in a document were synced, so it should be considered up-to-date */
    DocumentSynced,
    /** Removes a test (and all its children) */
    Remove,
    /** Changes the number of controllers who are yet to publish their collection roots. */
    IncrementPendingExtHosts,
    /** Retires a test/result */
    Retire,
    /** Add a new test tag */
    AddTag,
    /** Remove a test tag */
    RemoveTag,
}

export type TestsDiffOp =
    | { op: TestDiffOpType.Add; item: InternalTestItem }
    | { op: TestDiffOpType.Update; item: ITestItemUpdate }
    | { op: TestDiffOpType.Remove; itemId: string }
    | { op: TestDiffOpType.Retire; itemId: string }
    | { op: TestDiffOpType.IncrementPendingExtHosts; amount: number }
    | { op: TestDiffOpType.AddTag; tag: ITestTagDisplayInfo }
    | { op: TestDiffOpType.RemoveTag; id: string }
    | { op: TestDiffOpType.DocumentSynced; uri: Uri; docv?: number };

export namespace TestsDiffOp {
    export type Serialized =
        | { op: TestDiffOpType.Add; item: InternalTestItem.Serialized }
        | { op: TestDiffOpType.Update; item: ITestItemUpdate.Serialized }
        | { op: TestDiffOpType.Remove; itemId: string }
        | { op: TestDiffOpType.Retire; itemId: string }
        | { op: TestDiffOpType.IncrementPendingExtHosts; amount: number }
        | { op: TestDiffOpType.AddTag; tag: ITestTagDisplayInfo }
        | { op: TestDiffOpType.RemoveTag; id: string }
        | { op: TestDiffOpType.DocumentSynced; uri: UriComponents; docv?: number };

    export const deserialize = (u: Serialized): TestsDiffOp => {
        if (u.op === TestDiffOpType.Add) {
            return { op: u.op, item: InternalTestItem.deserialize(u.item) };
        } else if (u.op === TestDiffOpType.Update) {
            return { op: u.op, item: ITestItemUpdate.deserialize(u.item) };
        } else if (u.op === TestDiffOpType.DocumentSynced) {
            return { op: u.op, uri: Uri.revive(u.uri), docv: u.docv };
        } else {
            return u;
        }
    };

    export const serialize = (u: TestsDiffOp): Serialized => {
        if (u.op === TestDiffOpType.Add) {
            return { op: u.op, item: InternalTestItem.serialize(u.item) };
        } else if (u.op === TestDiffOpType.Update) {
            return { op: u.op, item: ITestItemUpdate.serialize(u.item) };
        } else {
            return u;
        }
    };
}

/**
 * Context for actions taken in the test explorer view.
 */
export interface ITestItemContext {
    /** Marshalling marker */
    $mid: MarshalledId.TestItemContext;
    /** Tests and parents from the root to the current items */
    tests: InternalTestItem.Serialized[];
}

/**
 * Request from the ext host or main thread to indicate that tests have
 * changed. It's assumed that any item upserted *must* have its children
 * previously also upserted, or upserted as part of the same operation.
 * Children that no longer exist in an upserted item will be removed.
 */
export type TestsDiff = TestsDiffOp[];

/**
 * @private
 */
export interface IncrementalTestCollectionItem extends InternalTestItem {
    children: Set<string>;
}

/**
 * The IncrementalChangeCollector is used in the IncrementalTestCollection
 * and called with diff changes as they're applied. This is used in the
 * ext host to create a cohesive change event from a diff.
 */
export class IncrementalChangeCollector<T> {
    /**
     * A node was added.
     */
    public add(node: T): void { }

    /**
     * A node in the collection was updated.
     */
    public update(node: T): void { }

    /**
     * A node was removed.
     */
    public remove(node: T, isNestedOperation: boolean): void { }

    /**
     * Called when the diff has been applied.
     */
    public complete(): void { }
}

/**
 * Maintains tests in this extension host sent from the main thread.
 */
export abstract class AbstractIncrementalTestCollection<T extends IncrementalTestCollectionItem>  {
    private readonly _tags = new Map<string, ITestTagDisplayInfo>();

    /**
     * Map of item IDs to test item objects.
     */
    protected readonly items = new Map<string, T>();

    /**
     * ID of test root items.
     */
    protected readonly roots = new Set<T>();

    /**
     * Number of 'busy' controllers.
     */
    protected busyControllerCount = 0;

    /**
     * Number of pending roots.
     */
    protected pendingRootCount = 0;

    /**
     * Known test tags.
     */
    public readonly tags: ReadonlyMap<string, ITestTagDisplayInfo> = this._tags;

    /**
     * Applies the diff to the collection.
     */
    public apply(diff: TestsDiff): void {
        const changes = this.createChangeCollector();

        for (const op of diff) {
            switch (op.op) {
                case TestDiffOpType.Add: {
                    const internalTest = InternalTestItem.deserialize(op.item);
                    if (!internalTest.parent) {
                        const created = this.createItem(internalTest);
                        this.roots.add(created);
                        this.items.set(internalTest.item.extId, created);
                        changes.add(created);
                    } else if (this.items.has(internalTest.parent)) {
                        const parent = this.items.get(internalTest.parent)!;
                        parent.children.add(internalTest.item.extId);
                        const created = this.createItem(internalTest, parent);
                        this.items.set(internalTest.item.extId, created);
                        changes.add(created);
                    }

                    if (internalTest.expand === TestItemExpandState.BusyExpanding) {
                        this.busyControllerCount++;
                    }
                    break;
                }

                case TestDiffOpType.Update: {
                    const patch = ITestItemUpdate.deserialize(op.item);
                    const existing = this.items.get(patch.extId);
                    if (!existing) {
                        break;
                    }

                    if (patch.expand !== undefined) {
                        if (existing.expand === TestItemExpandState.BusyExpanding) {
                            this.busyControllerCount--;
                        }
                        if (patch.expand === TestItemExpandState.BusyExpanding) {
                            this.busyControllerCount++;
                        }
                    }

                    applyTestItemUpdate(existing, patch);
                    changes.update(existing);
                    break;
                }

                case TestDiffOpType.Remove: {
                    const toRemove = this.items.get(op.itemId);
                    if (!toRemove) {
                        break;
                    }

                    if (toRemove.parent) {
                        const parent = this.items.get(toRemove.parent)!;
                        parent.children.delete(toRemove.item.extId);
                    } else {
                        this.roots.delete(toRemove);
                    }

                    const queue: Iterable<string>[] = [[op.itemId]];
                    while (queue.length) {
                        for (const itemId of queue.pop()!) {
                            const existing = this.items.get(itemId);
                            if (existing) {
                                queue.push(existing.children);
                                this.items.delete(itemId);
                                changes.remove(existing, existing !== toRemove);

                                if (existing.expand === TestItemExpandState.BusyExpanding) {
                                    this.busyControllerCount--;
                                }
                            }
                        }
                    }
                    break;
                }

                case TestDiffOpType.Retire:
                    this.retireTest(op.itemId);
                    break;

                case TestDiffOpType.IncrementPendingExtHosts:
                    this.updatePendingRoots(op.amount);
                    break;

                case TestDiffOpType.AddTag:
                    this._tags.set(op.tag.id, op.tag);
                    break;

                case TestDiffOpType.RemoveTag:
                    this._tags.delete(op.id);
                    break;
            }
        }

        changes.complete();
    }

    /**
     * Called when the extension signals a test result should be retired.
     */
    protected retireTest(testId: string): void {
        // no-op
    }

    /**
     * Updates the number of test root sources who are yet to report. When
     * the total pending test roots reaches 0, the roots for all controllers
     * will exist in the collection.
     */
    public updatePendingRoots(delta: number): void {
        this.pendingRootCount += delta;
    }

    /**
     * Called before a diff is applied to create a new change collector.
     */
    protected createChangeCollector(): IncrementalChangeCollector<T> {
        return new IncrementalChangeCollector<T>();
    }

    /**
     * Creates a new item for the collection from the internal test item.
     */
    protected abstract createItem(internal: InternalTestItem, parent?: T): T;
}
