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
import { METRICS_TIMEOUT } from '../common/metrics-protocol';
import * as assert from 'assert';
import * as sinon from 'sinon';

const COLLECTED_METRICS = 'test_metric 42\n';

describe('PluginMetricsContribution:', () => {
    let testContainer: Container;
    let contribution: PluginMetricsContribution;
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        testContainer = new Container();

        // Stub dependencies
        const stubContributor: Partial<PluginMetricsContributor> = {
            reconcile: () => ({})
        };
        const stubGenerator: Partial<PluginMetricStringGenerator> = {
            getMetricsString: () => COLLECTED_METRICS
        };

        const module = new ContainerModule(bind => {
            bind(PluginMetricsContributor).toConstantValue(stubContributor as unknown as PluginMetricsContributor);
            bind(PluginMetricStringGenerator).toConstantValue(stubGenerator as unknown as PluginMetricStringGenerator);
            bind(PluginMetricsContribution).toSelf().inSingletonScope();
        });

        testContainer.load(module);
        contribution = testContainer.get(PluginMetricsContribution);
    });

    afterEach(() => {
        clock.restore();
    });

    describe('getMetrics:', () => {
        it('should return empty string instead of undefined before startCollecting runs', () => {
            // When getMetrics is called before the interval has collected any data
            const metrics = contribution.getMetrics();

            // Then it returns an empty string, not undefined
            assert.strictEqual(metrics, '');
            assert.strictEqual(typeof metrics, 'string');
        });

        it('should return the collected metrics once the collection interval has elapsed', () => {
            contribution.startCollecting();

            // The interval has not yet fired, so nothing has been collected
            assert.strictEqual(contribution.getMetrics(), '');

            clock.tick(METRICS_TIMEOUT);

            // The interval has fired, so the generated metrics string is returned
            assert.strictEqual(contribution.getMetrics(), COLLECTED_METRICS);
        });
    });
});
