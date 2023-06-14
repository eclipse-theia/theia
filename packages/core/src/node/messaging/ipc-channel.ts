// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as cp from 'child_process';
import { Socket } from 'net';
import { Duplex } from 'stream';
import { AbstractChannel, Disposable, WriteBuffer } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { BinaryMessagePipe } from './binary-message-pipe';

/**
 * A {@link Channel} to send messages between two processes using a dedicated pipe/fd for binary messages.
 * This fd is opened as 5th channel in addition to the default stdios (stdin, stdout, stderr, ipc). This means the default channels
 * are not blocked and can be used by the respective process for additional custom message handling.
 */
export class IPCChannel extends AbstractChannel {

    protected messagePipe: BinaryMessagePipe;

    protected ipcErrorListener: (error: Error) => void = error => this.onErrorEmitter.fire(error);

    constructor(childProcess?: cp.ChildProcess) {
        super();
        if (childProcess) {
            this.setupChildProcess(childProcess);
        } else {
            this.setupProcess();
        }
        this.messagePipe.onMessage(message => {
            this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(message));
        });
    }

    protected setupChildProcess(childProcess: cp.ChildProcess): void {
        childProcess.once('exit', code => this.onCloseEmitter.fire({ reason: 'Child process has been terminated', code: code ?? undefined }));
        this.messagePipe = new BinaryMessagePipe(childProcess.stdio[4] as Duplex);
        childProcess.on('error', this.ipcErrorListener);
        this.toDispose.push(Disposable.create(() => {
            childProcess.removeListener('error', this.ipcErrorListener);
            this.messagePipe.dispose();
        }));
    }

    protected setupProcess(): void {
        process.once('beforeExit', code => this.onCloseEmitter.fire({ reason: 'Process is about to be terminated', code }));
        this.messagePipe = new BinaryMessagePipe(new Socket({ fd: 4 }));
        process.on('uncaughtException', this.ipcErrorListener);
        this.toDispose.push(Disposable.create(() => {
            (process as NodeJS.EventEmitter).removeListener('uncaughtException', this.ipcErrorListener);
            this.messagePipe.dispose();
        }));
    }

    getWriteBuffer(): WriteBuffer {
        const result = new Uint8ArrayWriteBuffer();
        result.onCommit(buffer => {
            this.messagePipe.send(buffer);
        });

        return result;
    }

}
