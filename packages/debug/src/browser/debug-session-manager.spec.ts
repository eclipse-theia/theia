// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Container, interfaces } from '@theia/core/shared/inversify';
import { ILogger, MessageService, ProgressService } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService, ContextKeyServiceDummyImpl, ContextKeyValue } from '@theia/core/lib/browser/context-key-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { Disposable } from '@theia/core/lib/common/disposable';
import { Emitter } from '@theia/core/lib/common/event';
import { QuickOpenTask } from '@theia/task/lib/browser/quick-open-task';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskIdentifier } from '@theia/task/lib/common';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { DebugConfiguration } from '../common/debug-common.js';
import { DebugPreferences } from '../common/debug-preferences.js';
import { DebugService } from '../common/debug-service.js';
import { BreakpointManager } from './breakpoint/breakpoint-manager.js';
import { DebugConfigurationManager } from './debug-configuration-manager.js';
import { DebugSession, DebugState } from './debug-session.js';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider.js';
import { DebugSessionContributionRegistry, DebugSessionFactory } from './debug-session-contribution.js';
import { DebugSessionManager } from './debug-session-manager.js';
import { DebugConfigurationSessionOptions, InternalDebugSessionOptions } from './debug-session-options.js';
import { DebugStackFrame } from './model/debug-stack-frame.js';

disableJSDOM();

class MockContextKeyService extends ContextKeyServiceDummyImpl {
    readonly values = new Map<string, unknown>();
    override createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): ContextKey<T> {
        this.values.set(key, defaultValue);
        return {
            set: (value: T | undefined) => { this.values.set(key, value); },
            reset: () => { this.values.set(key, defaultValue); },
            get: () => this.values.get(key) as T | undefined
        };
    }
}

/** The parts of a `DebugSession` that the manager uses, with the events driven by the test. */
class TestDebugSession {
    readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    readonly onDidChangeCapabilitiesEmitter = new Emitter<void>();
    readonly onDidChangeCapabilities = this.onDidChangeCapabilitiesEmitter.event;
    readonly onDisposeEmitter = new Emitter<void>();
    readonly onDispose = this.onDisposeEmitter.event;
    readonly onDidResolveLazyVariable = new Emitter<void>().event;
    readonly onDidFocusStackFrame = new Emitter<void>().event;
    readonly onDidFocusThread = new Emitter<void>().event;
    readonly onDidCustomEvent = new Emitter<void>().event;

    readonly configuration = { type: 'node', name: this.id, request: 'launch' };
    readonly capabilities: DebugProtocol.Capabilities = {};
    readonly currentThread: { currentFrame: Partial<DebugStackFrame> | undefined } = { currentFrame: undefined };
    state = DebugState.Running;

    constructor(readonly id: string) { }

    on(): Disposable {
        return Disposable.NULL;
    }

    async start(): Promise<void> { }

    /** As the `initialize` response or a `capabilities` event of the debug adapter. */
    updateCapabilities(capabilities: DebugProtocol.Capabilities): void {
        Object.assign(this.capabilities, capabilities);
        this.onDidChangeCapabilitiesEmitter.fire();
    }

    /** Focuses a frame with the given `canRestart`, or no frame. */
    focusFrame(canRestart: boolean | undefined | 'none'): void {
        const { capabilities } = this;
        this.state = DebugState.Stopped;
        this.currentThread.currentFrame = canRestart === 'none' ? undefined : {
            // as in `DebugStackFrame`
            get isRestartable(): boolean {
                return !!capabilities.supportsRestartFrame && canRestart !== false;
            },
            thread: { stopped: false }
        } as Partial<DebugStackFrame>;
        this.onDidChangeEmitter.fire();
    }

    end(): void {
        this.state = DebugState.Inactive;
        this.onDisposeEmitter.fire();
    }
}

