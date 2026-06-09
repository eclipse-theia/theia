// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { normalizeAgentMessageContentForDisplay } from '../common/qaap-agent-message-content';
import { parseAgentLogForTranscript } from '../common/qaap-cli-transcript-stream';
import { dedupeAgentMessageTextSegments } from '../common/qaap-qaiq-stream';
import { isStreamingTranscriptTailUnchanged, resolveStreamingTranscriptPatchKind, TRANSCRIPT_ACTIVITY_ROW_ATTR, TRANSCRIPT_MESSAGE_ID_ATTR } from '../common/qaap-transcript-incremental-update';
import { isTranscriptScrollNearBottom } from '../common/qaap-transcript-user-scroll-pin';
import { scrollElementToEnd } from '../common/qaap-prefers-reduced-motion';
import { attachTranscriptScrollToBottomButton } from './qaap-transcript-scroll-to-bottom';
import { attachTranscriptUserScrollPin } from './qaap-transcript-user-scroll-pin';
import type { QaapAgentConversationDTO, QaapAgentMessageDTO, QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsTranscriptMessagesArtifactsUi } from './mobile-projects-transcript-messages-artifacts-ui';
import type { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptMessagesToolUi } from './mobile-projects-transcript-messages-tool-ui';
import type { MobileProjectsTranscriptMessagesUserUi } from './mobile-projects-transcript-messages-user-ui';
import type { WorkHubTranscriptBridge } from './work-hub-transcript-bridge';

export class MobileProjectsTranscriptMessagesRenderUi {
    constructor(
        protected readonly host: MobileProjectsTranscriptMessagesHost,
        protected readonly workHub: WorkHubTranscriptBridge,
        protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi,
        protected readonly userUi: MobileProjectsTranscriptMessagesUserUi,
        protected readonly artifactsUi: MobileProjectsTranscriptMessagesArtifactsUi,
        protected readonly toolUi: MobileProjectsTranscriptMessagesToolUi,
    ) { }

    resolveTranscriptMessageHost(host: HTMLElement): HTMLElement {
        if (!host.classList.contains('theia-mobile-agent-transcript-real-chat')) {
            host.className = 'theia-mobile-agent-transcript';
            return host;
        }
        const existing = host.querySelector(':scope > .theia-mobile-agent-transcript');
        if (existing instanceof HTMLElement) {
            return existing;
        }
        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-transcript';
        host.replaceChildren(list);
        return list;
    }

    resolveTranscriptAgentSegments(
        conv: QaapAgentConversationDTO,
        msg: QaapAgentMessageDTO,
    ): QaapAgentMessageSegmentDTO[] | undefined {
        if (msg.segments && msg.segments.length > 0) {
            return dedupeAgentMessageTextSegments(msg.segments);
        }
        if (msg.role !== 'agent' || !msg.content?.trim()) {
            return undefined;
        }
        const parsed = parseAgentLogForTranscript(conv.agentId, msg.content);
        return parsed.segments.length > 0 ? dedupeAgentMessageTextSegments(parsed.segments) : undefined;
    }

    createTranscriptMessageRowAtIndex(conv: QaapAgentConversationDTO, index: number): HTMLElement {
        const msg = conv.messages[index];
        const sameConversation = this.host.transcriptLastRenderedConversationId === conv.id;
        const previousLastMessageId = this.host.transcriptLastRenderedMessageId;
        let row: HTMLElement;
        const agentSegments = this.resolveTranscriptAgentSegments(conv, msg);
        if (msg.role === 'user') {
            row = this.userUi.createTranscriptUserMessageRow(msg, conv);
        } else if (agentSegments && agentSegments.length > 0) {
            row = this.artifactsUi.createTranscriptAgentSegmentsRow(agentSegments, msg.error, conv);
            if (msg.id) {
                row.setAttribute(TRANSCRIPT_MESSAGE_ID_ATTR, msg.id);
            }
        } else {
            row = this.createTranscriptMessageRow(
                msg.role,
                normalizeAgentMessageContentForDisplay(msg.content),
                msg.error,
            );
        }
        if (index === conv.messages.length - 1 && sameConversation && previousLastMessageId && msg.id && msg.id !== previousLastMessageId) {
            row.classList.add('theia-mod-new-message');
        }
        if (index === conv.messages.length - 1 && conv.status === 'streaming' && msg.role === 'agent') {
            row.classList.add('theia-mod-streaming');
        }
        return row;
    }

    buildTranscriptVirtualFooter(conv: QaapAgentConversationDTO): HTMLElement[] {
        const footers: HTMLElement[] = [];
        if (conv.status === 'streaming' && conv.messages.at(-1)?.role === 'user') {
            footers.push(this.artifactsUi.createTranscriptStreamingActivityRow(conv));
        }
        return footers;
    }

