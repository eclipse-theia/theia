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
import { EnvMainImpl } from '@theia/plugin-ext/lib/main/common/env-main';
import { BasicMessageRegistryMainImpl } from '@theia/plugin-ext/lib/main/common/basic-message-registry-main';
import { BasicNotificationMainImpl } from '@theia/plugin-ext/lib/main/common/basic-notification-main';

import { HEADLESSMAIN_RPC_CONTEXT, HEADLESSPLUGIN_RPC_CONTEXT } from '../../common/headless-plugin-rpc';

// This sets up only the minimal plugin API required by the plugin manager to report
// messages and notifications to the main side and to initialize plugins.
export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const envMain = new EnvMainImpl(rpc, container);
    rpc.set(HEADLESSPLUGIN_RPC_CONTEXT.ENV_MAIN, envMain);

    const messageRegistryMain = new BasicMessageRegistryMainImpl(container);
    rpc.set(HEADLESSPLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, messageRegistryMain);

    const notificationMain = new BasicNotificationMainImpl(rpc, container, HEADLESSMAIN_RPC_CONTEXT.NOTIFICATION_EXT);
    rpc.set(HEADLESSPLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN, notificationMain);
}
