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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// some code copied and modified from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/api/common/extHostTesting.ts

// /* eslint-disable */

/* tslint:disable:typedef */

import * as theia from '@theia/plugin';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import { hash } from '@theia/core/lib/common/hash';

import { isDefined } from '@theia/core/lib/common/types';
import { TestingExt, PLUGIN_RPC_CONTEXT, TestingMain } from '../common/plugin-api-rpc';
import { CommandRegistryImpl } from './command-registry';
import { RPCProtocol } from '../common/rpc-protocol';
import { generateUuid } from '@theia/core/lib/common/uuid';
import * as Convert from './type-converters';
import { TestItemImpl, TestItemCollection } from './test-item';
import { AccumulatingTreeDeltaEmitter, TreeDelta } from '@theia/test/lib/common/tree-delta';
import {
    TestItemDTO, TestOutputDTO, TestExecutionState, TestRunProfileDTO,
    TestRunProfileKind, TestRunRequestDTO, TestStateChangeDTO, TestItemReference, TestMessageArg, TestMessageDTO,
    TestMessageStackFrameDTO
} from '../common/test-types';
import * as protocol from '@theia/core/shared/vscode-languageserver-protocol';
import { ChangeBatcher, observableProperty } from '@theia/test/lib/common/collections';
import { Location, Position, Range, TestRunRequest, URI } from './types-impl';
import { MarkdownString } from '../common/plugin-api-rpc-model';

type RefreshHandler = (token: theia.CancellationToken) => void | theia.Thenable<void>;
type ResolveHandler = (item: theia.TestItem | undefined) => theia.Thenable<void> | void;

export class TestControllerImpl implements theia.TestController {
    protected readonly _profiles = new Map<number, TestRunProfile>();
    private activeRuns = new Map<theia.TestRunRequest, TestRun>();
    private deltaBuilder: AccumulatingTreeDeltaEmitter<string, TestItemImpl>;
    private _refreshHandler?: RefreshHandler;
    private _resolveHandler?: ResolveHandler;

    constructor(
        private onDispose: () => void,
        protected readonly proxy: TestingMain,
        readonly id: string,
        private _label: string) {

        this.proxy.$registerTestController(id, _label);

        this.deltaBuilder = new AccumulatingTreeDeltaEmitter<string, TestItemImpl>(200);
        this.deltaBuilder.onDidFlush(delta => {
            // console.debug('flushing delta'); // logging levels don't work in plugin host: https://github.com/eclipse-theia/theia/issues/12234
            const mapped = this.mapDeltas(delta);
            // console.debug(JSON.stringify(mapped, undefined, 3));
            this.proxy.$notifyDelta(id, mapped);
        });

        this.items = new TestItemCollection(this, item => item.path, () => this.deltaBuilder);
    }
    mapDeltas(deltas: TreeDelta<string, TestItemImpl>[]): TreeDelta<string, TestItemDTO>[] {
        return deltas.map(delta => this.mapDelta(delta));
    }

    mapDelta(delta: TreeDelta<string, TestItemImpl>): TreeDelta<string, TestItemDTO> {
        return {
            path: delta.path,
            type: delta.type,
            value: delta.value ? Convert.TestItem.fromPartial(delta.value) : undefined,
            childDeltas: delta.childDeltas?.map(d => this.mapDelta(d))
        };
    }

    readonly items: TestItemCollection;

    get label(): string {
        return this._label;
    }
    set label(value: string) {
        this._label = value;
        this.proxy.$updateController(this.id, { label: value });
    }
    get refreshHandler(): RefreshHandler | undefined {
        return this._refreshHandler;
    }
    set refreshHandler(value: RefreshHandler | undefined) {
        this._refreshHandler = value;
        this.proxy.$updateController(this.id, { canRefresh: !!value });
    }

    get resolveHandler(): ResolveHandler | undefined {
        return this._resolveHandler;
    }

