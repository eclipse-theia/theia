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

import { Emitter } from '@theia/core/lib/common/event';
import { RPCProtocolImpl } from '../../../api/rpc-protocol';
import { HostedPluginManagerExtImpl } from '../../plugin/hosted-plugin-manager';
import { MAIN_RPC_CONTEXT, Plugin } from '../../../api/plugin-api';
import { createAPI, startPlugin } from '../../../plugin/plugin-context';
import { getPluginId, PluginMetadata } from '../../../common/plugin-protocol';

const ctx = self as any;
const plugins = new Map<string, () => void>();

const emitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emitter.event,
    send: (m: {}) => {
        ctx.postMessage(m);
    }
});
addEventListener('message', (message: any) => {
    emitter.fire(message.data);
});

const theia = createAPI(rpc);
ctx['theia'] = theia;

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({
    initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
        ctx.importScripts('/context/' + contextPath);
    },
    loadPlugin(contextPath: string, plugin: Plugin): void {
        if (isElectron()) {
            ctx.importScripts(plugin.pluginPath);
        } else {
            ctx.importScripts('/hostedPlugin/' + getPluginId(plugin.model) + '/' + plugin.pluginPath);
        }

        if (plugin.lifecycle.frontendModuleName) {
            if (!ctx[plugin.lifecycle.frontendModuleName]) {
                console.error(`WebWorker: Cannot start plugin "${plugin.model.name}". Frontend plugin not found: "${plugin.lifecycle.frontendModuleName}"`);
                return;
            }
            startPlugin(plugin, ctx[plugin.lifecycle.frontendModuleName], plugins);
        }
    },
    stopPlugins(contextPath: string, pluginIds: string[]): void {
        pluginIds.forEach(pluginId => {
            const stopPluginMethod = plugins.get(pluginId);
            if (stopPluginMethod) {
                stopPluginMethod();
                plugins.delete(pluginId);
            }
        });
    }
}));

function isElectron() {
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}
