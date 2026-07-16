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
import { expect } from 'chai';
import { ExternalApiContribution } from './external-api-contribution';
import { OpenApiDocument, OpenApiDocumentBuilderImpl, OpenApiDocumentSource } from './openapi-document-builder';

describe('OpenApiDocumentBuilder', () => {

    const BODY_SCHEMA: IJSONSchema = { type: 'object', properties: { text: { type: 'string' } } };
    const LIST_SCHEMA: IJSONSchema = { type: 'object', properties: { items: { type: 'array' } } };

    const contribution: ExternalApiContribution = {
        path: '/api/items',
        documentation: { title: 'Items', description: 'The items API.' },
        configure: () => { }
    };

    function itemsSource(overrides: Partial<OpenApiDocumentSource> = {}): OpenApiDocumentSource {
        return {
            contribution,
            routes: [
                {
                    method: 'get', path: '/', documentation: {
                        operationId: 'listItems',
                        summary: 'List the items.',
                        responses: { 200: { description: 'The items.', schema: LIST_SCHEMA } }
                    }
                },
                {
                    method: 'post', path: '/:id/rename', bodySchema: BODY_SCHEMA, documentation: {
                        params: { id: { description: 'The item id.' } }
                    }
                }
            ],
            eventStreams: [{ path: '/events', options: { event: 'items', summary: 'Stream the items.', dataSchema: LIST_SCHEMA } }],
            ...overrides
        };
    }

    function build(sources: OpenApiDocumentSource[], tokenConfigured: boolean = false, includeProtected: boolean = true): OpenApiDocument {
        const builder = new OpenApiDocumentBuilderImpl();
        (builder as unknown as Record<string, unknown>)['applicationPackage'] = { pck: { version: '1.2.3' } };
        builder.update(sources, tokenConfigured);
        return builder.build(includeProtected);
    }

    it('builds an empty document without sources', () => {
        const document = build([]);
        expect(document.openapi).to.equal('3.1.0');
        expect(document.info.title).to.equal('Theia External API');
        expect(document.info.version).to.equal('1.2.3');
        expect(document.paths).to.deep.equal({});
        expect(document.components).to.equal(undefined);
    });

    it('documents typed routes under the full path with their documentation', () => {
        const document = build([itemsSource()]);
        const operation = document.paths['/api/items'].get;
        expect(operation.operationId).to.equal('listItems');
        expect(operation.summary).to.equal('List the items.');
        expect(operation.tags).to.deep.equal(['Items']);
        expect(operation.responses['200'].description).to.equal('The items.');
        expect(operation.responses['200'].content?.['application/json'].schema).to.equal(LIST_SCHEMA);
        expect(document.tags).to.deep.equal([{ name: 'Items', description: 'The items API.' }]);
    });

    it('converts path parameters and declares them, merging their documentation', () => {
        const document = build([itemsSource()]);
        const operation = document.paths['/api/items/{id}/rename'].post;
        expect(operation.parameters).to.deep.equal([{
            name: 'id', in: 'path', required: true, description: 'The item id.', schema: { type: 'string' }
        }]);
        expect(operation.requestBody).to.deep.equal({ required: true, content: { 'application/json': { schema: BODY_SCHEMA } } });
        expect(operation.responses).to.deep.equal({ default: { description: 'The operation result.' } });
    });

    it('documents event streams as server-sent event responses', () => {
        const document = build([itemsSource()]);
        const operation = document.paths['/api/items/events'].get;
        expect(operation.summary).to.equal('Stream the items.');
        expect(operation.responses['200'].content?.['text/event-stream'].schema).to.equal(LIST_SCHEMA);
    });

    it('declares the bearer security scheme when a token is configured', () => {
        const unprotectedContribution: ExternalApiContribution = { path: '/public', unprotected: true, configure: () => { } };
        const document = build([
            itemsSource(),
            { contribution: unprotectedContribution, routes: [{ method: 'get', path: '/' }], eventStreams: [] }
        ], true);
        expect(document.components?.securitySchemes).to.deep.equal({ bearerAuth: { type: 'http', scheme: 'bearer' } });
        expect(document.paths['/api/items'].get.security).to.deep.equal([{ bearerAuth: [] }]);
        expect(document.paths['/public'].get.security).to.equal(undefined);
    });

    it('declares no security without a token', () => {
        const document = build([itemsSource()]);
        expect(document.components).to.equal(undefined);
        expect(document.paths['/api/items'].get.security).to.equal(undefined);
    });

    it('covers only unprotected contributions when protected routes are excluded', () => {
        const unprotectedContribution: ExternalApiContribution = {
            path: '/public', unprotected: true, documentation: { title: 'Public' }, configure: () => { }
        };
        const sources: OpenApiDocumentSource[] = [
            itemsSource(),
            { contribution: unprotectedContribution, routes: [{ method: 'get', path: '/' }], eventStreams: [] }
        ];
        const document = build(sources, true, false);
        expect(Object.keys(document.paths)).to.deep.equal(['/public']);
        expect(document.tags).to.deep.equal([{ name: 'Public', description: undefined }]);
        expect(document.components).to.equal(undefined);
    });

    it('covers all contributions when no token is configured, even when protected routes are excluded', () => {
        const document = build([itemsSource()], false, false);
        expect(document.paths).to.have.property('/api/items');
    });
});
