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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol.js';
import { LegacyMainPluginApiContribution } from './legacy-plugin-api-contribution.js';

/**
 * Assembles the main-side plugin API by composing explicitly injected providers.
 *
 * Each provider is responsible for a slice of the main-side API — registering
 * `*MainImpl` classes on the RPC protocol. This assembler is the single composition
 * point: call sites inject only the assembler, not individual providers.
 *
 * Currently there is only the legacy monolithic provider. As features are extracted,
 * each will export a main-side provider, and this assembler will gain an `@inject` for it:
 *
 * ```ts
 * @inject(TerminalMainPluginApiContribution)
 * protected readonly terminal: TerminalMainPluginApiContribution;
 *
 * registerMainImplementations(rpc: RPCProtocol, container: interfaces.Container): void {
 *     this.legacy.registerMainImplementations(rpc, container);
 *     this.terminal.registerMainImplementations(rpc, container);
 * }
 * ```
 *
 * The intent is that downstream applications wanting a different API surface replace
 * this assembler, injecting only the providers they need. That becomes practical once the
 * legacy provider has been broken up and the slices live in their own packages.
 */
@injectable()
export class MainPluginApiAssembler {

    @inject(LegacyMainPluginApiContribution)
    protected readonly legacy: LegacyMainPluginApiContribution;

    /**
     * Register all main-side RPC implementations from all providers.
     * Called once per plugin runtime connection.
     */
    registerMainImplementations(rpc: RPCProtocol, container: interfaces.Container): void {
        this.legacy.registerMainImplementations(rpc, container);
    }
}
