/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import { ILogger } from "@theia/core/lib/common";
import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as prom from 'prom-client';

@injectable()
export class MetricsBackendContribution implements BackendApplicationContribution {
    constructor(
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    configure(app: express.Application) {
        app.get('/metrics', (req, res) => {
            res.send(prom.register.metrics().toString());
        });
    }

    onStart(server: http.Server | https.Server): void {
        const collectDefaultMetrics = prom.collectDefaultMetrics;

        // Probe every 5th second.
        collectDefaultMetrics({ timeout: 5000 });
    }
}
