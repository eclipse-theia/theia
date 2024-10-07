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

import { CancellationToken, ContributionProvider, Disposable, Emitter, Event, QuickPickService, isObject, nls } from '@theia/core/lib/common';
import { CancellationTokenSource, Location, Range, Position, DocumentUri } from '@theia/core/shared/vscode-languageserver-protocol';
import { CollectionDelta, TreeDelta } from '../common/tree-delta';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { groupBy } from '../common/collections';
import { codiconArray } from '@theia/core/lib/browser';

export enum TestRunProfileKind {
    Run = 1,
    Debug = 2,
    Coverage = 3
}

export interface TestRunProfile {
    readonly kind: TestRunProfileKind;
    readonly label: string,
    isDefault: boolean;
    readonly canConfigure: boolean;
    readonly tag: string;
    run(name: string, included: readonly TestItem[], excluded: readonly TestItem[], preserveFocus: boolean): void;
    configure(): void;
}

export interface TestOutputItem {
    readonly output: string;
    readonly location?: Location;
}

export enum TestExecutionState {
    Queued = 1,
    Running = 2,
    Passed = 3,
    Failed = 4,
    Skipped = 5,
    Errored = 6
}

export interface TestMessage {
    readonly expected?: string;
    readonly actual?: string;
    readonly location?: Location;
    readonly message: string | MarkdownString;
    readonly contextValue?: string;
    readonly stackTrace?: TestMessageStackFrame[];
}

export interface TestMessageStackFrame {
    readonly label: string,
    readonly uri?: DocumentUri,
    readonly position?: Position,
}

export namespace TestMessage {
    export function is(obj: unknown): obj is TestMessage {
        return isObject<TestMessage>(obj) && (MarkdownString.is(obj.message) || typeof obj.message === 'string');
    }
}

export interface TestState {
    readonly state: TestExecutionState;
}

export interface TestFailure extends TestState {
    readonly state: TestExecutionState.Failed | TestExecutionState.Errored;
    readonly messages: TestMessage[];
    readonly duration?: number;
}

export namespace TestFailure {
    export function is(obj: unknown): obj is TestFailure {
        return isObject<TestFailure>(obj) && (obj.state === TestExecutionState.Failed || obj.state === TestExecutionState.Errored) && Array.isArray(obj.messages);
    }
}

export interface TestSuccess extends TestState {
    readonly state: TestExecutionState.Passed;
    readonly duration?: number;
}

export interface TestStateChangedEvent {
    test: TestItem;
    oldState: TestState | undefined;
    newState: TestState | undefined;
}

export interface TestRun {
    cancel(): void;
    readonly id: string;
    readonly name: string;
    readonly isRunning: boolean;
    readonly controller: TestController;

    onDidChangeProperty: Event<{ name?: string, isRunning?: boolean }>;

    getTestState(item: TestItem): TestState | undefined;
    onDidChangeTestState: Event<TestStateChangedEvent[]>;

    getOutput(item?: TestItem): readonly TestOutputItem[];
    onDidChangeTestOutput: Event<[TestItem | undefined, TestOutputItem][]>;

    readonly items: readonly TestItem[];
}

export namespace TestRun {
    export function is(obj: unknown): obj is TestRun {
        return isObject<TestRun>(obj)
            && typeof obj.cancel === 'function'
            && typeof obj.name === 'string'
            && typeof obj.isRunning === 'boolean'
            && typeof obj.controller === 'object'
            && typeof obj.onDidChangeProperty === 'function'
            && typeof obj.getTestState === 'function'
            && typeof obj.onDidChangeTestState === 'function'
            && typeof obj.onDidChangeTestState === 'function'
            && typeof obj.getOutput === 'function'
            && typeof obj.onDidChangeTestOutput === 'function'
            && Array.isArray(obj.items);
    }
}

export interface TestItem {
    readonly id: string;
    readonly label: string;
    readonly range?: Range;
    readonly sortKey?: string;
    readonly tags: string[];
    readonly uri?: URI;
    readonly busy: boolean;
    readonly tests: readonly TestItem[];
    readonly description?: string;
    readonly error?: string | MarkdownString;
    readonly parent: TestItem | undefined;
    readonly controller: TestController | undefined;
    readonly canResolveChildren: boolean;
    resolveChildren(): void;
    readonly path: string[];
}

