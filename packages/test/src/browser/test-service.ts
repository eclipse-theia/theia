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

import { ContributionProvider, Disposable, Emitter, Event } from '@theia/core/lib/common';
import { Location, Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { CollectionDelta, TreeDelta } from './tree-delta';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export enum TestRunProfileKind {
    Run = 1,
    Debug = 2,
    Coverage = 3
}

export interface TestRunProfile {
    readonly kind: TestRunProfileKind;
    readonly isDefault: boolean;
    readonly tags: string;
    run(): void;
    configure(): void;
}

export interface OutputEvent {
    readonly output: string;
    readonly location?: Location;
    readonly test?: TestItem;
}

export interface TestRun {
    cancel(): void;
    readonly name: string;
    readonly isRunning: boolean;
    readonly queued: TestItem[];
    readonly started: TestItem[];
    readonly skipped: TestItem[];
    readonly failures: TestFailure[];
    readonly errors: TestFailure[];
    readonly passed: TestSuccess[];

    readonly onQueued: Event<TestItem>;
    readonly onStarted: Event<TestItem>;
    readonly onSkipped: Event<TestItem>;
    readonly onFailed: Event<TestFailure>;
    readonly onErrored: Event<TestFailure>;
    readonly onPassed: Event<TestSuccess>;

    readonly onOutput: Event<OutputEvent>;
}

export interface TestFailure {
    readonly duration?: number;
    readonly item: TestItem;
    readonly messages: TestMessage[];
}

export interface TestSuccess {
    readonly duration?: number;
    readonly item: TestItem;
}

export interface TestMessage {
    readonly expected?: string;
    readonly actual?: string;
    readonly location: Location;
    readonly message: string | MarkdownString;
}

export interface TestItem {
    readonly id: string;
    readonly label: string;
    readonly range: Range;
    readonly sortKey?: string;
    readonly tags: string[];
    readonly uri: URI;
    readonly busy: boolean;
    readonly canResolveChildren: boolean;
    readonly children: readonly TestItem[];
    readonly description?: string;
    readonly error?: string | MarkdownString
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
}

export interface TestService {
    registerTestController(controller: TestController): Disposable;
    onControllersChanged: Event<CollectionDelta<string, TestController>>;
}

export const TestContribution = Symbol('TestContribution');

export interface TestContribution {
    registerTestControllers(service: TestService): void;
}

@injectable()
export class DefaultTestService implements TestService {
    private controllers: Map<string, TestController> = new Map();
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
        this.onControllersChangedEmitter.fire({ added: [controller] });
        return Disposable.create(() => {
            this.controllers.delete(controller.id);
            this.onControllersChangedEmitter.fire({ removed: [controller.id] });
        });
    }
}