    set resolveHandler(handler: ResolveHandler | undefined) {
        this._resolveHandler = handler;
        this.proxy.$updateController(this.id, { canResolve: !!handler });
    }

    getProfile(id: string) {
        return this._profiles.get(Number.parseInt(id));
    }

    createRunProfile(label: string, kind: TestRunProfileKind, runHandler: (request: theia.TestRunRequest, token: CancellationToken) => Thenable<void> | void,
        isDefault?: boolean, tag?: theia.TestTag, supportsContinuousRun?: boolean): theia.TestRunProfile {
        // Derive the profile ID from a hash so that the same profile will tend
        // to have the same hashes, allowing re-run requests to work across reloads.
        let profileId = hash(label);
        while (this._profiles.has(profileId)) {
            profileId++;
        }

        const profile = new TestRunProfile(this.proxy, this.id, profileId.toString(), label, kind, runHandler, isDefault, tag);
        this._profiles.set(profileId, profile);
        return profile;
    }
    createTestItem(id: string, label: string, uri?: theia.Uri): theia.TestItem {
        return new TestItemImpl(id, uri, label);
    }

    createTestRun(request: theia.TestRunRequest, name?: string, persist: boolean = true): theia.TestRun {
        const run = new TestRun(this, this.proxy, name || '', persist, true, request.preserveFocus);
        const endListener = run.onWillFlush(() => {
            // make sure we notify the front end of test item changes before test run state is sent
            this.deltaBuilder.flush();
        });
        run.onDidEnd(() => {
            endListener.dispose();
            this.activeRuns.delete(request);
        });
        this.activeRuns.set(request, run);
        return run;
    }

    dispose() {
        this.proxy.$unregisterTestController(this.id);
        this.onDispose();
    }

    runTestsForUI(profileId: string, name: string, includedTests: string[][], excludedTests: string[][], preserveFocus: boolean): void {
        const profile = this.getProfile(profileId);
        if (!profile) {
            console.error(`No test run profile found for controller ${this.id} with id ${profileId} `);
            return;
        }

        const includeTests = includedTests
            .map(testId => this.items.find(testId))
            .filter(isDefined);

        if (includeTests.length === 0) {
            return;
        }
        function isPrefix(left: string[], right: string[]) {
            if (left.length > right.length) {
                return false;
            }

            for (let i = 0; i < left.length; i++) {
                if (left[i] !== right[i]) {
                    return false;
                }
            }
            return true;
        }

        const excludeTests = excludedTests
            .filter(path => includedTests.some(
                includedPath => isPrefix(path, includedPath)
            ))
            .map(path => this.items.find(path))
            .filter(isDefined);

        const request = new TestRunRequest(
            includeTests, excludeTests, profile, false /* don't support continuous run yet */, preserveFocus
        );

        // we do not cancel test runs via a cancellation token, but instead invoke "cancel" on the test runs
        profile.runHandler(request, CancellationToken.None);
    }

    cancelRun(runId?: string): void {
        if (runId === undefined) {
            this.activeRuns.forEach(run => run.cancel());
        } else {
            const run = [...this.activeRuns.values()].find(r => r.id === runId);
            if (!run) {
                throw new Error(`TestController ${this.id} cannot cancel non - existing run ${runId} `);
            }
            run.cancel();
        }
    }

    invalidateTestResults(items?: theia.TestItem | readonly theia.TestItem[] | undefined): void {
        // do nothing for the moment, since we don't have a UI to "mark as outdated and deprioritized in the editor's UI."
    }
}

function checkTestInstance(item: theia.TestItem): TestItemImpl;
function checkTestInstance(item?: theia.TestItem): TestItemImpl | undefined;
function checkTestInstance(item?: theia.TestItem): TestItemImpl | undefined {
    if (item instanceof TestItemImpl) {
        if (!item.path) {
            throw new Error('Test item not added to a collection');
        }
        return <TestItemImpl>item;
    } else if (item) {
        throw new Error('Not a TestItem instance');
    }
    return undefined;
}

