/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import * as yargs from 'yargs';
import * as fs from 'fs-extra';
import { inject, named, injectable } from 'inversify';
import { ILogger, ContributionProvider, MaybePromise } from '../common';
import { CliContribution } from './cli';
import { Deferred } from '../common/promise-util';
import { environment } from '../common/index';
import { AddressInfo } from 'net';

export const BackendApplicationContribution = Symbol('BackendApplicationContribution');
export interface BackendApplicationContribution {
    initialize?(): void;
    configure?(app: express.Application): void;
    onStart?(server: http.Server | https.Server): MaybePromise<void>;

    /**
     * Called when the backend application shuts down. Contributions must perform only synchronous operations.
     * Any kind of additional asynchronous work queued in the event loop will be ignored and abandoned.
     */
    onStop?(app?: express.Application): void;
}

const defaultPort = environment.electron.is() ? 0 : 3000;
const defaultHost = 'localhost';
const defaultSSL = false;

const appProjectPath = 'app-project-path';

@injectable()
export class BackendApplicationCliContribution implements CliContribution {

    port: number;
    hostname: string | undefined;
    ssl: boolean | undefined;
    cert: string | undefined;
    certkey: string | undefined;
    projectPath: string;

    configure(conf: yargs.Argv): void {
        conf.option('port', { alias: 'p', description: 'The port the backend server listens on.', type: 'number', default: defaultPort });
        conf.option('hostname', { alias: 'h', description: 'The allowed hostname for connections.', type: 'string', default: defaultHost });
        conf.option('ssl', { description: 'Use SSL (HTTPS), cert and certkey must also be set', type: 'boolean', default: defaultSSL });
        conf.option('cert', { description: 'Path to SSL certificate.', type: 'string' });
        conf.option('certkey', { description: 'Path to SSL certificate key.', type: 'string' });
        conf.option(appProjectPath, { description: 'Sets the application project directory', default: this.appProjectPath() });
    }

    setArguments(args: yargs.Arguments): void {
        this.port = args.port;
        this.hostname = args.hostname;
        this.ssl = args.ssl;
        this.cert = args.cert;
        this.certkey = args.certkey;
        this.projectPath = args[appProjectPath];
    }

    protected appProjectPath(): string {
        if (environment.electron.is()) {
            if (process.env.THEIA_APP_PROJECT_PATH) {
                return process.env.THEIA_APP_PROJECT_PATH;
            }
            throw new Error('The \'THEIA_APP_PROJECT_PATH\' environment variable must be set when running in electron.');
        }
        return process.cwd();
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
                } catch (error) {
                    this.logger.error('Could not initialize contribution', error);
                }
            }
        }

        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.configure) {
                try {
                    contribution.configure(this.app);
                } catch (error) {
                    this.logger.error('Could not configure contribution', error);
                }
            }
        }
    }

    use(...handlers: express.Handler[]): void {
        this.app.use(...handlers);
    }

    async start(aPort?: number, aHostname?: string): Promise<http.Server | https.Server> {
        const hostname = aHostname !== undefined ? aHostname : this.cliParams.hostname;
        const port = aPort !== undefined ? aPort : this.cliParams.port;

        const deferred = new Deferred<http.Server | https.Server>();
        let server: http.Server | https.Server;

        if (this.cliParams.ssl) {

            if (this.cliParams.cert === undefined) {
                throw new Error('Missing --cert option, see --help for usage');
            }

            if (this.cliParams.certkey === undefined) {
                throw new Error('Missing --certkey option, see --help for usage');
            }

            let key: Buffer;
            let cert: Buffer;
            try {
                key = await fs.readFile(this.cliParams.certkey as string);
            } catch (err) {
                await this.logger.error("Can't read certificate key");
                throw err;
            }

            try {
                cert = await fs.readFile(this.cliParams.cert as string);
            } catch (err) {
                await this.logger.error("Can't read certificate");
                throw err;
            }
            server = https.createServer({ key, cert }, this.app);
        } else {
            server = http.createServer(this.app);
        }

        server.on('error', error => {
            deferred.reject(error);
            /* The backend might run in a separate process,
             * so we defer `process.exit` to let time for logging in the parent process */
            setTimeout(process.exit, 0, 1);
        });

        server.listen(port, hostname, () => {
            const scheme = this.cliParams.ssl ? 'https' : 'http';
            this.logger.info(`Theia app listening on ${scheme}://${hostname || 'localhost'}:${(server.address() as AddressInfo).port}.`);
            deferred.resolve(server);
        });

        /* Allow any number of websocket servers.  */
        server.setMaxListeners(0);

        for (const contrib of this.contributionsProvider.getContributions()) {
            if (contrib.onStart) {
                try {
                    await contrib.onStart(server);
                } catch (error) {
                    this.logger.error('Could not start contribution', error);
                }
            }
        }
        return deferred.promise;
    }

    protected onStop(): void {
        for (const contrib of this.contributionsProvider.getContributions()) {
            if (contrib.onStop) {
                try {
                    contrib.onStop(this.app);
                } catch (error) {
                    this.logger.error('Could not stop contribution', error);
                }
            }
        }
    }

}