export namespace TestItem {
    export function is(obj: unknown): obj is TestItem {
        return isObject<TestItem>(obj)
            && obj.id !== undefined
            && obj.label !== undefined
            && Array.isArray(obj.tags)
            && Array.isArray(obj.tests)
            && obj.busy !== undefined
            && obj.canResolveChildren !== undefined
            && typeof obj.resolveChildren === 'function';
    }
}

export interface TestController {
    readonly id: string;
    readonly label: string;
    readonly tests: readonly TestItem[];
    readonly testRunProfiles: readonly TestRunProfile[];
    readonly testRuns: readonly TestRun[];

    readonly onItemsChanged: Event<TreeDelta<string, TestItem>[]>;
    readonly onRunsChanged: Event<CollectionDelta<TestRun, TestRun>>;
    readonly onProfilesChanged: Event<CollectionDelta<TestRunProfile, TestRunProfile>>;

    refreshTests(token: CancellationToken): Promise<void>;
    clearRuns(): void;
}

export interface TestService {
    clearResults(): void;
    configureProfile(): void;
    selectDefaultProfile(): void;
    runTestsWithProfile(tests: TestItem[]): void;
    runTests(profileKind: TestRunProfileKind, tests: TestItem[]): void;
    runAllTests(profileKind: TestRunProfileKind): void;
    getControllers(): TestController[];
    registerTestController(controller: TestController): Disposable;
    onControllersChanged: Event<CollectionDelta<string, TestController>>;

    refresh(): void;
    cancelRefresh(): void;
    isRefreshing: boolean;
    onDidChangeIsRefreshing: Event<void>;
}

export namespace TestServices {
    export function withTestRun(service: TestService, controllerId: string, runId: string): TestRun {
        const controller = service.getControllers().find(c => c.id === controllerId);
        if (!controller) {
            throw new Error(`No test controller with id '${controllerId}' found`);
        }
        const run = controller.testRuns.find(r => r.id === runId);
        if (!run) {
            throw new Error(`No test run with id '${runId}' found`);
        }
        return run;
    }
}

export const TestContribution = Symbol('TestContribution');

export interface TestContribution {
    registerTestControllers(service: TestService): void;
}

export const TestService = Symbol('TestService');

@injectable()
export class DefaultTestService implements TestService {
    @inject(QuickPickService) quickpickService: QuickPickService;

    private testRunCounter = 0;

    private onDidChangeIsRefreshingEmitter = new Emitter<void>();
    onDidChangeIsRefreshing: Event<void> = this.onDidChangeIsRefreshingEmitter.event;

    private controllers: Map<string, TestController> = new Map();
    private refreshing: Set<CancellationTokenSource> = new Set();
    private onControllersChangedEmitter = new Emitter<CollectionDelta<string, TestController>>();

    @inject(ContributionProvider) @named(TestContribution)
    protected readonly contributionProvider: ContributionProvider<TestContribution>;

    @postConstruct()
    protected registerContributions(): void {
        this.contributionProvider.getContributions().forEach(contribution => contribution.registerTestControllers(this));
    }

    onControllersChanged: Event<CollectionDelta<string, TestController>> = this.onControllersChangedEmitter.event;

    registerTestController(controller: TestController): Disposable {
        if (this.controllers.has(controller.id)) {
            throw new Error('TestController already registered: ' + controller.id);
        }
        this.controllers.set(controller.id, controller);
        this.onControllersChangedEmitter.fire({ added: [controller] });
        return Disposable.create(() => {
            this.controllers.delete(controller.id);
            this.onControllersChangedEmitter.fire({ removed: [controller.id] });
        });
    }

    getControllers(): TestController[] {
        return Array.from(this.controllers.values());
    }

    refresh(): void {
        const cts = new CancellationTokenSource();
        this.refreshing.add(cts);

        Promise.all(this.getControllers().map(controller => controller.refreshTests(cts.token))).then(() => {
            this.refreshing.delete(cts);
            if (this.refreshing.size === 0) {
                this.onDidChangeIsRefreshingEmitter.fire();
            }
        });

        if (this.refreshing.size === 1) {
            this.onDidChangeIsRefreshingEmitter.fire();
        }
    }

    cancelRefresh(): void {
        if (this.refreshing.size > 0) {
            this.refreshing.forEach(cts => cts.cancel());
            this.refreshing.clear();
            this.onDidChangeIsRefreshingEmitter.fire();
        }
    }

