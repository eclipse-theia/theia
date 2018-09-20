/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import * as net from 'net';
import { injectable, inject, named } from 'inversify';
import { ILogger, DisposableCollection, Disposable } from '@theia/core';
import {
    DebugSessionState,
    DebugSessionStateAccumulator,
    ExtDebugProtocol
} from '../common/debug-common';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from '@theia/process/lib/node';
import {
    DebugAdapterExecutable,
    CommunicationProvider,
    DebugAdapterSession,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { EventEmitter } from 'events';
import { WebSocketChannel } from '@theia/core/lib/common/messaging/web-socket-channel';

/**
 * [DebugAdapterFactory](#DebugAdapterFactory) implementation based on
 * launching the debug adapter as separate process.
 */
@injectable()
export class LaunchBasedDebugAdapterFactory implements DebugAdapterFactory {
    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;
    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    start(executable: DebugAdapterExecutable): CommunicationProvider {
        const process = this.spawnProcess(executable);

        return {
            input: process.input,
            output: process.output,
            dispose: () => process.kill()
        };
    }

    private spawnProcess(executable: DebugAdapterExecutable): RawProcess {
        const command = executable.runtime
            ? executable.runtime
            : executable.program;

        const args = executable.runtime
            ? [executable.program].concat(executable.args ? executable.args : [])
            : executable.args;

        return this.processFactory({ command: command, args: args, options: { stdio: ['pipe', 'pipe', 2] } });
    }

    connect(debugServerPort: number): CommunicationProvider {
        const socket = net.createConnection(debugServerPort);
        return {
            input: socket,
            output: socket,
            dispose: () => socket.end()
        };
    }
}

/**
 * [DebugAdapterSession](#DebugAdapterSession) implementation.
 */
export class DebugAdapterSessionImpl extends EventEmitter implements DebugAdapterSession {
    readonly state: DebugSessionState;

    private static TWO_CRLF = '\r\n\r\n';

    private readonly toDispose = new DisposableCollection();
    private pendingRequests = new Map<number, DebugProtocol.Request>();
    private channel: WebSocketChannel | undefined;
    private contentLength: number;
    private buffer: Buffer;

    constructor(
        readonly id: string,
        protected readonly communicationProvider: CommunicationProvider,
        protected readonly logger: ILogger
    ) {
        super();

        this.contentLength = -1;
        this.buffer = new Buffer(0);
        this.state = new DebugSessionStateAccumulator(this);
        this.toDispose.push(this.communicationProvider);
        this.toDispose.push(Disposable.create(() => this.pendingRequests.clear()));
        // Node.js process crashes if there is no listeners for error event
        this.on('error', console.error);
    }

    async start(channel: WebSocketChannel): Promise<void> {
        if (this.channel) {
            throw new Error('The session has already been started, id: ' + this.id);
        }
        this.channel = channel;
        this.channel.onClose(() => this.channel = undefined);

        this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
        this.communicationProvider.output.on('close', () => this.onDebugAdapterClosed());
        this.communicationProvider.output.on('error', (error: Error) => this.onDebugAdapterError(error));
        this.communicationProvider.input.on('error', (error: Error) => this.onDebugAdapterError(error));

        this.channel.onMessage((data: string) => this.proceedRequest(data));
    }

    protected onDebugAdapterClosed(): void {
        const event: DebugProtocol.Event = {
            type: 'event',
            event: 'terminated',
            seq: -1
        };
        this.proceedEvent(JSON.stringify(event), event);
    }

    protected onDebugAdapterError(error: Error): void {
        const event: DebugProtocol.Event = {
            type: 'event',
            event: 'error',
            seq: -1,
            body: error
        };
        this.proceedEvent(JSON.stringify(event), event);
    }

    protected handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (true) {
            if (this.contentLength >= 0) {
                if (this.buffer.length >= this.contentLength) {
                    const rawData = this.buffer.toString('utf8', 0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.contentLength = -1;

                    if (rawData.length > 0) {
                        const message = JSON.parse(rawData) as DebugProtocol.ProtocolMessage;
                        if (message.type === 'event') {
                            this.proceedEvent(rawData, message as DebugProtocol.Event);
                        } else if (message.type === 'response') {
                            this.proceedResponse(rawData, message as DebugProtocol.Response);
                        } else if (this.channel) {
                            this.channel.send(rawData);
                        }
                    }
                    continue;	// there may be more complete messages to process
                }
            } else {
                const idx = this.buffer.indexOf(DebugAdapterSessionImpl.TWO_CRLF);
                if (idx !== -1) {
                    const header = this.buffer.toString('utf8', 0, idx);
                    const lines = header.split('\r\n');
                    for (let i = 0; i < lines.length; i++) {
                        const pair = lines[i].split(/: +/);
                        if (pair[0] === 'Content-Length') {
                            this.contentLength = +pair[1];
                        }
                    }
                    this.buffer = this.buffer.slice(idx + DebugAdapterSessionImpl.TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }

    protected proceedEvent(rawData: string, event: DebugProtocol.Event): void {
        this.logger.debug(log => log(`DAP event:\n${JSON.stringify(event, undefined, 2)}`));

        this.emit(event.event, event);
        if (this.channel) {
            this.channel.send(rawData);
        }
    }

    protected proceedResponse(rawData: string, response: DebugProtocol.Response): void {
        this.logger.debug(log => log(`DAP Response:\n${JSON.stringify(response, undefined, 2)}`));

        const request = this.pendingRequests.get(response.request_seq);

        this.pendingRequests.delete(response.request_seq);
        if (this.channel) {
            this.channel.send(rawData);
        }

        if (response.success) {
            switch (response.command) {
                case 'attach':
                case 'launch': {
                    const event: ExtDebugProtocol.ConnectedEvent = {
                        type: 'event',
                        seq: -1,
                        event: 'connected'
                    };
                    this.proceedEvent(JSON.stringify(event), event);
                    break;
                }

                case 'configurationDone': {
                    const event: ExtDebugProtocol.ConfigurationDoneEvent = {
                        type: 'event',
                        seq: -1,
                        event: 'configurationDone'
                    };
                    this.proceedEvent(JSON.stringify(event), event);
                    break;
                }

                case 'setVariable': {
                    const setVariableRequest = request as DebugProtocol.SetVariableRequest;
                    const event: ExtDebugProtocol.VariableUpdatedEvent = {
                        type: 'event',
                        seq: -1,
                        event: 'variableUpdated',
                        body: {
                            ...response.body,
                            name: setVariableRequest.arguments.name,
                            parentVariablesReference: setVariableRequest.arguments.variablesReference,
                        }
                    };
                    this.proceedEvent(JSON.stringify(event), event);
                    break;
                }

                case 'continue': {
                    const continueRequest = request as DebugProtocol.ContinueRequest;
                    const continueResponse = response as DebugProtocol.ContinueResponse;
                    const event: DebugProtocol.ContinuedEvent = {
                        type: 'event',
                        seq: -1,
                        event: 'continued',
                        body: {
                            threadId: continueRequest.arguments.threadId,
                            allThreadsContinued: continueResponse.body && continueResponse.body.allThreadsContinued
                        }
                    };
                    this.proceedEvent(JSON.stringify(event), event);
                    break;
                }

                case 'loadedSources': {
                    const loadedSourcesResponse = response as DebugProtocol.LoadedSourcesResponse;

                    for (const source of loadedSourcesResponse.body.sources) {
                        const event: DebugProtocol.LoadedSourceEvent = {
                            type: 'event',
                            seq: -1,
                            event: 'loadedSource',
                            body: {
                                source,
                                reason: 'new'
                            }
                        };
                        this.proceedEvent(JSON.stringify(event), event);
                    }
                    break;
                }

                case 'initialized': {
                    const initializeResponse = response as DebugProtocol.InitializeResponse;
                    const event: DebugProtocol.CapabilitiesEvent = {
                        type: 'event',
                        seq: -1,
                        event: 'capabilities',
                        body: {
                            capabilities: initializeResponse.body || {}
                        }
                    };
                    this.proceedEvent(JSON.stringify(event), event);
                    break;
                }
            }
        }
    }

    protected proceedRequest(data: string): void {
        const request = JSON.parse(data) as DebugProtocol.Request;
        this.logger.debug(log => log(`DAP Request:\n${JSON.stringify(request, undefined, 2)}`));

        this.pendingRequests.set(request.seq, request);
        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(data, 'utf8')}\r\n\r\n${data}`, 'utf8');
    }

    async stop(): Promise<void> {
        await this.toDispose.dispose();
    }
}

/**
 * [DebugAdapterSessionFactory](#DebugAdapterSessionFactory) implementation.
 */
@injectable()
export class DebugAdapterSessionFactoryImpl implements DebugAdapterSessionFactory {

    @inject(ILogger) @named('debug') protected readonly logger: ILogger;

    get(sessionId: string, communicationProvider: CommunicationProvider): DebugAdapterSession {
        return new DebugAdapterSessionImpl(
            sessionId,
            communicationProvider,
            this.logger
        );
    }
}
