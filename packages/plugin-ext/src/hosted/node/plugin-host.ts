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
import { PluginManagerExtImpl } from '../../plugin/plugin-manager';
import { RPCProtocolImpl } from '../../api/rpc-protocol';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { PluginMetadata } from '../../common/plugin-protocol';
import { createAPIFactory } from '../../plugin/plugin-context';
console.log('PLUGIN_HOST(' + process.pid + ') starting instance');

const emitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emitter.event,
    send: (m: {}) => {
        if (process.send) {
            process.send(JSON.stringify(m));
        }
    }
});

process.on('message', (message: string) => {
    try {
        emitter.fire(JSON.parse(message));
    } catch (e) {
        console.error(e);
    }
});

// tslint:disable-next-line:no-any
function initialize(contextPath: string, plugin: Plugin): any {
    console.log('PLUGIN_HOST(' + process.pid + '): initializing(' + contextPath + ')');
    try {
        const backendInit = require(contextPath);
        backendInit.doInitialization(apiFactory, plugin);
    } catch (e) {
        console.error(e);
    }
}

const pluginManager = new PluginManagerExtImpl({
    loadPlugin(plugin: Plugin): void {
        console.log('PLUGIN_HOST(' + process.pid + '): loadPlugin(' + plugin.pluginPath + ')');
        try {
            return require(plugin.pluginPath);
        } catch (e) {
            console.error(e);
        }
    },
    init(raw: PluginMetadata[]): [Plugin[], Plugin[]] {
        const result: Plugin[] = [];
        const foreign: Plugin[] = [];
        for (const plg of raw) {
            const pluginModel = plg.model;
            const pluginLifecycle = plg.lifecycle;
            if (pluginModel.entryPoint!.backend) {

                let backendInitPath = pluginLifecycle.backendInitPath;
                // if no init path, try to init as regular Theia plugin
                if (!backendInitPath) {
                    backendInitPath = __dirname + '/scanners/backend-init-theia.js';
                }

                const plugin: Plugin = {
                    pluginPath: pluginModel.entryPoint.backend!,
                    pluginFolder: plg.source.packagePath,
                    model: pluginModel,
                    lifecycle: pluginLifecycle,
                    rawModel: plg.source
                };

                initialize(backendInitPath, plugin);

                result.push(plugin);
            } else {
                foreign.push({
                    pluginPath: pluginModel.entryPoint.frontend!,
                    pluginFolder: plg.source.packagePath,
                    model: pluginModel,
                    lifecycle: pluginLifecycle,
                    rawModel: plg.source
                });
            }
        }

        return [result, foreign];
    }
});

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, pluginManager);
const apiFactory = createAPIFactory(rpc, pluginManager);
