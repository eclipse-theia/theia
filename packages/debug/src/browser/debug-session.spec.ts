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
import { DebugPreferences } from '../common/debug-preferences';
import { DebugChannel } from '../common/debug-service';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugContribution } from './debug-contribution';
import { DebugSession, DebugSessionData } from './debug-session';
import { DebugSessionConnection } from './debug-session-connection';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationSessionOptions } from './debug-session-options';

disableJSDOM();

/** A debug adapter that answers every request successfully, and the `initialize` request with the given capabilities. */
class TestDebugChannel implements DebugChannel {
    protected messageHandler: (message: string) => void = () => { };

    constructor(protected readonly capabilities: DebugProtocol.Capabilities) { }

    send(content: string): void {
        const request: DebugProtocol.Request = JSON.parse(content);
        const body = request.command === 'initialize' ? this.capabilities : {};
        this.receive({ type: 'response', seq: 0, request_seq: request.seq, command: request.command, success: true, body });
    }

    /** Sends a message of the debug adapter to Theia. */
    receive(message: DebugProtocol.ProtocolMessage): void {
        this.messageHandler(JSON.stringify(message));
    }

    onMessage(cb: (message: string) => void): void {
        this.messageHandler = cb;
    }

    onError(): void { }
    onClose(): void { }
    close(): void { }
}

describe('DebugSession', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('onDidChangeCapabilities', () => {

        let channel: TestDebugChannel;
        let session: DebugSession;
        let changes: number;

        beforeEach(() => {
            channel = new TestDebugChannel({ supportsRestartFrame: true });
            const container = new Container();
            container.bind(BreakpointManager).toConstantValue({ onDidChangeMarkers: Event.None } as unknown as BreakpointManager);
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
            session = DebugSession.createContainer(container, data, connection).get(DebugSession);
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
});
