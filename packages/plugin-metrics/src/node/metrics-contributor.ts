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

import { PluginMetrics } from '../common/metrics-protocol';
import { injectable } from '@theia/core/shared/inversify';
import { AnalyticsFromRequests, MetricsMap } from '../common/plugin-metrics-types';

@injectable()
export class PluginMetricsContributor {
    clients: Set<PluginMetrics> = new Set();

    reconcile(): MetricsMap {
        const reconciledMap: MetricsMap = {};
        this.clients.forEach(c => {
            const extensionIDtoMap = JSON.parse(c.getMetrics()) as MetricsMap;

            for (const vscodeExtensionID in extensionIDtoMap) {
                if (!extensionIDtoMap.hasOwnProperty(vscodeExtensionID)) {
                    continue;
                }

                if (!reconciledMap[vscodeExtensionID]) {
                    reconciledMap[vscodeExtensionID] = extensionIDtoMap[vscodeExtensionID];
                } else {
                    const methodToAnalytics = extensionIDtoMap[vscodeExtensionID];
                    for (const method in methodToAnalytics) {

                        if (!methodToAnalytics.hasOwnProperty(method)) {
                            continue;
                        }

                        if (!reconciledMap[vscodeExtensionID][method]) {
                            reconciledMap[vscodeExtensionID][method] = methodToAnalytics[method];
                        } else {
                            const currentAnalytic = reconciledMap[vscodeExtensionID][method];
                            if (!methodToAnalytics[method]) {
                                reconciledMap[vscodeExtensionID][method] = currentAnalytic;
                            } else {
                                // It does have the method
                                // Then we need to reconcile the two analytics from requests
                                const newAnalytic = methodToAnalytics[method] as AnalyticsFromRequests;
                                newAnalytic.sumOfTimeForSuccess = newAnalytic.sumOfTimeForSuccess + currentAnalytic.sumOfTimeForSuccess;
                                newAnalytic.sumOfTimeForFailure = newAnalytic.sumOfTimeForFailure + currentAnalytic.sumOfTimeForFailure;
                                newAnalytic.totalRequests += currentAnalytic.totalRequests;
                                newAnalytic.successfulResponses += currentAnalytic.successfulResponses;

                                reconciledMap[vscodeExtensionID][method] = newAnalytic;
                            }
                        }
                    }
                }
            }
        });
        return reconciledMap;
    }

}
