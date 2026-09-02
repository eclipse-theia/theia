// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { interfaces } from '@theia/core/shared/inversify';
import { TelemetryConsentProvider } from '@theia/telemetry/lib/common/telemetry-consent-provider';
import { MAIN_RPC_CONTEXT, TelemetryExt, TelemetryMain } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';

/**
 * Forwards the user's telemetry consent to the plugin host. The initial level is seeded through
 * `PluginManagerInitializeParams` so that it is in place before any plugin activates.
 *
 * @since 1.76.0
 * @experimental
 */
export class TelemetryMainImpl implements TelemetryMain, Disposable {

    protected readonly proxy: TelemetryExt;
    protected readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TELEMETRY_EXT);
        const consentProvider = container.get<TelemetryConsentProvider>(TelemetryConsentProvider);
        this.toDispose.push(consentProvider.onDidChangeTelemetryLevel(level => this.proxy.$setTelemetryLevel(level)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
