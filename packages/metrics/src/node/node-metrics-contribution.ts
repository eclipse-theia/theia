/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as prom from 'prom-client';
import { injectable } from 'inversify';
import { MetricsContribution } from './';

@injectable()
export class NodeMetricsContribution implements MetricsContribution {
    getMetrics(): string {
        return prom.register.metrics().toString();
    }

    startCollecting(): void {
        const collectDefaultMetrics = prom.collectDefaultMetrics;

        // Probe every 5th second.
        collectDefaultMetrics({ timeout: 5000 });
    }
}
