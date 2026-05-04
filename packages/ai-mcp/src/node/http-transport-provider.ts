// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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

import { injectable } from '@theia/core/shared/inversify';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
    isRemoteMCPServerDescription,
    MCPServerDescription,
} from '../common/mcp-server-manager';
import { MCPTransport, MCPTransportProvider } from '../common/mcp-transport-provider';
import { SdkTransportAdapter } from './mcp-transport-adapter';

/**
 * Default transport provider for {@link RemoteMCPServerDescription}. Returns
 * the Streamable-HTTP transport. The SSE fallback that {@link MCPServer}
 * performs today happens at the server level (on connect failure) rather
 * than at provider creation, so this provider unconditionally returns the
 * Streamable-HTTP transport — preserving today's behaviour.
 *
 * Headers and auth are injected into the transport's `requestInit` based on
 * the description's explicit fields (`headers`, `serverAuthToken`,
 * `serverAuthTokenHeader`). Credential resolution flow — which will
 * eventually replace those inline reads with a provider chain — is
 * introduced by a follow-up PR; the current behaviour is preserved here.
 */
@injectable()
export class HttpTransportProvider implements MCPTransportProvider {

    readonly id = 'http';
    readonly priority = 0;

    matches(description: MCPServerDescription): boolean {
        return isRemoteMCPServerDescription(description);
    }

    async create(description: MCPServerDescription, signal: AbortSignal): Promise<MCPTransport> {
        if (signal.aborted) {
            throw new DOMException('HTTP transport creation aborted', 'AbortError');
        }
        if (!isRemoteMCPServerDescription(description)) {
            throw new Error(`HttpTransportProvider cannot create a transport for local description "${description.name}"`);
        }
        const headers = this.buildHeaders(description);
        const url = new URL(description.serverUrl);
        const sdk = headers
            ? new StreamableHTTPClientTransport(url, { requestInit: { headers } })
            : new StreamableHTTPClientTransport(url);
        return new SdkTransportAdapter(sdk, 'http');
    }

    protected buildHeaders(description: { headers?: Record<string, string>; serverAuthToken?: string; serverAuthTokenHeader?: string }): Record<string, string> | undefined {
        let headers: Record<string, string> | undefined;
        if (description.headers) {
            headers = { ...description.headers };
        }
        if (description.serverAuthToken) {
            if (!headers) {
                headers = {};
            }
            if (description.serverAuthTokenHeader) {
                headers[description.serverAuthTokenHeader] = description.serverAuthToken;
            } else {
                headers.Authorization = `Bearer ${description.serverAuthToken}`;
            }
        }
        return headers;
    }
}
