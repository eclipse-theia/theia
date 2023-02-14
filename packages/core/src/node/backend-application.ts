// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import * as yargs from 'yargs';
import * as fs from 'fs-extra';
import { inject, named, injectable, postConstruct } from 'inversify';
import { ContributionProvider, MaybePromise, Stopwatch } from '../common';
import { CliContribution } from './cli';
import { Deferred } from '../common/promise-util';
import { environment } from '../common/index';
import { AddressInfo } from 'net';
import { ApplicationPackage } from '@theia/application-package';
import { ProcessUtils } from './process-utils';

const APP_PROJECT_PATH = 'app-project-path';

const TIMER_WARNING_THRESHOLD = 50;

const DEFAULT_PORT = environment.electron.is() ? 0 : 3000;
const DEFAULT_HOST = 'localhost';
const DEFAULT_SSL = false;

export const BackendApplicationServer = Symbol('BackendApplicationServer');
/**
 * This service is responsible for serving the frontend files.
 *
 * When not bound, `@theia/cli` generators will bind it on the fly to serve files according to its own layout.
 */
export interface BackendApplicationServer extends BackendApplicationContribution { }

export const BackendApplicationContribution = Symbol('BackendApplicationContribution');
/**
 * Contribution for hooking into the backend lifecycle.
 */
export interface BackendApplicationContribution {
    /**
     * Called during the initialization of the backend application.
     * Use this for functionality which has to run as early as possible.
     *
     * The implementation may be async, however it will still block the
     * initialization step until it's resolved.
     *
     * @returns either `undefined` or a Promise resolving to `undefined`.
     */
    initialize?(): MaybePromise<void>;

    /**
     * Called after the initialization of the backend application is complete.
     * Use this to configure the Express app before it is started, for example
     * to offer additional endpoints.
     *
     * The implementation may be async, however it will still block the
     * configuration step until it's resolved.
     *
     * @param app the express application to configure.
     *
     * @returns either `undefined` or a Promise resolving to `undefined`.
     */
    configure?(app: express.Application): MaybePromise<void>;

    /**
     * Called right after the server for the Express app is started.
     * Use this to additionally configure the server or as ready-signal for your service.
     *
     * The implementation may be async, however it will still block the
     * startup step until it's resolved.
     *
     * @param server the backend server running the express app.
     *
     * @returns either `undefined` or a Promise resolving to `undefined`.
     */
    onStart?(server: http.Server | https.Server): MaybePromise<void>;

    /**
     * Called when the backend application shuts down. Contributions must perform only synchronous operations.
     * Any kind of additional asynchronous work queued in the event loop will be ignored and abandoned.
     *
     * @param app the express application.
     */
    onStop?(app?: express.Application): void;
}

@injectable()
export class BackendApplicationCliContribution implements CliContribution {

    port: number;
    hostname: string | undefined;
    ssl: boolean | undefined;
    cert: string | undefined;
    certkey: string | undefined;
    projectPath: string;

    configure(conf: yargs.Argv): void {
        conf.option('port', { alias: 'p', description: 'The port the backend server listens on.', type: 'number', default: DEFAULT_PORT });
        conf.option('hostname', { alias: 'h', description: 'The allowed hostname for connections.', type: 'string', default: DEFAULT_HOST });
        conf.option('ssl', { description: 'Use SSL (HTTPS), cert and certkey must also be set', type: 'boolean', default: DEFAULT_SSL });
        conf.option('cert', { description: 'Path to SSL certificate.', type: 'string' });
        conf.option('certkey', { description: 'Path to SSL certificate key.', type: 'string' });
        conf.option(APP_PROJECT_PATH, { description: 'Sets the application project directory', default: this.appProjectPath() });
    }

