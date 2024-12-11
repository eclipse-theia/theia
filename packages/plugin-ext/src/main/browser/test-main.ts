// *****************************************************************************
// Copyright (C) 2023 ST Microelectronics, Inc. and others.
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

import { SimpleObservableCollection, TreeCollection, observableProperty } from '@theia/test/lib/common/collections';
import {
    TestController, TestItem, TestOutputItem, TestRun, TestRunProfile, TestService, TestState, TestStateChangedEvent
} from '@theia/test/lib/browser/test-service';
import { TestExecutionProgressService } from '@theia/test/lib/browser/test-execution-progress-service';
import { AccumulatingTreeDeltaEmitter, CollectionDelta, DeltaKind, TreeDelta, TreeDeltaBuilder } from '@theia/test/lib/common/tree-delta';
import { Emitter, Location, Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { Range as PluginRange, Location as PluginLocation } from '../../common/plugin-api-rpc-model';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { CancellationToken, Disposable, Event, URI } from '@theia/core';
import { MAIN_RPC_CONTEXT, TestControllerUpdate, TestingExt, TestingMain } from '../../common';
import { RPCProtocol } from '../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';
import {
    TestExecutionState, TestItemDTO, TestItemReference, TestOutputDTO,
    TestRunDTO, TestRunProfileDTO, TestStateChangeDTO
} from '../../common/test-types';
import { TestRunProfileKind } from '../../plugin/types-impl';
import { CommandRegistryMainImpl } from './command-registry-main';

export class TestItemCollection extends TreeCollection<string, TestItemImpl, TestItemImpl | TestControllerImpl> {
    override add(item: TestItemImpl): TestItemImpl | undefined {
        item.realParent = this.owner;
        return super.add(item);
    }
}

export class TestItemImpl implements TestItem {
    update(value: Partial<TestItemDTO>): void {
        if ('label' in value) {
            this.label = value.label!;
        }

        if ('range' in value) {
            this.range = convertRange(value.range);
        }

        if ('sortKey' in value) {
            this.sortKey = value.sortKey!;
        }

        if ('tags' in value) {
            this.tags = value.tags!;
        }
        if ('busy' in value) {
            this.busy = value.busy!;
        }
        if ('sortKey' in value) {
            this.sortKey = value.sortKey;
        }
        if ('canResolveChildren' in value) {
            this.canResolveChildren = value.canResolveChildren!;
        }
        if ('description' in value) {
            this.description = value.description;
        }

        if ('error' in value) {
            this.error = value.error;
        }
    }

    constructor(readonly uri: URI, readonly id: string) {
        this.items = new TestItemCollection(this, (v: TestItemImpl) => v.path, (v: TestItemImpl) => v.deltaBuilder);
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

    get parent(): TestItem | undefined {
        const realParent = this.realParent;
        if (realParent instanceof TestItemImpl) {
            return realParent;
        }
        return undefined;
    }

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

    get controller(): TestControllerImpl | undefined {
        return this.realParent?.controller;
    }

    protected iterate(toDo: (v: TestItemImpl) => boolean): boolean {
        if (toDo(this)) {
            for (let i = 0; i < this.items.values.length; i++) {
                if (!this.items.values[i].iterate(toDo)) {
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

    items: TestItemCollection;
    get tests(): readonly TestItemImpl[] {
        return this.items.values;
    }

    resolveChildren(): void {
        if (this.canResolveChildren) {
            this.controller?.resolveChildren(this);
        }
    }
}

function itemToPath(item: TestItem): string[] {
    if (!(item instanceof TestItemImpl)) {
        throw new Error(`Not a TestItemImpl: ${item.id}`);
    }
    return item.path;
}

class TestRunProfileImpl implements TestRunProfile {

    label: string;

    private _isDefault: boolean;
    set isDefault(isDefault: boolean) {
        this._isDefault = isDefault;
        this.proxy.$onDidChangeDefault(this.controllerId, this.id, isDefault);
    }
    get isDefault(): boolean {
        return this._isDefault;
    }

    tag: string;
    canConfigure: boolean;

    update(update: Partial<TestRunProfileDTO>): void {
        if ('label' in update) {
            this.label = update.label!;
        }

        if ('isDefault' in update) {
            this._isDefault = update.isDefault!;
        }

        if ('tag' in update) {
            this.tag = update.tag!;
        }

        if ('canConfigure' in update) {
            this.canConfigure = update.canConfigure!;
        }

    }

    constructor(
        private proxy: TestingExt,
        private controllerId: string,
        readonly id: string,
        readonly kind: TestRunProfileKind,
        label: string,
        isDefault: boolean,
        tag: string) {

        this.label = label;
        this.isDefault = isDefault;
        this.tag = tag;
    }

    configure(): void {
        this.proxy.$onConfigureRunProfile(this.controllerId, this.id);
    }

    run(name: string, included: TestItem[], excluded: TestItem[], preserveFocus: boolean): void {
        this.proxy.$onRunControllerTests([{
            controllerId: this.controllerId,
            name,
            profileId: this.id,
            includedTests: included.map(item => itemToPath(item)),
            excludedTests: excluded.map(item => itemToPath(item)),
            preserveFocus
        }]);
    }
}

class TestRunImpl implements TestRun {
    private testStates: Map<TestItem, TestState> = new Map();
    private outputIndices: Map<TestItem, number[]> = new Map();
    private outputs: TestOutputItem[] = [];
    private onDidChangePropertyEmitter = new Emitter<{ name?: string; isRunning?: boolean; }>();
    onDidChangeProperty: Event<{ name?: string; isRunning?: boolean; }> = this.onDidChangePropertyEmitter.event;

    constructor(readonly controller: TestControllerImpl, readonly proxy: TestingExt, readonly id: string, name: string) {
        this.name = name;
        this.isRunning = false;
    }

    @observableProperty('notifyPropertyChange')
    isRunning: boolean;

    @observableProperty('notifyPropertyChange')
    name: string;

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

    protected notifyPropertyChange(property: 'name' | 'isRunning', value: unknown): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        this.onDidChangePropertyEmitter.fire(val);
    }

    cancel(): void {
        this.proxy.$onCancelTestRun(this.controller.id, this.id);
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

    applyChanges(stateChanges: TestStateChangeDTO[], outputChanges: TestOutputDTO[]): void {
        const stateEvents: TestStateChangedEvent[] = [];
        stateChanges.forEach(change => {
            const item = this.controller.findItem(change.itemPath);
            if (item) {
                const oldState = this.testStates.get(item);
                this.testStates.set(item, change);
                stateEvents.push({ test: item, oldState: oldState, newState: change });
            }
        });
        const outputEvents: [TestItem | undefined, TestOutputItem][] = [];
        outputChanges.forEach(change => {
            const output = {
                output: change.output,
                location: convertLocation(change.location)
            };
            this.outputs.push(output);
            let item = undefined;
            if (change.itemPath) {
                item = this.controller.findItem(change.itemPath);
                if (item) {
                    let indices = this.outputIndices.get(item);
                    if (!indices) {
                        indices = [];
                        this.outputIndices.set(item, indices);
                    }
                    indices.push(this.outputs.length - 1);
                }
            }
            outputEvents.push([item, output]);
        });

        this.onDidChangeTestStateEmitter.fire(stateEvents);
        this.onDidChangeTestOutputEmitter.fire(outputEvents);
    }

    get items(): readonly TestItem[] {
        return [...this.testStates.keys()];
    }
}

function convertLocation(location: PluginLocation | undefined): Location | undefined {
    if (!location) {
        return undefined;
    }
    return {
        uri: location.uri.toString(),
        range: convertRange(location.range)
    };
}

interface TestCollectionHolder {
    items: TestItemCollection;
}

function convertRange(range: PluginRange): Range;
function convertRange(range: PluginRange | undefined): Range | undefined;
function convertRange(range: PluginRange | undefined): Range | undefined {
    if (range) {
        return {
            start: {
                line: range.startLineNumber,
                character: range.startColumn
            }, end: {
                line: range.endLineNumber,
                character: range.endColumn

            }
        };
    }
    return undefined;

}

class TestControllerImpl implements TestController {

    private _profiles = new SimpleObservableCollection<TestRunProfileImpl>();
    private _runs = new SimpleObservableCollection<TestRunImpl>();
    readonly deltaBuilder = new AccumulatingTreeDeltaEmitter<string, TestItemImpl>(300);
    canRefresh: boolean;
    private canResolveChildren: boolean = false;
    readonly items = new TestItemCollection(this, item => item.path, () => this.deltaBuilder);

    constructor(private readonly proxy: TestingExt, readonly id: string, public label: string) {
    }
    refreshTests(token: CancellationToken): Promise<void> {
        return this.proxy.$refreshTests(this.id, token);
    }

    applyDelta(diff: TreeDelta<string, TestItemDTO>[]): void {
        this.applyDeltasToCollection(this, diff);
    }

    withProfile(profileId: string): TestRunProfileImpl {
        const profile = this._profiles.values.find(p => p.id === profileId);
        if (!profile) {
            throw new Error(`No test profile ${profileId} found in controller with id ${this.id} found`);
        }
        return profile;

    }

    withRun(runId: string): TestRunImpl {
        const run = this._runs.values.find(p => p.id === runId);
        if (!run) {
            throw new Error(`No test profile ${runId} found in controller with id ${this.id} found`);
        }
        return run;
    }

    protected applyDeltasToCollection(root: TestCollectionHolder, deltas: TreeDelta<string, TestItemDTO>[]): void {
        deltas.forEach(delta => this.applyDeltaToCollection(root, delta));
    }

    protected applyDeltaToCollection(root: TestCollectionHolder, delta: TreeDelta<string, TestItemDTO>): void {
        if (delta.type === DeltaKind.ADDED || delta.type === DeltaKind.REMOVED) {
            const node = this.findNodeInRoot(root, delta.path.slice(0, delta.path.length - 1), 0);
            if (node) {
                if (delta.type === DeltaKind.ADDED) {
                    node.items.add(this.createTestItem(delta.value! as TestItemDTO));
                } else {
                    node.items.remove(delta.path[delta.path.length - 1]);
                }
            }
        } else {
            const node = this.findNodeInRoot(root, delta.path, 0);
            if (node) {
                if (delta.type === DeltaKind.CHANGED) {
                    (node as TestItemImpl).update(delta.value!);
                }
                if (delta.childDeltas) {
                    this.applyDeltasToCollection(node, delta.childDeltas);
                }
            }
        }
    }

    findItem(path: string[]): TestItemImpl | undefined {
        if (path.length === 0) {
            console.warn('looking for item with zero-path');
            return undefined;
        }
        return this.findNodeInRoot(this, path, 0) as TestItemImpl;
    }

    protected findNodeInRoot(root: TestCollectionHolder, path: string[], startIndex: number): TestCollectionHolder | undefined {
        if (startIndex >= path.length) {
            return root;
        }
        const child = root.items.get(path[startIndex]);
        if (!child) {
            return undefined;
        }
        return this.findNodeInRoot(child, path, startIndex + 1);
    }

    protected createTestItem(value: TestItemDTO): TestItemImpl {
        const item = new TestItemImpl(URI.fromComponents(value.uri!), value?.id!);

        item.update(value);

        value.children?.forEach(child => item.items.add(this.createTestItem(child)));

        return item;
    }

    get controller(): TestControllerImpl {
        return this;
    }

    get testRunProfiles(): readonly TestRunProfile[] {
        return this._profiles.values;
    }

    update(change: Partial<TestControllerUpdate>): void {
        if ('canRefresh' in change) {
            this.canRefresh = change.canRefresh!;
        }
        if ('canResolve' in change) {
            this.canResolveChildren = change.canResolve!;
        }
        if ('label' in change) {
            this.label = change.label!;
        }
    }

    addProfile(profile: TestRunProfileImpl): void {
        this._profiles.add(profile);
    }

    addRun(runId: string, runName: string, isRunning: boolean): TestRunImpl {
        const run = new TestRunImpl(this, this.proxy, runId, runName);
        run.isRunning = isRunning;
        this._runs.add(run);
        return run;
    }

    onProfilesChanged: Event<CollectionDelta<TestRunProfile, TestRunProfile>> = this._profiles.onChanged;

    removeProfile(profileId: string): void {
        this._profiles.remove(this.withProfile(profileId));
    }

    get testRuns(): readonly TestRun[] {
        return this._runs.values;
    }
    onRunsChanged: Event<CollectionDelta<TestRun, TestRun>> = this._runs.onChanged;

    get tests(): readonly TestItemImpl[] {
        return this.items.values;
    }
    onItemsChanged: Event<TreeDelta<string, TestItemImpl>[]> = this.deltaBuilder.onDidFlush;

    resolveChildren(item: TestItem): void {
        if (this.canResolveChildren) {
            this.proxy.$onResolveChildren(this.id, itemToPath(item));
        }
    }

    clearRuns(): void {
        this._runs.clear();
    }
}

export class TestingMainImpl implements TestingMain {
    private testService: TestService;
    private testExecutionProgressService: TestExecutionProgressService;
    private controllerRegistrations = new Map<string, [TestControllerImpl, Disposable]>();
    private proxy: TestingExt;
    canRefresh: boolean;

    constructor(rpc: RPCProtocol, container: interfaces.Container, commandRegistry: CommandRegistryMainImpl) {
        this.testService = container.get(TestService);
        this.testExecutionProgressService = container.get(TestExecutionProgressService);
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TESTING_EXT);
        commandRegistry.registerArgumentProcessor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            processArgument(arg: any): any {
                if (arg instanceof TestItemImpl) {
                    if (!arg.controller || !arg.path) {
                        throw new Error(`Passing unattached test item ${arg.id} as a command argument`);
                    }
                    return TestItemReference.create(arg.controller.id, arg.path);
                }
                return arg;
            }
        });
    }

    $registerTestController(controllerId: string, label: string): void {
        const controller = new TestControllerImpl(this.proxy, controllerId, label);
        this.controllerRegistrations.set(controllerId, [controller, this.testService.registerTestController(controller)]);
    }
    $updateController(controllerId: string, patch: Partial<TestControllerUpdate>): void {
        this.withController(controllerId).update(patch);
    }

    $unregisterTestController(controllerId: string): void {
        const registered = this.controllerRegistrations.get(controllerId);
        if (registered) {
            this.controllerRegistrations.delete(controllerId);
            registered[1].dispose();
        }
    }

    private withController(controllerId: string): TestControllerImpl {
        const registration = this.controllerRegistrations.get(controllerId);
        if (!registration) {
            throw new Error(`No test controller with id ${controllerId} found`);
        }
        return registration[0];
    }

    $notifyDelta(controllerId: string, diff: TreeDelta<string, TestItemDTO>[]): void {
        this.withController(controllerId).applyDelta(diff);
    }

    $notifyTestRunProfileCreated(controllerId: string, profile: TestRunProfileDTO): void {
        const registration = this.controllerRegistrations.get(controllerId);
        if (!registration) {
            throw new Error(`No test controller with id ${controllerId} found`);
        }
        registration[0].addProfile(new TestRunProfileImpl(this.proxy, controllerId, profile.id, profile.kind, profile.label, profile.isDefault, profile.tag));
    }

    $updateTestRunProfile(controllerId: string, profileId: string, update: Partial<TestRunProfileDTO>): void {
        this.withController(controllerId).withProfile(profileId).update(update);
    }
    $removeTestRunProfile(controllerId: string, profileId: string): void {
        this.withController(controllerId).removeProfile(profileId);
    }
    $notifyTestRunCreated(controllerId: string, run: TestRunDTO, preserveFocus: boolean): void {
        this.testExecutionProgressService.onTestRunRequested(preserveFocus);
        this.withController(controllerId).addRun(run.id, run.name, run.isRunning);
    }
    $notifyTestStateChanged(controllerId: string, runId: string, stateChanges: TestStateChangeDTO[], outputChanges: TestOutputDTO[]): void {
        this.withController(controllerId).withRun(runId).applyChanges(stateChanges, outputChanges);
    }

    $notifyTestRunEnded(controllerId: string, runId: string): void {
        this.withController(controllerId).withRun(runId).ended();
    }
}
