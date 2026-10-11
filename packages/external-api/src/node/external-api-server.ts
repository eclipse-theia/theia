// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContributionProvider, DisposableCollection } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as express from '@theia/core/shared/express';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as crypto from 'crypto';
import * as http from 'http';
import { ExternalApiConfigService, ExternalApiServerConfig } from '../common/external-api-configuration';
import { EXTERNAL_API_DEFAULT_HOSTNAME, EXTERNAL_API_PORT_PREF, EXTERNAL_API_TOKEN_PREF } from '../common/external-api-preferences';
import { ExternalApiContribution } from './external-api-contribution';
import { ExternalApiResponseWriter } from './external-api-response-writer';
import { ExternalApiRouterFactory } from './external-api-router';
import { OpenApiDocumentBuilder, OpenApiDocumentSource } from './openapi-document-builder';

/**
 * Serves the {@link ExternalApiContribution}s, either on a dedicated HTTP server or on
 * Theia's main HTTP server, as configured by the external API preferences pushed by the
 * frontend. It is off by default, applies configuration changes immediately, and protects
 * contributions by bearer token verification when a token is configured (unless they opted out).
 *
 * The external API is for external tools, not for browser pages: requests carrying an
 * `Origin` header are rejected so that web pages cannot drive the API cross-origin,
 * see {@link checkCrossOrigin}.
 *
 * The configuration applies to the backend as a whole: when several frontends are connected,
 * the configuration pushed last wins, and it stays in effect until it is changed or the
 * backend stops. It is not revoked when the frontend that pushed it disconnects.
 *
 * The dedicated server allows external tools to consume Theia APIs independently of the
 * main server's frontend-oriented protections. In Electron deployments the main port requires
 * the Electron security token, so `samePort` delivery is not reachable for external processes
 * there without further customizations. With `samePort` delivery, contribution paths share the
 * main server's path space: a contribution answers everything below its path, so a path that
 * nests with one of Theia's own routes shadows it.
 */
@injectable()
export class ExternalApiServer implements ExternalApiConfigService, BackendApplicationContribution {

    @inject(ILogger) @named('external-api:ExternalApiServer')
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(ExternalApiContribution)
    protected readonly contributions: ContributionProvider<ExternalApiContribution>;

    @inject(ExternalApiResponseWriter)
    protected readonly responseWriter: ExternalApiResponseWriter;

    @inject(ExternalApiRouterFactory)
    protected readonly routerFactory: ExternalApiRouterFactory;

    @inject(OpenApiDocumentBuilder)
    protected readonly documentBuilder: OpenApiDocumentBuilder;

    protected config?: ExternalApiServerConfig;
    protected server?: http.Server;
    /** Router serving the contributions on the main HTTP server with `samePort` delivery. */
    protected mainPortRouter?: express.Router;
    /** Serializes configuration updates to avoid concurrent server starts/stops. */
    protected pendingUpdate: Promise<void> = Promise.resolve();
    /**
     * The contribution routers of the current routing build. Disposed before the next build
     * and on shutdown, so that long-lived connections such as event streams are closed and
     * clients reconnect against the new configuration.
     */
    protected readonly toDisposeOnRebuild = new DisposableCollection();

    configure(app: express.Application): void {
        // delegate to the current router so that `samePort` delivery can follow preference
        // changes although express does not support unmounting routes
        app.use((request, response, next) => {
            if (this.mainPortRouter) {
                this.mainPortRouter(request, response, next);
            } else {
                next();
            }
        });
    }

    async updateConfig(config: ExternalApiServerConfig): Promise<void> {
        // a blank hostname must not reach `listen`, where Node would fall back to binding all interfaces
        const hostname = typeof config.hostname === 'string' ? config.hostname.trim() : '';
        const normalized: ExternalApiServerConfig = {
            delivery: config.delivery === 'samePort' || config.delivery === 'separatePort' ? config.delivery : 'off',
            port: Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 ? config.port : 0,
            hostname: hostname || EXTERNAL_API_DEFAULT_HOSTNAME,
            token: config.token ? config.token : undefined
        };
        const update = this.pendingUpdate.then(() => this.applyConfig(normalized));
        // keep the chain settled so that a failed update does not block later configuration changes
        this.pendingUpdate = update.catch(() => undefined);
        return update;
    }

