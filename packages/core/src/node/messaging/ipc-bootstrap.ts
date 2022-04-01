// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Socket } from 'net';
import 'reflect-metadata';
import { Emitter } from '../../common';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '../../common/message-rpc/array-buffer-message-buffer';
import { Channel, ReadBufferFactory } from '../../common/message-rpc/channel';
import { dynamicRequire } from '../dynamic-require';
import { checkParentAlive, IPCEntryPoint } from './ipc-protocol';

checkParentAlive();

const entryPoint = IPCEntryPoint.getScriptFromEnv();

dynamicRequire<{ default: IPCEntryPoint }>(entryPoint).default(createChannel());

function createChannel(): Channel {
    const pipe = new Socket({
        fd: 4
    });

    const onCloseEmitter = new Emitter<void>();
    const onMessageEmitter = new Emitter<ReadBufferFactory>();
    const onErrorEmitter = new Emitter<unknown>();
    pipe.on('data', (data: Uint8Array) => {
        onMessageEmitter.fire(() => new ArrayBufferReadBuffer(data.buffer));
    });
    process.on('exit', () => onCloseEmitter.fire());

    // FIXME: Add error handling
    return {
        id: process.pid.toString(),
        close: () => { },
        onClose: onCloseEmitter.event,
        onError: onErrorEmitter.event,
        onMessage: onMessageEmitter.event,
        getWriteBuffer: () => {
            const result = new ArrayBufferWriteBuffer();
            result.onCommit(buffer => {
                pipe.write(new Uint8Array(buffer));
            });

            return result;
        }
    };
}
