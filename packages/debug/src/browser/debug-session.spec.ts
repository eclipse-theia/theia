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
import { CommandService, ContributionProvider, ILogger, MessageClient } from '@theia/core';
import { LabelProvider } from '@theia/core/lib/browser';
import { Event } from '@theia/core/lib/common/event';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TestService } from '@theia/test/lib/browser/test-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { DebugPreferences } from '../common/debug-preferences.js';
import { DebugChannel } from '../common/debug-service.js';
import { BreakpointManager } from './breakpoint/breakpoint-manager.js';
import { DebugContribution } from './debug-contribution.js';
import { DebugSession, DebugSessionData } from './debug-session.js';
import { DebugSessionConnection } from './debug-session-connection.js';
import { DebugSessionManager } from './debug-session-manager.js';
import { DebugConfigurationSessionOptions } from './debug-session-options.js';

disableJSDOM();

/** A debug adapter that answers every request successfully, and the `initialize` request with the given capabilities. */
class TestDebugChannel implements DebugChannel {
    readonly sentCommands: string[] = [];
    protected messageHandler: (message: string) => void = () => { };

    constructor(protected readonly capabilities: DebugProtocol.Capabilities) { }

    send(content: string): void {
        const request: DebugProtocol.Request = JSON.parse(content);
        this.sentCommands.push(request.command);
        const body = request.command === 'initialize' ? this.capabilities : {};
        const response: DebugProtocol.Response = { type: 'response', seq: 0, request_seq: request.seq, command: request.command, success: true, body };
        this.receive(response);
    }

    /** Sends a message of the debug adapter to Theia. */
    receive(message: DebugProtocol.ProtocolMessage): void {
        this.messageHandler(JSON.stringify(message));
    }

    onMessage(cb: (message: string) => void): void {
        this.messageHandler = cb;
    }

    onError(): void { }
    onClose(cb: (code: number, reason: string) => void): void {
        this.closeHandler = cb;
    }
    close(): void {
        if (this.closeHandler) {
            this.closeHandler(0, 'closed');
        }
    }
    private closeHandler?: (code: number, reason: string) => void;
}

describe('DebugSession', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function createSession(channel: TestDebugChannel): { session: DebugSession; connection: DebugSessionConnection; loggerErrors: unknown[][] } {
        const loggerErrors: unknown[][] = [];
        const container = new Container();
        container.bind(BreakpointManager).toConstantValue({ onDidChangeMarkers: Event.None } as unknown as BreakpointManager);
        container.bind(ContributionProvider).toConstantValue({ getContributions: () => [] }).whenTargetNamed(DebugContribution);
        container.bind(DebugPreferences).toConstantValue({} as DebugPreferences);
        container.bind(ILogger).toConstantValue({ error: (...args: unknown[]) => loggerErrors.push(args) } as unknown as ILogger);
        // not used by these tests
        const services: interfaces.ServiceIdentifier<unknown>[] = [
            CommandService, TestService, DebugSessionManager, TerminalService, EditorManager, LabelProvider, MessageClient, FileService, WorkspaceService
        ];
        for (const service of services) {
            container.bind(service).toConstantValue({});
        }
        const options = { name: 'test', configuration: { type: 'node', name: 'test', request: 'launch' } } as DebugConfigurationSessionOptions;
        const data: DebugSessionData = { id: 'test', options, parentSession: undefined };
        const connection = new DebugSessionConnection('test', async () => channel, undefined);
        const session = DebugSession.createContainer(container, data, connection).get(DebugSession);
        return { session, connection, loggerErrors };
    }

    describe('onDidChangeCapabilities', () => {

        let channel: TestDebugChannel;
        let session: DebugSession;
        let changes: number;

        beforeEach(() => {
            channel = new TestDebugChannel({ supportsRestartFrame: true });
            ({ session } = createSession(channel));
            changes = 0;
            session.onDidChangeCapabilities(() => changes++);
        });

        it('fires for the capabilities of the initialize response', async () => {
            await session.start();
            expect(changes).to.equal(1);
            expect(session.capabilities.supportsRestartFrame).to.be.true;
        });

        it('fires for a capabilities event', async () => {
            await session.start();
            channel.receive({ type: 'event', seq: 0, event: 'capabilities', body: { capabilities: { supportsRestartFrame: false } } } as DebugProtocol.CapabilitiesEvent);
            expect(changes).to.equal(2);
            expect(session.capabilities.supportsRestartFrame).to.be.false;
        });
    });

    describe('disconnect', () => {

        let channel: TestDebugChannel;
        let session: DebugSession;
        let connection: DebugSessionConnection;
        let loggerErrors: unknown[][];

        beforeEach(() => {
            channel = new TestDebugChannel({});
            ({ session, connection, loggerErrors } = createSession(channel));
        });

        it('executes callback and does not send request if connection is already closed', async () => {
            await session.start();
            channel.close();
            expect(connection.closed).to.be.true;

            let callbackCalled = false;
            await session.disconnect(false, () => {
                callbackCalled = true;
            });

            expect(callbackCalled).to.be.true;
            expect(channel.sentCommands).to.not.include('disconnect');
        });

        it('executes callback when connection closes while disconnect request is in flight', async () => {
            await session.start();
            // Override channel.send to close connection instead of replying
            channel.send = content => {
                const request: DebugProtocol.Request = JSON.parse(content);
                channel.sentCommands.push(request.command);
                channel.close();
            };

            let callbackCalled = false;
            await session.disconnect(false, () => {
                callbackCalled = true;
            });

            expect(callbackCalled).to.be.true;
            expect(connection.closed).to.be.true;
        });

        it('executes callback and logs error when error happens on an active connection', async () => {
            await session.start();
            // Send an error response while connection remains open
            channel.send = content => {
                const request: DebugProtocol.Request = JSON.parse(content);
                channel.sentCommands.push(request.command);
                const response: DebugProtocol.Response = {
                    type: 'response',
                    seq: 0,
                    request_seq: request.seq,
                    command: request.command,
                    success: false,
                    message: 'Adapter failure on active connection'
                };
                channel.receive(response);
            };

            let callbackCalled = false;
            await session.disconnect(false, () => {
                callbackCalled = true;
            });

            expect(callbackCalled).to.be.true;
            expect(connection.closed).to.be.false;
            expect(channel.sentCommands).to.include('disconnect');
            expect(loggerErrors).to.have.lengthOf(1);
        });
    });
});
