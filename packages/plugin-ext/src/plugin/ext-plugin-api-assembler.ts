// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import type * as theia from '@theia/plugin';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../common/rpc-protocol';
import { Plugin, PluginAPIFactory } from '../common/plugin-api-rpc';
import { LegacyExtPluginApiContribution } from './legacy-ext-plugin-api-contribution';

/**
 * Assembles the ext-side (plugin-host) plugin API by composing explicitly injected providers.
 *
 * Each provider is responsible for a slice of the ext-side API — registering `*ExtImpl`
 * classes on the RPC protocol and producing the namespace properties and type exports
 * that form the `typeof theia` object given to each plugin.
 *
 * This assembler is the single composition point for the ext side: call sites inject
 * only the assembler, not individual providers.
 *
 * Currently there is only the legacy monolithic provider. As features are extracted
 * into their own packages (e.g. `plugin-ext-terminal`), each will export an ext-side
 * provider, and this assembler will gain an `@inject` for it. The `createApiFactory`
 * method merges all providers' namespace contributions and TypeScript ensures the
 * combined result satisfies `typeof theia`.
 *
 * Downstream applications that want a different API surface can subclass or replace
 * this assembler, injecting only the providers they need.
 */
@injectable()
export class ExtPluginApiAssembler {

    @inject(LegacyExtPluginApiContribution)
    protected readonly legacy: LegacyExtPluginApiContribution;

    // Future providers will be added here as explicit @inject fields, e.g.:
    // @inject(TerminalExtPluginApiProvider) protected readonly terminal: TerminalExtPluginApiProvider;

    /**
     * Register all ext-side RPC implementations and return a factory that produces
     * a per-plugin `typeof theia` API object.
     *
     * This performs two phases:
     * 1. **Registration** — calls `registerExtImplementations` on each provider,
     *    which creates `*ExtImpl` instances and registers them on the RPC protocol.
     * 2. **Factory** — returns a {@link PluginAPIFactory} closure. Each time a plugin
     *    is loaded, the closure calls `createApiNamespace` on every provider and merges
     *    the results into a single `typeof theia` object.
     */
    createApiFactory(rpc: RPCProtocol): PluginAPIFactory {
        this.legacy.registerExtImplementations(rpc);
        // Future: this.terminal.registerExtImplementations(rpc);

        return (plugin: Plugin): typeof theia => {
            const api = {
                ...this.legacy.createApiNamespace(plugin),
                // Future: ...this.terminal.createApiNamespace(plugin),
            };
            return api as typeof theia;
        };
    }
}
