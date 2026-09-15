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
import { ContributionProvider } from '@theia/core/lib/common';
import { MetricsBackendApplicationContribution } from './metrics-backend-application-contribution';
import { MetricsContribution } from './metrics-contribution';
import * as assert from 'assert';

describe('MetricsBackendApplicationContribution:', () => {
    let testContainer: Container;

    function createBackendContribution(contributions: MetricsContribution[]): MetricsBackendApplicationContribution {
        testContainer = new Container();

        const module = new ContainerModule(bind => {
            bind(ContributionProvider).toConstantValue({
                getContributions: () => contributions
            } as ContributionProvider<MetricsContribution>).whenTargetNamed(MetricsContribution);

            bind(MetricsBackendApplicationContribution).toSelf().inSingletonScope();
        });

        testContainer.load(module);
        return testContainer.get(MetricsBackendApplicationContribution);
    }

    describe('fetchMetricsFromProviders:', () => {
        it('should concatenate multiple contribution results with newlines', () => {
            const contrib1 = { getMetrics: () => 'metric1 42', startCollecting: () => { } };
            const contrib2 = { getMetrics: () => 'metric2 100', startCollecting: () => { } };

            const backend = createBackendContribution([contrib1, contrib2]);
            const result = backend.fetchMetricsFromProviders();

            assert.strictEqual(result, 'metric1 42\nmetric2 100\n');
        });

        it('should skip contributions that return empty string', () => {
            const contrib1 = { getMetrics: () => 'metric1 42', startCollecting: () => { } };
            const contrib2 = { getMetrics: () => '', startCollecting: () => { } };
            const contrib3 = { getMetrics: () => 'metric3 200', startCollecting: () => { } };

            const backend = createBackendContribution([contrib1, contrib2, contrib3]);
            const result = backend.fetchMetricsFromProviders();

            // Empty contribution should not leave a blank separator line
            assert.strictEqual(result, 'metric1 42\nmetric3 200\n');
            assert.strictEqual(result.includes('\n\n'), false, 'should not contain double newlines');
        });

        it('should skip contributions that return undefined (defensive)', () => {
            const contrib1 = { getMetrics: () => 'metric1 42', startCollecting: () => { } };
            const contrib2 = { getMetrics: () => undefined as any, startCollecting: () => { } };
            const contrib3 = { getMetrics: () => 'metric3 200', startCollecting: () => { } };

            const backend = createBackendContribution([contrib1, contrib2, contrib3]);
            const result = backend.fetchMetricsFromProviders();

            // undefined should not corrupt the output
            assert.strictEqual(result, 'metric1 42\nmetric3 200\n');
            assert.strictEqual(result.includes('undefined'), false, 'should not contain literal "undefined"');
        });

        it('should skip contributions that return null (defensive)', () => {
            const contrib1 = { getMetrics: () => 'metric1 42', startCollecting: () => { } };
            const contrib2 = { getMetrics: () => null as any, startCollecting: () => { } };

            const backend = createBackendContribution([contrib1, contrib2]);
            const result = backend.fetchMetricsFromProviders();

            assert.strictEqual(result, 'metric1 42\n');
            assert.strictEqual(result.includes('null'), false, 'should not contain literal "null"');
        });

        it('should return empty string when all contributions return empty', () => {
            const contrib1 = { getMetrics: () => '', startCollecting: () => { } };
            const contrib2 = { getMetrics: () => '', startCollecting: () => { } };

            const backend = createBackendContribution([contrib1, contrib2]);
            const result = backend.fetchMetricsFromProviders();

            assert.strictEqual(result, '');
        });

        it('should return empty string when there are no contributions', () => {
            const backend = createBackendContribution([]);
            const result = backend.fetchMetricsFromProviders();

            assert.strictEqual(result, '');
        });

        it('should not add trailing separator for the last contribution', () => {
            const contrib1 = { getMetrics: () => 'metric1 42', startCollecting: () => { } };

            const backend = createBackendContribution([contrib1]);
            const result = backend.fetchMetricsFromProviders();

            // Single contribution should end with exactly one newline, not two
            assert.strictEqual(result, 'metric1 42\n');
            assert.strictEqual(result.endsWith('\n\n'), false);
        });
    });
});
