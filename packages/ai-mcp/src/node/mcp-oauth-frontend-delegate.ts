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

import { injectable } from '@theia/core/shared/inversify';
import { MCPOAuthFrontendDelegate, MCPOAuthFrontendDelegateClient } from '../common/mcp-oauth';

@injectable()
export class MCPOAuthFrontendDelegateImpl implements MCPOAuthFrontendDelegate {

    // Bound in a connection container, so at most one frontend client.
    protected client?: MCPOAuthFrontendDelegateClient;

    setClient(client: MCPOAuthFrontendDelegateClient): void {
        if (this.client && this.client !== client) {
            throw new Error('MCP OAuth frontend delegate is scoped to a single frontend connection.');
        }
        this.client = client;
    }

    disconnectClient(client: MCPOAuthFrontendDelegateClient): void {
        if (this.client !== undefined && this.client !== client) {
            console.warn('MCP OAuth frontend delegate received disconnectClient for a non-current client; ignoring (one-client-per-container invariant violation).');
            return;
        }
        if (this.client === client) {
            this.client = undefined;
        }
    }

    async openExternal(url: string): Promise<void> {
        return this.requireClient().openExternal(url);
    }

    async getCallbackUrl(): Promise<string> {
        return this.requireClient().getCallbackUrl();
    }

    protected requireClient(): MCPOAuthFrontendDelegateClient {
        if (!this.client) {
            throw new Error('MCP OAuth frontend delegate client not set.');
        }
        return this.client;
    }
}
