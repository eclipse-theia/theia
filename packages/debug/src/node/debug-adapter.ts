/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import * as http from 'http';
import * as https from 'https';
import { injectable, inject } from "inversify";
import { openJsonRpcSocket, BackendApplicationContribution } from "@theia/core/lib/node";
import { ILogger, DisposableCollection, Disposable } from "@theia/core";
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    DebugAdapterExecutable,
    DebugAdapterPath,
    CommunicationProvider,
} from "../common/debug-model";
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";
import { IWebSocket } from 'vscode-ws-jsonrpc/lib';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * DebugAdapterSession symbol for DI.
 */
export const DebugAdapterSession = Symbol('DebugAdapterSession');

/**
 * The debug adapter session.
 */
export interface DebugAdapterSession extends Disposable {
    id: string;
    executable: DebugAdapterExecutable;

    start(): Promise<void>
}

@injectable()
export class ServerContainer implements BackendApplicationContribution {
    protected server = new Deferred<http.Server | https.Server>();

    onStart(server: http.Server | https.Server): void {
        this.server.resolve(server);
    }

    getServer(): Promise<http.Server | https.Server> {
        return this.server.promise;
    }
}

/**
 * DebugAdapterFactory implementation based on launching the debug adapter
 * as a separate process.
 */
@injectable()
export class DebugAdapterFactory {
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

@injectable()
export class DebugAdapterSessionImpl implements DebugAdapterSession {
    id: string;
    executable: DebugAdapterExecutable;

    @inject(DebugAdapterFactory)
    protected readonly adapterFactory: DebugAdapterFactory;
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(ServerContainer)
    protected readonly serverContainer: ServerContainer;

    protected readonly toDispose = new DisposableCollection();
    protected readonly pendingRequests = new Map<number, DebugProtocol.Request>();

    private static TWO_CRLF = '\r\n\r\n';
    private static TIMEOUT = 10_000;

    private communicationProvider: CommunicationProvider;
    private socket: IWebSocket;
    private contentLength: number;
    private buffer: Buffer;
    private sequence: number;

    constructor() {
        this.contentLength = -1;
        this.buffer = new Buffer(0);
        this.sequence = 1;
    }

    start(): Promise<void> {
        this.communicationProvider = this.adapterFactory.start(this.executable);
        this.toDispose.push(this.communicationProvider);

        const path = DebugAdapterPath + "/" + this.id;
        this.serverContainer.getServer().then(server => {
            openJsonRpcSocket({ server, path }, socket => {
                this.toDispose.push(socket);
                this.socket = socket;

                this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
                this.communicationProvider.output.on('error', (error: Error) => this.sendEvent('error', error));
                this.communicationProvider.output.on('close', () => this.sendEvent('close'));

                this.communicationProvider.input.on('error', (error: Error) => this.sendEvent('error', error));

                this.socket.onMessage((data: string) => this.sendRequest(data));
            });
        });

        return Promise.resolve();
    }

    private handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (true) {
            if (this.contentLength >= 0) {
                if (this.buffer.length >= this.contentLength) {
                    const message = this.buffer.toString('utf8', 0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.contentLength = -1;

                    if (message.length > 0) {
                        this.sendResponse(message);
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

    protected sendEvent(event: string, body?: any): void {
        const data: DebugProtocol.Event = {
            seq: this.sequence++,
            type: 'event',
            event: event,
            body: body
        };

        const message = JSON.stringify(data);
        this.logger.debug(`DAP event: ${message}`);

        this.socket.send(message);
    }

    protected sendResponse(message: string): void {
        this.logger.debug(`DAP response: ${message}`);

        const response = JSON.parse(message) as DebugProtocol.Response;
        if (response.type === 'response') {
            if (this.pendingRequests.delete(response.request_seq)) {
                this.socket.send(message);
            }
        }
    }

    protected sendRequest(message: string): void {
        this.logger.debug(`DAP request: ${message}`);

        const request = JSON.parse(message) as DebugProtocol.Request;
        request.seq = this.sequence++;
        this.pendingRequests.set(request.seq, request);
        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n${message}`, 'utf8');

        const timer = setTimeout(() => {
            clearTimeout(timer);
            const pendingRequest = this.pendingRequests.get(request.seq);
            if (pendingRequest) {
                this.pendingRequests.delete(request.seq);

                const response: DebugProtocol.Response = {
                    request_seq: pendingRequest.seq,
                    type: 'response',
                    seq: this.sequence++,
                    command: pendingRequest.command,
                    success: false,
                    message: 'timeout'
                };

                this.socket.send(JSON.stringify(response));
            }
        }, DebugAdapterSessionImpl.TIMEOUT);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