    get isRefreshing(): boolean {
        return this.refreshing.size > 0;
    }

    runAllTests(profileKind: TestRunProfileKind): void {
        this.getControllers().forEach(controller => {
            this.runTestForController(controller, profileKind, controller.tests);
        });
    }

    protected async runTestForController(controller: TestController, profileKind: TestRunProfileKind, items: readonly TestItem[]): Promise<void> {
        const runProfiles = controller.testRunProfiles.filter(profile => profile.kind === profileKind);
        let activeProfile;
        if (runProfiles.length === 1) {
            activeProfile = runProfiles[0];
        } else if (runProfiles.length > 1) {
            const defaultProfile = runProfiles.find(p => p.isDefault);
            if (defaultProfile) {
                activeProfile = defaultProfile;
            } else {

                activeProfile = await this.pickProfile(runProfiles, nls.localizeByDefault('Pick a test profile to use'));
            }
        }
        if (activeProfile) {
            activeProfile.run(`Test run #${this.testRunCounter++}`, items, [], true);
        }
    }

    protected async pickProfile(runProfiles: readonly TestRunProfile[], title: string): Promise<TestRunProfile | undefined> {
        if (runProfiles.length === 0) {
            return undefined;
        }
        // eslint-disable-next-line arrow-body-style
        const picks = runProfiles.map(profile => {
            let iconClasses;
            if (profile.kind === TestRunProfileKind.Run) {
                iconClasses = codiconArray('run');
            } else if (profile.kind === TestRunProfileKind.Debug) {
                iconClasses = codiconArray('debug-alt');
            }
            return {
                iconClasses,
                label: `${profile.label}${profile.isDefault ? ' (default)' : ''}`,
                profile: profile
            };
        });

        return (await this.quickpickService.show(picks, { title: title }))?.profile;

    }

    protected async pickProfileKind(): Promise<TestRunProfileKind | undefined> {
        // eslint-disable-next-line arrow-body-style
        const picks = [{
            iconClasses: codiconArray('run'),
            label: 'Run',
            kind: TestRunProfileKind.Run
        }, {
            iconClasses: codiconArray('debug-alt'),
            label: 'Debug',
            kind: TestRunProfileKind.Debug
        }];

        return (await this.quickpickService.show(picks, { title: 'Select the kind of profiles' }))?.kind;

    }

    runTests(profileKind: TestRunProfileKind, items: TestItem[]): void {
        groupBy(items, item => item.controller).forEach((tests, controller) => {
            if (controller) {
                this.runTestForController(controller, profileKind, tests);
            }
        });
    }

    runTestsWithProfile(items: TestItem[]): void {
        groupBy(items, item => item.controller).forEach((tests, controller) => {
            if (controller) {
                this.pickProfile(controller.testRunProfiles, nls.localizeByDefault('Pick a test profile to use')).then(activeProfile => {
                    if (activeProfile) {
                        activeProfile.run(`Test run #${this.testRunCounter++}`, items, [], true);
                    }
                });
            }
        });
    }

    selectDefaultProfile(): void {
        this.pickProfileKind().then(kind => {
            const profiles = this.getControllers().flatMap(c => c.testRunProfiles).filter(profile => profile.kind === kind);
            this.pickProfile(profiles, nls.localizeByDefault('Pick a test profile to use')).then(activeProfile => {
                if (activeProfile) {
                    // only change the default for the controller containing selected profile for default and its profiles with same kind
                    const controller = this.getControllers().find(c => c.testRunProfiles.includes(activeProfile));
                    controller?.testRunProfiles.filter(profile => profile.kind === activeProfile.kind).forEach(profile => {
                        profile.isDefault = profile === activeProfile;
                    });
                }
            });
        });
    }

    configureProfile(): void {
        const profiles: TestRunProfile[] = [];

        for (const controller of this.controllers.values()) {
            profiles.push(...controller.testRunProfiles);
        }
        ;
        this.pickProfile(profiles.filter(profile => profile.canConfigure), nls.localizeByDefault('Select a profile to update')).then(profile => {
            if (profile) {
                profile.configure();
            }
        });
    }

    clearResults(): void {
        for (const controller of this.controllers.values()) {
            controller.clearRuns();
        }
    }
}
