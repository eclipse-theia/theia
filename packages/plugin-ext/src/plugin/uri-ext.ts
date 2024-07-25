// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics.
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

import * as theia from '@theia/plugin';
import {
    UriExt,
    PLUGIN_RPC_CONTEXT, PluginInfo, UriMain
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { Disposable, URI } from './types-impl';
import { UriComponents } from '../common/uri-components';

export class UriExtImpl implements UriExt {

    private handlers = new Map<string, theia.UriHandler>();

    private readonly proxy: UriMain;

    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.URI_MAIN);
        console.log(this.proxy);
    }

    registerUriHandler(handler: theia.UriHandler, plugin: PluginInfo): theia.Disposable {
        const pluginId = plugin.id;
        if (this.handlers.has(pluginId)) {
            throw new Error(`URI handler already registered for plugin ${pluginId}`);
        }

        this.handlers.set(pluginId, handler);
        this.proxy.$registerUriHandler(pluginId, plugin.displayName || plugin.name);

        return new Disposable(() => {
            this.proxy.$unregisterUriHandler(pluginId);
            this.handlers.delete(pluginId);
        });
    }

    $handleExternalUri(uri: UriComponents): Promise<void> {
        const handler = this.handlers.get(uri.authority);
        if (!handler) {
            return Promise.resolve();
        }
        handler.handleUri(URI.revive(uri));
        return Promise.resolve();
    }
}
