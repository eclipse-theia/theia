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
    initialize?(): void;
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
        process.on('uncaughtException', error => {
            if (error) {
                logger.error('Uncaught Exception: ', error.toString());
                if (error.stack) {
                    logger.error(error.stack);
                }
            }
        });

        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.initialize) {
                try {
                    contribution.initialize();
                } catch (err) {
                    this.logger.error(err.toString());
                }
            }
        }

        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.configure) {
                try {
                    contribution.configure(this.app);
                } catch (err) {
                    this.logger.error(err.toString());
                }
            }
        }
    }

    use(...handlers: express.Handler[]): void {
        this.app.use(...handlers);
    }

    start(port: number = 0, hostname?: string): Promise<http.Server> {
        return new Promise(resolve => {
            let server: http.Server;
            server = this.app.listen(port, hostname!, () => {
                this.logger.info(`Theia app listening on port ${server.address().port}.`);
                resolve(server);
            });

            /* Allow any number of websocket servers.  */
            server.setMaxListeners(0);

            for (const contrib of this.contributionsProvider.getContributions()) {
                if (contrib.onStart) {
                    try {
                        contrib.onStart(server);
                    } catch (err) {
                        this.logger.error(err.toString());
                    }
                }
            }
        });
    }

}
