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

import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ExternalApiContribution } from './external-api-contribution';
import { RestEventStreamRegistration, RestParamDocumentation, RestRouteDocumentation, RestRouteRegistration } from './external-api-router';

/**
 * The routes of one {@link ExternalApiContribution}, as recorded by its router during the
 * last routing build.
 */
export interface OpenApiDocumentSource {
    contribution: ExternalApiContribution;
    routes: readonly RestRouteRegistration[];
    eventStreams: readonly RestEventStreamRegistration[];
}

/** A path parameter declaration of an {@link OpenApiOperation}. */
export interface OpenApiParameter {
    name: string;
    in: 'path';
    required: boolean;
    description?: string;
    schema: IJSONSchema;
}

/** Content of an OpenAPI request body or response, keyed by media type. */
export type OpenApiContent = Record<string, { schema?: IJSONSchema }>;

/** A response declaration of an {@link OpenApiOperation}. */
export interface OpenApiResponse {
    description: string;
    content?: OpenApiContent;
}

/** An operation of an {@link OpenApiDocument}, i.e. one method on one path. */
export interface OpenApiOperation {
    tags?: string[];
    operationId?: string;
    summary?: string;
    description?: string;
    parameters?: OpenApiParameter[];
    requestBody?: { required: true; content: OpenApiContent };
    responses: Record<string, OpenApiResponse>;
    security?: { [scheme: string]: string[] }[];
}

/** The OpenAPI document describing the external API, see {@link OpenApiDocumentBuilder}. */
export interface OpenApiDocument {
    openapi: string;
    info: { title: string; version: string; description?: string };
    tags?: { name: string; description?: string }[];
    paths: Record<string, Record<string, OpenApiOperation>>;
    components?: { securitySchemes: Record<string, { type: string; scheme: string }> };
}

export const OpenApiDocumentBuilder = Symbol('OpenApiDocumentBuilder');
/**
 * Builds the OpenAPI document describing the external API.
 *
 * The external API server records the typed routes and event streams of all contributions
 * on each routing build; the document is assembled on demand from those recordings, e.g. by
 * the `OpenApiSpecContribution` serving it. Routes registered on a contribution's raw
 * express router are not recorded and do not appear in the document.
 *
 * Rebind the {@link OpenApiDocumentBuilder} to customize the document.
 */
export interface OpenApiDocumentBuilder {
    /** Replaces the documented routes; called by the external API server on each routing build. */
    update(sources: readonly OpenApiDocumentSource[], tokenConfigured: boolean): void;
    /**
     * Builds the OpenAPI document for the routes of the current routing build. With
     * `includeProtected` set to `false`, the document covers only the contributions served
     * without token verification — the view presented to unauthorized requests.
     */
    build(includeProtected?: boolean): OpenApiDocument;
}

/**
 * Default implementation of the {@link OpenApiDocumentBuilder}.
 */
@injectable()
export class OpenApiDocumentBuilderImpl implements OpenApiDocumentBuilder {

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    protected sources: readonly OpenApiDocumentSource[] = [];
    protected tokenConfigured = false;

    update(sources: readonly OpenApiDocumentSource[], tokenConfigured: boolean): void {
        this.sources = sources;
        this.tokenConfigured = tokenConfigured;
    }