export function checkTestRunInstance(item: theia.TestRun): TestRun;
export function checkTestRunInstance(item?: theia.TestRun): TestRun | undefined;
export function checkTestRunInstance(item?: theia.TestRun): TestRun | undefined {
    if (item instanceof TestRun) {
        return <TestRun>item;
    } else if (item) {
        throw new Error('Not a TestRun instance');
    }
    return undefined;
}

export class TestRun implements theia.TestRun {
    private onDidEndEmitter = new Emitter<void>();
    onDidEnd: Event<void> = this.onDidEndEmitter.event;
    private onWillFlushEmitter = new Emitter<void>();
    onWillFlush: Event<void> = this.onWillFlushEmitter.event;
    private onDidDisposeEmitter = new Emitter<void>();
    onDidDispose: Event<void> = this.onDidDisposeEmitter.event;

    readonly id: string;
    private testStateDeltas = new Map<theia.TestItem, TestStateChangeDTO>();
    private testOutputDeltas: TestOutputDTO[] = [];
    private changeBatcher = new ChangeBatcher(() => {
        this.emitChange();
    }, 200);
    private ended: boolean;
    private tokenSource: CancellationTokenSource;

    constructor(
        readonly controller: TestControllerImpl,
        private readonly proxy: TestingMain,
        readonly name: string,
        readonly isPersisted: boolean,
        isRunning: boolean,
        preserveFocus: boolean) {
        this.id = generateUuid();

        this.tokenSource = new CancellationTokenSource();

        this.proxy.$notifyTestRunCreated(this.controller.id, { id: this.id, name: this.name, isRunning }, preserveFocus);
    }

    get token(): CancellationToken {
        return this.tokenSource.token;
    }

    enqueued(test: theia.TestItem): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Queued });
    }

    started(test: theia.TestItem): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Running });
    }
    skipped(test: theia.TestItem): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Skipped });
    }
    failed(test: theia.TestItem, message: theia.TestMessage | readonly theia.TestMessage[], duration?: number | undefined): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Failed, messages: Convert.TestMessage.from(message), duration });
    }
    errored(test: theia.TestItem, message: theia.TestMessage | readonly theia.TestMessage[], duration?: number | undefined): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Errored, messages: Convert.TestMessage.from(message), duration });
    }
    passed(test: theia.TestItem, duration?: number | undefined): void {
        this.updateTestState(test, { itemPath: checkTestInstance(test).path, state: TestExecutionState.Passed, duration });
    }
    appendOutput(output: string, location?: theia.Location | undefined, test?: theia.TestItem | undefined): void {
        this.testOutputDeltas.push({ output, location: Convert.fromLocation(location), itemPath: checkTestInstance(test)?.path });
        this.changeBatcher.changeOccurred();
    }

    end(): void {
        this.ended = true;
        this.proxy.$notifyTestRunEnded(this.controller.id, this.id);
    }

    /** @stubbed */
    addCoverage(fileCoverage: theia.FileCoverage): void { }

    private checkNotEnded(test: theia.TestItem): boolean {
        if (this.ended) {
            console.warn(`Setting the state of test "${test.id}" is a no - op after the run ends.`);
            return false;
        }
        return true;
    }

    private updateTestState<T extends TestStateChangeDTO>(item: theia.TestItem, state: T) {
        if (this.checkNotEnded(item)) {
            this.testStateDeltas.set(item, state);
            this.changeBatcher.changeOccurred();
        }
    }

    emitChange() {
        this.onWillFlushEmitter.fire();
        this.proxy.$notifyTestStateChanged(this.controller.id, this.id, [...this.testStateDeltas.values()], this.testOutputDeltas);
        this.testOutputDeltas = [];
        this.testStateDeltas = new Map();
    }

    cancel() {
        this.tokenSource.cancel();
    }
}

