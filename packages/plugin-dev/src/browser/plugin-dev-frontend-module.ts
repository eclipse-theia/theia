/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { HostedPluginLogViewer } from './hosted-plugin-log-viewer';
import { HostedPluginManagerClient } from './hosted-plugin-manager-client';
import { HostedPluginInformer } from './hosted-plugin-informer';
import { bindHostedPluginPreferences } from './hosted-plugin-preferences';
import { HostedPluginController } from './hosted-plugin-controller';
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { HostedPluginFrontendContribution } from './hosted-plugin-frontend-contribution';
import { CommandContribution } from '@theia/core/lib/common/command';
import { HostedPluginServer, hostedServicePath } from '../common/plugin-dev-protocol';
import { HostedPluginWatcher } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin-watcher';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindHostedPluginPreferences(bind);
    bind(HostedPluginLogViewer).toSelf().inSingletonScope();
    bind(HostedPluginManagerClient).toSelf().inSingletonScope();

    bind(FrontendApplicationContribution).to(HostedPluginInformer).inSingletonScope();
    bind(FrontendApplicationContribution).to(HostedPluginController).inSingletonScope();

    bind(HostedPluginFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(HostedPluginFrontendContribution);

    bind(HostedPluginServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const hostedWatcher = ctx.container.get(HostedPluginWatcher);
        return connection.createProxy<HostedPluginServer>(hostedServicePath, hostedWatcher.getHostedPluginClient());
    }).inSingletonScope();
});
