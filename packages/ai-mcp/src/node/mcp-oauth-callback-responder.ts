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
import { nls } from '@theia/core/lib/common/nls';
import { MCPOAuthCallback } from '../common/mcp-oauth';
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';

const MAX_OAUTH_ERROR_MESSAGE_LENGTH = 500;

/** Transport-agnostic OAuth callback response written verbatim by both transports. */
export interface MCPOAuthCallbackResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

/**
 * Parsed OAuth callback query parameters; all optional because {@link MCPOAuthCallbackResponder}
 * validates them (a missing `state`, or a missing `code` and `error`, both yield a 400).
 */
export type MCPOAuthCallbackQuery = Partial<MCPOAuthCallback>;

/**
 * Transport-agnostic core of the MCP OAuth callback handler, shared by the browser Express route and
 * the Electron loopback server. It keeps the security-relevant logic in one audited place:
 * `state`-bound dispatch into {@link MCPOAuthCallbackService}, HTML-escaping and length-capping of
 * reflected authorization-server errors, and the locked-down response headers. Each transport only
 * parses its query into {@link MCPOAuthCallbackQuery} and writes the returned {@link MCPOAuthCallbackResponse}.
 */
@injectable()
export class MCPOAuthCallbackResponder {

    @inject(MCPOAuthCallbackService)
    protected readonly callbackService: MCPOAuthCallbackService;

    renderResponse(query: MCPOAuthCallbackQuery): MCPOAuthCallbackResponse {
        const { state } = query;
        if (!state) {
            return this.failedPage(nls.localize('theia/ai/mcp/oauth/missingState', 'Missing OAuth state.'));
        }
        const callback: MCPOAuthCallback = { state, code: query.code, error: query.error, errorDescription: query.errorDescription };
        if (!callback.code && !callback.error) {
            return this.failedPage(nls.localize('theia/ai/mcp/oauth/missingCode', 'Missing OAuth authorization code.'));
        }
        if (!this.callbackService.acceptCallback(callback)) {
            // Only cancel/timeout/eviction paths populate the rejected-callback cache, so bogus-state floods cannot grow it.
            return this.failedPage(this.callbackService.consumeRejectedCallbackMessage(state)
                ?? nls.localize('theia/ai/mcp/oauth/unknownState', 'Unknown or expired OAuth state.'));
        }
        if (callback.error) {
            return this.failedPage(this.authorizationServerErrorMessage(callback));
        }
        return this.page(200, nls.localize('theia/ai/mcp/oauth/signInComplete', 'MCP sign-in complete'),
            nls.localizeByDefault('All done. You can close this tab now.'));
    }

    protected failedPage(message: string): MCPOAuthCallbackResponse {
        return this.page(400, nls.localize('theia/ai/mcp/oauth/signInFailed', 'MCP sign-in failed'), message);
    }

    protected page(status: number, title: string, message: string): MCPOAuthCallbackResponse {
        return {
            status,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer',
                // RFC 6749 §10.6: don't cache responses carrying `code` and `state` query params.
                'Cache-Control': 'no-store'
            },
            body: this.renderPage(title, message)
        };
    }

    protected authorizationServerErrorMessage(callback: MCPOAuthCallback): string {
        const message = callback.errorDescription ?? callback.error ?? '';
        const codePoints = Array.from(message);
        const truncated = codePoints.length > MAX_OAUTH_ERROR_MESSAGE_LENGTH
            ? `${codePoints.slice(0, MAX_OAUTH_ERROR_MESSAGE_LENGTH).join('')}…`
            : message;
        return nls.localize('theia/ai/mcp/oauth/authorizationServerError', 'Authorization server reported: {0}', truncated);
    }

    protected renderPage(title: string, message: string): string {
        return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.escapeHtml(title)}</title>
<style>
body { font-family: sans-serif; margin: 2rem; color: #24292f; background-color: #ffffff; }
main { max-width: 42rem; }
@media (prefers-color-scheme: dark) {
  body { color: #e6edf3; background-color: #0d1117; }
}
</style>
</head>
<body>
<main>
<h1>${this.escapeHtml(title)}</h1>
<p>${this.escapeHtml(message)}</p>
</main>
</body>
</html>`;
    }

    protected escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
