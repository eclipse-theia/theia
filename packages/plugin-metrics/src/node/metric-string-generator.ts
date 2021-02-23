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
import { PluginMetricTimeCount } from './metric-output/plugin-metrics-time-count';
import { PluginMetricTimeSum } from './metric-output/plugin-metrics-time-sum';
import { MetricsMap } from '../common/plugin-metrics-types';
import { injectable, inject } from '@theia/core/shared/inversify';

@injectable()
export class PluginMetricStringGenerator {

    @inject(PluginMetricTimeCount)
    private pluginMetricsTimeCount: PluginMetricTimeCount;

    @inject(PluginMetricTimeSum)
    private pluginMetricsTimeSum: PluginMetricTimeSum;

    getMetricsString(extensionIDAnalytics: MetricsMap): string {

        if (Object.keys(extensionIDAnalytics).length === 0) {
            return '';
        }

        let metricString = this.pluginMetricsTimeCount.header;
        for (const extensionID in extensionIDAnalytics) {
            if (!extensionIDAnalytics.hasOwnProperty(extensionID)) {
                continue;
            }

            const methodToAnalytic = extensionIDAnalytics[extensionID];
            for (const method in methodToAnalytic) {
                if (!methodToAnalytic.hasOwnProperty(method)) {
                    continue;
                }
                const analytic = methodToAnalytic[method];
                metricString += this.pluginMetricsTimeCount.createMetricOutput(extensionID, method, analytic);
            }
        }

        metricString += this.pluginMetricsTimeSum.header;
        for (const extensionID in extensionIDAnalytics) {
            if (!extensionIDAnalytics.hasOwnProperty(extensionID)) {
                continue;
            }

            const methodToAnalytic = extensionIDAnalytics[extensionID];
            for (const method in methodToAnalytic) {
                if (!methodToAnalytic.hasOwnProperty(method)) {
                    continue;
                }
                const analytic = methodToAnalytic[method];
                metricString += this.pluginMetricsTimeSum.createMetricOutput(extensionID, method, analytic);
            }
        }

        return metricString;
    }
}
