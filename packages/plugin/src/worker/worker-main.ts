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
import { createAPI, startExtension } from '../plugin/plugin-context';
import { MAIN_RPC_CONTEXT } from '../api/plugin-api';
import { HostedPluginManagerExtImpl } from '../plugin/hosted-plugin-manager';

const ctx = self as any;
const plugins = new Array<() => void>();

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
ctx['theia'] = theia;

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({
    loadPlugin(path: string): void {
        ctx.importScripts('/hostedPlugin/' + path);
        // FIXME: simplePlugin should come from metadata
        startExtension(ctx['simplePlugin'], plugins);
    },
    stopPlugins(): void {
        for (const s of plugins) {
            s();
        }
    }
}));
