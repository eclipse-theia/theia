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

import { Connection } from '@theia/core/lib/common/connection';
import { Emitter } from '@theia/core/lib/common/event';
import '@theia/core/shared/reflect-metadata';
import { DefaultPluginRpc, PluginHostProtocol, pluginRpcConnection } from '../../common/rpc-protocol';
import { reviver } from '../../plugin/types-impl';
import { PluginHostRPC } from './plugin-host-rpc';

let terminating = false;

console.log(`PLUGIN_HOST(${process.pid}) starting instance`);

// #region process exit protection

// override exit() function, to do not allow plugin kill this node
process.exit = function exit(code?: number): never {
    const error = new Error('An plugin call process.exit() and it was prevented.');
    console.warn(error.stack);
    throw error;
};

// same for 'crash'(works only in electron)
if (process.crash) {
    process.crash = function crash(): never {
        const error = new Error('An plugin call process.crash() and it was prevented.');
        console.warn(error.stack);
        throw error;
    };
}

// #endregion

// #region unhandled errors

const unhandledPromises = new WeakSet<Promise<void>>();

process.on('uncaughtException', (err: Error) => {
    console.error(err);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<void>) => {
    unhandledPromises.add(promise);
    setTimeout(() => {
        if (unhandledPromises.has(promise)) {
            unhandledPromises.delete(promise);
            // note that `error` is the same as `reason` here:
            promise.catch(error => {
                if (terminating) {
                    // during termination it is expected that pending RPC requests are rejected
                    return;
                }
                // note that `error.stack` is already formatted with `error.message` on node:
                console.error(`Promise rejection not handled in one second: ${error?.stack ?? error}`);
            });
        }
    }, 1000);
});

process.on('rejectionHandled', (promise: Promise<void>) => {
    unhandledPromises.delete(promise);
});

// #endregion

// #region RPC initialization

const messageEmitter = new Emitter<Uint8Array>();
const connectionToParentProcess: Connection<Uint8Array> = {
    state: Connection.State.OPENED,
    onClose: () => ({ dispose(): void { } }),
    onError: () => ({ dispose(): void { } }),
    onOpen: () => ({ dispose(): void { } }),
    onMessage: messageEmitter.event,
    sendMessage: message => {
        if (!terminating) {
            process.send!(message);
        }
    },
    close: () => {
        throw new Error('cannot close this connection');
    }
};
const rpc = new DefaultPluginRpc(pluginRpcConnection(connectionToParentProcess), { reviver });
const pluginHostRpc = new PluginHostRPC(rpc);

process.on('message', message => {
    if (terminating) {
        return;
    }
    // messaging oddity: two protocols are being passed around the plugin host and its parent
    // 1. is some custom messaging from `PluginHostProtocol`
    // 2. is whatever `connectionToParentProcess` handles
    // fortunately it is easy enough to segregate between both, see the following branching:
    if (PluginHostProtocol.isMessage(message)) {
        switch (message.$pluginHostMessageType) {
            case PluginHostProtocol.MessageType.TERMINATE_REQUEST: return terminatePluginHost(message.timeout);
        }
    } else if (message instanceof Uint8Array || Buffer.isBuffer(message)) {
        return messageEmitter.fire(message);
    }
    console.debug('unhandled message:', message);
});

async function terminatePluginHost(timeout?: number): Promise<void> {
    terminating = true;
    try {
        messageEmitter.dispose();
        if (typeof timeout === 'number' && timeout > 0) {
            await Promise.race([
                pluginHostRpc.terminate(),
                new Promise(resolve => setTimeout(resolve, timeout))
            ]);
        } else {
            await pluginHostRpc.terminate();
        }
        rpc.dispose();
    } catch (error) {
        console.error(error);
    } finally {
        process.send!(new PluginHostProtocol.TerminatedEvent());
    }
}

pluginHostRpc.initialize();

// #endregion
