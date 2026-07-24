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

import { Disposable, DisposableCollection, MaybePromise } from '@theia/core';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ILogger } from '@theia/core/lib/common/logger';
import * as Ajv from '@theia/core/shared/ajv';
import * as express from '@theia/core/shared/express';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as http from 'http';
import { RestBodySchema } from '../common/rest-body-schema';
import { ExternalApiEventStream, ExternalApiEventStreamFactory, ExternalApiEventStreamOptions } from './external-api-event-stream';
import { ExternalApiResponseWriter } from './external-api-response-writer';
import { RestResult } from './rest-result';

/** HTTP methods supported by the typed routes of the {@link ExternalApiRouter}. */
export type RestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Documentation of a typed route, published in the OpenAPI document of the external API.
 *
 * All documentation is optional: undocumented routes are served all the same and appear in
 * the OpenAPI document with their method, path, and body schema only.
 */
export interface RestRouteDocumentation {
    /** Stable operation id, unique across the external API, e.g. `createChatSession`. */
    operationId?: string;
    /** Short summary of what the route does. */
    summary?: string;
    /** Longer description of the route; CommonMark. */
    description?: string;
    /** Documentation of the route's path parameters, e.g. of `id` for a route registered on `/:id`. */
    params?: Record<string, RestParamDocumentation>;
    /** Documented responses of the route by status code. Declarative documentation only — not enforced. */
    responses?: Record<number, RestResponseDocumentation>;
}

/**
 * Documentation of a path parameter of a typed route, see {@link RestRouteDocumentation}.
 */
export interface RestParamDocumentation {
    /** Description of the parameter. */
    description: string;
    /** JSON Schema of the parameter. Defaults to `{ "type": "string" }`. */
    schema?: IJSONSchema;
}

/**
 * Documentation of a response of a typed route, see {@link RestRouteDocumentation}.
 */
export interface RestResponseDocumentation {
    /** Description of the response. */
    description: string;
    /** JSON Schema of the JSON response body, if the response carries one. */
    schema?: IJSONSchema;
}

/**
 * Options of a typed route, see {@link ExternalApiRouter}.
 */
export interface RestRouteOptions<B = undefined> extends RestRouteDocumentation {
    /**
     * JSON Schema of the request body. When declared, the request body is parsed as JSON and
     * validated against the schema — violations are rejected with a client error carrying
     * the validation messages as details, without invoking the handler — and the schema is
     * published in the OpenAPI document.
     */
    bodySchema?: RestBodySchema<B>;
    /**
     * Additional validation for constraints the {@link bodySchema} cannot express, such as
     * cross-field dependencies, running on the schema-valid body. Returns `undefined` (or an
     * empty string) when the body is valid, otherwise the error message the request is
     * rejected with.
     */
    validate?: (body: B) => string | undefined;
    /** JSON body size limit of this route, e.g. '2mb'. Defaults to '1mb'. Only used together with {@link bodySchema}. */
    jsonLimit?: string;
}

/**
 * Request of a typed route handler, see {@link ExternalApiRouter}.
 */
export interface RestRequest<B = undefined> {
    /** Path parameters of the matched route, e.g. `id` for a route registered on `/:id`. */
    readonly params: Readonly<Record<string, string>>;
    /** The schema-valid request body; `undefined` for routes without a body schema. */
    readonly body: B;
    /**
     * Whether the request carries the configured external API token; `true` when no token is
     * configured. For routes of token-protected contributions this is always `true`, as
     * unauthorized requests are rejected before the handler runs. Unprotected contributions
     * can use it to serve a reduced public view to unauthorized requests, as the OpenAPI
     * document endpoint does.
     */
    readonly authorized: boolean;
    /** The underlying express request, e.g. to access the query string or headers. */
    readonly raw: express.Request;
}

/**
 * Handler of a typed route: computes a {@link RestResult} for a {@link RestRequest}.
 * Thrown errors are logged and answered with `500` in the uniform error format.
 */
