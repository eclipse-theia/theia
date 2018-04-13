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
import { ILogger } from "@theia/core";
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    DebugSession,
    DebugAdapterExecutable,
    DebugAdapterFactory,
    DebugSessionPath,
    CommunicationProvider,
} from "../common/debug-model";
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";
import { IWebSocket, Disposable } from 'vscode-ws-jsonrpc/lib';

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

@injectable()
export class DebugSessionImpl implements DebugSession {
    id: string;
    executable: DebugAdapterExecutable;

    private messageForwarder: MessageForwarder;

    @inject(DebugAdapterFactory)
    protected readonly adapterFactory: DebugAdapterFactory;
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(ServerContainer)
    protected readonly serverContainer: ServerContainer;

    constructor() { }

    start(): Promise<void> {
        const path = DebugSessionPath + "/" + this.id;

        this.serverContainer.getServer().then(server => {
            openJsonRpcSocket({ server, path }, socket => {
                try {
                    const communicationProvider = this.adapterFactory.start(this.executable);

                    this.messageForwarder = new MessageForwarder(socket, communicationProvider);
                    this.messageForwarder.start();
                } catch (e) {
                    this.logger.error(`Error occurred while communicating with debug adapter. ${path}.`, e);
                    socket.dispose();
                }
            });
        });

        return Promise.resolve();
    }

    dispose(): void {
        if (this.messageForwarder) {
            this.messageForwarder.dispose();
        }
    }
}

/**
 * DebugAdapterFactory implementation based on launching the debug adapter
 * as a separate process.
 */
@injectable()
export class LauncherBasedDebugAdapterFactory implements DebugAdapterFactory {
    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;
    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    start(executable: DebugAdapterExecutable): CommunicationProvider {
        const process = this.spawnProcess(executable);
        return { input: process.input, output: process.output };
    }

    private spawnProcess(executable: DebugAdapterExecutable): RawProcess {
        return this.processFactory({ command: executable.command, args: executable.args });
    }
}

class MessageForwarder implements Disposable {
    dispose(): void {
        throw new Error("Method not implemented.");
    }
    private static TWO_CRLF = '\r\n\r\n';

    private contentLength: number;
    private buffer: Buffer;

    constructor(protected readonly websocket: IWebSocket, protected readonly communicationProvider: CommunicationProvider) { }

    start() {
        this.contentLength = -1;
        this.buffer = new Buffer(0);

        this.websocket.onMessage((data: string) => {
            this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(data, 'utf8')}\r\n\r\n${data}`, 'utf8');
        });

        this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
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
                        this.websocket.send(message);
                    }
                    continue;	// there may be more complete messages to process
                }
            } else {
                const idx = this.buffer.indexOf(MessageForwarder.TWO_CRLF);
                if (idx !== -1) {
                    const header = this.buffer.toString('utf8', 0, idx);
                    const lines = header.split('\r\n');
                    for (let i = 0; i < lines.length; i++) {
                        const pair = lines[i].split(/: +/);
                        if (pair[0] === 'Content-Length') {
                            this.contentLength = +pair[1];
                        }
                    }
                    this.buffer = this.buffer.slice(idx + MessageForwarder.TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }
}
