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
import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { LegacyHeadlessPluginApiContribution } from './legacy-headless-plugin-api-contribution.js';

/**
 * @deprecated Rebind or replace `LegacyHeadlessPluginApiContribution` instead.
 */
export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    container.get(LegacyHeadlessPluginApiContribution).registerMainImplementations(rpc, container);
}