export type RestHandler<B = undefined> = (request: RestRequest<B>) => MaybePromise<RestResult>;

/**
 * A typed route registered on an {@link ExternalApiRouter}, recorded for the OpenAPI
 * document builder.
 */
export interface RestRouteRegistration {
    method: RestMethod;
    /** Contribution-relative express path, e.g. `/:id/prompt`. */
    path: string;
    /** The route's documentation, when given. */
    documentation?: RestRouteDocumentation;
    /** JSON Schema of the request body, when declared. */
    bodySchema?: IJSONSchema;
}

/**
 * An event stream registered on an {@link ExternalApiRouter}, recorded for the OpenAPI
 * document builder.
 */
export interface RestEventStreamRegistration {
    /** Contribution-relative express path, e.g. `/events`. */
    path: string;
    options: ExternalApiEventStreamOptions<unknown>;
}

export const ExternalApiRouterOptions = Symbol('ExternalApiRouterOptions');
/**
 * Instantiation options of an {@link ExternalApiRouter}, provided by the external API server.
 */
export interface ExternalApiRouterOptions {
    /** Path under which the contribution's routes are mounted, used to give log messages context. */
    contributionPath: string;
    /** The underlying express router. */
    router: express.Router;
    /**
     * Checks whether a request carries the configured external API token, see
     * {@link RestRequest.authorized}. `undefined` when no token is configured; every
     * request counts as authorized then.
     */
    isAuthorized?: (request: express.Request) => boolean;
}

export const ExternalApiRouterFactory = Symbol('ExternalApiRouterFactory');
/** Creates the {@link ExternalApiRouter} passed to each `ExternalApiContribution`. */
export type ExternalApiRouterFactory = (options: ExternalApiRouterOptions) => ExternalApiRouter;

export const ExternalApiRouter = Symbol('ExternalApiRouter');
/**
 * Registers the routes of an `ExternalApiContribution`, taking care of the recurring endpoint
 * mechanics so that all contributions of the external API behave consistently:
 *
 * - Typed routes ({@link get}, {@link post}, ...) parse request bodies as JSON, validate them
 *   against the declared body schema (plus the optional custom validation), and write the
 *   handler's {@link RestResult} — including all error cases — through the
 *   {@link ExternalApiResponseWriter}, giving all endpoints one wire format.
 * - Typed routes and their optional documentation are recorded and published in the OpenAPI
 *   document of the external API, see `OpenApiDocumentBuilder`.
 * - {@link eventStream} serves server-sent events with connected-client management,
 *   keep-alive comments, and coalesced broadcasts.
 * - {@link raw} exposes the underlying express router as an escape hatch for routes the
 *   typed registration does not cover.
 *
 * A router is created for each routing build and disposed before the next build (on
 * configuration changes) and on shutdown: event streams are closed automatically, and
 * contributions register their own build-scoped resources — such as event listeners — in
 * {@link toDispose}.
 */
export interface ExternalApiRouter extends Disposable {

    /** Disposed when the routing is rebuilt or the external API server stops. */
    readonly toDispose: DisposableCollection;

    /** The typed routes registered on this router, in registration order. */
    readonly routeRegistrations: readonly RestRouteRegistration[];

    /** The event streams registered on this router, in registration order. */
    readonly eventStreamRegistrations: readonly RestEventStreamRegistration[];

    /**
     * The underlying express router, mounted at the contribution's path behind the token
     * verification. Full-power escape hatch: existing express routers and middlewares can
     * be mounted here unchanged, keeping their own request handling and response format.
     * Errors they do not handle themselves are reduced to the uniform error format and
     * unmatched paths are answered with `404` in that format, their routes are not
     * published in the OpenAPI document, and their build-scoped resources belong in
     * {@link toDispose}.
     */
    readonly raw: express.Router;

    /** Registers a typed `GET` route. */
    get(path: string, handler: RestHandler<undefined>): void;
    get(path: string, documentation: RestRouteDocumentation, handler: RestHandler<undefined>): void;

