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

import { MessageService, nls, Progress } from '@theia/core';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { MCP_OAUTH_CALLBACK_PATH, MCPOAuthFrontendDelegateClient } from '../common/mcp-oauth';
import { MCPFrontendNotificationService } from '../common/mcp-server-manager';

@injectable()
export class MCPOAuthFrontendDelegateClientImpl implements MCPOAuthFrontendDelegateClient {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpNotificationService: MCPFrontendNotificationService;

    /** The currently visible browser sign-in notification, if any. */
    protected pendingBrowserPrompt?: Progress;

    @postConstruct()
    protected init(): void {
        // A server update means the OAuth flow progressed, so the notification is stale.
        this.mcpNotificationService.onDidUpdateMCPServers(() => {
            this.pendingBrowserPrompt?.cancel();
            this.pendingBrowserPrompt = undefined;
        });
    }

    async openExternal(url: string): Promise<void> {
        this.windowService.openNewWindow(url, { external: true });
        // Popup blockers may suppress the window.open above without indication, as the RPC round-trip
        // consumed the user activation of the original click. The notification's 'Open' action carries
        // fresh activation as a manual fallback; not awaited so the flow proceeds to the callback wait.
        this.pendingBrowserPrompt?.cancel();
        const openAction = nls.localizeByDefault('Open');
        this.messageService.showProgress({
            text: nls.localize('theia/ai/mcp/oauth/completeSignInInBrowser',
                'Complete the MCP OAuth sign-in in your browser. If no sign-in tab opened, your browser may have blocked the popup.'),
            actions: [openAction],
            options: { cancelable: true }
        }).then(progress => {
            this.pendingBrowserPrompt = progress;
            return progress.result.then(action => {
                if (this.pendingBrowserPrompt === progress) {
                    this.pendingBrowserPrompt = undefined;
                }
                if (action === openAction) {
                    this.windowService.openNewWindow(url, { external: true });
                }
            });
        }).catch(error => {
            console.error('Failed to drive the MCP OAuth browser sign-in toast', error);
        });
    }

    async getCallbackUrl(): Promise<string> {
        const callbackUrl = new Endpoint({ path: MCP_OAUTH_CALLBACK_PATH }).getRestUrl().toString();
        console.debug(`Computed MCP OAuth callback URL: ${callbackUrl}`);
        return callbackUrl;
    }
}
