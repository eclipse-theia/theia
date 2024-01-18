// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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
import { MainPluginApiProvider } from '@theia/plugin-ext/lib/common/plugin-ext-api-contribution';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GreetingMain, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';

@injectable()
export class GotdMainPluginApiProvider implements MainPluginApiProvider {
    @inject(GreetingMain)
    protected readonly greetingMain: GreetingMain;

    initialize(rpc: RPCProtocol): void {
        rpc.set(PLUGIN_RPC_CONTEXT.GREETING_MAIN, this.greetingMain);
    }
}
