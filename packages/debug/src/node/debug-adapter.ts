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

import * as WebSocket from 'ws';
import { injectable, inject } from "inversify";
import { ILogger, DisposableCollection, Disposable } from "@theia/core";
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    DebugAdapterPath,
    DebugConfiguration,
    DebugSessionState,
    DebugSessionStateAccumulator,
    ExtDebugProtocol
} from "../common/debug-common";
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import {
    DebugAdapterExecutable,
    CommunicationProvider,
    DebugAdapterSession,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { EventEmitter } from 'events';

/**
 * The container for [Messaging Service](#MessagingService).
 */
@injectable()
export class MessagingServiceContainer implements MessagingService.Contribution {
    protected service = new Deferred<MessagingService>();

    getService(): Promise<MessagingService> {
        return this.service.promise;
    }

    configure(service: MessagingService): void {
        this.service.resolve(service);
    }
}

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

        return this.processFactory({ command: command, args: args });
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
    private communicationProvider: CommunicationProvider;
    private ws: WebSocket;
    private contentLength: number;
    private buffer: Buffer;

    constructor(
        readonly id: string,
        readonly executable: DebugAdapterExecutable,
        readonly configuration: DebugConfiguration,
        protected readonly adapterFactory: DebugAdapterFactory,
        protected readonly logger: ILogger,
        protected readonly messagingServiceContainer: MessagingServiceContainer) {
        super();

        this.contentLength = -1;
        this.buffer = new Buffer(0);
        this.state = new DebugSessionStateAccumulator(this);
        this.toDispose.push(Disposable.create(() => this.pendingRequests.clear()));
    }

    start(): Promise<void> {
        this.communicationProvider = this.adapterFactory.start(this.executable);
        this.toDispose.push(this.communicationProvider);

        const path = DebugAdapterPath + "/" + this.id;

        this.messagingServiceContainer.getService().then(service => {
            service.ws(path, (params: MessagingService.PathParams, ws: WebSocket) => {
                this.ws = ws;
                this.toDispose.push(Disposable.create(() => this.ws.close()));

                this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
                this.communicationProvider.output.on('close', () => this.onDebugAdapterClosed());
                this.communicationProvider.output.on('error', (error: Error) => this.onDebugAdapterError(error));
                this.communicationProvider.input.on('error', (error: Error) => this.onDebugAdapterError(error));

                this.ws.on('message', (data: string) => this.proceedRequest(data));
            });
        });

        return Promise.resolve();
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
        this.logger.debug(`DAP event: ${rawData}`);

        this.emit(event.event, event);
        this.ws.send(rawData);
    }

    protected proceedResponse(rawData: string, response: DebugProtocol.Response): void {
        this.logger.debug(`DAP Response: ${rawData}`);

        const request = this.pendingRequests.get(response.request_seq);

        this.pendingRequests.delete(response.request_seq);
        this.ws.send(rawData);

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
        this.logger.debug(`DAP Request: ${data}`);

        const request = JSON.parse(data) as DebugProtocol.Request;
        this.pendingRequests.set(request.seq, request);

        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(data, 'utf8')}\r\n\r\n${data}`, 'utf8');
    }

    stop(): Promise<void> {
        this.toDispose.dispose();
        return Promise.resolve();
    }
}

/**
 * [DebugAdapterSessionFactory](#DebugAdapterSessionFactory) implementation.
 */
@injectable()
export class DebugAdapterSessionFactoryImpl implements DebugAdapterSessionFactory {

    constructor(
        @inject(DebugAdapterFactory)
        protected readonly adapterFactory: DebugAdapterFactory,
        @inject(ILogger)
        protected readonly logger: ILogger,
        @inject(MessagingServiceContainer)
        protected readonly messagingServiceContainer: MessagingServiceContainer) { }

    get(sessionId: string, debugConfiguration: DebugConfiguration, executable: DebugAdapterExecutable): DebugAdapterSession {
        return new DebugAdapterSessionImpl(
            sessionId,
            executable,
            debugConfiguration,
            this.adapterFactory,
            this.logger,
            this.messagingServiceContainer);
    }
}
