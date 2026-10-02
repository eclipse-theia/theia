// *****************************************************************************
// Copyright (C) 2026 Sahil Gupta and others.
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

import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { PluginMetricsContribution } from './plugin-metrics';
import { PluginMetricsContributor } from './metrics-contributor';
import { PluginMetricStringGenerator } from './metric-string-generator';
import * as assert from 'assert';

describe('PluginMetricsContribution:', () => {
    let testContainer: Container;
    let contribution: PluginMetricsContribution;

    beforeEach(() => {
        testContainer = new Container();

        // Stub dependencies
        const stubContributor = {
            reconcile: () => ({})
        };
        const stubGenerator = {
            getMetricsString: () => 'test_metric 42\n'
        };

        const module = new ContainerModule(bind => {
            bind(PluginMetricsContributor).toConstantValue(stubContributor as any);
            bind(PluginMetricStringGenerator).toConstantValue(stubGenerator as any);
            bind(PluginMetricsContribution).toSelf().inSingletonScope();
        });

        testContainer.load(module);
        contribution = testContainer.get(PluginMetricsContribution);
    });

    describe('getMetrics before first interval:', () => {
        it('should return empty string instead of undefined before startCollecting runs', () => {
            // When getMetrics is called before the interval has collected any data
            const metrics = contribution.getMetrics();

            // Then it returns an empty string, not undefined
            assert.strictEqual(metrics, '');
            assert.strictEqual(typeof metrics, 'string');
        });

        it('should return empty string before the first setInterval callback fires', () => {
            // When startCollecting is called but the interval has not yet ticked
            contribution.startCollecting();
            const metricsBeforeInterval = contribution.getMetrics();

            // Then it still returns an empty string (the interval is 10 seconds)
            assert.strictEqual(metricsBeforeInterval, '');
        });
    });
});
