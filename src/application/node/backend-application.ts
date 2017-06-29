/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as express from 'express';
import { inject, named, injectable } from "inversify";
import { ILogger, ContributionProvider } from '../common';

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

    protected readonly app: express.Application = express();

    constructor(
        @inject(ContributionProvider) @named(BackendApplicationContribution)
        protected readonly contributionsProvider: ContributionProvider<BackendApplicationContribution>,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        process.on('uncaughtException', (error: any) => {
            logger.error('Uncaught Exception: ', error.toString());
            if (error.stack) {
                logger.error(error.stack);
            }
        });
        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.configure) {
                contribution.configure(this.app);
            }
        }
    }

    use(...handlers: express.Handler[]): void {
        this.app.use(...handlers);
    }

    start(port: number = 3000): Promise<void> {
        return new Promise<void>(resolve => {
            const server = this.app.listen(port, () => {
                this.logger.info(`Theia app listening on port ${port}.`);
                resolve();
            });
            for (const contrib of this.contributionsProvider.getContributions()) {
                if (contrib.onStart) {
                    contrib.onStart(server);
                }
            }
        });
    }

}
