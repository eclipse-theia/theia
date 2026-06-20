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

import { expect } from 'chai';
import * as express from '@theia/core/shared/express';
import { MCPOAuthCallbackBackendContribution } from './mcp-oauth-callback-backend-contribution';
import { MCPOAuthCallbackResponder, MCPOAuthCallbackQuery, MCPOAuthCallbackResponse } from './mcp-oauth-callback-responder';

class TestResponse {
    statusCode = 200;
    body = '';
    headers: Record<string, string> = {};

    status(statusCode: number): this {
        this.statusCode = statusCode;
        return this;
    }

    set(headers: Record<string, string>): this {
        Object.assign(this.headers, headers);
        return this;
    }

    send(body: string): this {
        this.body = body;
        return this;
    }
}

class RecordingResponder extends MCPOAuthCallbackResponder {
    lastQuery: MCPOAuthCallbackQuery | undefined;
    cannedResponse: MCPOAuthCallbackResponse = {
        status: 207,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Test': 'yes' },
        body: '<html>stub</html>'
    };

    override renderResponse(query: MCPOAuthCallbackQuery): MCPOAuthCallbackResponse {
        this.lastQuery = query;
        return this.cannedResponse;
    }
}

function createContribution(): { contribution: MCPOAuthCallbackBackendContribution, responder: RecordingResponder } {
    const responder = new RecordingResponder();
    const contribution = new MCPOAuthCallbackBackendContribution();
    (contribution as unknown as { responder: MCPOAuthCallbackResponder }).responder = responder;
    return { contribution, responder };
}

function handleCallback(contribution: MCPOAuthCallbackBackendContribution, query: object): TestResponse {
    const response = new TestResponse();
    const request = { query };
    (contribution as unknown as {
        handleCallback: (req: express.Request, res: express.Response) => void
    }).handleCallback(request as unknown as express.Request, response as unknown as express.Response);
    return response;
}

describe('MCPOAuthCallbackBackendContribution', () => {
    it('registers a fixed callback route', () => {
        const registeredRoutes: Array<string | RegExp> = [];
        const app = {
            get: (path: string | RegExp) => registeredRoutes.push(path)
        };

        new MCPOAuthCallbackBackendContribution().configure(app as unknown as express.Application);

        expect(registeredRoutes).to.deep.equal(['/mcp/oauth/callback']);
    });

    it('parses the OAuth query params and forwards them to the shared responder', () => {
        const { contribution, responder } = createContribution();

        handleCallback(contribution, { state: 'state', code: 'code', error: 'err', error_description: 'desc' });

        expect(responder.lastQuery).to.deep.equal({ state: 'state', code: 'code', error: 'err', errorDescription: 'desc' });
    });

    it('takes the first value when a query param is repeated (array form)', () => {
        const { contribution, responder } = createContribution();

        handleCallback(contribution, { state: ['first', 'second'], code: 'code' });

        expect(responder.lastQuery?.state).to.equal('first');
    });

    it('ignores non-string query params', () => {
        const { contribution, responder } = createContribution();

        handleCallback(contribution, { state: 'state', code: { nested: 'object' } });

        expect(responder.lastQuery?.code).to.be.undefined;
    });

    it('writes the responder status, headers, and body to the response', () => {
        const { contribution } = createContribution();

        const response = handleCallback(contribution, { state: 'state', code: 'code' });

        expect(response.statusCode).to.equal(207);
        expect(response.headers['Content-Type']).to.equal('text/html; charset=utf-8');
        expect(response.headers['X-Test']).to.equal('yes');
        expect(response.body).to.equal('<html>stub</html>');
    });
});
