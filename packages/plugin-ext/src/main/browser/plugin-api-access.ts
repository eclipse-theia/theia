// *****************************************************************************
// Copyright (C) 2025 Typefox GmbH and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { MAIN_RPC_CONTEXT, PluginApiAccessExt } from '../../common';

@injectable()
export class PluginApiAccessService {

    protected pluginApiAccessExt: PluginApiAccessExt;

    init(rpc: RPCProtocol): void {
        this.pluginApiAccessExt = rpc.getProxy(MAIN_RPC_CONTEXT.PLUGIN_API_ACCESS_EXT);
    }

    async getExports<T extends object>(pluginId: string): Promise<T> {
        const pluginApiAccessExt = this.pluginApiAccessExt;
        const apiObject = await pluginApiAccessExt.$getBasicExports(pluginId);
        return Promise.resolve(new Proxy(apiObject, {
            get(target, p: string, receiver): unknown {
                if (p in target) {
                    return (target as never)[p];
                }
                return async (...args: unknown[]) =>
                    pluginApiAccessExt.$exec(pluginId, p.toString(), args);
            },
        }) as T);
    }
}