    renderTranscriptMessagesVirtual(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.host.transcriptLastConv = conv;
        const messageHost = this.resolveTranscriptMessageHost(host);
        messageHost.classList.remove('theia-mod-empty-chat');
        messageHost.classList.add('theia-mod-virtual-scroll');

        const list = this.host.transcriptUi.mount(messageHost, conv, index => {
            const current = this.host.transcriptLastConv;
            if (!current) {
                return document.createElement('div');
            }
            return this.createTranscriptMessageRowAtIndex(current, index);
        });

        const wasNearBottom = list.isNearBottom() || conv.status === 'streaming';
        list.setItemCount(conv.messages.length);
        list.setFooter(this.buildTranscriptVirtualFooter(conv));
        this.host.transcriptLastRenderedConversationId = conv.id;
        this.host.transcriptLastRenderedMessageId = conv.messages.at(-1)?.id;
        if (wasNearBottom) {
            list.scrollToEnd();
        }
        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = new DisposableCollection(
            attachTranscriptUserScrollPin(messageHost),
            attachTranscriptScrollToBottomButton(host),
        );
        this.workHub.renderTeamSectionInTranscript(host, conv);
        this.workHub.renderInlineApproval(host, conv);
        this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
    }

    renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        if (this.tryPatchStreamingTranscriptMessages(host, conv)) {
            return;
        }
        if (isStreamingTranscriptTailUnchanged(this.host.transcriptLastConv, conv)) {
            this.host.transcriptLastConv = conv;
            return;
        }
        this.host.transcriptLastConv = conv;
        const messageHost = this.resolveTranscriptMessageHost(host);
        const isEmptyChat = conv.messages.length === 0 && conv.status !== 'streaming';
        if (isEmptyChat) {
            this.host.transcriptUi.disposeList();
            messageHost.classList.remove('theia-mod-virtual-scroll');
            messageHost.replaceChildren();
            messageHost.classList.toggle('theia-mod-empty-chat', true);
            this.host.transcriptLastRenderedConversationId = conv.id;
            this.host.transcriptLastRenderedMessageId = undefined;
            const project = this.host.transcriptOpenProject;
            if (project && this.workHub.shouldEmbedAgentsHubRecentsInWorkspaceTranscript()) {
                messageHost.append(this.workHub.createAgentsHubRecentsBlock(project));
            }
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-agent-transcript-empty';
            empty.append(this.workHub.createAgentsHubQuickActionsBlock());
            messageHost.append(empty);
            this.host.transcriptUserScrollPinDispose.dispose();
            this.host.transcriptUserScrollPinDispose = new DisposableCollection(
                attachTranscriptScrollToBottomButton(host),
            );
            return;
        }
        if (this.host.transcriptUi.shouldVirtualize(conv)) {
            this.renderTranscriptMessagesVirtual(host, conv);
            return;
        }
        this.host.transcriptUi.disposeList();
        messageHost.classList.remove('theia-mod-virtual-scroll');
        messageHost.replaceChildren();
        messageHost.classList.toggle('theia-mod-empty-chat', false);
        for (let index = 0; index < conv.messages.length; index++) {
            messageHost.append(this.createTranscriptMessageRowAtIndex(conv, index));
        }
        this.host.transcriptLastRenderedConversationId = conv.id;
        this.host.transcriptLastRenderedMessageId = conv.messages.at(-1)?.id;
        const last = conv.messages[conv.messages.length - 1];
        if (conv.status === 'streaming') {
            if (last?.role === 'agent') {
                messageHost.lastElementChild?.classList.add('theia-mod-streaming');
            } else {
                messageHost.append(this.artifactsUi.createTranscriptStreamingActivityRow(conv));
            }
        }
        scrollElementToEnd(messageHost);
        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = new DisposableCollection(
            attachTranscriptUserScrollPin(messageHost),
            attachTranscriptScrollToBottomButton(host),
        );
        this.workHub.renderTeamSectionInTranscript(host, conv);
        this.workHub.renderInlineApproval(host, conv);
        this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
    }

    /**
     * Live SSE streaming: patch only the tail of the transcript instead of rebuilding the
     * whole list so tool expand state and scroll position stay stable.
     */

    tryPatchStreamingTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): boolean {
        const patchKind = resolveStreamingTranscriptPatchKind(this.host.transcriptLastConv, conv);
        if (patchKind === 'none') {
            if (isStreamingTranscriptTailUnchanged(this.host.transcriptLastConv, conv)) {
                this.host.transcriptLastConv = conv;
                return true;
            }
            return false;
        }
        if (this.host.transcriptUi.shouldVirtualize(conv)) {
            const list = this.host.transcriptUi.activeList;
            if (!list || this.host.transcriptUi.activeConversationId !== conv.id) {
                return false;
            }
            return this.tryPatchStreamingTranscriptVirtual(host, conv, patchKind);
        }
        const messageHost = this.resolveTranscriptMessageHost(host);
        const wasNearBottom = isTranscriptScrollNearBottom(
            messageHost.scrollTop,
            messageHost.clientHeight,
            messageHost.scrollHeight,
        );

        if (patchKind === 'activity-only') {
            this.syncTranscriptActivityRow(messageHost, conv);
            this.host.transcriptLastConv = conv;
            this.host.transcriptLastRenderedConversationId = conv.id;
            this.host.transcriptLastRenderedMessageId = conv.messages.at(-1)?.id;
            if (wasNearBottom) {
                scrollElementToEnd(messageHost);
            }
            return true;
        }

        const lastAgent = conv.messages[conv.messages.length - 1];
        if (!lastAgent || !lastAgent.id || lastAgent.role !== 'agent') {
            return false;
        }
        const segments = this.resolveTranscriptAgentSegments(conv, lastAgent);

        this.removeTranscriptActivityRow(messageHost);
        messageHost.querySelectorAll('.theia-mod-streaming').forEach(element => {
            element.classList.remove('theia-mod-streaming');
        });

        const row = segments?.length
            ? this.artifactsUi.createTranscriptAgentSegmentsRow(segments, lastAgent.error, conv)
            : this.createTranscriptMessageRowAtIndex(conv, conv.messages.length - 1);
        this.markTranscriptMessageRow(row, lastAgent.id, true);

        if (patchKind === 'last-agent') {
            const existing = messageHost.querySelector<HTMLElement>(
                `[${TRANSCRIPT_MESSAGE_ID_ATTR}="${CSS.escape(lastAgent.id)}"]`,
            );
            if (existing) {
                existing.replaceWith(row);
            } else {
                messageHost.append(row);
            }
        } else {
            messageHost.append(row);
        }

        this.host.transcriptLastConv = conv;
        this.host.transcriptLastRenderedConversationId = conv.id;
        this.host.transcriptLastRenderedMessageId = lastAgent.id;
        if (wasNearBottom) {
            scrollElementToEnd(messageHost);
        }
        return true;
    }

    tryPatchStreamingTranscriptVirtual(
        _host: HTMLElement,
        conv: QaapAgentConversationDTO,
        patchKind: ReturnType<typeof resolveStreamingTranscriptPatchKind>,
    ): boolean {
        const list = this.host.transcriptUi.activeList;
        if (!list) {
            return false;
        }
        const wasNearBottom = list.isNearBottom();

        if (patchKind === 'activity-only') {
            this.host.transcriptLastConv = conv;
            list.setItemCount(conv.messages.length);
            list.setFooter(this.buildTranscriptVirtualFooter(conv));
            this.host.transcriptLastRenderedConversationId = conv.id;
            this.host.transcriptLastRenderedMessageId = conv.messages.at(-1)?.id;
            if (wasNearBottom) {
                list.scrollToEnd();
            }
            return true;
        }

        const lastAgent = conv.messages[conv.messages.length - 1];
        if (!lastAgent || !lastAgent.id || lastAgent.role !== 'agent') {
            return false;
        }
        const segments = this.resolveTranscriptAgentSegments(conv, lastAgent);

        this.host.transcriptLastConv = conv;
        const row = segments?.length
            ? this.artifactsUi.createTranscriptAgentSegmentsRow(segments, lastAgent.error, conv)
            : this.createTranscriptMessageRowAtIndex(conv, conv.messages.length - 1);
        this.markTranscriptMessageRow(row, lastAgent.id, true);

        if (patchKind === 'last-agent') {
            list.replaceRowByAttribute(TRANSCRIPT_MESSAGE_ID_ATTR, lastAgent.id, row);
        }
        list.setItemCount(conv.messages.length);
        list.setFooter(this.buildTranscriptVirtualFooter(conv));
        this.host.transcriptLastRenderedConversationId = conv.id;
        this.host.transcriptLastRenderedMessageId = lastAgent.id;
        if (wasNearBottom) {
            list.scrollToEnd();
        }
        return true;
    }

    markTranscriptMessageRow(row: HTMLElement, messageId: string, streaming: boolean): void {
        row.setAttribute(TRANSCRIPT_MESSAGE_ID_ATTR, messageId);
        row.classList.toggle('theia-mod-streaming', streaming);
    }

    removeTranscriptActivityRow(messageHost: HTMLElement): void {
        messageHost.querySelector(`[${TRANSCRIPT_ACTIVITY_ROW_ATTR}]`)?.remove();
    }

    syncTranscriptActivityRow(messageHost: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.removeTranscriptActivityRow(messageHost);
        messageHost.querySelectorAll('.theia-mod-streaming').forEach(element => {
            element.classList.remove('theia-mod-streaming');
        });
        if (conv.status === 'streaming' && conv.messages.at(-1)?.role === 'user') {
            messageHost.append(this.artifactsUi.createTranscriptStreamingActivityRow(conv));
        }
    }

    createTranscriptMessageRow(
        role: 'user' | 'agent',
        content: string,
        error?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-transcript-msg theia-mod-${role}`;
        // Ownership is conveyed by alignment and the bubble surface, so no redundant "You" label.
        const contentEl = document.createElement('div');
        contentEl.className = 'theia-mobile-agent-transcript-content';
        this.toolUi.renderTranscriptRichContent(contentEl, normalizeAgentMessageContentForDisplay(content));
        row.append(contentEl);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }
}