    /** Registers a typed `POST` route, validating the request body when a body schema is declared. */
    post(path: string, handler: RestHandler<undefined>): void;
    post<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;

    /** Registers a typed `PUT` route, validating the request body when a body schema is declared. */
    put(path: string, handler: RestHandler<undefined>): void;
    put<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;

    /** Registers a typed `PATCH` route, validating the request body when a body schema is declared. */
    patch(path: string, handler: RestHandler<undefined>): void;
    patch<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;

    /** Registers a typed `DELETE` route. */
    delete(path: string, handler: RestHandler<undefined>): void;
    delete(path: string, documentation: RestRouteDocumentation, handler: RestHandler<undefined>): void;

    /**
     * Registers a `GET` route serving server-sent events. The returned stream manages the
     * connected clients (see {@link ExternalApiEventStream}) and is disposed with this
     * router, ending all client connections so that clients reconnect against a new
     * configuration.
     */
    eventStream<T>(path: string, options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T>;

    /**
     * Appends the fallback handling that answers unmatched paths below the contribution with
     * `404` and reduces unhandled route errors — including malformed JSON bodies — to the
     * uniform error format. Called by the external API server once the contribution is
     * configured, so that it runs after all contributed routes.
     */
    finalize(): void;
}

/**
 * Default implementation of the {@link ExternalApiRouter}.
 */
@injectable()
export class ExternalApiRouterImpl implements ExternalApiRouter {

    @inject(ILogger) @named('external-api:ExternalApiRouter')
    protected readonly logger: ILogger;

    @inject(ExternalApiRouterOptions)
    protected readonly options: ExternalApiRouterOptions;

    @inject(ExternalApiResponseWriter)
    protected readonly responseWriter: ExternalApiResponseWriter;

    @inject(ExternalApiEventStreamFactory)
    protected readonly eventStreamFactory: ExternalApiEventStreamFactory;

    readonly toDispose = new DisposableCollection();

    protected readonly routes: RestRouteRegistration[] = [];
    protected readonly eventStreams: RestEventStreamRegistration[] = [];

    get routeRegistrations(): readonly RestRouteRegistration[] {
        return this.routes;
    }

    get eventStreamRegistrations(): readonly RestEventStreamRegistration[] {
        return this.eventStreams;
    }

    get raw(): express.Router {
        return this.options.router;
    }

    get(path: string, handler: RestHandler<undefined>): void;
    get(path: string, documentation: RestRouteDocumentation, handler: RestHandler<undefined>): void;
    get(path: string, documentationOrHandler: RestRouteDocumentation | RestHandler<undefined>, handler?: RestHandler<undefined>): void {
        this.registerRoute('get', path, documentationOrHandler, handler);
    }

    post(path: string, handler: RestHandler<undefined>): void;
    post<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    post<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('post', path, optionsOrHandler, handler);
    }

