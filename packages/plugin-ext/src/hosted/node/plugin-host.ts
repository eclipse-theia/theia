// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// eslint-disable-next-line import/no-extraneous-dependencies
import 'reflect-metadata';
import { Channel, ChannelCloseEvent, MessageProvider } from '@theia/core/lib/common/message-rpc/channel';
import { Emitter } from '@theia/core/lib/common/event';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '@theia/core/lib/common/message-rpc/array-buffer-message-buffer';
import { Socket } from 'net';
import { RPCProtocolImpl } from '../../common/rpc-protocol';
import { ConnectionClosedError } from '../../common/rpc-protocol';
import { ProcessTerminatedMessage, ProcessTerminateMessage } from './hosted-plugin-protocol';
import { PluginHostRPC } from './plugin-host-rpc';
import { configureCachedReceive, encodeMessageStart } from './cached-process-messaging';
import { reviver } from '../../plugin/types-impl';

console.log('PLUGIN_HOST(' + process.pid + ') starting instance');

const pipe = new Socket({
    fd: 4
});

// override exit() function, to do not allow plugin kill this node
process.exit = function (code?: number): void {
    const err = new Error('An plugin call process.exit() and it was prevented.');
    console.warn(err.stack);
} as (code?: number) => never;

// same for 'crash'(works only in electron)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proc = process as any;
if (proc.crash) {
    proc.crash = function (): void {
        const err = new Error('An plugin call process.crash() and it was prevented.');
        console.warn(err.stack);
    };
}

process.on('uncaughtException', (err: Error) => {
    console.error(err);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unhandledPromises: Promise<any>[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    unhandledPromises.push(promise);
    setTimeout(() => {
        const index = unhandledPromises.indexOf(promise);
        if (index >= 0) {
            promise.catch(err => {
                unhandledPromises.splice(index, 1);
                if (terminating && (ConnectionClosedError.is(err) || ConnectionClosedError.is(reason))) {
                    // during termination it is expected that pending rpc request are rejected
                    return;
                }
                console.error(`Promise rejection not handled in one second: ${err} , reason: ${reason}`);
                if (err && err.stack) {
                    console.error(`With stack trace: ${err.stack}`);
                }
            });
        }
    }, 1000);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('rejectionHandled', (promise: Promise<any>) => {
    const index = unhandledPromises.indexOf(promise);
    if (index >= 0) {
        unhandledPromises.splice(index, 1);
    }
});

let terminating = false;
const channel = createChannel();
const rpc = new RPCProtocolImpl(channel, { reviver: reviver });

process.on('message', async (message: string) => {
    if (terminating) {
        return;
    }
    try {
        const msg = JSON.parse(message);
        if (ProcessTerminateMessage.is(msg)) {
            terminating = true;
            if (msg.stopTimeout) {
                await Promise.race([
                    pluginHostRPC.terminate(),
                    new Promise(resolve => setTimeout(resolve, msg.stopTimeout))
                ]);
            } else {
                await pluginHostRPC.terminate();
            }
            rpc.dispose();
            if (process.send) {
                process.send(JSON.stringify({ type: ProcessTerminatedMessage.TYPE }));
            }

        }
    } catch (e) {
        console.error(e);
    }
});

const pluginHostRPC = new PluginHostRPC(rpc,);
pluginHostRPC.initialize();

function createChannel(): Channel {
    const onCloseEmitter = new Emitter<ChannelCloseEvent>();
    const onMessageEmitter = new Emitter<MessageProvider>();
    const onErrorEmitter = new Emitter<unknown>();
    const eventEmitter: NodeJS.EventEmitter = process;
    eventEmitter.on('error', error => onErrorEmitter.fire(error));
    eventEmitter.on('close', () => onCloseEmitter.fire({ reason: 'Process has been closed from remote site (parent)' }));
    configureCachedReceive(pipe, buffer => {
        onMessageEmitter.fire(() => new ArrayBufferReadBuffer(buffer));
    });

    return {
        close: () => { },
        onClose: onCloseEmitter.event,
        onError: onErrorEmitter.event,
        onMessage: onMessageEmitter.event,
        getWriteBuffer: () => {
            const result = new ArrayBufferWriteBuffer();
            result.onCommit(buffer => {
                if (!terminating) {
                    const messageStart = encodeMessageStart(buffer);
                    pipe.write(messageStart);
                    pipe.write(new Uint8Array(buffer));
                }
            });

            return result;
        }
    };
}
