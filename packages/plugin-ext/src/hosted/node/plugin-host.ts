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

import { ObjectStreamConnection } from '@theia/core/lib/node/connection/object-stream';
import { PackrStream, UnpackrStream } from '@theia/core/shared/msgpackr';
import '@theia/core/shared/reflect-metadata';
import assert = require('assert');
import { connect } from 'net';
import { DefaultPluginRpc, PluginHostProtocol, pluginRpcConnection } from '../../common/rpc-protocol';
import { reviver } from '../../plugin/types-impl';
import { PluginHostRPC } from './plugin-host-rpc';

let terminating = false;

// Fetch and remove the IPC server pipe name from `process.argv`
const [ipcServer] = process.argv.splice(2, 1);
assert(typeof ipcServer === 'string', 'the first cli argument should be a string');

console.log(`PLUGIN_HOST(${process.pid}) starting instance`);

// #region process exit protection

// override exit() function, to do not allow plugins to kill the plugin host:
process.exit = function exit(code?: number): never {
    const error = new Error('A plugin called process.exit() and it was prevented.');
    console.warn(error.stack);
    throw error;
};

// same for 'crash'(only works in electron):
if (process.crash) {
    process.crash = function crash(): never {
        const error = new Error('A plugin called process.crash() and it was prevented.');
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

const rpc = new DefaultPluginRpc(
    pluginRpcConnection(new Promise(resolve => {
        const pipeToParent = connect(ipcServer, () => {
            const packr = new PackrStream();
            const unpackr = new UnpackrStream();
            packr.pipe(pipeToParent);
            pipeToParent.pipe(unpackr);
            resolve(new ObjectStreamConnection(unpackr, packr));
        });
    })),
    { reviver }
);
const pluginHostRpc = new PluginHostRPC(rpc);

process.on('message', message => {
    if (terminating) {
        return;
    }
    if (PluginHostProtocol.isMessage(message)) {
        switch (message.$pluginHostMessageType) {
            case PluginHostProtocol.MessageType.TERMINATE_REQUEST: return terminatePluginHost(message.timeout);
        }
    }
    console.debug('process.on(\'message\', ...): unhandled message:', message);
});

process.on('beforeExit', code => {
    console.log('exiting with code:', code);
});

async function terminatePluginHost(timeout?: number): Promise<void> {
    console.log('terminating...');
    terminating = true;
    try {
        await new Promise<void>((resolve, reject) => {
            pluginHostRpc.terminate().then(resolve, reject);
            if (typeof timeout === 'number' && timeout > 0) {
                setTimeout(() => {
                    console.log('host.terminate() timed out');
                    resolve();
                }, timeout);
            }
        });
        rpc.dispose();
    } catch (error) {
        console.error(error);
    } finally {
        console.log('terminated');
        process.send!(new PluginHostProtocol.TerminatedEvent());
    }
}

pluginHostRpc.initialize();

// #endregion