    onStop(): void {
        this.toDisposeOnRebuild.dispose();
        this.stop().catch(error => this.logger.error('Failed to stop the external API server.', error));
    }

    protected async applyConfig(config: ExternalApiServerConfig): Promise<void> {
        if (this.config
            && this.config.delivery === config.delivery
            && this.config.port === config.port
            && this.config.hostname === config.hostname
            && this.config.token === config.token) {
            return;
        }
        this.config = config;
        this.mainPortRouter = undefined;
        await this.stop();
        this.toDisposeOnRebuild.dispose();
        try {
            switch (config.delivery) {
                case 'off':
                    return;
                case 'samePort':
                    this.mainPortRouter = this.createRouter(config);
                    this.logger.info('The external API is served on the main HTTP server'
                        + (config.token ? ' (token required)' : ' (unprotected)'));
                    return;
                case 'separatePort':
                    if (config.port === 0) {
                        this.logger.warn(`External API delivery is set to 'separatePort' but no port is configured ('${EXTERNAL_API_PORT_PREF}').`);
                        return;
                    }
                    this.server = await this.start(config);
                    this.logServed(config);
            }
        } catch (error) {
            this.logger.error(`Failed to serve the external API ${this.describeTarget(config)}.`, error);
            // forget the failing config so that pushing the same preferences again retries,
            // e.g. once the occupied port has been freed
            this.config = undefined;
            // drop the routing of the failed build, which is not served
            this.mainPortRouter = undefined;
            this.toDisposeOnRebuild.dispose();
            this.documentBuilder.update([], !!config.token);
        }
    }

    /** Describes where the external API is served, for log messages. */
    protected describeTarget(config: ExternalApiServerConfig): string {
        return config.delivery === 'separatePort' ? `at http://${config.hostname}:${config.port}` : 'on the main HTTP server';
    }

    protected logServed(config: ExternalApiServerConfig): void {
        const served = `The external API is served at http://${config.hostname}:${config.port}`;
        if (config.token) {
            this.logger.info(`${served} (token required)`);
        } else if (this.isLoopbackHostname(config.hostname)) {
            this.logger.info(`${served} (unprotected)`);
        } else {
            this.logger.warn(`${served} without token verification although '${config.hostname}' may accept remote connections. `
                + `Configure a token ('${EXTERNAL_API_TOKEN_PREF}') to protect it.`);
        }
    }

    /** Whether the hostname only accepts connections from the local machine. */
    protected isLoopbackHostname(hostname: string): boolean {
        const normalized = hostname.toLowerCase();
        return normalized === 'localhost' || normalized === '::1' || /^127(\.\d{1,3}){3}$/.test(normalized);
    }

    protected start(config: ExternalApiServerConfig): Promise<http.Server> {
        const app = express();
        app.use(this.createRouter(config));
        // answer paths outside all contributions in the uniform error format instead of express' HTML 404
        app.use((request: express.Request, response: express.Response) => this.responseWriter.writeError(404, 'not found', response));
        return new Promise((resolve, reject) => {
            const server = app.listen(config.port, config.hostname);
            server.once('error', reject);
            server.once('listening', () => {
                server.removeListener('error', reject);
                // keep an error listener so that later failures are logged instead of crashing the backend
                server.on('error', error => this.logger.error(`The external API server ${this.describeTarget(config)} failed.`, error));
                resolve(server);
            });
        });
    }

    protected async stop(): Promise<void> {
        const server = this.server;
        if (!server) {
            return;
        }
        this.server = undefined;
        await new Promise<void>(resolve => {
            server.close(() => resolve());
            server.closeAllConnections();
        });
    }