    setArguments(args: yargs.Arguments): void {
        this.port = args.port as number;
        this.hostname = args.hostname as string;
        this.ssl = args.ssl as boolean;
        this.cert = args.cert as string;
        this.certkey = args.certkey as string;
        this.projectPath = args[APP_PROJECT_PATH] as string;
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

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    @inject(ProcessUtils)
    protected readonly processUtils: ProcessUtils;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    constructor(
        @inject(ContributionProvider) @named(BackendApplicationContribution)
        protected readonly contributionsProvider: ContributionProvider<BackendApplicationContribution>,
        @inject(BackendApplicationCliContribution) protected readonly cliParams: BackendApplicationCliContribution) {
        process.on('uncaughtException', error => {
            this.handleUncaughtError(error);
        });

        // Workaround for Electron not installing a handler to ignore SIGPIPE error
        // (https://github.com/electron/electron/issues/13254)
        process.on('SIGPIPE', () => {
            console.error(new Error('Unexpected SIGPIPE'));
        });
        /**
         * Kill the current process tree on exit.
         */
        function signalHandler(signal: NodeJS.Signals): never {
            process.exit(1);
        }
        // Handles normal process termination.
        process.on('exit', () => this.onStop());
        // Handles `Ctrl+C`.
        process.on('SIGINT', signalHandler);
        // Handles `kill pid`.
        process.on('SIGTERM', signalHandler);
    }

    protected async initialize(): Promise<void> {
        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.initialize) {
                try {
                    await this.measure(contribution.constructor.name + '.initialize',
                        () => contribution.initialize!()
                    );
                } catch (error) {
                    console.error('Could not initialize contribution', error);
                }
            }
        }
    }

    @postConstruct()
    protected async configure(): Promise<void> {
        // Do not await the initialization because contributions are expected to handle
        // concurrent initialize/configure in undefined order if they provide both
        this.initialize();

        this.app.get('*.js', this.serveGzipped.bind(this, 'text/javascript'));
        this.app.get('*.js.map', this.serveGzipped.bind(this, 'application/json'));
        this.app.get('*.css', this.serveGzipped.bind(this, 'text/css'));
        this.app.get('*.wasm', this.serveGzipped.bind(this, 'application/wasm'));
        this.app.get('*.gif', this.serveGzipped.bind(this, 'image/gif'));
        this.app.get('*.png', this.serveGzipped.bind(this, 'image/png'));
        this.app.get('*.svg', this.serveGzipped.bind(this, 'image/svg+xml'));

        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.configure) {
                try {
                    await this.measure(contribution.constructor.name + '.configure',
                        () => contribution.configure!(this.app)
                    );
                } catch (error) {
                    console.error('Could not configure contribution', error);
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
                console.error("Can't read certificate key");
                throw err;
            }

            try {
                cert = await fs.readFile(this.cliParams.cert as string);
            } catch (err) {
                console.error("Can't read certificate");
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
            console.info(`Theia app listening on ${scheme}://${hostname || 'localhost'}:${(server.address() as AddressInfo).port}.`);
            deferred.resolve(server);
        });

        /* Allow any number of websocket servers.  */
        server.setMaxListeners(0);

        for (const contribution of this.contributionsProvider.getContributions()) {
            if (contribution.onStart) {
                try {
                    await this.measure(contribution.constructor.name + '.onStart',
                        () => contribution.onStart!(server)
                    );
                } catch (error) {
                    console.error('Could not start contribution', error);
                }
            }
        }
        return this.stopwatch.startAsync('server', 'Finished starting backend application', () => deferred.promise);
    }

    protected onStop(): void {
        console.info('>>> Stopping backend contributions...');
        for (const contrib of this.contributionsProvider.getContributions()) {
            if (contrib.onStop) {
                try {
                    contrib.onStop(this.app);
                } catch (error) {
                    console.error('Could not stop contribution', error);
                }
            }
        }
        console.info('<<< All backend contributions have been stopped.');
        this.processUtils.terminateProcessTree(process.pid);
    }

    protected async serveGzipped(contentType: string, req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
        const acceptedEncodings = req.acceptsEncodings();

        const gzUrl = `${req.url}.gz`;
        const gzPath = path.join(this.applicationPackage.projectPath, 'lib', gzUrl);
        if (acceptedEncodings.indexOf('gzip') === -1 || !(await fs.pathExists(gzPath))) {
            next();
            return;
        }

        req.url = gzUrl;

        res.set('Content-Encoding', 'gzip');
        res.set('Content-Type', contentType);

        next();
    }

    protected async measure<T>(name: string, fn: () => MaybePromise<T>): Promise<T> {
        return this.stopwatch.startAsync(name, `Backend ${name}`, fn, { thresholdMillis: TIMER_WARNING_THRESHOLD });
    }

    protected handleUncaughtError(error: Error): void {
        if (error) {
            console.error('Uncaught Exception: ', error.toString());
            if (error.stack) {
                console.error(error.stack);
            }
        }
    }

}
