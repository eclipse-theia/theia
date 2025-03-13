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

    /**
     * get exports of a vscode extension
     * @param pluginId id of the plugin
     * @returns a proxy for accessing the exports of the extension.
     * Be aware that fields are only resolved once when executing this method.
     */
    async getExports<T extends Record<string, unknown>>(pluginId: string): Promise<T> {
        const pluginApiAccessExt = this.pluginApiAccessExt;
        const apiObject = await pluginApiAccessExt.$getBasicExports(pluginId);
        return this.createApiProxy<T>([], apiObject, pluginId);
    }

    protected createApiProxy<T extends Record<string, unknown>>(propertyPath: string[], apiObject: Record<string, unknown>, pluginId: string): T {
        const that = this;
        return new Proxy(apiObject, {
            get(target, p: string, receiver): unknown {
                if (p === 'then' || p === 'catch') {
                    return undefined;
                }

                if (p in target) {
                    const value = target[p];
                    if (value === '$extension-exports-callable') {
                        return async (...args: unknown[]) => that.pluginApiAccessExt.$exec(pluginId, [...propertyPath, p], args);
                    }
                    return typeof value === 'object' ? that.createApiProxy([...propertyPath, p], value as Record<string, unknown>, pluginId) : value;
                } else {
                    return undefined;
                }
            },
        }) as T;
    }
}