    put(path: string, handler: RestHandler<undefined>): void;
    put<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    put<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('put', path, optionsOrHandler, handler);
    }

    patch(path: string, handler: RestHandler<undefined>): void;
    patch<B>(path: string, options: RestRouteOptions<B>, handler: RestHandler<B>): void;
    patch<B>(path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        this.registerRoute('patch', path, optionsOrHandler, handler);
    }

    delete(path: string, handler: RestHandler<undefined>): void;
    delete(path: string, documentation: RestRouteDocumentation, handler: RestHandler<undefined>): void;
    delete(path: string, documentationOrHandler: RestRouteDocumentation | RestHandler<undefined>, handler?: RestHandler<undefined>): void {
        this.registerRoute('delete', path, documentationOrHandler, handler);
    }

    eventStream<T>(path: string, options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T> {
        this.eventStreams.push({ path, options });
        const stream = this.eventStreamFactory(options);
        this.toDispose.push(stream);
        this.raw.get(path, (request, response) => stream.handle(request, response));
        return stream;
    }

    finalize(): void {
        this.raw.use((request: express.Request, response: express.Response) => {
            this.responseWriter.writeError(404, 'not found', response);
        });
        this.raw.use((error: unknown, request: express.Request, response: express.Response, next: express.NextFunction) => {
            if (response.headersSent) {
                next(error);
                return;
            }
            const clientError = this.clientErrorStatus(error);
            if (clientError !== undefined) {
                this.responseWriter.writeError(clientError, this.clientErrorCode(clientError), response);
            } else {
                this.logger.error(`Failed to serve a request below '${this.options.contributionPath}'.`, error);
                this.responseWriter.writeError(500, 'internal error', response);
            }
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected registerRoute<B>(method: RestMethod, path: string, optionsOrHandler: RestRouteOptions<B> | RestHandler<undefined>, handler?: RestHandler<B>): void {
        if (typeof optionsOrHandler === 'function') {
            this.route(method, path, undefined, optionsOrHandler);
        } else {
            this.route(method, path, optionsOrHandler, handler!);
        }
    }

    protected route<B>(method: RestMethod, path: string, options: RestRouteOptions<B> | undefined, handler: RestHandler<B>): void {
        this.routes.push({ method, path, documentation: options, bodySchema: options?.bodySchema });
        const validator = options?.bodySchema && this.compileBodySchema(options.bodySchema);
        const handlers: express.RequestHandler[] = [];
        if (options?.bodySchema) {
            handlers.push(express.json({ limit: options.jsonLimit ?? this.defaultJsonLimit }));
        }
        handlers.push(async (request, response) => {
            try {
                if (validator) {
                    const schemaErrors = validator(request.body);
                    if (schemaErrors) {
                        this.responseWriter.writeError(400, 'invalid request', response, schemaErrors);
                        return;
                    }
                    const validationError = options?.validate?.(request.body as B);
                    if (validationError) {
                        this.responseWriter.writeError(400, 'invalid request', response, [validationError]);
                        return;
                    }
                }
                const result = await handler({ params: request.params, body: request.body as B, authorized: this.isAuthorized(request), raw: request });
                this.responseWriter.write(result, response);
            } catch (error) {
                this.logger.error(`Failed to serve '${method.toUpperCase()} ${this.options.contributionPath}${path === '/' ? '' : path}'.`, error);
                if (!response.headersSent) {
                    this.responseWriter.writeError(500, 'internal error', response);
                }
            }
        });
        this.raw[method](path, ...handlers);
    }

    /** Whether the request counts as authorized, see {@link RestRequest.authorized}. */
    protected isAuthorized(request: express.Request): boolean {
        return this.options.isAuthorized?.(request) ?? true;
    }

    /**
     * Compiles the body schema into a validator returning the validation error messages, or
     * `undefined` when the body is valid. An invalid schema throws, failing the
     * contribution's configuration.
     */
    protected compileBodySchema(schema: IJSONSchema): (body: unknown) => string[] | undefined {
        const validate = new Ajv().compile(schema);
        return body => validate(body) ? undefined : (validate.errors ?? []).map(error => this.renderSchemaError(error));
    }

    /** Renders a schema validation error to a human-readable message, e.g. `text should be string`. */
    protected renderSchemaError(error: Ajv.ErrorObject): string {
        const path = error.dataPath.replace(/^\./, '');
        const message = error.message ?? 'is invalid';
        return path ? `${path} ${message}` : message;
    }

    protected get defaultJsonLimit(): string {
        return '1mb';
    }

    /** Returns the HTTP status of client errors raised below the contribution's routes, e.g. by the JSON body parsing. */
    protected clientErrorStatus(error: unknown): number | undefined {
        const status = (error as { status?: unknown } | undefined)?.status;
        return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
    }

    /**
     * Returns the error code written for unhandled client errors: the HTTP status text,
     * except for plain `400`s, which keep the established `invalid request` code.
     */
    protected clientErrorCode(status: number): string {
        if (status === 400) {
            return 'invalid request';
        }
        return http.STATUS_CODES[status]?.toLowerCase() ?? 'invalid request';
    }
}
