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
import { injectable, inject } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess,
    RawProcessOptions,
    RawForkOptions
} from '@theia/process/lib/node';
import {
    DebugAdapterExecutable,
    CommunicationProvider,
    DebugAdapterSession,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
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
        const process = this.childProcess(executable);

        // FIXME: propagate onError + onExit
        return {
            input: process.input,
            output: process.output,
            dispose: () => process.kill()
        };
    }

    private childProcess(executable: DebugAdapterExecutable): RawProcess {
        const isForkOptions = (forkOptions: RawForkOptions | any): forkOptions is RawForkOptions =>
            !!forkOptions && !!forkOptions.modulePath;

        const processOptions: RawProcessOptions | RawForkOptions = { ...executable };
        const options = { stdio: ['pipe', 'pipe', 2] };

        if (isForkOptions(processOptions)) {
            options.stdio.push('ipc');
        }

        processOptions.options = options;
        return this.processFactory(processOptions);
    }

    connect(debugServerPort: number): CommunicationProvider {
        const socket = net.createConnection(debugServerPort);
        // FIXME: propagate socket.on('error', ...) + socket.on('close', ...)
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
export class DebugAdapterSessionImpl implements DebugAdapterSession {

    private static TWO_CRLF = '\r\n\r\n';

    private readonly toDispose = new DisposableCollection();
    private channel: WebSocketChannel | undefined;
    private contentLength: number;
    private buffer: Buffer;

    constructor(
        readonly id: string,
        protected readonly communicationProvider: CommunicationProvider
    ) {
        this.contentLength = -1;
        this.buffer = new Buffer(0);
        this.toDispose.pushAll([
            this.communicationProvider,
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'disconnect' }))),
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'terminate' })))
        ]);
    }

    async start(channel: WebSocketChannel): Promise<void> {
        if (this.channel) {
            throw new Error('The session has already been started, id: ' + this.id);
        }
        this.channel = channel;
        this.channel.onMessage((message: string) => this.write(message));
        this.channel.onClose(() => this.channel = undefined);

        this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
        this.communicationProvider.output.on('close', () => this.fireExited());
        this.communicationProvider.output.on('error', error => this.onDebugAdapterError(error));
        this.communicationProvider.input.on('error', error => this.onDebugAdapterError(error));
    }

    protected fireExited(): void {
        const event: DebugProtocol.ExitedEvent = {
            type: 'event',
            event: 'exited',
            seq: -1,
            body: {
                exitCode: 1 // FIXME pass a proper exit code
            }
        };
        this.send(JSON.stringify(event));
    }

    protected onDebugAdapterError(error: Error): void {
        const event: DebugProtocol.Event = {
            type: 'event',
            event: 'error',
            seq: -1,
            body: error
        };
        this.send(JSON.stringify(event));
    }

    protected handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (true) {
            if (this.contentLength >= 0) {
                if (this.buffer.length >= this.contentLength) {
                    const message = this.buffer.toString('utf8', 0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.contentLength = -1;

                    if (message.length > 0) {
                        this.send(message);
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

    protected send(message: string): void {
        if (this.channel) {
            this.channel.send(message);
        }
    }

    protected write(message: string): void {
        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n${message}`, 'utf8');
    }

    async stop(): Promise<void> {
        this.toDispose.dispose();
    }
}

/**
 * [DebugAdapterSessionFactory](#DebugAdapterSessionFactory) implementation.
 */
@injectable()
export class DebugAdapterSessionFactoryImpl implements DebugAdapterSessionFactory {

    get(sessionId: string, communicationProvider: CommunicationProvider): DebugAdapterSession {
        return new DebugAdapterSessionImpl(
            sessionId,
            communicationProvider
        );
    }
}