describe('DebugSessionManager', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('restart frame context keys', () => {

        let contextKeys: MockContextKeyService;
        let manager: DebugSessionManager;

        beforeEach(() => {
            contextKeys = new MockContextKeyService();
            const container = new Container();
            container.bind(ContextKeyService).toConstantValue(contextKeys);
            container.bind(DebugSessionFactory).toConstantValue({
                createSession: (sessionId: string) => new TestDebugSession(sessionId) as unknown as DebugSession
            });
            container.bind(DebugSessionContributionRegistry).toConstantValue({ get: () => undefined } as unknown as DebugSessionContributionRegistry);
            container.bind(BreakpointManager).toConstantValue({
                getDataBreakpoints: () => [],
                updateSessionData: () => { },
                clearExceptionSessionEnablement: () => { }
            } as unknown as BreakpointManager);
            container.bind(DebugPreferences).toConstantValue({} as DebugPreferences);
            // not used by these tests
            const services: interfaces.ServiceIdentifier<unknown>[] = [
                DebugService, VariableResolverService, MessageService, ProgressService, TaskService, DebugConfigurationManager,
                QuickOpenTask, ApplicationShell, DebugSessionConfigurationLabelProvider, ILogger, WorkspaceTrustService, WindowService
            ];
            for (const service of services) {
                container.bind(service).toConstantValue({});
            }
            container.bind(DebugSessionManager).toSelf().inSingletonScope();
            manager = container.get(DebugSessionManager);
        });

        async function startSession(id: string): Promise<TestDebugSession> {
            const options = { name: id, configuration: { type: 'node', name: id, request: 'launch' } } as DebugConfigurationSessionOptions;
            const session = await (manager as unknown as { doStart(id: string, options: DebugConfigurationSessionOptions): Promise<DebugSession> })
                .doStart(id, options) as unknown as TestDebugSession;
            // the manager makes the session current once it has started
            await session.start();
            return session;
        }

        function expectKeys(restartFrameSupported: boolean, stackFrameSupportsRestart: boolean): void {
            expect(contextKeys.values.get('restartFrameSupported'), 'restartFrameSupported').to.equal(restartFrameSupported);
            expect(contextKeys.values.get('stackFrameSupportsRestart'), 'stackFrameSupportsRestart').to.equal(stackFrameSupportsRestart);
        }

        it('follows the focused frame of the current session', async () => {
            const session = await startSession('a');
            session.updateCapabilities({ supportsRestartFrame: true });
            expectKeys(true, false);

            session.focusFrame(undefined);
            expectKeys(true, true);

            session.focusFrame(false);
            expectKeys(true, false);

            session.focusFrame('none');
            expectKeys(true, false);
        });

        it('follows a change of the capabilities of the current session', async () => {
            const session = await startSession('a');
            session.focusFrame(undefined);
            expectKeys(false, false);

            session.updateCapabilities({ supportsRestartFrame: true });
            expectKeys(true, true);
        });

        it('ignores a change of the capabilities of another session', async () => {
            const current = await startSession('a');
            const other = await startSession('b');
            expect(manager.currentSession).to.equal(current);

            let changes = 0;
            manager.onDidChange(() => changes++);
            other.updateCapabilities({ supportsRestartFrame: true });
            expect(changes).to.equal(0);
            expectKeys(false, false);
        });

        it('follows a switch to another session', async () => {
            const current = await startSession('a');
            const other = await startSession('b');
            current.focusFrame(false);
            other.updateCapabilities({ supportsRestartFrame: true });
            other.focusFrame(undefined);
            expectKeys(false, false);

            manager.currentSession = other as unknown as DebugSession;
            expectKeys(true, true);
        });

        it('is reset when the session ends', async () => {
            const session = await startSession('a');
            session.updateCapabilities({ supportsRestartFrame: true });
            session.focusFrame(undefined);
            expectKeys(true, true);

            session.end();
            expect(manager.currentSession).to.be.undefined;
            expectKeys(false, false);
        });
    });
});

