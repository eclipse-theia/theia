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

import * as WebSocket from 'ws';
import { injectable, inject } from "inversify";
import { ILogger, DisposableCollection } from "@theia/core";
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    DebugAdapterExecutable,
    CommunicationProvider,
    DebugAdapterPath,
} from "../common/debug-model";
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';

/**
 * DebugAdapterSession symbol for DI.
 */
export const DebugAdapterSession = Symbol('DebugAdapterSession');

/**
 * The debug adapter session.
 */
export interface DebugAdapterSession {
    id: string;
    executable: DebugAdapterExecutable;

    start(): Promise<void>
    stop(): Promise<void>
}

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

    protected readonly toDispose = new DisposableCollection();

    private static TWO_CRLF = '\r\n\r\n';

    private communicationProvider: CommunicationProvider;
    private ws: WebSocket;
    private contentLength: number;
    private buffer: Buffer;

    constructor(
        @inject(DebugAdapterFactory)
        protected readonly adapterFactory: DebugAdapterFactory,
        @inject(ILogger)
        protected readonly logger: ILogger,
        @inject(MessagingServiceContainer)
        protected readonly messagingServiceContainer: MessagingServiceContainer) {

        this.contentLength = -1;
        this.buffer = new Buffer(0);
    }

    start(): Promise<void> {
        this.communicationProvider = this.adapterFactory.start(this.executable);
        this.toDispose.push(this.communicationProvider);

        const path = DebugAdapterPath + "/" + this.id;

        this.messagingServiceContainer.getService().then(service => {
            service.ws(path, (params: MessagingService.PathParams, ws: WebSocket) => {
                this.toDispose.push({
                    dispose: () => ws.close()
                });

                this.ws = ws;
                this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
                this.communicationProvider.output.on('close', () => this.proceedEvent("terminated"));
                this.communicationProvider.input.on('error', error => this.logger.error(error));
                ws.on('message', (message: string) => this.proceedRequest(message));
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
                        this.proceedResponse(message);
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

    protected proceedEvent(event: string, body?: any): void {
        const message = JSON.stringify({
            type: 'event',
            event: event,
            body: body
        });

        this.logger.debug(`DAP Event: ${message}`);
        this.ws.send(message);
    }

    protected proceedResponse(message: string): void {
        this.logger.debug(`DAP Response: ${message}`);
        this.ws.send(message);
    }

    protected proceedRequest(message: string): void {
        this.logger.debug(`DAP Request: ${message}`);
        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n${message}`, 'utf8');
    }

    stop(): Promise<void> {
        this.toDispose.dispose();
        return Promise.resolve();
    }
}
