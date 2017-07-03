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
    private fs = require('fs');


    constructor(
        @inject(ContributionProvider) @named(BackendApplicationContribution)
        protected readonly contributionsProvider: ContributionProvider<BackendApplicationContribution>,
        @inject(ILogger) protected readonly logger: ILogger
<<<<<<< HEAD:src/application/node/application.ts
    ) { }

    createFile(portNumber: number) {

        this.fs.writeFile('port', portNumber.toString(), function (err: string) {
            if (err) {
                return console.error(err);
            }
        });
    }

    start(portNumber: number): Promise<void> {
        const contributions = this.contributionsProvider.getContributions()
        this.app = express();

        if (portNumber < 1024 || isNaN(portNumber)) {
            portNumber = 3000
        }

        for (const contrib of contributions) {
            if (contrib.configure) {
                contrib.configure(this.app);
            }
        }


        return this.attemptToListen(contributions, portNumber)
    }


    attemptToListen(contributions: BackendApplicationContribution[], portNumber: number): Promise<void> {
        this.createFile(portNumber)
        let self = this;
=======
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
>>>>>>> b414199ab9ff3c822be7160fd9a3c00faf5b9431:src/application/node/backend-application.ts
        return new Promise<void>(resolve => {
            const server = this.app.listen(portNumber, function () {
                console.log(`Theia app listening on port ` + portNumber);
                resolve();
            }).on('error', function (e) {
                portNumber++
                self.attemptToListen(contributions, portNumber)
            });
<<<<<<< HEAD:src/application/node/application.ts

            for (const contrib of contributions) {
=======
            for (const contrib of this.contributionsProvider.getContributions()) {
>>>>>>> b414199ab9ff3c822be7160fd9a3c00faf5b9431:src/application/node/backend-application.ts
                if (contrib.onStart) {
                    contrib.onStart(server);
                }
            }
        });
    }

}