const LAUNCH: DebugConfiguration = { name: 'Debug', type: 'node', request: 'launch', program: '${file}', preLaunchTask: 'build' };

class TestDebugSessionManager extends DebugSessionManager {
    readonly tasks: string[] = [];
    readonly steps: string[] = [];
    readonly started: DebugConfigurationSessionOptions[] = [];
    taskSucceeds = true;
    resolvedName: string | undefined;
    launchConfiguration: DebugConfiguration = LAUNCH;

    protected override readonly debugConfigurationManager = {
        findConfiguration: (name: string) => name === this.launchConfiguration.name ? this.launchConfiguration : undefined
    } as unknown as DebugConfigurationManager;

    protected override async runTask(_workspaceFolderUri: string | undefined, taskName: string | TaskIdentifier | undefined): Promise<boolean> {
        if (taskName) {
            this.tasks.push(String(taskName));
            this.steps.push('task');
        }
        return this.taskSucceeds;
    }

    protected override readonly workspaceTrustService = { requestWorkspaceTrust: async () => true } as unknown as WorkspaceTrustService;
    protected override readonly progressService = { withProgress: (_: string, __: string, run: () => Promise<unknown>) => run() } as unknown as ProgressService;
    protected override readonly sessionConfigurationLabelProvider = {
        getLabel: () => LAUNCH.name
    } as unknown as DebugSessionConfigurationLabelProvider;
    protected override readonly debug = {
        createDebugSession: async () => 'new-session',
        terminateDebugSession: async () => { },
        provideDebuggerVariables: async () => ({})
    } as unknown as DebugService;
    protected override readonly variableResolver = {
        resolve: async (configuration: DebugConfiguration) => configuration
    } as unknown as VariableResolverService;

    protected override async resolveDebugConfiguration(configuration: DebugConfiguration): Promise<DebugConfiguration> {
        return { ...configuration, name: this.resolvedName ?? configuration.name, program: '/resolved/' + configuration.program };
    }

    protected override async resolveDebugConfigurationWithSubstitutedVariables(configuration: DebugConfiguration): Promise<DebugConfiguration> {
        return configuration;
    }

    protected override async saveAll(): Promise<boolean> {
        this.steps.push('save');
        return true;
    }

    protected override async fireWillStartDebugSession(): Promise<void> { }

    protected override async doStart(_sessionId: string, options: DebugConfigurationSessionOptions): Promise<DebugSession> {
        this.started.push(options);
        return {} as DebugSession;
    }

    async createSession(configuration: DebugConfiguration, supportsRestart = true): Promise<FakeSession> {
        const options = await this.resolveConfiguration({ name: configuration.name, configuration });
        return new FakeSession(options as InternalDebugSessionOptions & DebugConfigurationSessionOptions, supportsRestart);
    }

    restartRequestedByAdapter(session: DebugSession): Promise<DebugSession | undefined> {
        return this.doRestart(session, true, false);
    }
}

class FakeSession {
    readonly restarts: (DebugConfigurationSessionOptions | undefined)[] = [];
    stopped = false;

    constructor(public options: InternalDebugSessionOptions & DebugConfigurationSessionOptions, readonly supportsRestart: boolean) { }

    get configuration(): DebugConfiguration {
        return this.options.configuration;
    }

    canRestart(): boolean {
        return this.supportsRestart;
    }

    async restart(options?: DebugConfigurationSessionOptions): Promise<void> {
        this.restarts.push(options);
    }

    async stop(): Promise<void> {
        this.stopped = true;
    }
}

