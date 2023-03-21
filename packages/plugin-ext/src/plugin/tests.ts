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

// some code copied and modified from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/api/common/extHostTesting.ts

// /* eslint-disable */

/* tslint:disable:typedef */

import type * as theia from '@theia/plugin';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { mapFind } from '../common/arrays';
import { VSBuffer } from '@theia/testing/lib/common/buffer';
import { Emitter, Event } from '@theia/core';
import { once } from '@theia/testing/lib/common/test-service';
import { hash } from '@theia/core/lib/common/hash';

import { Disposable, DisposableStore, toDisposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';

import { MarshalledId } from '@theia/testing/lib/common/marshalling-ids';
import { deepFreeze } from '@theia/core/lib/common/objects';
import { isDefined } from '@theia/core/lib/common/types';
import { generateUuid } from '@theia/monaco-editor-core/esm/vs/base/common/uuid';
import { TestingExt, PLUGIN_RPC_CONTEXT, TestingMain } from '../common/plugin-api-rpc';
import { Location } from '../common/plugin-api-rpc-model';
import { CommandRegistryImpl } from './command-registry';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { RPCProtocol } from '../common/rpc-protocol';
import { ExtHostTestItemCollection, TestItemImpl, TestItemRootImpl, toItemFromContext } from './test-item';
import * as Convert from './type-converters';
import { TestRunProfileKind, TestRunRequest } from './types-impl';
import { TestId, TestIdPathParts, TestPosition } from '@theia/testing/lib/common/test-id';
import { InvalidTestItemError } from '@theia/testing/lib/common/test-item-collection';
import {
    AbstractIncrementalTestCollection,
    CoverageDetails,
    IFileCoverage,
    IncrementalChangeCollector,
    IncrementalTestCollectionItem,
    InternalTestItem,
    ISerializedTestResults,
    ITestItem,
    RunTestForControllerRequest,
    RunTestForControllerResult,
    TestResultState,
    TestRunProfileBitset,
    TestsDiff,
    TestsDiffOp,
} from '@theia/testing/lib/common/test-types';

interface ControllerInfo {
    controller: theia.TestController;
    profiles: Map<number, theia.TestRunProfile>;
    collection: ExtHostTestItemCollection;
}

export class TestingExtImpl implements TestingExt {
    private readonly resultsChangedEmitter = new Emitter<void>();
    private readonly controllers = new Map</* controller ID */ string, ControllerInfo>();
    private readonly proxy: TestingMain;
    private readonly runTracker: TestRunCoordinator;
    private readonly observer: TestObservers;

    public onResultsChanged = this.resultsChangedEmitter.event;
    public results: ReadonlyArray<theia.TestRunResult> = [];

    constructor(
        rpc: RPCProtocol,
        commands: CommandRegistryImpl,
        private readonly editors: EditorsAndDocumentsExtImpl,
    ) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TESTING_MAIN);
        this.observer = new TestObservers(this.proxy);
        this.runTracker = new TestRunCoordinator(this.proxy);

        commands.registerArgumentProcessor({
            processArgument: arg =>
                arg?.$mid === MarshalledId.TestItemContext ? toItemFromContext(arg) : arg,
        });
    }

    /**
     * Implements theia.test.registerTestProvider
     */
    public createTestController(controllerId: string, label: string, refreshHandler?: (token: CancellationToken) => Thenable<void> | void): theia.TestController {
        if (this.controllers.has(controllerId)) {
            throw new Error(`Attempt to insert a duplicate controller with ID "${controllerId}"`);
        }

        const disposable = new DisposableStore();
        const collection = disposable.add(new ExtHostTestItemCollection(controllerId, label, this.editors));
        collection.root.label = label;

        const profiles = new Map<number, theia.TestRunProfile>();
        const proxy = this.proxy;

        const controller: theia.TestController = {
            items: collection.root.children,
            get label(): string {
                return label;
            },
            set label(value: string) {
                label = value;
                collection.root.label = value;
                proxy.$updateController(controllerId, { label });
            },
            get refreshHandler(): ((token: theia.CancellationToken) => void | theia.Thenable<void>) | undefined {
                return refreshHandler;
            },
            set refreshHandler(value: ((token: CancellationToken) => Thenable<void> | void) | undefined) {
                refreshHandler = value;
                proxy.$updateController(controllerId, { canRefresh: !!value });
            },
            get id(): string {
                return controllerId;
            },
            createRunProfile: (labelIn, group, runHandler, isDefault, tag?: theia.TestTag | undefined) => {
                // Derive the profile ID from a hash so that the same profile will tend
                // to have the same hashes, allowing re-run requests to work across reloads.
                let profileId = hash(labelIn);
                while (profiles.has(profileId)) {
                    profileId++;
                }

                return new TestRunProfileImpl(this.proxy, profiles, controllerId, profileId, label, group, runHandler, isDefault, tag);
            },
            createTestItem(id, labelIn, uri): theia.TestItem {
                return new TestItemImpl(controllerId, id, labelIn, uri);
            },
            createTestRun: (request, name, persist = true) => this.runTracker.createTestRun(controllerId, collection, request, name, persist),
            set resolveHandler(fn) {
                collection.resolveHandler = fn;
            },
            get resolveHandler(): ((item?: theia.TestItem) => void) | undefined {
                return collection.resolveHandler as undefined | ((item?: theia.TestItem) => void);
            },
            dispose: () => {
                disposable.dispose();
            },
        };

        proxy.$registerTestController(controllerId, label, !!refreshHandler);
        disposable.add(toDisposable(() => proxy.$unregisterTestController(controllerId)));

        const info: ControllerInfo = { controller, collection, profiles: profiles };
        this.controllers.set(controllerId, info);
        disposable.add(toDisposable(() => this.controllers.delete(controllerId)));

        disposable.add(collection.onDidGenerateDiff(diff => proxy.$publishDiff(controllerId, diff.map(TestsDiffOp.serialize))));

        return controller;
    }

    /**
     * Implements theia.test.createTestObserver
     */
    public createTestObserver(): theia.TestObserver {
        return this.observer.checkout();
    }

    /**
     * Implements theia.test.runTests
     */
    public async runTests(req: theia.TestRunRequest, token = CancellationToken.None): Promise<void> {
        const profile = tryGetProfileFromTestRunReq(req);
        if (!profile) {
            throw new Error('The request passed to `theia.test.runTests` must include a profile');
        }

        const controller = this.controllers.get(profile.controllerId);
        if (!controller) {
            throw new Error('Controller not found');
        }

        await this.proxy.$runTests({
            isUiTriggered: false,
            targets: [{
                testIds: req.include?.map(t => TestId.fromExtHostTestItem(t, controller.collection.root.id).toString()) ?? [controller.collection.root.id],
                profileGroup: profileGroupToBitset[profile.kind],
                profileId: profile.profileId,
                controllerId: profile.controllerId,
            }],
            exclude: req.exclude?.map(t => t.id),
        }, token);
    }

    /**
     * @inheritdoc
     */
    $provideFileCoverage(runId: string, taskId: string, token: CancellationToken): Promise<IFileCoverage[]> {
        const coverage = mapFind(this.runTracker.trackers, t => t.id === runId ? t.getCoverage(taskId) : undefined);
        return coverage?.provideFileCoverage(token) ?? Promise.resolve([]);
    }

    /**
     * @inheritdoc
     */
    $resolveFileCoverage(runId: string, taskId: string, fileIndex: number, token: CancellationToken): Promise<CoverageDetails[]> {
        const coverage = mapFind(this.runTracker.trackers, t => t.id === runId ? t.getCoverage(taskId) : undefined);
        return coverage?.resolveFileCoverage(fileIndex, token) ?? Promise.resolve([]);
    }

    /** @inheritdoc */
    $configureRunProfile(controllerId: string, profileId: number): void {
        this.controllers.get(controllerId)?.profiles.get(profileId)?.configureHandler?.();
    }

    /** @inheritdoc */
    async $refreshTests(controllerId: string, token: CancellationToken): Promise<void> {
        await this.controllers.get(controllerId)?.controller.refreshHandler?.(token);
    }

    /**
     * Updates test results shown to extensions.
     * @override
     */
    public $publishTestResults(results: ISerializedTestResults[]): void {
        this.results = Object.freeze(
            results
                .map(r => deepFreeze(Convert.TestResults.to(r)))
                .concat(this.results)
                .sort((a, b) => b.completedAt - a.completedAt)
                .slice(0, 32),
        );

        this.resultsChangedEmitter.fire();
    }

    /**
     * Expands the nodes in the test tree. If levels is less than zero, it will
     * be treated as infinite.
     */
    public async $expandTest(testId: string, levels: number): Promise<void> {
        const collection = this.controllers.get(TestId.fromString(testId).controllerId)?.collection;
        if (collection) {
            await collection.expand(testId, levels < 0 ? Infinity : levels);
            collection.flushDiff();
        }
    }

    /**
     * Receives a test update from the main thread. Called (eventually) whenever
     * tests change.
     */
    public $acceptDiff(diff: TestsDiffOp.Serialized[]): void {
        this.observer.applyDiff(diff.map(TestsDiffOp.deserialize));
    }

    /**
     * Runs tests with the given set of IDs. Allows for test from multiple
     * providers to be run.
     * @override
     */
    public async $runControllerTests(reqs: RunTestForControllerRequest[], token: CancellationToken): Promise<RunTestForControllerResult[]> {
        return Promise.all(reqs.map(req => this.runControllerTestRequest(req, token)));
    }

    public async runControllerTestRequest(req: RunTestForControllerRequest, token: CancellationToken): Promise<RunTestForControllerResult> {
        const lookup = this.controllers.get(req.controllerId);
        if (!lookup) {
            return {};
        }

        const { collection, profiles } = lookup;
        const profile = profiles.get(req.profileId);
        if (!profile) {
            return {};
        }

        const includeTests = req.testIds
            .map(testId => collection.tree.get(testId))
            .filter(isDefined);

        const excludeTests = req.excludeExtIds
            .map(id => lookup.collection.tree.get(id))
            .filter(isDefined)
            .filter(exclude => includeTests.some(
                include => include.fullId.compare(exclude.fullId) === TestPosition.IsChild,
            ));

        if (!includeTests.length) {
            return {};
        }

        const publicReq = new TestRunRequest(
            includeTests.some(i => i.actual instanceof TestItemRootImpl) ? undefined : includeTests.map(t => t.actual),
            excludeTests.map(t => t.actual),
            profile,
        );

        const tracker = this.runTracker.prepareForMainThreadTestRun(
            publicReq,
            TestRunDto.fromInternal(req, lookup.collection),
            token,
        );

        try {
            await profile.runHandler(publicReq, token);
            return {};
        } catch (e) {
            return { error: String(e) };
        } finally {
            if (tracker.isRunning && !token.isCancellationRequested) {
                await Event.toPromise(tracker.onEnd);
            }

            tracker.dispose();
        }
    }

    /**
     * Cancels an ongoing test run.
     */
    public $cancelExtensionTestRun(runId: string | undefined): void {
        if (runId === undefined) {
            this.runTracker.cancelAllRuns();
        } else {
            this.runTracker.cancelRunById(runId);
        }
    }
}