    build(includeProtected: boolean = true): OpenApiDocument {
        const document: OpenApiDocument = {
            openapi: '3.1.0',
            info: this.info(),
            paths: {}
        };
        // without a token every contribution is served unprotected, so nothing is filtered then
        const sources = includeProtected || !this.tokenConfigured ? this.sources : this.sources.filter(source => source.contribution.unprotected);
        for (const source of sources) {
            const documentation = source.contribution.documentation;
            if (documentation) {
                (document.tags ??= []).push({ name: documentation.title, description: documentation.description });
            }
            for (const route of source.routes) {
                this.operations(document, source, route.path)[route.method] = this.createRouteOperation(source, route);
            }
            for (const stream of source.eventStreams) {
                this.operations(document, source, stream.path).get = this.createEventStreamOperation(source, stream);
            }
        }
        if (this.tokenConfigured && includeProtected) {
            document.components = { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } };
        }
        return document;
    }

    protected info(): OpenApiDocument['info'] {
        return {
            title: 'Theia External API',
            version: this.applicationPackage.pck.version ?? '0.0.0'
        };
    }

    /** Returns the operations object of the route's full path, creating it if necessary. */
    protected operations(document: OpenApiDocument, source: OpenApiDocumentSource, routePath: string): Record<string, OpenApiOperation> {
        return document.paths[this.toApiPath(source.contribution.path, routePath)] ??= {};
    }

    /** Converts the contribution-relative express path to the full OpenAPI path, e.g. `/:id` to `/api/ai/sessions/{id}`. */
    protected toApiPath(contributionPath: string, routePath: string): string {
        const fullPath = routePath === '/' ? contributionPath : `${contributionPath}${routePath}`;
        return fullPath.replace(/:([^/]+)/g, '{$1}');
    }

    protected createRouteOperation(source: OpenApiDocumentSource, route: RestRouteRegistration): OpenApiOperation {
        const operation = this.createOperation(source, route.path, route.documentation);
        if (route.bodySchema) {
            operation.requestBody = { required: true, content: { 'application/json': { schema: route.bodySchema } } };
        }
        operation.responses = this.toResponses(route.documentation);
        return operation;
    }

    protected createEventStreamOperation(source: OpenApiDocumentSource, stream: RestEventStreamRegistration): OpenApiOperation {
        const operation = this.createOperation(source, stream.path, stream.options);
        operation.responses = {
            200: {
                description: `A stream of '${stream.options.event}' server-sent events.`,
                content: { 'text/event-stream': stream.options.dataSchema ? { schema: stream.options.dataSchema } : {} }
            }
        };
        return operation;
    }

    protected createOperation(source: OpenApiDocumentSource, routePath: string,
        documentation?: Pick<RestRouteDocumentation, 'operationId' | 'summary' | 'description' | 'params'>): OpenApiOperation {
        const operation: OpenApiOperation = { responses: {} };
        if (source.contribution.documentation) {
            operation.tags = [source.contribution.documentation.title];
        }
        if (documentation?.operationId) {
            operation.operationId = documentation.operationId;
        }
        if (documentation?.summary) {
            operation.summary = documentation.summary;
        }
        if (documentation?.description) {
            operation.description = documentation.description;
        }
        const expressPath = routePath === '/' ? source.contribution.path : `${source.contribution.path}${routePath}`;
        const parameters = this.pathParameters(expressPath, documentation?.params);
        if (parameters.length > 0) {
            operation.parameters = parameters;
        }
        if (this.tokenConfigured && !source.contribution.unprotected) {
            operation.security = [{ bearerAuth: [] }];
        }
        return operation;
    }

    /** Declares all path parameters of the express path, merging in their documentation where given. */
    protected pathParameters(expressPath: string, documentation?: Record<string, RestParamDocumentation>): OpenApiParameter[] {
        return Array.from(expressPath.matchAll(/:([^/]+)/g), match => {
            const name = match[1];
            return {
                name,
                in: 'path' as const,
                required: true,
                description: documentation?.[name]?.description,
                schema: documentation?.[name]?.schema ?? { type: 'string' }
            };
        });
    }

    protected toResponses(documentation?: RestRouteDocumentation): Record<string, OpenApiResponse> {
        const documented = Object.entries(documentation?.responses ?? {});
        if (documented.length === 0) {
            return { default: { description: 'The operation result.' } };
        }
        const responses: Record<string, OpenApiResponse> = {};
        for (const [status, response] of documented) {
            responses[status] = response.schema
                ? { description: response.description, content: { 'application/json': { schema: response.schema } } }
                : { description: response.description };
        }
        return responses;
    }
}
