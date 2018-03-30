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

import { RPCProtocolImpl } from '../api/rpc-protocol';
import { Emitter } from '@theia/core/lib/common/event';
import { createAPI } from '../extension/extension-context';
import { MAIN_RPC_CONTEXT } from '../api/extension-api';
import { HostedExtensionManagerExtImpl } from '../extension/hosted-extension-manager';

const ctx = self as any;
const plugins = new Array<() => void>();
const registerPlugin = function (pluginId: string, start: (api: any) => void, stop?: () => void): void {
    console.log(`Extension: ${pluginId} loaded.`);
    if (stop) {
        plugins.push(stop);
    }
    start(theia);
};

const emmitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emmitter.event,
    send: (m: {}) => {
        ctx.postMessage(m);
    }
});
addEventListener('message', (message: any) => {
    emmitter.fire(message.data);
});

const theia = createAPI(rpc);
if (registerPlugin) {
    ctx['registerPlugin'] = registerPlugin;
}
// api.commands.registerCommand({ id: 'fooBar', label: 'Command From Extension' }, () => {
//     console.log("Hello from WebWorker Command");
// });

rpc.set(MAIN_RPC_CONTEXT.HOSTED_EXTENSION_MANAGER_EXT, new HostedExtensionManagerExtImpl({
    loadExtension(path: string): void {
        ctx.importScripts('/hostedExtension/' + path);
    },
    stopExtensions(): void {
        for (const s of plugins) {
            s();
        }
    }
}));
