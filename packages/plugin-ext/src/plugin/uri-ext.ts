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

    private static handle = 0;
    private handles = new Set<string>();
    private handlers = new Map<number, theia.UriHandler>();

    private readonly proxy: UriMain;

    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.URI_MAIN);
        console.log(this.proxy);
    }

    registerUriHandler(handler: theia.UriHandler, plugin: PluginInfo): theia.Disposable {
        const extensionId = plugin.id;
        if (this.handles.has(extensionId)) {
            throw new Error(`URI handler already registered for extension ${extensionId}`);
        }

        const handle = UriExtImpl.handle++;
        this.handles.add(extensionId);
        this.handlers.set(handle, handler);
        this.proxy.$registerUriHandler(handle, extensionId, plugin.displayName || plugin.name);

        return new Disposable(() => {
            this.proxy.$unregisterUriHandler(handle);
            this.handles.delete(extensionId);
            this.handlers.delete(handle);
        });
    }

    $handleExternalUri(handle: number, uri: UriComponents): Promise<void> {
        const handler = this.handlers.get(handle);

        if (!handler) {
            return Promise.resolve(undefined);
        }
        try {
            handler.handleUri(URI.revive(uri));
        } catch (err) {
            console.log(`error while handling external uri: ${uri}`);
        }

        return Promise.resolve(undefined);
    }

}
