/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as express from 'express';
import { inject, named, injectable } from "inversify";
import { ContributionProvider } from '../common/contribution-provider';
import { ILogger } from '../common/logger';

export const BackendApplicationContribution = Symbol("BackendApplicationContribution");
export interface BackendApplicationContribution {
    configure?(app: express.Application): void;
    onStart?(server: http.Server): void;
}

/**
 * The main entry point for Theia applications.
 */
@injectable()
export class BackendApplication {

    private app: express.Application;

    constructor( @inject(ContributionProvider) @named(BackendApplicationContribution) private contributionsProvider: ContributionProvider<BackendApplicationContribution>,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    start(port: number = 3000): Promise<void> {
        const contributions = this.contributionsProvider.getContributions()
        this.app = express();
        for (const contrib of contributions) {
            if (contrib.configure) {
                contrib.configure(this.app);
            }
        }
        return new Promise<void>(resolve => {
            const server = this.app.listen(port, () => {
                this.logger.info(`Theia app listening on port ${port}.`);
                resolve();
            });
            for (const contrib of contributions) {
                if (contrib.onStart) {
                    contrib.onStart(server);
                }
            }
        });
    }

}
