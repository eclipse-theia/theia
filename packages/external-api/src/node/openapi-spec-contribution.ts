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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ExternalApiContribution, ExternalApiContributionDocumentation } from './external-api-contribution';
import { ExternalApiRouter } from './external-api-router';
import { OpenApiDocumentBuilder } from './openapi-document-builder';
import { RestResult } from './rest-result';

/** Path under which the OpenAPI document of the external API is served. */
export const OPENAPI_SPEC_PATH = '/api/openapi.json';

/**
 * Serves the OpenAPI document describing the endpoints of the external API at
 * {@link OPENAPI_SPEC_PATH}.
 *
 * The endpoint itself is served without token verification, but scopes the document to the
 * requester: when a token is configured, requests without it receive a document covering only
 * the unprotected contributions, while requests carrying the token receive the full document —
 * the protected API surface is not revealed to unauthorized clients.
 */
@injectable()
export class OpenApiSpecContribution implements ExternalApiContribution {

    readonly path = OPENAPI_SPEC_PATH;

    readonly unprotected = true;

    readonly documentation: ExternalApiContributionDocumentation = {
        title: 'OpenAPI',
        description: 'The OpenAPI document describing the endpoints of the external API.'
    };

    @inject(OpenApiDocumentBuilder)
    protected readonly builder: OpenApiDocumentBuilder;

    configure(router: ExternalApiRouter): void {
        router.get('/', {
            operationId: 'getOpenApiDocument',
            summary: 'Get the OpenAPI document describing the endpoints of the external API.',
            description: 'Without the configured bearer token, the document covers only the endpoints served without token verification; '
                + 'with the token, it covers all endpoints.',
            responses: { 200: { description: 'The OpenAPI 3.1 document.' } }
        }, ({ authorized }) => RestResult.ok(this.builder.build(authorized)));
    }
}