    protected createRouter(config: ExternalApiServerConfig): express.Router {
        const apiRouter = express.Router();
        const mountedPaths = new Set<string>();
        const documentSources: OpenApiDocumentSource[] = [];
        const token = config.token;
        const isAuthorized = token ? (request: express.Request) => this.matchesToken(request.headers.authorization, `Bearer ${token}`) : undefined;
        for (const contribution of this.contributions.getContributions()) {
            if (mountedPaths.has(contribution.path)) {
                this.logger.warn(`Skipped an external API contribution: another contribution already uses the path '${contribution.path}'.`);
                continue;
            }
            const overlapping = this.findOverlappingPath(contribution.path, mountedPaths);
            if (overlapping) {
                // express matches `use` by path-segment prefix and each contribution answers everything
                // below its path (including a catch-all 404), so nested paths shadow each other
                this.logger.warn(`Skipped an external API contribution: its path '${contribution.path}' nests with `
                    + `the path '${overlapping}' of another contribution. Contribution paths must not nest.`);
                continue;
            }
            mountedPaths.add(contribution.path);
            const router = express.Router();
            // guard the contribution paths only: with `samePort` delivery, requests to the rest
            // of the main server pass through this routing and must stay unaffected
            router.use((request, response, next) => this.checkCrossOrigin(request, response, next));
            if (token && !contribution.unprotected) {
                router.use((request, response, next) => this.checkAuthorization(token, request, response, next));
            }
            const contributionRouter = this.routerFactory({ contributionPath: contribution.path, router, isAuthorized });
            this.toDisposeOnRebuild.push(contributionRouter);
            try {
                contribution.configure(contributionRouter);
            } catch (error) {
                this.logger.error(`Failed to configure the external API contribution for '${contribution.path}'; it is not served.`, error);
                continue;
            }
            contributionRouter.finalize();
            apiRouter.use(contribution.path, router);
            documentSources.push({
                contribution,
                routes: contributionRouter.routeRegistrations,
                eventStreams: contributionRouter.eventStreamRegistrations
            });
        }
        this.documentBuilder.update(documentSources, !!config.token);
        return apiRouter;
    }

    /**
     * Returns a mounted path that nests with the candidate path, i.e. one is a path-segment
     * prefix of the other, or `undefined` when the candidate nests with no mounted path.
     * The root path `/` nests with every path, as everything is below it.
     */
    protected findOverlappingPath(path: string, mountedPaths: ReadonlySet<string>): string | undefined {
        const segments = this.pathSegments(path);
        for (const mounted of mountedPaths) {
            const mountedSegments = this.pathSegments(mounted);
            if (this.isSegmentPrefix(segments, mountedSegments) || this.isSegmentPrefix(mountedSegments, segments)) {
                return mounted;
            }
        }
        return undefined;
    }

    /** Splits a path into its non-empty segments, e.g. `/api/ai/` into `['api', 'ai']`. */
    protected pathSegments(path: string): string[] {
        return path.split('/').filter(segment => segment.length > 0);
    }

    /** Whether the segments start with all of the prefix segments, i.e. whether the prefix path contains them. */
    protected isSegmentPrefix(segments: readonly string[], prefix: readonly string[]): boolean {
        return prefix.every((segment, index) => segments[index] === segment);
    }

    /**
     * Rejects requests carrying an `Origin` header with `403`. Such requests come from a browser
     * context, and browsers execute CORS-simple cross-origin requests before any preflight, so a
     * malicious page could otherwise drive state-changing routes, most notably with `samePort`
     * delivery, where the external API shares the main server's port. The main server's
     * cookie-based `HttpConnectionValidator` cannot protect these routes because external tools
     * never hold the connection-token cookie; such tools do not send an `Origin` header either,
     * so they are unaffected by this guard.
     */
    protected checkCrossOrigin(request: express.Request, response: express.Response, next: express.NextFunction): void {
        if (request.headers.origin === undefined) {
            next();
        } else {
            this.responseWriter.writeError(403, 'forbidden', response);
        }
    }

    protected checkAuthorization(token: string, request: express.Request, response: express.Response, next: express.NextFunction): void {
        if (this.matchesToken(request.headers.authorization, `Bearer ${token}`)) {
            next();
        } else {
            this.responseWriter.writeError(401, 'unauthorized', response);
        }
    }

    protected matchesToken(actual: string | undefined, expected: string): boolean {
        if (actual === undefined) {
            return false;
        }
        // hashing yields equal-length buffers, allowing a timing-safe comparison of arbitrary input
        const actualDigest = crypto.createHash('sha256').update(actual).digest();
        const expectedDigest = crypto.createHash('sha256').update(expected).digest();
        return crypto.timingSafeEqual(actualDigest, expectedDigest);
    }
}
