// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as markdownit from '@theia/core/shared/markdown-it';
import { nls } from '@theia/core/lib/common/nls';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    approveAgentRequest,
    rejectAgentRequest,
} from '../common/qaap-agent-approval-client';
import {
    conversationToSummary,
    isConversationAutoApproveEnabled,
    rewindConversationToMessage,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageDTO,
    type QaapAgentMessageSegmentDTO,
} from '../common/qaap-agent-conversation-client';
import { normalizeAgentMessageContentForDisplay } from '../common/qaap-agent-message-content';
import { parseAgentLogForTranscript } from '../common/qaap-cli-transcript-stream';
import { collapseExactRepeatedText, dedupeAgentMessageTextSegments } from '../common/qaap-qaiq-stream';
import {
    formatReadToolDetailFromArgs,
    formatToolActivityLabel,
    parseDiffStatsFromText,
} from '../common/qaap-agent-conversation-list-metrics';
import {
    excerptTranscriptThought,
    extractInlineDiffPreview,
    hasTranscriptActivityStats,
    hasTranscriptActivityTimeline,
    isTranscriptThoughtExcerptTruncated,
    resolveTranscriptActivityStats,
    resolveTranscriptThinkingContent,
    resolveTranscriptToolPillDescriptors,
    shouldOpenTranscriptToolDetails,
    shouldRenderTranscriptToolSegmentInline,
    type QaapTranscriptActivityStats,
} from '../common/qaap-agent-transcript-segments';
import {
    isTranscriptErrorOutput,
    isTranscriptTerminalOutputText,
} from '../common/qaap-transcript-content-display';
import {
    isStreamingTranscriptTailUnchanged,
    resolveStreamingTranscriptPatchKind,
    TRANSCRIPT_ACTIVITY_ROW_ATTR,
    TRANSCRIPT_MESSAGE_ID_ATTR,
} from '../common/qaap-transcript-incremental-update';
import { isTranscriptScrollNearBottom } from '../common/qaap-transcript-user-scroll-pin';
import { scrollElementToEnd } from '../common/qaap-prefers-reduced-motion';
import {
    buildTranscriptToolApprovalId,
    isPendingTranscriptToolSegment,
} from '../common/qaap-transcript-approval-inline';
import {
    createTranscriptCodeView,
    resolveTranscriptCodeLanguage,
} from './qaap-transcript-code-view';
import { attachTranscriptUserScrollPin } from './qaap-transcript-user-scroll-pin';
import { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { ExecutionSurfaceTabId } from '../common/qaap-execution-surface-tabs';

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
    resolveTranscriptMessageHost(host: HTMLElement): HTMLElement;
    shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean;
    createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement;
    createAgentsHubQuickActionsBlock(): HTMLElement;
    ensureOverlayUi(): { team: { renderTeamSection(host: HTMLElement, conv: QaapAgentConversationDTO): void } };
    renderTranscriptInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    refreshTranscriptExecutionChrome(): void;
    maybeSyncTranscriptVisuallySettledChrome(conv: QaapAgentConversationDTO): void;
    ensureTranscriptConversationRefresh(): void;
    selectTranscriptTab(tab: ExecutionSurfaceTabId, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    remountTranscriptStickyComposer(): void;
    openTranscriptPreviewUrlFromLink(href: string): Promise<boolean>;
}

/** Transcript message list rendering: rows, streaming patches, and rich segment UI. */
export class MobileProjectsTranscriptMessagesUi {

    constructor(protected readonly host: MobileProjectsTranscriptMessagesHost) { }

    /** Structured transcript UI: persisted segments or on-the-fly replay from agent stdout. */
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
            row = this.createTranscriptUserMessageRow(msg, conv);
        } else if (agentSegments && agentSegments.length > 0) {
            row = this.createTranscriptAgentSegmentsRow(agentSegments, msg.error, conv);
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
        const turnReview = this.createTranscriptTurnReviewCta(conv);
        if (turnReview) {
            footers.push(turnReview);
        }
        if (conv.status === 'streaming' && conv.messages.at(-1)?.role === 'user') {
            footers.push(this.createTranscriptStreamingActivityRow(conv));
        }
        return footers;
    }

    renderTranscriptMessagesVirtual(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.host.transcriptLastConv = conv;
        const messageHost = this.host.resolveTranscriptMessageHost(host);
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
        this.host.transcriptUserScrollPinDispose = attachTranscriptUserScrollPin(messageHost);
        this.host.ensureOverlayUi().team.renderTeamSection(host, conv);
        this.host.renderTranscriptInlineApproval(host, conv);
        this.host.refreshTranscriptExecutionChrome();
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
        const messageHost = this.host.resolveTranscriptMessageHost(host);
        const isEmptyChat = conv.messages.length === 0 && conv.status !== 'streaming';
        if (isEmptyChat) {
            this.host.transcriptUi.disposeList();
            messageHost.classList.remove('theia-mod-virtual-scroll');
            messageHost.replaceChildren();
            messageHost.classList.toggle('theia-mod-empty-chat', true);
            this.host.transcriptLastRenderedConversationId = conv.id;
            this.host.transcriptLastRenderedMessageId = undefined;
            const project = this.host.transcriptOpenProject;
            if (project && this.host.shouldEmbedAgentsHubRecentsInWorkspaceTranscript()) {
                messageHost.append(this.host.createAgentsHubRecentsBlock(project));
            }
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-agent-transcript-empty';
            empty.append(this.host.createAgentsHubQuickActionsBlock());
            messageHost.append(empty);
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
                messageHost.append(this.createTranscriptStreamingActivityRow(conv));
            }
        }
        const turnReview = this.createTranscriptTurnReviewCta(conv);
        if (turnReview) {
            messageHost.append(turnReview);
        }
        scrollElementToEnd(messageHost);
        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = attachTranscriptUserScrollPin(messageHost);
        this.host.ensureOverlayUi().team.renderTeamSection(host, conv);
        this.host.renderTranscriptInlineApproval(host, conv);
        this.host.refreshTranscriptExecutionChrome();
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
        const messageHost = this.host.resolveTranscriptMessageHost(host);
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
            ? this.createTranscriptAgentSegmentsRow(segments, lastAgent.error, conv)
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
            ? this.createTranscriptAgentSegmentsRow(segments, lastAgent.error, conv)
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
            messageHost.append(this.createTranscriptStreamingActivityRow(conv));
        }
    }

    createTranscriptAgentSegmentsRow(
        segments: QaapAgentMessageSegmentDTO[],
        error?: string,
        conv?: QaapAgentConversationDTO,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-transcript-segments';

        const thoughtBrief = this.createTranscriptThoughtBriefBlock(segments);
        if (thoughtBrief) {
            body.append(thoughtBrief);
        }

        // Hero content first — Cursor-style: intent/thought, then the visible answer, then artifacts.
        for (const segment of segments) {
            if (segment.type === 'text' && (segment.content?.trim() ?? '').length > 0) {
                body.append(this.createTranscriptSegmentDetails(segment));
            }
        }

        const artifacts = document.createElement('div');
        artifacts.className = 'theia-mobile-agent-transcript-artifacts';
        const toolPills = this.createTranscriptToolPillsStrip(segments, conv);
        if (toolPills) {
            artifacts.append(toolPills);
        }
        const inlineDiff = this.createTranscriptInlineDiffStrip(segments);
        if (inlineDiff) {
            artifacts.append(inlineDiff);
        }
        const changedFiles = this.createTranscriptChangedFilesCard(segments);
        if (changedFiles) {
            artifacts.append(changedFiles);
        } else {
            const diffSummary = this.createTranscriptDiffSummaryCard(segments);
            if (diffSummary) {
                artifacts.append(diffSummary);
            }
        }
        const verification = this.createTranscriptVerificationCard(segments);
        if (verification) {
            artifacts.append(verification);
        }
        if (!toolPills) {
            const activityTimelineShown = hasTranscriptActivityTimeline(segments);
            for (const segment of segments) {
                if (segment.type !== 'tool') {
                    continue;
                }
                if (!shouldRenderTranscriptToolSegmentInline({
                    activityTimelineShown,
                    finished: segment.finished,
                    resultFailed: this.transcriptToolResultFailed(segment.result),
                })) {
                    continue;
                }
                artifacts.append(this.createTranscriptSegmentDetails(segment));
            }
        }
        if (artifacts.childElementCount > 0) {
            body.append(artifacts);
        }

        if (!thoughtBrief) {
            const technicalDetails = this.createTranscriptTechnicalDetailsCard(segments);
            if (technicalDetails) {
                body.append(technicalDetails);
            }
        }

        row.append(body);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    createTranscriptThoughtBriefBlock(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const thinking = resolveTranscriptThinkingContent(segments);
        const stats = resolveTranscriptActivityStats(segments);
        const hasStats = hasTranscriptActivityStats(stats);
        if (!thinking && !hasStats) {
            return undefined;
        }

        const block = document.createElement('details');
        block.className = 'theia-mobile-agent-thought-brief';

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-thought-brief-summary';
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-thought-brief-title';
        title.textContent = thinking
            ? nls.localize('qaap/mobileProjects/transcriptThoughtBriefly', 'Thought briefly')
            : nls.localize('qaap/mobileProjects/transcriptExploredWorkspace', 'Explored the workspace');
        summary.append(title);
        if (hasStats) {
            const meta = document.createElement('span');
            meta.className = 'theia-mobile-agent-thought-brief-meta';
            meta.textContent = this.formatTranscriptActivityMeta(stats);
            summary.append(meta);
        }
        block.append(summary);

        if (thinking) {
            const bodyWrap = document.createElement('div');
            bodyWrap.className = 'theia-mobile-agent-thought-brief-body-wrap';
            const preview = excerptTranscriptThought(thinking);
            const body = document.createElement('p');
            body.className = 'theia-mobile-agent-thought-brief-body';
            body.textContent = preview;
            bodyWrap.append(body);
            if (isTranscriptThoughtExcerptTruncated(thinking)) {
                const full = document.createElement('pre');
                full.className = 'theia-mobile-agent-thought-brief-more-body';
                full.textContent = this.cleanTranscriptDisplayText(thinking);
                bodyWrap.append(full);
            }
            block.append(bodyWrap);
        }

        return block;
    }

    createTranscriptToolPillsStrip(
        segments: QaapAgentMessageSegmentDTO[],
        conv?: QaapAgentConversationDTO,
    ): HTMLElement | undefined {
        const manualApproval = !!conv && !isConversationAutoApproveEnabled(conversationToSummary(conv));
        const toolSegments = segments.filter((segment): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> =>
            segment.type === 'tool',
        );
        const descriptors = resolveTranscriptToolPillDescriptors(toolSegments, {
            resolvePath: args => this.extractTranscriptToolFullPath(args),
        });
        if (descriptors.length === 0) {
            return undefined;
        }
        const strip = document.createElement('div');
        strip.className = 'theia-mobile-agent-tool-pills';
        for (const descriptor of descriptors) {
            const segment = segments.find(entry =>
                entry.type === 'tool' && entry.toolUseId === descriptor.toolUseId,
            );
            if (segment?.type !== 'tool') {
                continue;
            }
            const pill = document.createElement('details');
            pill.className = `theia-mobile-agent-tool-pill theia-mod-${descriptor.kind}`;
            pill.classList.toggle('theia-mod-running', !descriptor.finished);
            pill.classList.toggle('theia-mod-done', descriptor.finished);
            pill.classList.toggle('theia-mod-failed', descriptor.resultFailed);
            pill.open = shouldOpenTranscriptToolDetails({
                finished: descriptor.finished,
                resultFailed: descriptor.resultFailed,
            });
            const summary = document.createElement('summary');
            summary.className = 'theia-mobile-agent-tool-pill-summary';
            const icon = document.createElement('span');
            icon.className = `codicon ${this.transcriptToolIconClass(descriptor.kind)} theia-mobile-agent-tool-pill-icon`;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'theia-mobile-agent-tool-pill-label';
            label.textContent = descriptor.label;
            summary.append(icon, label);
            pill.append(summary);
            if (this.isTranscriptPureReadTool(segment.name) && !this.shouldShowTranscriptToolResultBody(segment, descriptor.kind)) {
                strip.append(pill);
                continue;
            }
            const body = document.createElement('div');
            body.className = 'theia-mobile-agent-tool-pill-body';
            if (manualApproval && isPendingTranscriptToolSegment(segment)) {
                body.append(this.createTranscriptToolApprovalActions(conv!.id, segment));
            }
            body.append(this.createTranscriptToolResultBody(segment, descriptor.kind));
            pill.append(body);
            strip.append(pill);
        }
        return strip.childElementCount > 0 ? strip : undefined;
    }

    createTranscriptToolApprovalActions(
        conversationId: string,
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-agent-tool-pill-approval';
        const title = document.createElement('div');
        title.className = 'theia-mobile-agent-tool-pill-approval-title';
        title.textContent = nls.localize(
            'qaap/mobileProjects/transcriptToolApprovalTitle',
            'Allow {0}?',
            segment.name,
        );
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-agent-tool-pill-approval-actions';
        const approvalId = buildTranscriptToolApprovalId(conversationId, segment.toolUseId);
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'theia-mobile-agent-tool-pill-approval-allow';
        approve.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalAllow', 'Allow');
        approve.addEventListener('click', event => {
            event.stopPropagation();
            void approveAgentRequest(approvalId).then(() => this.host.ensureTranscriptConversationRefresh());
        });
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'theia-mobile-agent-tool-pill-approval-deny';
        reject.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalDeny', 'Deny');
        reject.addEventListener('click', event => {
            event.stopPropagation();
            void rejectAgentRequest(approvalId).then(() => this.host.ensureTranscriptConversationRefresh());
        });
        actions.append(approve, reject);
        wrap.append(title, actions);
        return wrap;
    }

    createTranscriptInlineDiffStrip(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const editSegment = [...segments].reverse().find(segment =>
            segment.type === 'tool'
            && this.resolveTranscriptToolKind(segment.name) === 'editing'
            && !!segment.result?.trim(),
        );
        if (!editSegment || editSegment.type !== 'tool') {
            return undefined;
        }
        const preview = extractInlineDiffPreview(this.formatTranscriptToolResult(editSegment.result!));
        if (!preview?.length) {
            return undefined;
        }
        const block = document.createElement('div');
        block.className = 'theia-mobile-agent-inline-diff';
        const path = this.extractTranscriptToolFullPath(editSegment.args);
        if (path) {
            const head = document.createElement('div');
            head.className = 'theia-mobile-agent-inline-diff-head';
            head.textContent = this.compactTranscriptPath(path);
            block.append(head);
        }
        const lines = document.createElement('pre');
        lines.className = 'theia-mobile-agent-inline-diff-lines';
        for (const line of preview) {
            const row = document.createElement('div');
            row.className = `theia-mobile-agent-inline-diff-line theia-mod-${line.kind}`;
            row.textContent = line.text;
            lines.append(row);
        }
        block.append(lines);
        return block;
    }

    formatTranscriptActivityMeta(stats: QaapTranscriptActivityStats): string {
        const parts: string[] = [];
        if (stats.fileReads > 0) {
            parts.push(stats.fileReads === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneFile', '1 file')
                : nls.localize('qaap/mobileProjects/transcriptMetaFiles', '{0} files', String(stats.fileReads)));
        }
        if (stats.searches > 0) {
            parts.push(stats.searches === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneSearch', '1 search')
                : nls.localize('qaap/mobileProjects/transcriptMetaSearches', '{0} searches', String(stats.searches)));
        }
        if (stats.shells > 0) {
            parts.push(stats.shells === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneCommand', '1 command')
                : nls.localize('qaap/mobileProjects/transcriptMetaCommands', '{0} commands', String(stats.shells)));
        }
        if (stats.edits > 0) {
            parts.push(stats.edits === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneEdit', '1 edit')
                : nls.localize('qaap/mobileProjects/transcriptMetaEdits', '{0} edits', String(stats.edits)));
        }
        if (stats.otherTools > 0) {
            parts.push(stats.otherTools === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneTool', '1 tool')
                : nls.localize('qaap/mobileProjects/transcriptMetaTools', '{0} tools', String(stats.otherTools)));
        }
        return nls.localize('qaap/mobileProjects/transcriptThoughtMeta', 'Explored {0}', parts.join(', '));
    }

    createTranscriptActivityTimeline(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): HTMLElement | undefined {
        const items = this.resolveTranscriptActivityItems(segments, includeThinkingSteps);
        if (items.length === 0) {
            return undefined;
        }
        const visibleItems = items.slice(-8);
        const activeIndex = visibleItems.findIndex(item => item.state === 'running' || item.state === 'thinking');
        const timeline = document.createElement('section');
        timeline.className = 'theia-mobile-agent-premium-card theia-mobile-agent-activity-timeline';
        timeline.append(this.createTranscriptPremiumHead(
            'codicon-checklist',
            nls.localize('qaap/mobileProjects/transcriptActivityTimeline', 'Activity'),
            { count: visibleItems.length, variant: 'todos' },
        ));
        const list = document.createElement('ol');
        list.className = 'theia-mobile-agent-activity-list';
        visibleItems.forEach((item, index) => {
            const isActive = index === activeIndex;
            const li = document.createElement('li');
            li.className = `theia-mobile-agent-activity-item theia-mod-${item.state}${isActive ? ' theia-mod-active' : ''}`;
            li.append(
                this.createTranscriptActivityIcon(item.state, isActive),
                this.createTranscriptActivityLabel(item.label),
            );
            list.append(li);
        });
        timeline.append(list);
        return timeline;
    }

    createTranscriptActivityIcon(
        state: 'done' | 'running' | 'thinking',
        active: boolean,
    ): HTMLElement {
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-activity-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (active) {
            icon.classList.add('theia-mod-active');
            const arrow = document.createElement('span');
            arrow.className = 'codicon codicon-arrow-small-right';
            arrow.setAttribute('aria-hidden', 'true');
            icon.append(arrow);
            return icon;
        }
        if (state === 'done') {
            icon.classList.add('theia-mod-done', 'codicon', 'codicon-check');
            return icon;
        }
        icon.classList.add('theia-mod-pending');
        return icon;
    }

    createTranscriptActivityLabel(text: string): HTMLElement {
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-activity-label';
        label.textContent = text;
        return label;
    }

    /** Consistent card header: a muted leading codicon plus a label, shared by the premium cards. */
    createTranscriptPremiumHead(
        iconClass: string,
        label: string,
        options?: { readonly count?: number; readonly variant?: 'default' | 'todos' },
    ): HTMLElement {
        const head = document.createElement('div');
        head.className = 'theia-mobile-agent-premium-head';
        if (options?.variant === 'todos') {
            head.classList.add('theia-mod-todos');
        }
        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-premium-head-icon codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-agent-premium-head-label';
        text.textContent = label;
        head.append(icon, text);
        if (options?.count !== undefined) {
            const count = document.createElement('span');
            count.className = 'theia-mobile-agent-premium-head-count';
            count.textContent = String(options.count);
            head.append(count);
        }
        return head;
    }

    createTranscriptDiffSummaryCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const stats = this.resolveTranscriptDiffStats(segments);
        if (!stats || (stats.added === 0 && stats.removed === 0)) {
            return undefined;
        }
        const card = document.createElement('section');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-diff-summary';
        card.append(this.createTranscriptPremiumHead(
            'codicon-diff',
            nls.localize('qaap/mobileProjects/transcriptDiffSummary', 'Change summary'),
        ));
        const statsRow = document.createElement('div');
        statsRow.className = 'theia-mobile-agent-diff-stats';
        const added = document.createElement('span');
        added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
        added.textContent = `+${stats.added}`;
        const removed = document.createElement('span');
        removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
        removed.textContent = `-${stats.removed}`;
        statsRow.append(added, removed);
        card.append(statsRow);
        return card;
    }

    createTranscriptChangedFilesCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const files = this.resolveTranscriptChangedFiles(segments);
        if (files.length === 0) {
            return undefined;
        }
        const stats = this.resolveTranscriptDiffStats(segments);

        // Collapsible, GitHub-style card: a compact header (count + aggregate +/- stats) that
        // expands to the per-file list.
        const card = document.createElement('details');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-changed-files';

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-changed-files-summary';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-changed-files-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-changed-files-title';
        title.textContent = files.length === 1
            ? nls.localize('qaap/mobileProjects/transcriptChangedFilesOne', '{0} file changed', '1')
            : nls.localize('qaap/mobileProjects/transcriptChangedFilesCount', '{0} files changed', String(files.length));
        summary.append(chevron, title);
        if (stats && (stats.added > 0 || stats.removed > 0)) {
            const statsRow = document.createElement('span');
            statsRow.className = 'theia-mobile-agent-changed-files-stats';
            const added = document.createElement('span');
            added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
            added.textContent = `+${stats.added}`;
            const removed = document.createElement('span');
            removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
            removed.textContent = `-${stats.removed}`;
            statsRow.append(added, removed);
            summary.append(statsRow);
        }
        summary.append(this.createTranscriptChangedFilesReviewButton());
        card.append(summary);

        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-changed-files-list';
        for (const file of files.slice(0, 12)) {
            list.append(this.createTranscriptChangedFileRow(file));
        }
        if (files.length > 12) {
            const more = document.createElement('div');
            more.className = 'theia-mobile-agent-changed-files-more';
            more.textContent = nls.localize(
                'qaap/mobileProjects/transcriptChangedFilesMore',
                '+{0} more',
                String(files.length - 12),
            );
            list.append(more);
        }
        card.append(list);
        return card;
    }

    /**
     * Post-turn CTA when git diff stats exist on the conversation but the last agent row did not
     * render a changed-files card (e.g. ground-truth stats from `git diff --numstat`).
     */
    createTranscriptTurnReviewCta(conv: QaapAgentConversationDTO): HTMLElement | undefined {
        if (conv.status !== 'idle') {
            return undefined;
        }
        const summary = this.host.transcriptOpenSummary ?? conversationToSummary(conv);
        if (!this.host.hasConversationDiffStats(summary)) {
            return undefined;
        }
        const lastAgent = [...conv.messages].reverse().find(message => message.role === 'agent');
        if (!lastAgent) {
            return undefined;
        }
        if (lastAgent.segments?.length && this.resolveTranscriptChangedFiles(lastAgent.segments).length > 0) {
            return undefined;
        }
        const added = summary.linesAdded ?? 0;
        const removed = summary.linesRemoved ?? 0;
        const banner = document.createElement('div');
        banner.className = 'theia-mobile-agent-turn-review-cta';
        const stats = document.createElement('span');
        stats.className = 'theia-mobile-agent-turn-review-cta-stats';
        const addedSpan = document.createElement('span');
        addedSpan.className = 'theia-mobile-agent-diff-stat theia-mod-added';
        addedSpan.textContent = `+${added}`;
        const removedSpan = document.createElement('span');
        removedSpan.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
        removedSpan.textContent = `−${removed}`;
        stats.append(addedSpan, removedSpan);
        const review = this.createTranscriptChangedFilesReviewButton();
        review.classList.add('theia-mobile-agent-turn-review-cta-btn');
        banner.append(stats, review);
        return banner;
    }

    /** "Review" button in the changed-files header — jumps to the transcript's diff Review tab. */
    createTranscriptChangedFilesReviewButton(): HTMLButtonElement {
        const review = document.createElement('button');
        review.type = 'button';
        review.className = 'theia-mobile-agent-changed-files-review';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-compare';
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = nls.localize('qaap/mobileProjects/transcriptChangedFilesReview', 'Review');
        review.append(icon, label);
        review.addEventListener('click', event => {
            // Inside <summary>: stop the click from toggling the collapsible card.
            event.preventDefault();
            event.stopPropagation();
            const project = this.host.transcriptComposerProject;
            const convSummary = this.host.transcriptComposerSummary;
            if (project && convSummary) {
                this.host.selectTranscriptTab('review', project, convSummary);
            }
        });
        return review;
    }

    createTranscriptChangedFileRow(
        file: { readonly path: string; readonly kind: 'edited' | 'created' },
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-changed-file theia-mod-${file.kind}`;

        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-changed-file-icon codicon ${this.transcriptFileIconClass(file.path)}`;
        icon.setAttribute('aria-hidden', 'true');

        const info = document.createElement('span');
        info.className = 'theia-mobile-agent-changed-file-info';
        const slash = file.path.lastIndexOf('/');
        const name = document.createElement('span');
        name.className = 'theia-mobile-agent-changed-file-name';
        name.textContent = slash >= 0 ? file.path.slice(slash + 1) : file.path;
        info.append(name);
        if (slash > 0) {
            const dir = document.createElement('span');
            dir.className = 'theia-mobile-agent-changed-file-dir';
            dir.textContent = file.path.slice(0, slash);
            info.append(dir);
        }

        const badge = document.createElement('span');
        badge.className = `theia-mobile-agent-changed-file-badge theia-mod-${file.kind}`;
        badge.textContent = file.kind === 'created'
            ? nls.localize('qaap/mobileProjects/transcriptChangedFileNew', 'New')
            : nls.localize('qaap/mobileProjects/transcriptChangedFileEdited', 'Edited');

        row.append(icon, info, badge);
        return row;
    }

    /** Codicon for a changed-file row, derived from the file extension. */
    transcriptFileIconClass(path: string): string {
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
        if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'sh'].includes(ext)) {
            return 'codicon-file-code';
        }
        if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env'].includes(ext)) {
            return 'codicon-settings-gear';
        }
        if (['md', 'mdx', 'txt', 'rst'].includes(ext)) {
            return 'codicon-markdown';
        }
        if (['css', 'scss', 'less', 'html', 'svg'].includes(ext)) {
            return 'codicon-symbol-color';
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) {
            return 'codicon-file-media';
        }
        return 'codicon-file';
    }

    createTranscriptVerificationCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const checks = this.resolveTranscriptVerificationChecks(segments);
        if (checks.length === 0) {
            return undefined;
        }
        const card = document.createElement('section');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-verification';
        card.append(this.createTranscriptPremiumHead(
            'codicon-check-all',
            nls.localize('qaap/mobileProjects/transcriptVerification', 'Verification'),
        ));
        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-verification-list';
        for (const check of checks.slice(-4)) {
            const row = document.createElement('div');
            row.className = `theia-mobile-agent-verification-row theia-mod-${check.state}`;
            const state = document.createElement('span');
            state.className = 'theia-mobile-agent-verification-state';
            state.textContent = check.state === 'passed'
                ? nls.localize('qaap/mobileProjects/transcriptVerificationPassed', 'OK')
                : check.state === 'failed'
                    ? nls.localize('qaap/mobileProjects/transcriptVerificationFailed', 'Fail')
                    : nls.localize('qaap/mobileProjects/transcriptVerificationRunning', 'Run');
            const command = document.createElement('span');
            command.className = 'theia-mobile-agent-verification-command';
            command.textContent = check.command;
            row.append(state, command);
            list.append(row);
        }
        card.append(list);
        return card;
    }

    createTranscriptTechnicalDetailsCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const technical = segments.filter(segment => segment.type === 'thinking');
        if (technical.length === 0) {
            return undefined;
        }
        const details = document.createElement('details');
        details.className = 'theia-mobile-agent-technical-details';
        const summary = document.createElement('summary');
        summary.textContent = nls.localize(
            'qaap/mobileProjects/transcriptTechnicalDetails',
            'Technical details ({0})',
            String(technical.length),
        );
        details.append(summary);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-technical-details-body';
        for (const segment of technical) {
            body.append(this.createTranscriptSegmentDetails(segment));
        }
        details.append(body);
        return details;
    }

    resolveTranscriptActivityItems(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> {
        const items: Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> = [];
        for (const segment of segments) {
            if (segment.type === 'thinking' && segment.content.trim()) {
                if (includeThinkingSteps) {
                    items.push({
                        label: nls.localize('qaap/mobileProjects/transcriptActivityPlanning', 'Planning next steps'),
                        state: 'thinking',
                    });
                }
            } else if (segment.type === 'tool') {
                items.push({
                    label: this.host.localizeActivityLabel(formatToolActivityLabel(segment.name, segment.args)),
                    state: segment.finished ? 'done' : 'running',
                });
            }
        }
        if (segments.some(segment => segment.type === 'text' && segment.content.trim())) {
            items.push({
                label: nls.localize('qaap/mobileProjects/transcriptActivityResponseReady', 'Writing response'),
                state: 'done',
            });
        }
        return items;
    }

    resolveTranscriptChangedFiles(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly path: string; readonly kind: 'edited' | 'created' }> {
        const byPath = new Map<string, 'edited' | 'created'>();
        for (const segment of segments) {
            if (segment.type !== 'tool') {
                continue;
            }
            const kind = this.resolveTranscriptFileChangeKind(segment.name);
            if (!kind) {
                continue;
            }
            const path = this.extractTranscriptToolPath(segment.args);
            if (!path) {
                continue;
            }
            byPath.set(path, kind === 'created' ? 'created' : byPath.get(path) ?? 'edited');
        }
        return [...byPath.entries()].map(([path, kind]) => ({ path, kind }));
    }

    resolveTranscriptVerificationChecks(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> {
        const checks: Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> = [];
        for (const segment of segments) {
            if (segment.type !== 'tool' || !this.isTranscriptShellTool(segment.name)) {
                continue;
            }
            const command = this.extractTranscriptToolCommand(segment.args);
            if (!command || !this.isTranscriptVerificationCommand(command)) {
                continue;
            }
            checks.push({
                command: this.compactTranscriptCommand(command),
                state: !segment.finished ? 'running' : this.transcriptToolResultFailed(segment.result) ? 'failed' : 'passed',
            });
        }
        return checks;
    }

    resolveTranscriptDiffStats(
        segments: QaapAgentMessageSegmentDTO[],
    ): { readonly added: number; readonly removed: number } | undefined {
        let added = 0;
        let removed = 0;
        let found = false;
        for (const segment of segments) {
            const texts = segment.type === 'tool'
                ? [segment.args, segment.result ?? '']
                : [segment.content];
            for (const text of texts) {
                const parsed = parseDiffStatsFromText(this.cleanTranscriptDisplayText(text));
                if (parsed) {
                    added += parsed.added;
                    removed += parsed.removed;
                    found = true;
                }
            }
        }
        return found ? { added, removed } : undefined;
    }

    resolveTranscriptFileChangeKind(toolName: string): 'edited' | 'created' | undefined {
        const name = toolName.toLowerCase();
        if (name.includes('write') || name.includes('create')) {
            return 'created';
        }
        if (name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'edited';
        }
        return undefined;
    }

    extractTranscriptToolPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path ? this.compactTranscriptPath(path) : undefined;
        } catch {
            return undefined;
        }
    }

    extractTranscriptToolCommand(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            return typeof args.command === 'string' && args.command.trim() ? args.command.trim() : undefined;
        } catch {
            return undefined;
        }
    }

    isTranscriptShellTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_');
    }

    isTranscriptReadLikeTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('read') || name.includes('grep') || name.includes('glob') || name.includes('search') || name.includes('list');
    }

    isTranscriptVerificationCommand(command: string): boolean {
        return /\b(test|spec|check|lint|compile|build|typecheck|tsc|vitest|jest|mocha|playwright|pytest|cargo test|go test)\b/i.test(command);
    }

    transcriptToolResultFailed(result: string | undefined): boolean {
        if (!result?.trim()) {
            return false;
        }
        return /\b(error|failed|failure|exit\s+[1-9]\d*|code\s+[1-9]\d*)\b/i.test(result)
            && !/\b0\s+failed\b/i.test(result);
    }

    shouldOpenTranscriptToolDetails(segment: { readonly finished: boolean; readonly result?: string }): boolean {
        return shouldOpenTranscriptToolDetails({
            finished: segment.finished,
            resultFailed: this.transcriptToolResultFailed(segment.result),
        });
    }

    compactTranscriptCommand(command: string): string {
        const clean = command.replace(/\s+/g, ' ').trim();
        return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
    }

    formatTranscriptToolResult(result: string): string {
        return this.stripTranscriptLineNumberPrefixes(this.cleanTranscriptDisplayText(result));
    }

    stripTranscriptLineNumberPrefixes(text: string): string {
        const lines = text.split('\n');
        const stripped = lines.map(line => line.replace(/^\s*\d+[→:|]\s?/, ''));
        return stripped.some((line, index) => line !== lines[index]) ? stripped.join('\n') : text;
    }

    isTranscriptPureReadTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        if (name.includes('grep') || name.includes('search') || name.includes('glob')
            || name.includes('list') || name.includes('ls')) {
            return false;
        }
        return name === 'read' || name.endsWith('_read') || /\bread\b/.test(name);
    }

    extractTranscriptToolFullPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path?.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    splitTranscriptFilePath(path: string): { fileName: string; dirPath: string } {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        const fileName = parts.pop() ?? clean;
        const dirParts = parts.length > 3 ? parts.slice(-2) : parts;
        return { fileName, dirPath: dirParts.join('/') };
    }

    countTranscriptResultLines(result: string): number {
        const clean = this.stripTranscriptLineNumberPrefixes(this.cleanTranscriptDisplayText(result));
        return clean ? clean.split('\n').length : 0;
    }

    shouldShowTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        kind: string,
    ): boolean {
        if (!segment.result?.trim()) {
            return false;
        }
        if (this.isTranscriptPureReadTool(segment.name)) {
            return false;
        }
        return kind === 'searching' || kind === 'editing' || kind === 'tool';
    }

    compactTranscriptPath(path: string): string {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        return parts.length > 3 ? parts.slice(-3).join('/') : clean;
    }

    createTranscriptSegmentDetails(segment: QaapAgentMessageSegmentDTO): HTMLElement {
        if (segment.type === 'thinking') {
            const details = document.createElement('details');
            details.className = 'theia-mobile-agent-transcript-details theia-mod-thinking';
            details.open = false;
            const summary = document.createElement('summary');
            summary.textContent = nls.localize('qaap/mobileProjects/transcriptThinking', 'Thinking');
            const pre = document.createElement('pre');
            pre.textContent = this.cleanTranscriptDisplayText(segment.content);
            details.append(summary, pre);
            return details;
        }
        if (segment.type === 'tool') {
            if (this.isTranscriptShellTool(segment.name)) {
                return this.createTranscriptShellDetails(segment);
            }
            return this.createTranscriptToolWindow(segment);
        }
        const block = document.createElement('div');
        block.className = 'theia-mobile-agent-transcript-content';
        this.renderTranscriptRichContent(block, segment.content ?? '');
        return block;
    }

    /**
     * Render preformatted output that clamps to a few preview lines when long, with an inline
     * expand/collapse toggle — used for tool results and terminal output so the transcript stays
     * compact but every line is one tap away.
     */
    createTranscriptClampedPre(text: string, className: string): HTMLElement {
        const pre = document.createElement('pre');
        pre.className = className;
        pre.textContent = text;
        return this.createTranscriptClampedBlock(pre, text.split('\n').length);
    }

    createTranscriptClampedBlock(content: HTMLElement, lineCount: number, previewLines = 4): HTMLElement {
        if (lineCount <= previewLines) {
            return content;
        }
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-agent-clamp';
        wrap.style.setProperty('--qaap-clamp-lines', String(previewLines));
        wrap.append(content);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-agent-clamp-toggle';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-clamp-chevron codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        const hiddenLines = lineCount - previewLines;
        const syncToggle = () => {
            const expanded = wrap.classList.contains('theia-mod-expanded');
            label.textContent = expanded
                ? nls.localize('qaap/mobileProjects/transcriptShowLess', 'Show less')
                : nls.localize('qaap/mobileProjects/transcriptShowMoreLines', 'Show {0} more lines', String(hiddenLines));
            chevron.classList.toggle('codicon-chevron-down', !expanded);
            chevron.classList.toggle('codicon-chevron-up', expanded);
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };
        syncToggle();
        toggle.append(chevron, label);
        toggle.addEventListener('click', () => {
            wrap.classList.toggle('theia-mod-expanded');
            syncToggle();
        });
        wrap.append(toggle);
        return wrap;
    }

    /** Minimal one-line read status: `Read file.ts L2505-2554`. */
    createTranscriptReadLine(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const line = document.createElement('div');
        line.className = 'theia-mobile-agent-read-line';
        if (!segment.finished) {
            line.classList.add('theia-mod-running');
        }
        const verb = document.createElement('span');
        verb.className = 'theia-mobile-agent-read-line-verb';
        verb.textContent = nls.localize('qaap/mobileProjects/transcriptToolRead', 'Read');
        const detail = document.createElement('span');
        detail.className = 'theia-mobile-agent-read-line-detail';
        detail.textContent = formatReadToolDetailFromArgs(segment.args)
            ?? (fullPath ? this.splitTranscriptFilePath(fullPath).fileName : '');
        line.append(verb, detail);
        if (fullPath) {
            this.attachTranscriptFileOpenAction(line, fullPath);
        }
        return line;
    }

    createTranscriptToolWindow(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const kind = this.resolveTranscriptToolKind(segment.name);
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const target = fullPath ? this.compactTranscriptPath(fullPath)
            : this.extractTranscriptToolShortArg(segment.args);
        const hasResult = !!segment.result?.trim();
        const showResultBody = this.shouldShowTranscriptToolResultBody(segment, kind);
        const pureRead = this.isTranscriptPureReadTool(segment.name);

        if (pureRead && !showResultBody) {
            return this.createTranscriptReadLine(segment);
        }

        const head = this.createTranscriptToolHead({
            kind,
            toolName: segment.name,
            fullPath,
            target,
            hasResult,
            showResultBody,
            pureRead,
            result: segment.result,
            finished: segment.finished,
        });

        const details = document.createElement('details');
        details.className = `theia-mobile-agent-tool-window theia-mod-${kind}`;
        details.open = this.shouldOpenTranscriptToolDetails(segment);
        details.classList.add(segment.finished ? 'theia-mod-done' : 'theia-mod-running');
        details.append(head);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-tool-body';
        body.append(this.createTranscriptToolResultBody(segment, kind));
        details.append(body);
        return details;
    }

    createTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        _kind: string,
    ): HTMLElement {
        const text = this.formatTranscriptToolResult(segment.result!);
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const language = resolveTranscriptCodeLanguage(fullPath, text);
        const view = createTranscriptCodeView(text, language);
        return this.createTranscriptClampedBlock(view, text.split('\n').length);
    }

    handleTranscriptFileOpen(filePath: string): void {
        if (!this.host.openTranscriptFile) {
            return;
        }
        void Promise.resolve(this.host.openTranscriptFile(filePath)).catch(error => {
            console.warn('[qaap-mobile-shell] Failed to open transcript file:', error);
            this.host.messageService?.error(
                nls.localize('qaap/mobileProjects/transcriptOpenFileFailed', 'Could not open {0}', filePath),
            );
        });
    }

    attachTranscriptFileOpenAction(head: HTMLElement, filePath: string): void {
        if (!this.host.openTranscriptFile) {
            return;
        }
        head.classList.add('theia-mod-clickable');
        head.title = nls.localize('qaap/mobileProjects/transcriptOpenFile', 'Open in editor');
        head.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            this.handleTranscriptFileOpen(filePath);
        });
    }

    createTranscriptToolHead(options: {
        kind: string;
        toolName: string;
        fullPath?: string;
        target?: string;
        hasResult: boolean;
        showResultBody: boolean;
        pureRead: boolean;
        result?: string;
        finished: boolean;
    }): HTMLElement {
        const head = document.createElement(options.showResultBody ? 'summary' : 'div');
        head.className = 'theia-mobile-agent-tool-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-tool-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        if (!options.showResultBody) {
            chevron.hidden = true;
        }
        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-tool-icon codicon ${this.transcriptToolIconClass(options.kind)}`;
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-tool-title';
        title.textContent = this.transcriptToolVerb(options.kind, options.toolName);
        head.append(chevron, icon, title);
        if (options.fullPath && options.kind === 'reading') {
            const { fileName, dirPath } = this.splitTranscriptFilePath(options.fullPath);
            const fileNameEl = document.createElement('span');
            fileNameEl.className = 'theia-mobile-agent-tool-file-name';
            fileNameEl.textContent = fileName;
            head.append(fileNameEl);
            if (dirPath) {
                const dirEl = document.createElement('span');
                dirEl.className = 'theia-mobile-agent-tool-file-dir';
                dirEl.textContent = dirPath;
                head.append(dirEl);
            }
            if (!options.showResultBody) {
                this.attachTranscriptFileOpenAction(head, options.fullPath);
            }
        } else if (options.target) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-agent-tool-target';
            chip.textContent = options.target;
            head.append(chip);
        }
        if (options.hasResult && options.pureRead && options.result) {
            const lineCount = this.countTranscriptResultLines(options.result);
            if (lineCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'theia-mobile-agent-tool-badge';
                badge.textContent = lineCount === 1
                    ? nls.localize('qaap/mobileProjects/transcriptToolLineCountOne', '1 line')
                    : nls.localize('qaap/mobileProjects/transcriptToolLineCount', '{0} lines', String(lineCount));
                head.append(badge);
            }
        } else if (options.hasResult && options.kind === 'searching' && options.result) {
            const matchLines = this.countTranscriptResultLines(options.result);
            if (matchLines > 0) {
                const badge = document.createElement('span');
                badge.className = 'theia-mobile-agent-tool-badge theia-mod-muted';
                badge.textContent = matchLines === 1
                    ? nls.localize('qaap/mobileProjects/transcriptToolMatchCountOne', '1 match')
                    : nls.localize('qaap/mobileProjects/transcriptToolMatchCount', '{0} matches', String(matchLines));
                head.append(badge);
            }
        }
        const state = document.createElement('span');
        state.className = 'theia-mobile-agent-tool-state';
        state.setAttribute('aria-hidden', 'true');
        head.append(state);
        return head;
    }

    /** Codicon for a tool window header, by resolved tool kind. */
    transcriptToolIconClass(kind: string): string {
        switch (kind) {
            case 'reading': return 'codicon-file';
            case 'searching': return 'codicon-search';
            case 'editing': return 'codicon-edit';
            case 'terminal': return 'codicon-terminal';
            default: return 'codicon-tools';
        }
    }

    /** Human verb for a finished/running tool, e.g. "Read", "Edited", "Searched". */
    transcriptToolVerb(kind: string, toolName: string): string {
        switch (kind) {
            case 'reading': return nls.localize('qaap/mobileProjects/transcriptToolRead', 'Read');
            case 'searching': return nls.localize('qaap/mobileProjects/transcriptToolSearched', 'Searched');
            case 'editing': return nls.localize('qaap/mobileProjects/transcriptToolEdited', 'Edited');
            case 'terminal': return nls.localize('qaap/mobileProjects/transcriptToolRan', 'Ran');
            default: return (toolName ?? 'tool').replace(/_/g, ' ');
        }
    }

    transcriptShellStateAriaLabel(finished: boolean, failed: boolean): string {
        if (!finished) {
            return nls.localize('qaap/mobileProjects/transcriptShellRunning', 'running');
        }
        return failed
            ? nls.localize('qaap/mobileProjects/transcriptShellFailed', 'failed')
            : nls.localize('qaap/mobileProjects/transcriptShellDone', 'done');
    }

    /** Full shell-window text for clipboard: `$ command` plus any output block. */
    collectTranscriptShellBodyCopyText(body: HTMLElement): string {
        const parts: string[] = [];
        const command = body.querySelector('.theia-mobile-agent-shell-command code')?.textContent?.trim();
        if (command) {
            parts.push(`$ ${command}`);
        }
        const output = body.querySelector('.theia-mobile-agent-shell-output')?.textContent;
        if (output?.trim()) {
            if (parts.length) {
                parts.push('');
            }
            parts.push(output.trimEnd());
        }
        if (parts.length) {
            return parts.join('\n');
        }
        return body.textContent?.trim() ?? '';
    }

    appendTranscriptShellSummaryTail(
        summary: HTMLElement,
        options: { finished: boolean; failed: boolean; copyFrom?: () => string; copyLabel?: string },
    ): void {
        const tail = document.createElement('div');
        tail.className = 'theia-mobile-agent-shell-tail';
        const state = document.createElement('span');
        state.className = 'theia-mobile-agent-shell-state';
        state.setAttribute('role', 'status');
        state.setAttribute('aria-label', this.transcriptShellStateAriaLabel(options.finished, options.failed));
        tail.append(state);
        if (options.copyFrom) {
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'theia-mobile-agent-shell-copy codicon codicon-copy';
            const copyLabel = options.copyLabel
                ?? nls.localize('qaap/mobileProjects/transcriptShellCopy', 'Copy');
            copyBtn.setAttribute('aria-label', copyLabel);
            const tip = document.createElement('span');
            tip.className = 'theia-mobile-agent-shell-copy-tip';
            tip.setAttribute('role', 'tooltip');
            tip.textContent = nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied');
            copyBtn.append(tip);
            copyBtn.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();
                const text = options.copyFrom!().trim();
                if (text) {
                    void this.copyTranscriptShellText(text, copyBtn, tip, copyLabel);
                }
            });
            tail.append(copyBtn);
        }
        summary.append(tail);
    }

    async copyTranscriptShellText(
        text: string,
        copyBtn: HTMLButtonElement,
        tip: HTMLElement,
        copyLabel: string,
    ): Promise<void> {
        const copiedLabel = nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied');
        const failedLabel = nls.localize('qaap/mobileProjects/transcriptShellCopyFailed', 'Could not copy');
        try {
            await navigator.clipboard.writeText(text);
            this.flashTranscriptShellCopyTooltip(copyBtn, tip, copiedLabel, copyLabel, false);
        } catch {
            this.flashTranscriptShellCopyTooltip(copyBtn, tip, failedLabel, copyLabel, true);
        }
    }

    flashTranscriptShellCopyTooltip(
        copyBtn: HTMLButtonElement,
        tip: HTMLElement,
        message: string,
        copyLabel: string,
        failed: boolean,
    ): void {
        tip.textContent = message;
        copyBtn.classList.remove('theia-mod-copied', 'theia-mod-copy-failed');
        copyBtn.classList.add(failed ? 'theia-mod-copy-failed' : 'theia-mod-copied');
        copyBtn.setAttribute('aria-label', message);
        window.clearTimeout(copyBtn.dataset.copyTipTimerId ? Number(copyBtn.dataset.copyTipTimerId) : undefined);
        copyBtn.dataset.copyTipTimerId = String(window.setTimeout(() => {
            copyBtn.classList.remove('theia-mod-copied', 'theia-mod-copy-failed');
            copyBtn.setAttribute('aria-label', copyLabel);
            delete copyBtn.dataset.copyTipTimerId;
        }, 1400));
    }

    createTranscriptShellDetails(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const details = document.createElement('details');
        details.className = 'theia-mobile-agent-shell-window';
        const failed = this.transcriptToolResultFailed(segment.result);
        details.open = this.shouldOpenTranscriptToolDetails(segment);
        if (segment.finished) {
            details.classList.add(failed ? 'theia-mod-failed' : 'theia-mod-done');
        } else {
            details.classList.add('theia-mod-running');
        }

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-shell-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-shell-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-shell-icon';
        icon.textContent = '>_';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-shell-title';
        const command = this.extractTranscriptToolCommand(segment.args)
            ?? this.cleanTranscriptDisplayText(segment.args);
        label.textContent = command && command !== '{}'
            ? this.compactTranscriptCommand(command)
            : nls.localize('qaap/mobileProjects/transcriptShell', 'Shell');
        summary.append(chevron, icon, label);

        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-shell-body';
        const commandLine = document.createElement('div');
        commandLine.className = 'theia-mobile-agent-shell-command';
        const prompt = document.createElement('span');
        prompt.className = 'theia-mobile-agent-shell-prompt';
        prompt.textContent = '$';
        const commandText = document.createElement('code');
        commandText.textContent = command;
        commandLine.append(prompt, commandText);
        body.append(commandLine);
        if (segment.result?.trim()) {
            body.append(this.createTranscriptClampedPre(
                this.formatTranscriptToolResult(segment.result),
                'theia-mobile-agent-shell-output',
            ));
        }
        this.appendTranscriptShellSummaryTail(summary, {
            finished: segment.finished,
            failed,
            copyFrom: () => this.collectTranscriptShellBodyCopyText(body),
        });
        details.append(summary, body);
        return details;
    }

    createTranscriptStreamingActivityRow(conv: QaapAgentConversationDTO): HTMLElement {
        const row = document.createElement('div');
        row.setAttribute(TRANSCRIPT_ACTIVITY_ROW_ATTR, 'true');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent theia-mod-streaming theia-mobile-agent-activity';
        const state = this.resolveTranscriptStreamingActivity(conv);

        // A single, live "thinking/acting" line — minimalist, with an animated dot and a shimmering
        // label that reflects what the agent is doing right now.
        const line = document.createElement('div');
        line.className = `theia-mobile-agent-stream-line theia-mod-${state.kind}`;
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-agent-stream-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-stream-label';
        label.textContent = `${state.title}…`;
        line.append(dot, label);
        row.append(line);
        return row;
    }

    resolveTranscriptStreamingActivity(conv: QaapAgentConversationDTO): { kind: string; title: string; detail: string } {
        const lastAgent = [...conv.messages].reverse().find(message => message.role === 'agent');
        const segments = lastAgent?.segments ?? [];
        const activeTool = [...segments].reverse().find((segment): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> =>
            segment.type === 'tool' && !segment.finished);
        if (activeTool) {
            const label = this.host.localizeActivityLabel(formatToolActivityLabel(activeTool.name, activeTool.args));
            return {
                kind: this.resolveTranscriptToolKind(activeTool.name),
                title: label,
                detail: this.resolveTranscriptToolDetail(activeTool),
            };
        }
        const hasText = segments.some(segment => segment.type === 'text' && (segment.content ?? '').trim().length > 0);
        if (hasText) {
            return {
                kind: 'writing',
                title: nls.localize('qaap/mobileProjects/transcriptActivityWriting', 'Writing the response'),
                detail: nls.localize('qaap/mobileProjects/transcriptActivityWritingDetail', 'Composing the next visible update.'),
            };
        }
        const hasThinking = segments.some(segment => segment.type === 'thinking' && segment.content.trim().length > 0);
        if (hasThinking) {
            return {
                kind: 'thinking',
                title: nls.localize('qaap/mobileProjects/transcriptActivityThinking', 'Thinking'),
                detail: nls.localize('qaap/mobileProjects/transcriptActivityThinkingDetail', 'Planning the next step before changing anything.'),
            };
        }
        return {
            kind: 'starting',
            title: nls.localize('qaap/mobileProjects/transcriptActivityStarting', 'Starting the turn'),
            detail: nls.localize('qaap/mobileProjects/transcriptActivityStartingDetail', 'Preparing context and selecting the next action.'),
        };
    }

    resolveTranscriptToolKind(toolName: string | undefined): string {
        const name = (toolName ?? 'tool').toLowerCase();
        if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
            return 'terminal';
        }
        if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'editing';
        }
        if (name.includes('grep') || name.includes('search') || name.includes('glob')) {
            return 'searching';
        }
        if (name.includes('read') || name.includes('list') || name.includes('ls')) {
            return 'reading';
        }
        return 'tool';
    }

    resolveTranscriptToolDetail(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): string {
        const name = (segment.name ?? 'tool').replace(/_/g, ' ');
        const shortArgs = this.extractTranscriptToolShortArg(segment.args);
        return shortArgs
            ? nls.localize('qaap/mobileProjects/transcriptActivityToolDetailWithArgs', '{0}: {1}', name, shortArgs)
            : nls.localize('qaap/mobileProjects/transcriptActivityToolDetail', 'Calling {0}', name);
    }

    extractTranscriptToolShortArg(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const value = typeof args.command === 'string' ? args.command
                : typeof args.path === 'string' ? args.path
                    : typeof args.file_path === 'string' ? args.file_path
                        : typeof args.pattern === 'string' ? args.pattern
                            : typeof args.query === 'string' ? args.query
                                : undefined;
            if (!value?.trim()) {
                return undefined;
            }
            const clean = value.trim().replace(/\s+/g, ' ');
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        } catch {
            const clean = (argsJson ?? '').trim().replace(/\s+/g, ' ');
            if (!clean || clean === '{}') {
                return undefined;
            }
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        }
    }

    createTranscriptUserMessageRow(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-agent-transcript-user-wrap';
        wrap.dataset.messageId = msg.id;

        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-user';
        const contentEl = document.createElement('div');
        contentEl.className = 'theia-mobile-agent-transcript-content';
        const displayContent = normalizeAgentMessageContentForDisplay(msg.content);
        this.renderTranscriptRichContent(contentEl, displayContent);
        row.append(contentEl);
        if (msg.error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = msg.error;
            row.append(err);
        }
        wrap.append(row);

        const plainText = this.cleanTranscriptDisplayText(displayContent).trim();
        const summary = this.host.transcriptComposerSummary;
        const isTheiaChat = summary?.source === 'theia-chat';
        const actionsEnabled = conv.status !== 'streaming' && !msg.id.startsWith('pending-user-');

        wrap.append(this.createTranscriptUserMessageActions({
            plainText,
            canEdit: actionsEnabled,
            canUndo: actionsEnabled && !isTheiaChat,
            onEdit: () => { void this.editTranscriptUserMessage(msg, conv); },
            onCopy: () => { void this.copyTranscriptUserMessage(plainText); },
            onUndo: () => { void this.undoTranscriptUserMessage(msg, conv); },
        }));
        return wrap;
    }

    createTranscriptUserMessageActions(options: {
        plainText: string;
        canEdit: boolean;
        canUndo: boolean;
        onEdit: () => void;
        onCopy: () => void;
        onUndo: () => void;
    }): HTMLElement {
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-agent-transcript-user-actions';

        const editLabel = nls.localize('qaap/mobileProjects/transcriptUserEdit', 'Edit');
        const copyLabel = nls.localize('qaap/mobileProjects/transcriptUserCopy', 'Copy');
        const undoLabel = nls.localize('qaap/mobileProjects/transcriptUserUndo', 'Undo');

        const editBtn = this.createTranscriptUserActionButton('edit', editLabel, 'codicon-edit', options.onEdit);
        editBtn.disabled = !options.canEdit || !options.plainText;
        const copyBtn = this.createTranscriptUserActionButton('copy', copyLabel, 'codicon-copy', options.onCopy);
        copyBtn.disabled = !options.plainText;
        const undoBtn = this.createTranscriptUserActionButton('undo', undoLabel, 'codicon-discard', options.onUndo);
        undoBtn.disabled = !options.canUndo;

        actions.append(editBtn, copyBtn, undoBtn);
        return actions;
    }

    createTranscriptUserActionButton(
        action: 'edit' | 'copy' | 'undo',
        label: string,
        iconClass: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `theia-mobile-agent-transcript-user-action theia-mod-${action}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = `<span class="codicon ${iconClass}" aria-hidden="true"></span><span class="theia-mobile-agent-transcript-user-action-label">${label}</span>`;
        button.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            onClick();
        });
        return button;
    }

    async copyTranscriptUserMessage(text: string): Promise<void> {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        try {
            if (this.host.previewClipboard) {
                await this.host.previewClipboard.writeText(trimmed);
            } else {
                await navigator.clipboard.writeText(trimmed);
            }
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied'), { kind: 'success', duration: 1800 });
        } catch {
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptShellCopyFailed', 'Could not copy'), { kind: 'warning' });
        }
    }

    async editTranscriptUserMessage(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        const summary = this.host.transcriptComposerSummary;
        if (!summary || this.host.transcriptOpenSummaryId !== conv.id) {
            return;
        }
        const plainText = this.cleanTranscriptDisplayText(normalizeAgentMessageContentForDisplay(msg.content)).trim();
        if (!plainText) {
            return;
        }
        if (summary.source === 'theia-chat') {
            this.host.transcriptComposerDraft = plainText;
            this.host.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
            return;
        }
        try {
            const updated = await rewindConversationToMessage(conv.id, msg.id);
            this.host.conversations?.recordSnapshot(conversationToSummary(updated));
            this.host.transcriptLastFingerprint = undefined;
            if (this.host.transcriptChatHost) {
                this.renderTranscriptMessages(this.host.transcriptChatHost, updated);
            }
            this.host.transcriptComposerDraft = plainText;
            this.host.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }

    async undoTranscriptUserMessage(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        const summary = this.host.transcriptComposerSummary;
        if (!summary || this.host.transcriptOpenSummaryId !== conv.id || summary.source === 'theia-chat') {
            return;
        }
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/transcriptUndoTitle', 'Undo message'),
            msg: nls.localize(
                'qaap/mobileProjects/transcriptUndoMsg',
                'Remove this message and everything after it? Tracked files may revert to the previous checkpoint.',
            ),
            ok: nls.localize('qaap/mobileProjects/transcriptUserUndo', 'Undo'),
            cancel: nls.localize('qaap/mobileProjects/parallelCancel', 'Back'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            const updated = await rewindConversationToMessage(conv.id, msg.id);
            this.host.conversations?.recordSnapshot(conversationToSummary(updated));
            this.host.transcriptLastFingerprint = undefined;
            if (this.host.transcriptChatHost) {
                this.renderTranscriptMessages(this.host.transcriptChatHost, updated);
            }
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptUndoDone', 'Message undone'), { kind: 'success', duration: 2200 });
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }

    focusTranscriptComposerInput(): void {
        window.requestAnimationFrame(() => {
            const input = this.host.transcriptComposerHost?.querySelector<HTMLTextAreaElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            if (!input) {
                return;
            }
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
    }

    /** Plain DOM fallback when {@link ChatViewWidget} is unavailable. */
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
        this.renderTranscriptRichContent(contentEl, normalizeAgentMessageContentForDisplay(content));
        row.append(contentEl);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    renderTranscriptRichContent(host: HTMLElement, content: string): void {
        const clean = this.cleanTranscriptDisplayText(content).trim();
        if (isTranscriptTerminalOutputText(clean)) {
            host.append(this.createTranscriptTextTerminalWindow(clean));
            return;
        }
        host.classList.add('theia-mod-markdown');
        this.renderTranscriptMarkdown(host, clean);
    }

    createTranscriptTextTerminalWindow(content: string): HTMLElement {
        const details = document.createElement('details');
        const failed = isTranscriptErrorOutput(content);
        details.className = `theia-mobile-agent-shell-window ${failed ? 'theia-mod-failed' : 'theia-mod-done'} theia-mod-text-output`;
        details.open = shouldOpenTranscriptToolDetails({ finished: true, resultFailed: failed });
        const cleanContent = this.cleanTranscriptDisplayText(content);
        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-shell-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-shell-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-shell-icon';
        icon.textContent = '>_';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-shell-title';
        label.textContent = failed
            ? nls.localize('qaap/mobileProjects/transcriptErrorOutput', 'Error output')
            : nls.localize('qaap/mobileProjects/transcriptTerminalOutput', 'Terminal output');
        summary.append(chevron, icon, label);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-shell-body';
        body.append(this.createTranscriptClampedPre(cleanContent, 'theia-mobile-agent-shell-output'));
        this.appendTranscriptShellSummaryTail(summary, {
            finished: true,
            failed,
            copyFrom: () => this.collectTranscriptShellBodyCopyText(body),
        });
        details.append(summary, body);
        return details;
    }

    renderTranscriptMarkdown(host: HTMLElement, content: string): void {
        const html = this.host.transcriptMarkdownIt.render(this.linkifyTranscriptPreviewUrls(this.cleanTranscriptDisplayText(content)));
        host.innerHTML = DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true,
        });
        host.addEventListener('click', event => {
            let target = event.target as HTMLElement | null;
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }
            if (!target) {
                return;
            }
            const href = target.getAttribute('href');
            if (!href) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void this.host.openTranscriptPreviewUrlFromLink(href).then(handled => {
                if (!handled) {
                    window.open(href, '_blank', 'noopener');
                }
            });
        });
    }

    linkifyTranscriptPreviewUrls(content: string | undefined | null): string {
        const text = content ?? '';
        return text.replace(
            /(^|[\s(])((?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):\d{2,5}(?:\/[^\s\x60<)]*)?|\/qaap-dev\/\d{2,5}(?:\/[^\s\x60<)]*)?)/gi,
            (match, prefix: string, url: string, offset: number) => {
                const before = text.slice(0, offset);
                if (/\[[^\]]*$/.test(before) || /\]\([^)]*$/.test(before)) {
                    return match;
                }
                return prefix + '[' + url + '](' + url + ')';
            },
        );
    }

    cleanTranscriptDisplayText(content: string | undefined | null): string {
        const text = content ?? '';
        return collapseExactRepeatedText(text
            .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
            .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, ''));
    }
}
