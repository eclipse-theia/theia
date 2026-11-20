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

/** A debug adapter that answers requests, and lets tests simulate connection closes or failures. */
class TestDebugChannel implements DebugChannel {
    protected messageHandler: (message: string) => void = () => { };
    protected closeHandler: (code: number, reason: string) => void = () => { };
    readonly sentRequests: DebugProtocol.Request[] = [];
    onRequest?: (request: DebugProtocol.Request) => void;

    constructor(protected readonly capabilities: DebugProtocol.Capabilities) { }

    send(content: string): void {
        const request: DebugProtocol.Request = JSON.parse(content);
        this.sentRequests.push(request);
        if (this.onRequest) {
            this.onRequest(request);
            return;
        }
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
        this.closeHandler(0, '');
    }
}

describe('DebugSession', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function createSession(channel: TestDebugChannel): DebugSession {
        const container = new Container();
        container.bind(BreakpointManager).toConstantValue({
            onDidChangeMarkers: Event.None,
            getExceptionBreakpoints: () => []
        } as unknown as BreakpointManager);
        container.bind(ContributionProvider).toConstantValue({ getContributions: () => [] }).whenTargetNamed(DebugContribution);
        container.bind(DebugPreferences).toConstantValue({} as DebugPreferences);
        // not used by these tests
        const services: interfaces.ServiceIdentifier<unknown>[] = [
            CommandService, ILogger, TestService, DebugSessionManager, TerminalService, EditorManager, LabelProvider, MessageClient, FileService, WorkspaceService
        ];
        for (const service of services) {
            container.bind(service).toConstantValue({});
        }
        const options = { name: 'test', configuration: { type: 'node', name: 'test', request: 'launch' } } as DebugConfigurationSessionOptions;
        const data: DebugSessionData = { id: 'test', options, parentSession: undefined };
        const connection = new DebugSessionConnection('test', async () => channel, undefined);
        return DebugSession.createContainer(container, data, connection).get(DebugSession);
    }

    describe('onDidChangeCapabilities', () => {

        let channel: TestDebugChannel;
        let session: DebugSession;
        let changes: number;

        beforeEach(() => {
            channel = new TestDebugChannel({ supportsRestartFrame: true });
            session = createSession(channel);
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

        it('runs the callback without sending disconnect when the connection is already closed', async () => {
            const channel = new TestDebugChannel({});
            const session = createSession(channel);
            await session.start();
            channel.sentRequests.length = 0;
            channel.close();

            let callbackCalls = 0;
            await session.disconnect(false, () => { callbackCalls++; });

            expect(channel.sentRequests).to.deep.equal([]);
            expect(callbackCalls).to.equal(1);
        });

        it('runs the callback when the connection closes before replying to disconnect', async () => {
            const channel = new TestDebugChannel({});
            const session = createSession(channel);
            await session.start();
            channel.sentRequests.length = 0;
            channel.onRequest = request => {
                if (request.command === 'disconnect') {
                    channel.close();
                }
            };

            let callbackCalls = 0;
            await session.disconnect(false, () => { callbackCalls++; });

            expect(channel.sentRequests.map(req => req.command)).to.deep.equal(['disconnect']);
            expect(callbackCalls).to.equal(1);
        });

        it('rejects without running the callback when disconnect fails on an active connection', async () => {
            const channel = new TestDebugChannel({});
            const session = createSession(channel);
            await session.start();
            channel.onRequest = request => {
                const response: DebugProtocol.Response = {
                    type: 'response',
                    seq: 0,
                    request_seq: request.seq,
                    command: request.command,
                    success: false,
                    message: 'disconnect failed'
                };
                channel.receive(response);
            };

            let callbackCalls = 0;
            let error: unknown;
            try {
                await session.disconnect(false, () => { callbackCalls++; });
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('object').and.have.property('message', 'disconnect failed');
            expect(callbackCalls).to.equal(0);
        });
    });
});