class TestRunTracker extends Disposable {
    private readonly tasks = new Map</* task ID */string, { run: theia.TestRun; coverage: TestRunCoverageBearer }>();
    private readonly sharedTestIds = new Set<string>();
    private readonly cts: CancellationTokenSource;
    private readonly endEmitter = this._register(new Emitter<void>());
    private disposed = false;

    /**
     * Fires when a test ends, and no more tests are left running.
     */
    public readonly onEnd = this.endEmitter.event;

    /**
     * Gets whether there are any tests running.
     */
    public get isRunning(): boolean {
        return this.tasks.size > 0;
    }

    /**
     * Gets the run ID.
     */
    public get id(): string {
        return this.dto.id;
    }

    constructor(private readonly dto: TestRunDto, private readonly proxy: TestingMain, parentToken?: CancellationToken) {
        super();
        this.cts = this._register(new CancellationTokenSource(parentToken));
        this._register(this.cts.token.onCancellationRequested(() => {
            for (const { run } of this.tasks.values()) {
                run.end();
            }
        }));
    }

    public getCoverage(taskId: string): TestRunCoverageBearer | undefined {
        return this.tasks.get(taskId)?.coverage;
    }

    public createRun(name: string | undefined): theia.TestRun {
        const runId = this.dto.id;
        const ctrlId = this.dto.controllerId;
        const taskId = generateUuid();
        const coverage = new TestRunCoverageBearer(this.proxy, runId, taskId);

        const guardTestMutation = <Args extends unknown[]>(fn: (test: theia.TestItem, ...args: Args) => void) =>
            (test: theia.TestItem, ...args: Args) => {
                if (ended) {
                    console.warn(`Setting the state of test "${test.id}" is a no-op after the run ends.`);
                    return;
                }

                if (!this.dto.isIncluded(test)) {
                    return;
                }

                this.ensureTestIsKnown(test);
                fn(test, ...args);
            };

        const appendMessages = (test: theia.TestItem, messages: theia.TestMessage | readonly theia.TestMessage[]) => {
            const converted = messages instanceof Array
                ? messages.map(Convert.TestMessage.from)
                : [Convert.TestMessage.from(messages)];

            if (test.uri && test.range) {
                const defaultLocation: Location = { range: Convert.Range.from(test.range), uri: test.uri };
                for (const message of converted) {
                    message.location = message.location || defaultLocation;
                }
            }

            this.proxy.$appendTestMessagesInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), converted);
        };

        let ended = false;
        const run: theia.TestRun = {
            isPersisted: this.dto.isPersisted,
            token: this.cts.token,
            name,
            get coverageProvider(): theia.TestCoverageProvider<theia.FileCoverage> | undefined {
                return coverage.coverageProvider;
            },
            set coverageProvider(provider) {
                coverage.coverageProvider = provider;
            },
            // #region state mutation
            enqueued: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Queued);
            }),
            skipped: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Skipped);
            }),
            started: guardTestMutation(test => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Running);
            }),
            errored: guardTestMutation((test, messages, duration) => {
                appendMessages(test, messages);
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Errored, duration);
            }),
            failed: guardTestMutation((test, messages, duration) => {
                appendMessages(test, messages);
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Failed, duration);
            }),
            passed: guardTestMutation((test, duration) => {
                this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, this.dto.controllerId).toString(), TestResultState.Passed, duration);
            }),
            // #endregion
            appendOutput: (output, location?: theia.Location, test?: theia.TestItem) => {
                if (ended) {
                    return;
                }

                if (test) {
                    if (this.dto.isIncluded(test)) {
                        this.ensureTestIsKnown(test);
                    } else {
                        test = undefined;
                    }
                }

                this.proxy.$appendOutputToRun(
                    runId,
                    taskId,
                    VSBuffer.fromString(output),
                    location && Convert.location.from(location),
                    test && TestId.fromExtHostTestItem(test, ctrlId).toString(),
                );
            },
            end: () => {
                if (ended) {
                    return;
                }

                ended = true;
                this.proxy.$finishedTestRunTask(runId, taskId);
                this.tasks.delete(taskId);
                if (!this.isRunning) {
                    this.dispose();
                }
            }
        };

        this.tasks.set(taskId, { run, coverage });
        this.proxy.$startedTestRunTask(runId, { id: taskId, name, running: true });

        return run;
    }

    public override dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.endEmitter.fire();
            this.cts.cancel();
            super.dispose();
        }
    }

    private ensureTestIsKnown(test: theia.TestItem): void {
        if (!(test instanceof TestItemImpl)) {
            throw new InvalidTestItemError(test.id);
        }

        if (this.sharedTestIds.has(TestId.fromExtHostTestItem(test, this.dto.controllerId).toString())) {
            return;
        }

        const chain: ITestItem.Serialized[] = [];
        const root = this.dto.colllection.root;
        while (true) {
            const converted = Convert.TestItem.from(test as TestItemImpl);
            chain.unshift(converted);

            if (this.sharedTestIds.has(converted.extId)) {
                break;
            }

            this.sharedTestIds.add(converted.extId);
            if (test === root) {
                break;
            }

            test = test.parent || root;
        }

        this.proxy.$addTestsToRun(this.dto.controllerId, this.dto.id, chain);
    }
}

