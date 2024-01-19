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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import '@theia/core/shared/reflect-metadata';
import { Container } from '@theia/core/shared/inversify';
import { ConnectionClosedError, RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { ProcessTerminatedMessage, ProcessTerminateMessage } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-protocol';
import { HeadlessPluginHostRPC } from './plugin-host-headless-rpc';
import pluginHostModule from './plugin-host-headless-module';

const banner = `HEADLESS_PLUGIN_HOST(${process.pid}):`;
console.log(banner, 'Starting instance');

// override exit() function, to do not allow plugin kill this node
process.exit = function (code?: number): void {
    const err = new Error('A plugin called process.exit() but it was blocked.');
    console.warn(banner, err.stack);
} as (code?: number) => never;

// same for 'crash'(works only in electron)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proc = process as any;
if (proc.crash) {
    proc.crash = function (): void {
        const err = new Error('A plugin called process.crash() but it was blocked.');
        console.warn(banner, err.stack);
    };
}

process.on('uncaughtException', (err: Error) => {
    console.error(banner, err);
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
                console.error(banner, `Promise rejection not handled in one second: ${err} , reason: ${reason}`);
                if (err && err.stack) {
                    console.error(banner, `With stack trace: ${err.stack}`);
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

const container = new Container();
container.load(pluginHostModule);

const rpc: RPCProtocol = container.get(RPCProtocol);
const pluginHostRPC = container.get(HeadlessPluginHostRPC);

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
        console.error(banner, e);
    }
});
