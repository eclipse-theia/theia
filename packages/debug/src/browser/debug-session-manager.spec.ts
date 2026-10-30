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
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { DebugPreferences } from '../common/debug-preferences';
import { DebugService } from '../common/debug-service';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugSession, DebugState } from './debug-session';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider';
import { DebugSessionContributionRegistry, DebugSessionFactory } from './debug-session-contribution';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationSessionOptions } from './debug-session-options';
import { DebugStackFrame } from './model/debug-stack-frame';

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
