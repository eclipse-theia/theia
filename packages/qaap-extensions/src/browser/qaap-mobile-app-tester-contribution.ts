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
import { QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF } from './qaap-ai-preference-branding-contribution';

export const QAAP_BOOTSTRAP_PREVIEW_OPENED_EVENT = 'qaap-bootstrap-preview-opened';

@injectable()
export class QaapMobileAppTesterContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

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
        const detail = (event as CustomEvent<{ url?: string }>).detail;
        const url = detail?.url?.trim();
        if (!url) {
            return;
        }
        void this.runAppTesterSmoke(url);
    };

    protected async runAppTesterSmoke(previewUrl: string): Promise<void> {
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
}