describe('DebugSessionManager restart', () => {
    let manager: TestDebugSessionManager;

    beforeEach(() => {
        manager = new TestDebugSessionManager();
    });

    it('runs the preLaunchTask and restarts with the session configuration when the user restarts', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal(['build']);
        expect(fake.restarts).to.deep.equal([fake.options]);
    });

    it('saves before it runs the preLaunchTask', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.steps.length = 0;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.steps).to.deep.equal(['save', 'task']);
    });

    it('does not restart when the preLaunchTask fails', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.taskSucceeds = false;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts).to.deep.equal([]);
    });

    it('restarts without running tasks when the adapter asks for it', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartRequestedByAdapter(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal([]);
        expect(fake.restarts).to.deep.equal([fake.options]);
    });

    it('starts again as a new launch, so the preLaunchTask runs, when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);
        fake.options.configuration.__restart = true;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.stopped).to.equal(true);
        expect(manager.tasks).to.deep.equal(['build']);
        expect(manager.started).to.have.length(1);
        expect(manager.started[0].configuration).to.not.have.property('__restart');
    });

    it('marks an adapter-requested restart, so the preLaunchTask does not run, when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);

        await manager.restartRequestedByAdapter(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal([]);
        expect(manager.started[0].configuration.__restart).to.equal(true);
        expect(fake.options.configuration).to.not.have.property('__restart');
    });

    it('resolves the launch configuration again when it changed since the session started', async () => {
        await manager.createSession(LAUNCH);
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts).to.have.length(1);
        expect(fake.restarts[0]!.configuration.program).to.equal('/resolved/other.js');
        expect((fake.restarts[0] as InternalDebugSessionOptions).id).to.equal(1);
    });

    it('keeps the resolved configuration when the launch configuration did not change', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]).to.equal(fake.options);
    });

    it('uses the changed preLaunchTask and drops keys removed from the launch configuration', async () => {
        manager.launchConfiguration = { ...LAUNCH, stopOnEntry: true };
        const fake = await manager.createSession({ ...manager.launchConfiguration, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, preLaunchTask: 'rebuild' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal(['rebuild']);
        expect(fake.restarts[0]!.configuration).to.not.have.property('stopOnEntry');
    });

    it('resolves the launch configuration again when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.started[0].configuration.program).to.equal('/resolved/other.js');
    });

    it('compares a later restart with the launch configuration it restarted with', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };
        await manager.restartSession(fake as unknown as DebugSession);
        fake.options = fake.restarts[0] as FakeSession['options'];

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[1]).to.equal(fake.options);
    });

    it('keeps what the session added to the launch configuration when it resolves it again', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: true, parentSessionId: 'parent' });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]!.configuration).to.include({ program: '/resolved/other.js', noDebug: true, parentSessionId: 'parent' });
    });

    it('finds the launch configuration by its own name when a resolver renamed the session', async () => {
        manager.resolvedName = 'Debug (renamed)';
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]!.configuration.program).to.equal('/resolved/other.js');
    });

    it('does not replace a configuration that only shares its name with the launch configuration', async () => {
        const fake = await manager.createSession({ ...LAUNCH, program: 'inline.js' });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]).to.equal(fake.options);
    });

    it('does not use up a session number when it resolves the configuration again', async () => {
        const fake = await manager.createSession(LAUNCH);
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };
        await manager.restartSession(fake as unknown as DebugSession);

        const next = await manager.createSession(manager.launchConfiguration);

        expect((next.options as InternalDebugSessionOptions).id).to.equal(1);
    });
});

describe('DebugSession restart', () => {
    it('sends the configuration as the restart arguments', async () => {
        const requests: [string, unknown][] = [];
        const options: DebugConfigurationSessionOptions = { name: LAUNCH.name, configuration: { ...LAUNCH, program: '/new' } };
        const debugSession = Object.assign(Object.create(DebugSession.prototype), {
            data: { options: { name: LAUNCH.name, configuration: LAUNCH } },
            canRestart: () => true,
            sendRequest: async (command: string, args: unknown) => { requests.push([command, args]); }
        }) as DebugSession;

        await debugSession.restart(options);

        expect(requests).to.deep.equal([['restart', { arguments: options.configuration }]]);
        expect(debugSession.options).to.equal(options);
    });
});
