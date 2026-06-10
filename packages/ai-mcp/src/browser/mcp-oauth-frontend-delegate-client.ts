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

import { MessageService, nls } from '@theia/core';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCP_OAUTH_CALLBACK_PATH, MCPOAuthFrontendDelegateClient } from '../common/mcp-oauth';

@injectable()
export class MCPOAuthFrontendDelegateClientImpl implements MCPOAuthFrontendDelegateClient {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    async openExternal(url: string): Promise<void> {
        this.windowService.openNewWindow(url, { external: true });
        // The RPC round-trip consumed the user activation of the original click, so popup blockers may
        // suppress the window.open above — undetectably, as 'noopener' makes it return null even on success.
        // The toast's action click carries fresh activation as a manual fallback. Deliberately not awaited:
        // the OAuth flow must proceed to the callback wait regardless of the toast.
        this.messageService.info(
            nls.localize('theia/ai/mcp/oauth/completeSignInInBrowser',
                'Complete the MCP OAuth sign-in in your browser. If no sign-in tab opened, your browser may have blocked the popup.'),
            nls.localizeByDefault('Open')
        ).then(action => {
            if (action) {
                this.windowService.openNewWindow(url, { external: true });
            }
        });
    }

    async getCallbackUrl(): Promise<string> {
        const callbackUrl = new Endpoint({ path: MCP_OAUTH_CALLBACK_PATH }).getRestUrl().toString();
        console.debug(`Computed MCP OAuth callback URL: ${callbackUrl}`);
        return callbackUrl;
    }
}