/**
 * Queues runs for a single extension and provides the currently-executing
 * run so that `createTestRun` can be properly correlated.
 */
export class TestRunCoordinator {
    private tracked = new Map<theia.TestRunRequest, TestRunTracker>();

    public get trackers(): IterableIterator<TestRunTracker> {
        return this.tracked.values();
    }

    constructor(private readonly proxy: TestingMain) { }

    /**
     * Registers a request as being invoked by the main thread, so
     * `$startedExtensionTestRun` is not invoked. The run must eventually
     * be cancelled manually.
     */
    public prepareForMainThreadTestRun(req: theia.TestRunRequest, dto: TestRunDto, token: CancellationToken): TestRunTracker {
        return this.getTracker(req, dto, token);
    }

    /**
     * Cancels an existing test run via its cancellation token.
     */
    public cancelRunById(runId: string): void {
        for (const tracker of this.tracked.values()) {
            if (tracker.id === runId) {
                tracker.dispose();
                return;
            }
        }
    }

    /**
     * Cancels an existing test run via its cancellation token.
     */
    public cancelAllRuns(): void {
        for (const tracker of this.tracked.values()) {
            tracker.dispose();
        }
    }

    /**
     * Implements the public `createTestRun` API.
     */
    public createTestRun(controllerId: string, collection: ExtHostTestItemCollection, request: theia.TestRunRequest, name: string | undefined, persist: boolean): theia.TestRun {
        const existing = this.tracked.get(request);
        if (existing) {
            return existing.createRun(name);
        }

        // If there is not an existing tracked extension for the request, start
        // a new, detached session.
        const dto = TestRunDto.fromPublic(controllerId, collection, request, persist);
        const profile = tryGetProfileFromTestRunReq(request);
        this.proxy.$startedExtensionTestRun({
            controllerId,
            profile: profile && { group: profileGroupToBitset[profile.kind], id: profile.profileId },
            exclude: request.exclude?.map(t => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [],
            id: dto.id,
            include: request.include?.map(t => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [collection.root.id],
            persist
        });

        const tracker = this.getTracker(request, dto);
        tracker.onEnd(() => this.proxy.$finishedExtensionTestRun(dto.id));
        return tracker.createRun(name);
    }

    private getTracker(req: theia.TestRunRequest, dto: TestRunDto, token?: CancellationToken): TestRunTracker {
        const tracker = new TestRunTracker(dto, this.proxy, token);
        this.tracked.set(req, tracker);
        tracker.onEnd(() => this.tracked.delete(req));
        return tracker;
    }
}

const tryGetProfileFromTestRunReq = (request: theia.TestRunRequest) => {
    if (!request.profile) {
        return undefined;
    }

    if (!(request.profile instanceof TestRunProfileImpl)) {
        throw new Error('TestRunRequest.profile is not an instance created from TestController.createRunProfile');
    }

    return request.profile;
};

export class TestRunDto {
    private readonly includePrefix: string[];
    private readonly excludePrefix: string[];

    public static fromPublic(controllerId: string, collection: ExtHostTestItemCollection, request: theia.TestRunRequest, persist: boolean): TestRunDto {
        return new TestRunDto(
            controllerId,
            generateUuid(),
            request.include?.map(t => TestId.fromExtHostTestItem(t, controllerId).toString()) ?? [controllerId],
            request.exclude?.map(t => TestId.fromExtHostTestItem(t, controllerId).toString()) ?? [],
            persist,
            collection,
        );
    }

    public static fromInternal(request: RunTestForControllerRequest, collection: ExtHostTestItemCollection): TestRunDto {
        return new TestRunDto(
            request.controllerId,
            request.runId,
            request.testIds,
            request.excludeExtIds,
            true,
            collection,
        );
    }

    constructor(
        public readonly controllerId: string,
        public readonly id: string,
        include: string[],
        exclude: string[],
        public readonly isPersisted: boolean,
        public readonly colllection: ExtHostTestItemCollection,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        this.includePrefix = include.map(id => id + TestIdPathParts.Delimiter);
        // eslint-disable-next-line @typescript-eslint/no-shadow
        this.excludePrefix = exclude.map(id => id + TestIdPathParts.Delimiter);
    }

    public isIncluded(test: theia.TestItem): boolean {
        const id = TestId.fromExtHostTestItem(test, this.controllerId).toString() + TestIdPathParts.Delimiter;
        for (const prefix of this.excludePrefix) {
            if (id === prefix || id.startsWith(prefix)) {
                return false;
            }
        }

        for (const prefix of this.includePrefix) {
            if (id === prefix || id.startsWith(prefix)) {
                return true;
            }
        }

        return false;
    }
}

class TestRunCoverageBearer {
    private _coverageProvider?: theia.TestCoverageProvider;
    private fileCoverage?: Promise<theia.FileCoverage[] | null | undefined>;

    public set coverageProvider(provider: theia.TestCoverageProvider | undefined) {
        if (this._coverageProvider) {
            throw new Error('The TestCoverageProvider cannot be replaced after being provided');
        }

        if (!provider) {
            return;
        }

        this._coverageProvider = provider;
        this.proxy.$signalCoverageAvailable(this.runId, this.taskId);
    }

    public get coverageProvider(): theia.TestCoverageProvider<theia.FileCoverage> | undefined {
        return this._coverageProvider;
    }

    constructor(
        private readonly proxy: TestingMain,
        private readonly runId: string,
        private readonly taskId: string,
    ) {
    }

    public async provideFileCoverage(token: CancellationToken): Promise<IFileCoverage[]> {
        if (!this._coverageProvider) {
            return [];
        }

        if (!this.fileCoverage) {
            this.fileCoverage = (async () => this._coverageProvider!.provideFileCoverage(token))();
        }

        try {
            const coverage = await this.fileCoverage;
            return coverage?.map(Convert.TestCoverage.fromFile) ?? [];
        } catch (e) {
            this.fileCoverage = undefined;
            throw e;
        }
    }

    public async resolveFileCoverage(index: number, token: CancellationToken): Promise<CoverageDetails[]> {
        const fileCoverage = await this.fileCoverage;
        let file = fileCoverage?.[index];
        if (!this._coverageProvider || !fileCoverage || !file) {
            return [];
        }

        if (!file.detailedCoverage) {
            file = fileCoverage[index] = await this._coverageProvider.resolveFileCoverage?.(file, token) ?? file;
        }

        return file.detailedCoverage?.map(Convert.TestCoverage.fromDetailed) ?? [];
    }
}

/**
 * @private
 */
interface MirroredCollectionTestItem extends IncrementalTestCollectionItem {
    revived: theia.TestItem;
    depth: number;
}

class MirroredChangeCollector extends IncrementalChangeCollector<MirroredCollectionTestItem> {
    private readonly added = new Set<MirroredCollectionTestItem>();
    private readonly updated = new Set<MirroredCollectionTestItem>();
    private readonly removed = new Set<MirroredCollectionTestItem>();

    private readonly alreadyRemoved = new Set<string>();

    public get isEmpty(): boolean {
        return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
    }

    constructor(private readonly emitter: Emitter<theia.TestsChangeEvent>) {
        super();
    }

    /**
     * @override
     */
    public override add(node: MirroredCollectionTestItem): void {
        this.added.add(node);
    }

    /**
     * @override
     */
    public override update(node: MirroredCollectionTestItem): void {
        Object.assign(node.revived, Convert.TestItem.toPlain(node.item));
        if (!this.added.has(node)) {
            this.updated.add(node);
        }
    }

    /**
     * @override
     */
    public override remove(node: MirroredCollectionTestItem): void {
        if (this.added.has(node)) {
            this.added.delete(node);
            return;
        }

        this.updated.delete(node);

        if (node.parent && this.alreadyRemoved.has(node.parent)) {
            this.alreadyRemoved.add(node.item.extId);
            return;
        }

        this.removed.add(node);
    }

    /**
     * @override
     */
    public getChangeEvent(): theia.TestsChangeEvent {
        const { added, updated, removed } = this;
        return {
            get added(): readonly theia.TestItem[] { return [...added].map(n => n.revived); },
            get updated(): readonly theia.TestItem[] { return [...updated].map(n => n.revived); },
            get removed(): readonly theia.TestItem[] { return [...removed].map(n => n.revived); },
        };
    }

    public override complete(): void {
        if (!this.isEmpty) {
            this.emitter.fire(this.getChangeEvent());
        }
    }
}

/**
 * Maintains tests in this extension host sent from the main thread.
 * @private
 */
export class MirroredTestCollection extends AbstractIncrementalTestCollection<MirroredCollectionTestItem> {
    private changeEmitter = new Emitter<theia.TestsChangeEvent>();

    /**
     * Change emitter that fires with the same semantics as `TestObserver.onDidChangeTests`.
     */
    public readonly onDidChangeTests = this.changeEmitter.event;

    /**
     * Gets a list of root test items.
     */
    public get rootTests(): Set<MirroredCollectionTestItem> {
        return super.roots;
    }

    /**
     *
     * If the test ID exists, returns its underlying ID.
     */
    public getMirroredTestDataById(itemId: string): MirroredCollectionTestItem | undefined {
        return this.items.get(itemId);
    }

    /**
     * If the test item is a mirrored test item, returns its underlying ID.
     */
    public getMirroredTestDataByReference(item: theia.TestItem): MirroredCollectionTestItem | undefined {
        return this.items.get(item.id);
    }

    /**
     * @override
     */
    protected createItem(item: InternalTestItem, parent?: MirroredCollectionTestItem): MirroredCollectionTestItem {
        return {
            ...item,
            // todo@connor4312: make this work well again with children
            revived: Convert.TestItem.toPlain(item.item) as theia.TestItem,
            depth: parent ? parent.depth + 1 : 0,
            children: new Set(),
        };
    }

    /**
     * @override
     */
    protected override createChangeCollector(): MirroredChangeCollector {
        return new MirroredChangeCollector(this.changeEmitter);
    }
}

class TestObservers {
    private current?: {
        observers: number;
        tests: MirroredTestCollection;
    };

    constructor(private readonly proxy: TestingMain) {
    }

    public checkout(): theia.TestObserver {
        if (!this.current) {
            this.current = this.createObserverData();
        }

        const current = this.current;
        current.observers++;

        return {
            onDidChangeTest: current.tests.onDidChangeTests,
            get tests(): theia.TestItem[] { return [...current.tests.rootTests].map(t => t.revived); },
            dispose: once(() => {
                if (--current.observers === 0) {
                    this.proxy.$unsubscribeFromDiffs();
                    this.current = undefined;
                }
            }),
        };
    }

    /**
     * Gets the internal test data by its reference.
     */
    public getMirroredTestDataByReference(ref: theia.TestItem): MirroredCollectionTestItem | undefined {
        return this.current?.tests.getMirroredTestDataByReference(ref);
    }

    /**
     * Applies test diffs to the current set of observed tests.
     */
    public applyDiff(diff: TestsDiff): void {
        this.current?.tests.apply(diff);
    }

    private createObserverData(): { observers: number; tests: MirroredTestCollection } {
        const tests = new MirroredTestCollection();
        this.proxy.$subscribeToDiffs();
        return { observers: 0, tests, };
    }
}

export class TestRunProfileImpl implements theia.TestRunProfile {
    readonly #proxy: TestingMain;
    #profiles?: Map<number, theia.TestRunProfile>;
    private _configureHandler?: (() => void);

    public get label(): string {
        return this._label;
    }

    public set label(label: string) {
        if (label !== this._label) {
            this._label = label;
            this.#proxy.$updateTestRunConfig(this.controllerId, this.profileId, { label });
        }
    }

    public get isDefault(): boolean {
        return this._isDefault;
    }

    public set isDefault(isDefault: boolean) {
        if (isDefault !== this._isDefault) {
            this._isDefault = isDefault;
            this.#proxy.$updateTestRunConfig(this.controllerId, this.profileId, { isDefault });
        }
    }

    public get tag(): theia.TestTag | undefined {
        return this._tag;
    }

    public set tag(tag: theia.TestTag | undefined) {
        if (tag?.id !== this._tag?.id) {
            this._tag = tag;
            this.#proxy.$updateTestRunConfig(this.controllerId, this.profileId, {
                tag: tag ? Convert.TestTag.namespace(this.controllerId, tag.id) : undefined,
            });
        }
    }

