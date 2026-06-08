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
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import * as express from '@theia/core/shared/express';
import { MCP_OAUTH_CALLBACK_PATH } from '../common/mcp-oauth';
import { MCPOAuthCallbackResponder } from './mcp-oauth-callback-responder';

/**
 * Browser/hosted transport for the MCP OAuth callback: a thin Express adapter over the shared
 * {@link MCPOAuthCallbackResponder}. It only parses `req.query` into the responder's input and
 * writes the responder's output; the `state`-bound dispatch, error sanitization, and locked-down
 * headers all live in the responder.
 *
 * Unauthenticated by design: OAuth redirects from the authorization server don't carry Theia's
 * security-token cookie. Safety relies on the responder's `state`-bound dispatch, HTML escaping of
 * reflected error text, and a locked-down CSP. In Electron the redirect is delivered to the
 * loopback callback server instead, so this origin-based route is unused there.
 */
@injectable()
export class MCPOAuthCallbackBackendContribution implements BackendApplicationContribution {

    @inject(MCPOAuthCallbackResponder)
    protected readonly responder: MCPOAuthCallbackResponder;

    configure(app: express.Application): void {
        app.get(MCP_OAUTH_CALLBACK_PATH, (req, res) => this.handleCallback(req, res));
    }

    protected handleCallback(req: express.Request, res: express.Response): void {
        const response = this.responder.renderResponse({
            state: this.getQueryParam(req.query.state),
            code: this.getQueryParam(req.query.code),
            error: this.getQueryParam(req.query.error),
            errorDescription: this.getQueryParam(req.query.error_description)
        });
        res.status(response.status).set(response.headers).send(response.body);
    }

    protected getQueryParam(value: unknown): string | undefined {
        if (typeof value === 'string') {
            return value;
        }
        if (Array.isArray(value) && typeof value[0] === 'string') {
            return value[0];
        }
        return undefined;
    }
}
