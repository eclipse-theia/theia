// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { MetricsContribution } from '@theia/metrics/lib/node/metrics-contribution';
import { PluginMetricsContribution } from './plugin-metrics';
import { PluginMetrics, metricsJsonRpcPath } from '../common/metrics-protocol';
import { PluginMetricsImpl } from './plugin-metrics-impl';
import { ServiceContribution } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { PluginMetricsContributor } from './metrics-contributor';
import { PluginMetricTimeSum } from './metric-output/plugin-metrics-time-sum';
import { PluginMetricTimeCount } from './metric-output/plugin-metrics-time-count';
import { PluginMetricStringGenerator } from './metric-string-generator';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    // #region transients
    bind(PluginMetrics).to(PluginMetricsImpl).inTransientScope();
    // #endregion
    // #region singletons
    bind(PluginMetricTimeSum).toSelf().inSingletonScope();
    bind(PluginMetricTimeCount).toSelf().inSingletonScope();
    bind(PluginMetricStringGenerator).toSelf().inSingletonScope();
    bind(PluginMetricsContributor).toSelf().inSingletonScope();
    bind(MetricsContribution).to(PluginMetricsContribution).inSingletonScope();
    bind(ServiceContribution)
        .toDynamicValue(ctx => {
            const { clients } = ctx.container.get(PluginMetricsContributor);
            return ServiceContribution.fromEntries(
                [metricsJsonRpcPath, (params, lifecycle) => {
                    const metrics = ctx.container.get<PluginMetrics>(PluginMetrics);
                    clients.add(metrics);
                    lifecycle.onDispose(() => clients.delete(metrics));
                    return metrics;
                }]
            );
        })
        .inSingletonScope();
    // #endregion
});
