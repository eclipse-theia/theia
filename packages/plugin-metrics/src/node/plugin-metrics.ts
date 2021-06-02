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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MetricsContribution } from '@theia/metrics/lib/node/metrics-contribution';
import { METRICS_TIMEOUT } from '../common/metrics-protocol';
import { PluginMetricsContributor } from './metrics-contributor';
import { PluginMetricStringGenerator } from './metric-string-generator';

@injectable()
export class PluginMetricsContribution implements MetricsContribution {

    @inject(PluginMetricsContributor)
    protected readonly metricsContributor: PluginMetricsContributor;

    @inject(PluginMetricStringGenerator)
    protected readonly stringGenerator: PluginMetricStringGenerator;

    private metrics: string;

    getMetrics(): string {
        return this.metrics;
    }

    startCollecting(): void {
        setInterval(() => {
            const reconciledMetrics = this.metricsContributor.reconcile();
            this.metrics = this.stringGenerator.getMetricsString(reconciledMetrics);
        }, METRICS_TIMEOUT);
    }
}
