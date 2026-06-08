// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as markdownit from '@theia/core/shared/markdown-it';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageDTO,
    type QaapAgentMessageSegmentDTO,
} from '../common/qaap-agent-conversation-client';
import { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsTranscriptMessagesArtifactsUi } from './mobile-projects-transcript-messages-artifacts-ui';
import { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import { MobileProjectsTranscriptMessagesRenderUi } from './mobile-projects-transcript-messages-render-ui';
import { MobileProjectsTranscriptMessagesResolversUi } from './mobile-projects-transcript-messages-resolvers-ui';
import { MobileProjectsTranscriptMessagesToolUi } from './mobile-projects-transcript-messages-tool-ui';
import { MobileProjectsTranscriptMessagesUserUi } from './mobile-projects-transcript-messages-user-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';
import type { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptStickyComposerUi } from './mobile-projects-transcript-sticky-composer-ui';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';

/** Panel surface consumed by transcript message rendering (keeps deps narrow vs. the full panel). */
export interface MobileProjectsTranscriptMessagesHost {
    transcriptUi: MobileProjectsTranscriptUi;
    transcriptUserScrollPinDispose: Disposable;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptLastRenderedConversationId: string | undefined;
    transcriptLastRenderedMessageId: string | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptComposerDraft: string;
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenSummaryId: string | undefined;
    transcriptPreviewRequestPending: boolean;
    transcriptPreviewRequestRunning: boolean;
    transcriptMarkdownIt: ReturnType<typeof markdownit>;
    openTranscriptFile?: (filePath: string) => void | Promise<void>;
    messageService?: MessageService;
    previewClipboard?: ClipboardService;
    conversations?: MobileProjectsConversations;
    projectsService: MobileProjectsService;
    projects: MobileProjectEntry[];

    localizeActivityLabel(label: string): string;
    hasConversationDiffStats(summary?: QaapAgentConversationSummaryDTO): boolean;
    shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean;
    createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement;
    createAgentsHubQuickActionsBlock(): HTMLElement;
    ensureOverlayUi(): { team: { renderTeamSection(host: HTMLElement, conv: QaapAgentConversationDTO): void } };
    renderTranscriptInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;
    transcriptLiveUi: MobileProjectsTranscriptLiveUi;
    transcriptStickyComposerUi: MobileProjectsTranscriptStickyComposerUi;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;
    maybeSyncTranscriptVisuallySettledChrome(conv: QaapAgentConversationDTO): void;
}

/** Transcript message list rendering: rows, streaming patches, and rich segment UI. */
export class MobileProjectsTranscriptMessagesUi {

    protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi;
    protected readonly resolversUi: MobileProjectsTranscriptMessagesResolversUi;
    protected readonly toolUi: MobileProjectsTranscriptMessagesToolUi;
    protected readonly artifactsUi: MobileProjectsTranscriptMessagesArtifactsUi;
    protected readonly userUi: MobileProjectsTranscriptMessagesUserUi;
    protected readonly renderUi: MobileProjectsTranscriptMessagesRenderUi;

    constructor(protected readonly host: MobileProjectsTranscriptMessagesHost) {
        this.contentUi = new MobileProjectsTranscriptMessagesContentUi(host);
        this.resolversUi = new MobileProjectsTranscriptMessagesResolversUi(host, this.contentUi);
        this.toolUi = new MobileProjectsTranscriptMessagesToolUi(host, this.contentUi, this.resolversUi);
        this.artifactsUi = new MobileProjectsTranscriptMessagesArtifactsUi(host, this.contentUi, this.resolversUi, this.toolUi);
        let renderUi!: MobileProjectsTranscriptMessagesRenderUi;
        this.userUi = new MobileProjectsTranscriptMessagesUserUi(host, this.contentUi, this.toolUi, (messageHost, conv) => {
            renderUi.renderTranscriptMessages(messageHost, conv);
        });
        renderUi = new MobileProjectsTranscriptMessagesRenderUi(host, this.contentUi, this.userUi, this.artifactsUi, this.toolUi);
        this.renderUi = renderUi;
    }

    resolveTranscriptMessageHost(host: HTMLElement): HTMLElement {
        return this.renderUi.resolveTranscriptMessageHost(host);
    }

    normalizeTranscriptPreviewLink(href: string): string | undefined {
        return this.contentUi.normalizeTranscriptPreviewLink(href);
    }

    async openTranscriptPreviewUrlFromLink(href: string): Promise<boolean> {
        return this.contentUi.openTranscriptPreviewUrlFromLink(href);
    }

    resolveTranscriptAgentSegments(
        conv: QaapAgentConversationDTO,
        msg: QaapAgentMessageDTO,
    ): QaapAgentMessageSegmentDTO[] | undefined {
        return this.renderUi.resolveTranscriptAgentSegments(conv, msg);
    }

    renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.renderUi.renderTranscriptMessages(host, conv);
    }

    focusTranscriptComposerInput(): void {
        this.userUi.focusTranscriptComposerInput();
    }

    resolveTranscriptActivityItems(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> {
        return this.resolversUi.resolveTranscriptActivityItems(segments, includeThinkingSteps);
    }

    cleanTranscriptDisplayText(content: string | undefined | null): string {
        return this.contentUi.cleanTranscriptDisplayText(content);
    }
}