export class TestingExtImpl implements TestingExt {
    private readonly controllersById = new Map<string, TestControllerImpl>();
    private readonly proxy: TestingMain;

    constructor(
        rpc: RPCProtocol,
        commands: CommandRegistryImpl
    ) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TESTING_MAIN);

        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (TestItemReference.is(arg)) {
                    return this.toTestItem(arg);
                } else if (Array.isArray(arg)) {
                    return arg.map(param => TestItemReference.is(param) ? this.toTestItem(param) : param);
                } else if (TestMessageArg.is(arg)) {
                    return this.fromTestMessageArg(arg);
                } else {
                    return arg;
                }
            }
        });

    }

    fromTestMessageArg(arg: TestMessageArg): { test?: theia.TestItem, message: theia.TestMessage } {
        const testItem = arg.testItemReference ? this.toTestItem(arg.testItemReference) : undefined;
        const message = this.toTestMessage(arg.testMessage);
        return {
            test: testItem,
            message: message
        };
    }

    toTestMessage(testMessage: TestMessageDTO): theia.TestMessage {
        const message = MarkdownString.is(testMessage.message) ? Convert.toMarkdown(testMessage.message) : testMessage.message;

        return {
            message: message,
            actualOutput: testMessage.actual,
            expectedOutput: testMessage.expected,
            contextValue: testMessage.contextValue,
            location: this.toLocation(testMessage.location),
            stackTrace: testMessage.stackTrace ? testMessage.stackTrace.map(frame => this.toStackFrame(frame)) : undefined
        };
    }

    toLocation(location: protocol.Location | undefined): Location | undefined {
        if (!location) {
            return undefined;
        }
        return new Location(URI.parse(location.uri), this.toRange(location.range));
    }

    toRange(range: protocol.Range): Range {
        return new Range(this.toPosition(range.start), this.toPosition(range.end));
    }

    toPosition(position: protocol.Position): Position;
    toPosition(position: protocol.Position | undefined): Position | undefined;
    toPosition(position: protocol.Position | undefined): Position | undefined {
        if (!position) {
            return undefined;
        }
        return new Position(position.line, position.character);
    }

    toStackFrame(stackFrame: TestMessageStackFrameDTO): theia.TestMessageStackFrame {
        return {
            label: stackFrame.label,
            position: this.toPosition(stackFrame.position),
            uri: stackFrame.uri ? URI.parse(stackFrame.uri) : undefined
        };
    }

    toTestItem(ref: TestItemReference): theia.TestItem {
        const result = this.withController(ref.controllerId).items.find(ref.testPath);
        if (!result) {
            throw new Error(`Test item for controller ${ref.controllerId} not found: ${ref.testPath}`);
        }
        return result;
    }

    protected withController(controllerId: string): TestControllerImpl {
        const controller = this.controllersById.get(controllerId);
        if (!controller) {
            throw new Error(`No test controller found with id "${controllerId}"`);
        }
        return controller;
    }

    $onResolveChildren(controllerId: string, path: string[]): void {
        const controller = this.withController(controllerId);
        if (controller.resolveHandler) {
            const item = controller.items.find(path);
            if (item?.canResolveChildren) { // the item and resolve handler might have been been changed, but not sent to the front end
                controller.resolveHandler?.(item);
            }
        }
    }

    /**
     * Implements theia.test.registerTestProvider
     */
    createTestController(controllerId: string, label: string): theia.TestController {
        if (this.controllersById.has(controllerId)) {
            throw new Error(`Attempt to insert a duplicate controller with ID "${controllerId}"`);
        }

        const disposable = new DisposableCollection();

        const controller = new TestControllerImpl(() => disposable.dispose(), this.proxy, controllerId, label);

        this.controllersById.set(controllerId, controller);
        disposable.push(Disposable.create(() => this.controllersById.delete(controllerId)));

        return controller;
    }

    /** @inheritdoc */
    $onConfigureRunProfile(controllerId: string, profileId: string): void {
        this.controllersById.get(controllerId)?.getProfile(profileId)?.configureHandler?.();
    }

    /** @inheritdoc */
    $onDidChangeDefault(controllerId: string, profileId: string, isDefault: boolean): void {
        const profile = this.controllersById.get(controllerId)?.getProfile(profileId);
        if (profile) {
            profile.doSetDefault(isDefault);
        }
    }

    /** @inheritdoc */
    async $refreshTests(controllerId: string, token: CancellationToken): Promise<void> {
        await this.withController(controllerId).refreshHandler?.(token);
    }

    /**
     * Runs tests with the given set of IDs. Allows for test from multiple
     * providers to be run.
     * @override
     */
    $onRunControllerTests(reqs: TestRunRequestDTO[]): void {
        reqs.map(req => this.runTestsForUI(req));
    }

    runTestsForUI(req: TestRunRequestDTO): void {
        this.withController(req.controllerId).runTestsForUI(req.profileId, req.name, req.includedTests, req.excludedTests, req.preserveFocus);
    }

    /**
     * Cancels an ongoing test run.
     */
    $onCancelTestRun(controllerId: string, runId: string): void {
        this.withController(controllerId).cancelRun(runId);
    }
}

