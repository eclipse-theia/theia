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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testService.ts

/* eslint-disable import/no-extraneous-dependencies */

import { CancellationToken } from '@theia/monaco-editor-core/esm/vs/base/common/cancellation';
import { Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { Iterable } from '@theia/monaco-editor-core/esm/vs/base/common/iterator';
import { IDisposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { MarshalledId } from './marshalling-ids';
import { URI } from '@theia/monaco-editor-core/esm/vs/base/common/uri';
import { createDecorator } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { IUriIdentityService } from '@theia/monaco-editor-core/esm/vs/platform/uriIdentity/common/uriIdentity';
import { IObservableValue, MutableObservableValue } from './observable-value';
import {
    AbstractIncrementalTestCollection,
    IncrementalTestCollectionItem,
    InternalTestItem,
    ITestItemContext,
    ResolvedTestRunRequest,
    RunTestForControllerRequest,
    RunTestForControllerResult,
    TestItemExpandState,
    TestRunProfileBitset,
    TestsDiff
} from './test-types';
import { TestExclusions } from './test-exclusions';
import { TestId } from './test-id';
import { ITestResult } from './test-result';

export const ITestService = createDecorator<ITestService>('testService');

export interface IMainThreadTestController {
    readonly id: string;
    readonly label: IObservableValue<string>;
    readonly canRefresh: IObservableValue<boolean>;
    refreshTests(token: CancellationToken): Promise<void>;
    configureRunProfile(profileId: number): void;
    expandTest(id: string, levels: number): Promise<void>;
    runTests(request: RunTestForControllerRequest[], token: CancellationToken): Promise<RunTestForControllerResult[]>;
}

export type TestDiffListener = (diff: TestsDiff) => void;

export interface IMainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> {
    onBusyProvidersChange: Event<number>;

    /**
     * Number of providers working to discover tests.
     */
    busyProviders: number;

    /**
     * Root item IDs.
     */
    rootIds: Iterable<string>;

    /**
     * Root items, correspond to registered controllers.
     */
    rootItems: Iterable<IncrementalTestCollectionItem>;

    /**
     * Iterates over every test in the collection, in strictly descending
     * order of depth.
     */
    all: Iterable<IncrementalTestCollectionItem>;

    /**
     * Gets a node in the collection by ID.
     */
    getNodeById(id: string): IncrementalTestCollectionItem | undefined;

    /**
     * Requests that children be revealed for the given test. "Levels" may
     * be infinite.
     */
    expand(testId: string, levels: number): Promise<void>;

    /**
     * Gets a diff that adds all items currently in the tree to a new collection,
     * allowing it to fully hydrate.
     */
    getReviverDiff(): TestsDiff;
}

/**
 * Iterates through the item and its parents to the root.
 */
export const getCollectionItemParents = function* (collection: IMainThreadTestCollection, item: InternalTestItem): Generator<InternalTestItem, void, unknown> {
    let i: InternalTestItem | undefined = item;
    while (i) {
        yield i;
        i = i.parent ? collection.getNodeById(i.parent) : undefined;
    }
};

export const testCollectionIsEmpty = (collection: IMainThreadTestCollection) =>
    !Iterable.some(collection.rootItems, r => r.children.size > 0);

export const getContextForTestItem = (collection: IMainThreadTestCollection, id: string | TestId) => {
    if (typeof id === 'string') {
        id = TestId.fromString(id);
    }

    if (id.isRoot) {
        return { controller: id.toString() };
    }

    const context: ITestItemContext = { $mid: MarshalledId.TestItemContext, tests: [] };
    for (const i of id.idsFromRoot()) {
        if (!i.isRoot) {
            const test = collection.getNodeById(i.toString());
            if (test) {
                context.tests.push(test);
            }
        }
    }

    return context;
};

/**
 * Ensures the test with the given ID exists in the collection, if possible.
 * If cancellation is requested, or the test cannot be found, it will return
 * undefined.
 */
export const expandAndGetTestById = async (collection: IMainThreadTestCollection, id: string, ct = CancellationToken.None) => {
    const idPath = [...TestId.fromString(id).idsFromRoot()];

    let expandToLevel = 0;
    for (let i = idPath.length - 1; !ct.isCancellationRequested && i >= expandToLevel;) {
        const idLoop = idPath[i].toString();
        const existing = collection.getNodeById(idLoop);
        if (!existing) {
            i--;
            continue;
        }

        if (i === idPath.length - 1) {
            return existing;
        }

        // expand children only if it looks like it's necessary
        if (!existing.children.has(idPath[i + 1].toString())) {
            await collection.expand(idLoop, 0);
        }

        expandToLevel = i + 1; // avoid an infinite loop if the test does not exist
        i = idPath.length - 1;
    }
    return undefined;
};

/**
 * Waits for all test in the hierarchy to be fulfilled before returning.
 * If cancellation is requested, it will return early.
 */
export const getAllTestsInHierarchy = async (collection: IMainThreadTestCollection, ct = CancellationToken.None) => {
    if (ct.isCancellationRequested) {
        return;
    }

    let l: IDisposable;

    await Promise.race([
        Promise.all([...collection.rootItems].map(r => collection.expand(r.item.extId, Infinity))),
        new Promise(r => { l = ct.onCancellationRequested(r); }),
    ]).finally(() => l?.dispose());
};

/**
 * Iterator that expands to and iterates through tests in the file. Iterates
 * in strictly descending order.
 */
export const testsInFile = async function* (collection: IMainThreadTestCollection, ident: IUriIdentityService, uri: URI): AsyncIterable<IncrementalTestCollectionItem> {
    for (const test of collection.all) {
        if (!test.item.uri) {
            continue;
        }

        if (ident.extUri.isEqual(uri, test.item.uri)) {
            yield test;
        }

        if (ident.extUri.isEqualOrParent(uri, test.item.uri) && test.expand === TestItemExpandState.Expandable) {
            await collection.expand(test.item.extId, 1);
        }
    }
};

/**
 * An instance of the RootProvider should be registered for each extension
 * host.
 */
export interface ITestRootProvider {
    // todo: nothing, yet
}

/**
 * A run request that expresses the intent of the request and allows the
 * test service to resolve the specifics of the group.
 */
export interface AmbiguousRunTestsRequest {
    /** Group to run */
    group: TestRunProfileBitset;
    /** Tests to run. Allowed to be from different controllers */
    tests: readonly InternalTestItem[];
    /** Tests to exclude. If not given, the current UI excluded tests are used */
    exclude?: InternalTestItem[];
    /** Whether this was triggered from an auto run. */
    isAutoRun?: boolean;
}

export interface ITestService {
    readonly _serviceBrand: undefined;
    /**
     * Fires when the user requests to cancel a test run -- or all runs, if no
     * runId is given.
     */
    readonly onDidCancelTestRun: Event<{ runId: string | undefined }>;

    /**
     * Event that fires when the excluded tests change.
     */
    readonly excluded: TestExclusions;

    /**
     * Test collection instance.
     */
    readonly collection: IMainThreadTestCollection;

    /**
     * Event that fires immediately before a diff is processed.
     */
    readonly onWillProcessDiff: Event<TestsDiff>;

    /**
     * Event that fires after a diff is processed.
     */
    readonly onDidProcessDiff: Event<TestsDiff>;

    /**
     * Whether inline editor decorations should be visible.
     */
    readonly showInlineOutput: MutableObservableValue<boolean>;

    /**
     * Registers an interface that runs tests for the given provider ID.
     */
    registerTestController(providerId: string, controller: IMainThreadTestController): IDisposable;

    /**
     * Gets a registered test controller by ID.
     */
    getTestController(controllerId: string): IMainThreadTestController | undefined;

    /**
     * Refreshes tests for the controller, or all controllers if no ID is given.
     */
    refreshTests(controllerId?: string): Promise<void>;

    /**
     * Cancels any ongoing test refreshes.
     */
    cancelRefreshTests(): void;

    /**
     * Requests that tests be executed.
     */
    runTests(req: AmbiguousRunTestsRequest, token?: CancellationToken): Promise<ITestResult>;

    /**
     * Requests that tests be executed.
     */
    runResolvedTests(req: ResolvedTestRunRequest, token?: CancellationToken): Promise<ITestResult>;

    /**
     * Cancels an ongoing test run by its ID, or all runs if no ID is given.
     */
    cancelTestRun(runId?: string): void;

    /**
     * Publishes a test diff for a controller.
     */
    publishDiff(controllerId: string, diff: TestsDiff): void;
}

export function once<T extends Function>(this: unknown, fn: T): T {
    const _this = this;
    let didCall = false;
    let result: unknown;

    return function (): unknown {
        if (didCall) {
            return result;
        }

        didCall = true;
        result = fn.apply(_this, arguments);

        return result;
    } as unknown as T;
}