    public get configureHandler(): (() => void) | undefined {
        return this._configureHandler;
    }

    public set configureHandler(handler: undefined | (() => void)) {
        if (handler !== this._configureHandler) {
            this._configureHandler = handler;
            this.#proxy.$updateTestRunConfig(this.controllerId, this.profileId, { hasConfigurationHandler: !!handler });
        }
    }

    constructor(
        proxy: TestingMain,
        profiles: Map<number, theia.TestRunProfile>,
        public readonly controllerId: string,
        public readonly profileId: number,
        private _label: string,
        public readonly kind: theia.TestRunProfileKind,
        public runHandler: (request: theia.TestRunRequest, token: theia.CancellationToken) => Thenable<void> | void,
        private _isDefault = false,
        public _tag: theia.TestTag | undefined = undefined,
    ) {
        this.#proxy = proxy;
        this.#profiles = profiles;
        profiles.set(profileId, this);

        const groupBitset = profileGroupToBitset[kind];
        if (typeof groupBitset !== 'number') {
            throw new Error(`Unknown TestRunProfile.group ${kind}`);
        }

        this.#proxy.$publishTestRunProfile({
            profileId: profileId,
            controllerId,
            tag: _tag ? Convert.TestTag.namespace(this.controllerId, _tag.id) : undefined,
            label: _label,
            group: groupBitset,
            isDefault: _isDefault,
            hasConfigurationHandler: false,
        });
    }

    dispose(): void {
        if (this.#profiles?.delete(this.profileId)) {
            this.#profiles = undefined;
            this.#proxy.$removeTestProfile(this.controllerId, this.profileId);
        }
    }
}

const profileGroupToBitset: { [K in TestRunProfileKind]: TestRunProfileBitset } = {
    [TestRunProfileKind.Coverage]: TestRunProfileBitset.Coverage,
    [TestRunProfileKind.Debug]: TestRunProfileBitset.Debug,
    [TestRunProfileKind.Run]: TestRunProfileBitset.Run,
};