export class TestRunProfile implements theia.TestRunProfile {
    private readonly proxy: TestingMain;
    supportsContinuousRun: boolean = false;

    constructor(
        proxy: TestingMain,
        readonly controllerId: string,
        readonly profileId: string,
        label: string,
        readonly kind: theia.TestRunProfileKind,
        public runHandler: (request: theia.TestRunRequest, token: theia.CancellationToken) => Thenable<void> | void,
        isDefault = false,
        tag: theia.TestTag | undefined = undefined,
    ) {
        proxy.$notifyTestRunProfileCreated(controllerId, {
            id: profileId,
            kind: kind,
            tag: tag ? tag.toString() : '',
            label: label,
            isDefault: isDefault,
            canConfigure: false,
        });
        this.proxy = proxy;
        this.label = label;
        this.tag = tag;
        this.label = label;
        this.isDefault = isDefault;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected notifyPropertyChange(property: keyof TestRunProfileDTO, value: any): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        this.proxy.$updateTestRunProfile(this.controllerId, this.profileId, val);
    }

    @observableProperty('notifyPropertyChange')
    label: string;

    _isDefault: boolean;

    get isDefault(): boolean {
        return this._isDefault;
    }

    set isDefault(isDefault: boolean) {
        if (this.doSetDefault(isDefault)) {
            this.proxy.$updateTestRunProfile(this.controllerId, this.profileId, { isDefault: isDefault });
        }
    }

    doSetDefault(isDefault: boolean): boolean {
        if (this._isDefault !== isDefault) {
            this._isDefault = isDefault;
            this.onDidChangeDefaultEmitter.fire(isDefault);
            return true;
        }
        return false;
    }

    private onDidChangeDefaultEmitter = new Emitter<boolean>();
    onDidChangeDefault = this.onDidChangeDefaultEmitter.event;

    @observableProperty('notifyTagChange')
    tag: theia.TestTag | undefined;

    protected notifyTagChange(_property: keyof TestRunProfileDTO, value?: theia.TestTag): void {
        this.proxy.$updateTestRunProfile(this.controllerId, this.profileId, { tag: value ? value.toString() : '' });
    }

    @observableProperty('notifyConfigureHandlerChange')
    configureHandler: () => void | undefined;

    protected notifyConfigureHandlerChange(_property: keyof TestRunProfileDTO, value?: () => void): void {
        this.proxy.$updateTestRunProfile(this.controllerId, this.profileId, { canConfigure: !!value });
    }

    dispose(): void {
    }

}
