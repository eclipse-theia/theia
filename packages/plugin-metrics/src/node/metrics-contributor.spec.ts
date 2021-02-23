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

import { AnalyticsFromRequests } from '../common/plugin-metrics-types';
import { PluginMetricsContributor } from './metrics-contributor';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { PluginMetricsImpl } from './plugin-metrics-impl';
import { PluginMetrics } from '../common/metrics-protocol';
import * as assert from 'assert';

describe('Metrics contributor:', () => {
    let testContainer: Container;
    before(() => {
        testContainer = new Container();

        const module = new ContainerModule(bind => {
            bind(PluginMetrics).to(PluginMetricsImpl).inTransientScope();
            bind(PluginMetricsContributor).toSelf().inTransientScope();
        });

        testContainer.load(module);
    });

    describe('reconcile:', () => {
        it('Reconcile with one client connected', async () => {
            // given
            const analytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 5,
                successfulResponses: 10,
                totalRequests: 15
            } as AnalyticsFromRequests;
            const metricExtensionID = 'my_test_metric.test_metric';
            const metricMethod = 'textDocument/testMethod';

            const metricsMap = {
                [metricExtensionID]: {
                    [metricMethod]: analytics
                }
            };

            const metricsContributor = testContainer.get(PluginMetricsContributor);
            const pluginMetrics = testContainer.get(PluginMetrics) as PluginMetrics;
            pluginMetrics.setMetrics(JSON.stringify(metricsMap));
            metricsContributor.clients.add(pluginMetrics);

            // when
            const reconciledMap = metricsContributor.reconcile();

            // then
            assert.deepStrictEqual(reconciledMap, metricsMap);

        });

        it('Reconcile same extension id and method with two clients connected', async () => {
            // given

            // first client
            const firstClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 5,
                successfulResponses: 10,
                totalRequests: 15
            } as AnalyticsFromRequests;
            const firstClientMetricExtensionID = 'my_test_metric.test_metric';
            const firstClientMetricMethod = 'textDocument/testMethod';
            const firstClientMetricsMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: firstClientAnalytics
                }
            };

            const secondClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 15,
                successfulResponses: 20,
                totalRequests: 18
            } as AnalyticsFromRequests;
            const secondClientMetricsMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: secondClientAnalytics
                }
            };
            const metricsContributor = testContainer.get(PluginMetricsContributor);
            const firstClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            firstClientPluginMetric.setMetrics(JSON.stringify(firstClientMetricsMap));
            metricsContributor.clients.add(firstClientPluginMetric);

            const secondClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            secondClientPluginMetric.setMetrics(JSON.stringify(secondClientMetricsMap));
            metricsContributor.clients.add(secondClientPluginMetric);

            // when
            const reconciledMap = metricsContributor.reconcile();

            // then
            const expectedAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 20,
                successfulResponses: 30,
                totalRequests: 33
            } as AnalyticsFromRequests;

            const expectedMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: expectedAnalytics
                }
            };

            assert.deepStrictEqual(reconciledMap, expectedMap);
        });

        it('Reconcile different extension id and method with two clients connected', async () => {
            // given

            // first client
            const firstClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 5,
                successfulResponses: 10,
                totalRequests: 15
            } as AnalyticsFromRequests;
            const firstClientMetricExtensionID = 'my_test_metric.test_metric';
            const firstClientMetricMethod = 'textDocument/testMethod';
            const firstClientMetricsMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: firstClientAnalytics
                }
            };

            const secondClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 15,
                successfulResponses: 20,
                totalRequests: 18
            } as AnalyticsFromRequests;
            const secondClientMetricExtensionID = 'my_other_test_metric.test_metric';
            const secondClientMetricsMap = {
                [secondClientMetricExtensionID]: {
                    [firstClientMetricMethod]: secondClientAnalytics
                }
            };
            const metricsContributor = testContainer.get(PluginMetricsContributor);
            const firstClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            firstClientPluginMetric.setMetrics(JSON.stringify(firstClientMetricsMap));
            metricsContributor.clients.add(firstClientPluginMetric);

            const secondClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            secondClientPluginMetric.setMetrics(JSON.stringify(secondClientMetricsMap));
            metricsContributor.clients.add(secondClientPluginMetric);

            // when
            const reconciledMap = metricsContributor.reconcile();

            // then
            const expectedMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: firstClientAnalytics
                },
                [secondClientMetricExtensionID]: {
                    [firstClientMetricMethod]: secondClientAnalytics
                }
            };

            assert.deepStrictEqual(reconciledMap, expectedMap);
        });

        it('Reconcile same extension id and different method with two clients connected', async () => {
            // given

            // first client
            const firstClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 5,
                successfulResponses: 10,
                totalRequests: 15
            } as AnalyticsFromRequests;
            const firstClientMetricExtensionID = 'my_test_metric.test_metric';
            const firstClientMetricMethod = 'textDocument/testMethod';
            const firstClientMetricsMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: firstClientAnalytics
                }
            };
            const secondClientAnalytics = {
                sumOfTimeForFailure: 0,
                sumOfTimeForSuccess: 15,
                successfulResponses: 20,
                totalRequests: 18
            } as AnalyticsFromRequests;
            const secondClientMetricMethod = 'textDocument/myOthertestMethod';
            const secondClientMetricsMap = {
                [firstClientMetricExtensionID]: {
                    [secondClientMetricMethod]: secondClientAnalytics
                }
            };
            const metricsContributor = testContainer.get(PluginMetricsContributor);
            const firstClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            firstClientPluginMetric.setMetrics(JSON.stringify(firstClientMetricsMap));
            metricsContributor.clients.add(firstClientPluginMetric);

            const secondClientPluginMetric = testContainer.get(PluginMetrics) as PluginMetrics;
            secondClientPluginMetric.setMetrics(JSON.stringify(secondClientMetricsMap));
            metricsContributor.clients.add(secondClientPluginMetric);

            // when
            const reconciledMap = metricsContributor.reconcile();

            // then
            const expectedMap = {
                [firstClientMetricExtensionID]: {
                    [firstClientMetricMethod]: firstClientAnalytics,
                    [secondClientMetricMethod]: secondClientAnalytics
                }
            };

            assert.deepStrictEqual(reconciledMap, expectedMap);
        });
    });

});
