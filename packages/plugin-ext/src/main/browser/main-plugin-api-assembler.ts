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

import { inject, injectable } from '@theia/core/shared/inversify';
import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { LegacyMainPluginApiContribution } from './legacy-plugin-api-contribution';

/**
 * Assembles the main-side plugin API by composing explicitly injected providers.
 *
 * Each provider is responsible for a slice of the main-side API — registering
 * `*MainImpl` classes on the RPC protocol. This assembler is the single composition
 * point: call sites inject only the assembler, not individual providers.
 *
 * Currently there is only the legacy monolithic provider. As features are extracted
 * into their own packages (e.g. `plugin-ext-terminal`), each will export a main-side
 * provider, and this assembler will gain an `@inject` for it. TypeScript ensures that
 * any provider added here is actually available in the DI container.
 *
 * Downstream applications that want a different API surface can subclass or replace
 * this assembler, injecting only the providers they need.
 */
@injectable()
export class MainPluginApiAssembler {

    @inject(LegacyMainPluginApiContribution)
    protected readonly legacy: LegacyMainPluginApiContribution;

    // Future providers will be added here as explicit @inject fields, e.g.:
    // @inject(TerminalMainPluginApiProvider) protected readonly terminal: TerminalMainPluginApiProvider;

    /**
     * Register all main-side RPC implementations from all providers.
     * Called once per plugin runtime connection.
     */
    registerMainImplementations(rpc: RPCProtocol, container: interfaces.Container): void {
        this.legacy.registerMainImplementations(rpc, container);
        // Future: this.terminal.registerMainImplementations(rpc, container);
    }
}
