/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
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

console.log("Plugin host loaded!!!");
const plugins = new Array<() => void>();
const registerPlugin = function (pluginId: string, start: (api: any) => void, stop?: () => void): void {
    if (stop) {
        plugins.push(stop);
    }
    start(theia);
};

const emmitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emmitter.event,
    send: (m: {}) => {
        if (process.send) {
            process.send(JSON.stringify(m));
        }
    }
});
process.on('message', (message: any) => {
    console.log("Ext: " + message);
    emmitter.fire(JSON.parse(message));
});

const theia = createAPI(rpc);
if (registerPlugin) {
    const g = global as any;
    g['registerPlugin'] = registerPlugin;
}

rpc.set(MAIN_RPC_CONTEXT.HOSTED_EXTENSION_MANAGER_EXT, new HostedExtensionManagerExtImpl({
    loadExtension(path: string): void {
        console.log("Ext: load: " + path);
        try {
            require(path);
        } catch (e) {
            console.error(e);
        }
    },
    stopExtensions(): void {
        console.log("Plugin: Stopping plugins.");
        for (const s of plugins) {
            s();
        }
    }
}));
