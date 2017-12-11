/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import * as yargs from 'yargs';
import { inject, named, injectable } from "inversify";
import { ILogger, ContributionProvider } from '../common';
import { CliContribution } from './cli';
import { Deferred } from '../common/promise-util';
import { BackendProcess } from './backend-process';
import * as fs from "fs-extra";

export const BackendApplicationContribution = Symbol("BackendApplicationContribution");
export interface BackendApplicationContribution {
    initialize?(): void;
    configure?(app: express.Application): void;
    onStart?(server: http.Server | https.Server): void;

    /**
     * Called when the backend application shuts down. Contributions must perform only synchronous operations.
     * Any kind of additional asynchronous work queued in the event loop will be ignored and abandoned.
     */
    onStop?(app?: express.Application): void;
}

const defaultPort = BackendProcess.electron ? 0 : 3000;
const defaultHost = 'localhost';
const defaultSSL = false;

@injectable()
export class BackendApplicationCliContribution implements CliContribution {

    port: number;
    hostname: string | undefined;
    ssl: boolean | undefined;
    cert: string | undefined;
    certkey: string | undefined;

    configure(conf: yargs.Argv): void {
        yargs.option('port', { alias: 'p', description: 'The port the backend server listens on.', type: 'number', default: defaultPort });
        yargs.option('hostname', { description: 'The allowed hostname for connections.', type: 'string', default: defaultHost });
        yargs.option('ssl', { description: 'Use SSL (HTTPS), cert and certkey must also be set', type: 'boolean', default: defaultSSL });
        yargs.option('cert', { description: 'Path to SSL certificate.', type: 'string' });
        yargs.option('certkey', { description: 'Path to SSL certificate key.', type: 'string' });
    }

    setArguments(args: yargs.Arguments): void {
        this.port = args.port;
        this.hostname = args.hostname;
        this.ssl = args.ssl;
        this.cert = args.cert;
        this.certkey = args.certkey;
    }
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
        @inject(BackendApplicationCliContribution) protected readonly cliParams: BackendApplicationCliContribution,
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

        // Handles normal process termination.
        process.on('exit', () => this.onStop());
        // Handles `Ctrl+C`.
        process.on('SIGINT', () => process.exit(0));
        // Handles `kill pid`.
        process.on('SIGTERM', () => process.exit(0));

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

    async start(aPort?: number, aHostname?: string): Promise<http.Server | https.Server> {
        const deferred = new Deferred<http.Server | https.Server>();
        let server: http.Server | https.Server;
        const port = aPort !== undefined ? aPort : this.cliParams.port;
        const hostname = aHostname !== undefined ? aHostname : this.cliParams.hostname;

        if (this.cliParams.ssl) {

            if (this.cliParams.cert === undefined) {
                throw new Error("Missing --cert option, see --help for usage");
            }

            if (this.cliParams.certkey === undefined) {
                throw new Error("Missing --certkey option, see --help for usage");
            }

            let key;
            let cert;
            try {
                key = await fs.readFile(this.cliParams.certkey as string);
            } catch (err) {
                await this.logger.error(`Can't read certificate key`);
                throw err;
            }

            try {
                cert = await fs.readFile(this.cliParams.cert as string);
            } catch (err) {
                await this.logger.error(`Can't read certificate`);
                throw err;
            }
            server = https.createServer({ key, cert }, this.app);
        } else {
            server = http.createServer(this.app);
        }

        server.listen(port, hostname, () => {
            const scheme = this.cliParams.ssl ? 'https' : 'http';
            this.logger.info(`Theia app listening on ${scheme}://${hostname || 'localhost'}:${server.address().port}.`);
            deferred.resolve(server);
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
        return deferred.promise;
    }

    private onStop(): void {
        for (const contrib of this.contributionsProvider.getContributions()) {
            if (contrib.onStop) {
                try {
                    contrib.onStop(this.app);
                } catch (err) {
                    this.logger.error(err);
                }
            }
        }
    }

}
