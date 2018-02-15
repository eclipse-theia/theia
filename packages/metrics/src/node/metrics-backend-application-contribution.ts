/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import { ILogger, ContributionProvider } from "@theia/core/lib/common";
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { MetricsContribution } from './metrics-contribution';

@injectable()
export class MetricsBackendApplicationContribution implements BackendApplicationContribution {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(ContributionProvider) @named(MetricsContribution)
        protected readonly metricsProviders: ContributionProvider<MetricsContribution>
    ) {
    }

    configure(app: express.Application) {
        app.get('/metrics', (req, res) => {
            const lastMetrics = this.fetchMetricsFromProviders();
            res.send(lastMetrics);
        });
    }

    onStart(server: http.Server | https.Server): void {
        this.metricsProviders.getContributions().forEach(contribution => {
            contribution.startCollecting();
        });
    }

    fetchMetricsFromProviders(): string {
        return this.metricsProviders.getContributions().reduce((total, contribution) =>
            total += contribution.getMetrics() + '\n'
            , "");
    }
}
