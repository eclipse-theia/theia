// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { ChatService } from '@theia/ai-chat/lib/common';
import { AI_CHAT_TOGGLE_COMMAND_ID } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { AppTesterChatAgentId } from '@theia/ai-ide/lib/browser/app-tester-chat-agent';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF } from './qaap-mobile-app-preferences';

/**
 * Backend probe endpoint that reports whether Chrome (with --remote-debugging-port=9222) is
 * reachable from the workspace backend. Kept as a literal here to avoid a cross-package import
 * from `@theia/qaap-cloud-workspace`, which would create a dependency cycle.
 */
const QAAP_CDP_STATUS_PATH = '/qaap/api/cloud/cdp-status';

export const QAAP_BOOTSTRAP_PREVIEW_OPENED_EVENT = 'qaap-bootstrap-preview-opened';

@injectable()
export class QaapMobileAppTesterContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

    /**
     * Once we've confirmed the workspace has no Chrome reachable on CDP, suppress the auto-trigger
     * for the rest of the session. `focusPreview()` re-fires the bootstrap event every time the
     * user taps the Preview button, which otherwise would spam the "Chrome not running" toast and
     * keep churning the chat view focus — visually surfacing as "I tap Preview and end up in Agent".
     */
    protected cdpUnreachableThisSession = false;

    onStart(): void {
        window.addEventListener(QAAP_BOOTSTRAP_PREVIEW_OPENED_EVENT, this.onPreviewOpened);
    }

    onStop(): void {
        window.removeEventListener(QAAP_BOOTSTRAP_PREVIEW_OPENED_EVENT, this.onPreviewOpened);
    }

    protected readonly onPreviewOpened = (event: Event): void => {
        if (!this.mobileMq?.matches) {
            return;
        }
        if (!this.preferences.get<boolean>(QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF, true)) {
            return;
        }
        // After the first negative CDP check this session, stop reacting entirely — otherwise every
        // Preview tab tap re-runs the probe + toast and gives the impression that focus is jumping
        // to the Agent panel.
        if (this.cdpUnreachableThisSession) {
            return;
        }
        const detail = (event as CustomEvent<{ url?: string }>).detail;
        const url = detail?.url?.trim();
        if (!url) {
            return;
        }
        void this.runAppTesterSmoke(url);
    };

    protected async runAppTesterSmoke(previewUrl: string): Promise<void> {
        // Skip when Chrome isn't running on the workspace — otherwise the chat prompts the user
        // to start the chrome-devtools MCP server, which then hangs because there's no CDP target
        // to connect to. Common on headless VPS workspaces with no browser installed.
        if (!await this.isCdpReachable()) {
            this.cdpUnreachableThisSession = true;
            this.messageService.info(
                'App Tester skipped: Chrome is not running on the workspace. ' +
                'Start Chrome with --remote-debugging-port=9222 to enable smoke tests.'
            );
            return;
        }
        try {
            await this.commands.executeCommand(AI_CHAT_TOGGLE_COMMAND_ID);
        } catch {
            /* already open */
        }
        let session = this.chatService.getActiveSession();
        if (!session) {
            session = this.chatService.createSession();
            this.chatService.setActiveSession(session.id);
        }
        await this.chatService.sendRequest(session.id, {
            text: `@${AppTesterChatAgentId} Run a quick mobile smoke on the dev preview at ${previewUrl}. ` +
                'Check that the page loads and one primary interaction works. Report pass/fail only.',
        });
    }

    protected async isCdpReachable(): Promise<boolean> {
        try {
            const response = await fetch(QAAP_CDP_STATUS_PATH);
            if (!response.ok) {
                return false;
            }
            const body = await response.json() as { reachable?: boolean };
            return body.reachable === true;
        } catch {
            return false;
        }
    }
}
