/********************************************************************************
 * Copyright (C) 2019 Red Hat and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { LanguagesMainPluginMetrics } from './plugin-metrics-languages-main';
import { PluginMetrics, metricsJsonRpcPath } from '../common/metrics-protocol';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { PluginMetricsCreator } from './plugin-metrics-creator';
import { PluginMetricsResolver } from './plugin-metrics-resolver';
import { PluginMetricsOutputChannelRegistry } from './plugin-metrics-output-registry';
import { LanguagesMainImpl } from '@theia/plugin-ext/lib/main/browser/languages-main';
import { OutputChannelRegistryMainImpl } from '@theia/plugin-ext/lib/main/browser/output-channel-registry-main';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(PluginMetricsResolver).toSelf().inSingletonScope();
    bind(PluginMetricsCreator).toSelf().inSingletonScope();

    rebind(LanguagesMainImpl).to(LanguagesMainPluginMetrics).inTransientScope();
    rebind(OutputChannelRegistryMainImpl).to(PluginMetricsOutputChannelRegistry).inTransientScope();

    bind(PluginMetrics).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<PluginMetrics>(metricsJsonRpcPath);
    }).inSingletonScope();
});
