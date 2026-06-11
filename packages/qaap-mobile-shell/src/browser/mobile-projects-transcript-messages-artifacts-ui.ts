// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { approveAgentRequest, rejectAgentRequest } from '../common/qaap-agent-approval-client';
import { type QaapAgentConversationDTO, type QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';
import { conversationUsesInteractiveApprovals } from '../common/qaap-agent-interactive-approvals';
import { formatToolActivityLabel } from '../common/qaap-agent-conversation-list-metrics';
import { excerptTranscriptThought, extractTranscriptDiffCard, hasTranscriptActivityStats, hasTranscriptActivityTimeline, isTranscriptThoughtExcerptTruncated, isTranscriptTodoTool, parseTranscriptTodoChecklist, resolveTranscriptActivityStats, resolveTranscriptThinkingContent, resolveTranscriptToolPillDescriptors, resolveTranscriptToolRowParts, shouldOpenTranscriptToolDetails, shouldRenderTranscriptToolSegmentInline, type QaapTranscriptActivityStats } from '../common/qaap-agent-transcript-segments';
import { formatTranscriptStreamElapsed, formatTranscriptStreamTokens, resolveTranscriptTurnStartMs, resolveTranscriptTurnStreamChars } from '../common/qaap-transcript-stream-status';
import { buildTranscriptToolApprovalId, isPendingTranscriptToolSegment } from '../common/qaap-transcript-approval-inline';
import { TRANSCRIPT_ACTIVITY_ROW_ATTR, TRANSCRIPT_SEGMENT_INDEX_ATTR, TRANSCRIPT_TOOL_USE_ID_ATTR } from '../common/qaap-transcript-incremental-update';
import type { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import type { MobileProjectsTranscriptMessagesResolversUi } from './mobile-projects-transcript-messages-resolvers-ui';
import type { MobileProjectsTranscriptMessagesToolUi } from './mobile-projects-transcript-messages-tool-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';

export class MobileProjectsTranscriptMessagesArtifactsUi {
    constructor(
        protected readonly host: MobileProjectsTranscriptMessagesHost,
        protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi,
        protected readonly resolversUi: MobileProjectsTranscriptMessagesResolversUi,
        protected readonly toolUi: MobileProjectsTranscriptMessagesToolUi,
    ) { }

    createTranscriptAgentSegmentsRow(
        segments: QaapAgentMessageSegmentDTO[],
        error?: string,
        conv?: QaapAgentConversationDTO,
        options?: { readonly deferHeavyContent?: boolean; readonly streaming?: boolean },
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
        const defer = !!options?.deferHeavyContent;
        if (defer) {
            row.setAttribute('data-transcript-row-deferred', '1');
        }
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-transcript-segments';

        const thoughtBrief = this.createTranscriptThoughtBriefBlock(segments);
        if (thoughtBrief) {
            body.append(thoughtBrief);
        }

        // Hero content first — Cursor-style: intent/thought, then the visible answer, then artifacts.
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
            const segment = segments[segmentIndex];
            if (segment.type === 'text' && (segment.content?.trim() ?? '').length > 0) {
                const textBlock = this.toolUi.createTranscriptSegmentDetails(segment, {
                    defer,
                    streaming: options?.streaming,
                });
                textBlock.setAttribute(TRANSCRIPT_SEGMENT_INDEX_ATTR, String(segmentIndex));
                body.append(textBlock);
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
                    resultFailed: this.resolversUi.transcriptToolResultFailed(segment.result),
                })) {
                    continue;
                }
                artifacts.append(this.toolUi.createTranscriptSegmentDetails(segment));
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

        if (options?.streaming && conv) {
            const meta = this.createTranscriptStreamMeta(conv, row);
            if (meta) {
                const status = document.createElement('div');
                status.className = 'theia-mobile-agent-stream-status';
                status.append(meta);
                body.append(status);
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

    /** In-place markdown refresh for streaming text segments — preserves tool pill expand state. */
    patchStreamingAgentTextSegments(
        row: HTMLElement,
        prevSegments: readonly QaapAgentMessageSegmentDTO[],
        nextSegments: readonly QaapAgentMessageSegmentDTO[],
    ): boolean {
        for (let segmentIndex = 0; segmentIndex < nextSegments.length; segmentIndex++) {
            const previous = prevSegments[segmentIndex];
            const next = nextSegments[segmentIndex];
            if (next.type !== 'text' || previous.type !== 'text') {
                continue;
            }
            if ((previous.content ?? '') === (next.content ?? '')) {
                continue;
            }
            const host = row.querySelector<HTMLElement>(
                `[${TRANSCRIPT_SEGMENT_INDEX_ATTR}="${segmentIndex}"]`,
            );
            if (!host) {
                return false;
            }
            const streaming = row.classList.contains('theia-mod-streaming');
            this.toolUi.renderTranscriptRichContent(host, next.content ?? '', { streaming });
        }
        return true;
    }

    /** In-place tool pill refresh — preserves expand state while result/args stream or finish. */
    patchStreamingAgentToolSegments(
        row: HTMLElement,
        prevSegments: readonly QaapAgentMessageSegmentDTO[],
        nextSegments: readonly QaapAgentMessageSegmentDTO[],
        conv?: QaapAgentConversationDTO,
    ): boolean {
        for (let segmentIndex = 0; segmentIndex < nextSegments.length; segmentIndex++) {
            const previous = prevSegments[segmentIndex];
            const next = nextSegments[segmentIndex];
            if (next.type !== 'tool' || previous.type !== 'tool') {
                continue;
            }
            if (previous.toolUseId !== next.toolUseId || previous.name !== next.name) {
                return false;
            }
            const previousResult = previous.result ?? '';
            const incomingResult = next.result ?? '';
            const previousArgs = previous.args ?? '';
            const incomingArgs = next.args ?? '';
            const unchanged = previous.finished === next.finished
                && previousResult === incomingResult
                && previousArgs === incomingArgs;
            if (unchanged) {
                continue;
            }
            const pill = row.querySelector<HTMLDetailsElement>(
                `[${TRANSCRIPT_TOOL_USE_ID_ATTR}="${CSS.escape(next.toolUseId)}"]`,
            );
            if (!pill) {
                return false;
            }
            this.patchTranscriptToolPill(pill, previous, next, conv);
            const group = pill.closest('.theia-mobile-agent-tool-group');
            if (group instanceof HTMLElement) {
                this.refreshTranscriptToolGroupSummary(group);
            }
        }
        return true;
    }

    /** Append a new text block when a text segment appears at the tail without rebuilding tool pills. */
    appendStreamingAgentTextSegment(
        row: HTMLElement,
        nextSegments: readonly QaapAgentMessageSegmentDTO[],
    ): boolean {
        const segmentIndex = nextSegments.length - 1;
        const segment = nextSegments[segmentIndex];
        if (!segment || segment.type !== 'text') {
            return false;
        }
        const segmentsBody = row.querySelector('.theia-mobile-agent-transcript-segments');
        if (!segmentsBody) {
            return false;
        }
        if (segmentsBody.querySelector(`[${TRANSCRIPT_SEGMENT_INDEX_ATTR}="${segmentIndex}"]`)) {
            return false;
        }
        const textBlock = this.toolUi.createTranscriptSegmentDetails(segment);
        textBlock.setAttribute(TRANSCRIPT_SEGMENT_INDEX_ATTR, String(segmentIndex));
        const streaming = row.classList.contains('theia-mod-streaming');
        if (streaming) {
            this.toolUi.renderTranscriptRichContent(textBlock, segment.content ?? '', { streaming });
        }
        const artifacts = segmentsBody.querySelector('.theia-mobile-agent-transcript-artifacts');
        if (artifacts) {
            segmentsBody.insertBefore(textBlock, artifacts);
        } else {
            segmentsBody.append(textBlock);
        }
        return true;
    }

    /** Append a new tool pill when a tool segment appears at the tail without rebuilding text blocks. */
    appendStreamingAgentToolSegment(
        row: HTMLElement,
        nextSegments: readonly QaapAgentMessageSegmentDTO[],
        conv?: QaapAgentConversationDTO,
    ): boolean {
        const segment = nextSegments[nextSegments.length - 1];
        if (!segment || segment.type !== 'tool') {
            return false;
        }
        const segmentsBody = row.querySelector('.theia-mobile-agent-transcript-segments');
        if (!segmentsBody) {
            return false;
        }
        let artifacts = segmentsBody.querySelector('.theia-mobile-agent-transcript-artifacts');
        if (!artifacts) {
            artifacts = document.createElement('div');
            artifacts.className = 'theia-mobile-agent-transcript-artifacts';
            segmentsBody.append(artifacts);
        }
        let strip = artifacts.querySelector('.theia-mobile-agent-tool-pills');
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'theia-mobile-agent-tool-pills';
            artifacts.prepend(this.wrapTranscriptToolGroup(strip as HTMLElement));
        }
        if (strip.querySelector(`[${TRANSCRIPT_TOOL_USE_ID_ATTR}="${CSS.escape(segment.toolUseId)}"]`)) {
            return false;
        }
        strip.append(this.createTranscriptToolPill(segment, conv));
        const group = strip.closest('.theia-mobile-agent-tool-group');
        if (group instanceof HTMLElement) {
            this.refreshTranscriptToolGroupSummary(group);
        }
        return true;
    }

    patchTranscriptToolPill(
        pill: HTMLDetailsElement,
        previous: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        conv?: QaapAgentConversationDTO,
    ): void {
        const manualApproval = !!conv && conversationUsesInteractiveApprovals(conv);
        const descriptors = resolveTranscriptToolPillDescriptors([segment], {
            resolvePath: args => this.resolversUi.extractTranscriptToolFullPath(args),
        });
        const descriptor = descriptors[0];
        if (!descriptor) {
            return;
        }
        const wasOpen = pill.open;
        const wasFailed = pill.classList.contains('theia-mod-failed');
        pill.className = `theia-mobile-agent-tool-pill theia-mod-${descriptor.kind}`;
        pill.classList.toggle('theia-mod-running', !descriptor.finished);
        pill.classList.toggle('theia-mod-done', descriptor.finished);
        pill.classList.toggle('theia-mod-failed', descriptor.resultFailed);
        const rowParts = this.resolveToolRowParts(segment, descriptor.kind);
        const verb = pill.querySelector('.theia-mobile-agent-tool-pill-verb');
        if (verb) {
            verb.textContent = rowParts.verb;
        }
        const label = pill.querySelector('.theia-mobile-agent-tool-pill-label');
        if (label) {
            label.textContent = rowParts.detail;
        }
        if (this.resolversUi.isTranscriptPureReadTool(segment.name)
            && !this.resolversUi.shouldShowTranscriptToolResultBody(segment, descriptor.kind)) {
            pill.querySelector('.theia-mobile-agent-tool-pill-body')?.remove();
            pill.open = wasOpen;
            return;
        }
        let body = pill.querySelector<HTMLElement>('.theia-mobile-agent-tool-pill-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'theia-mobile-agent-tool-pill-body';
            pill.append(body);
        }
        const pendingApproval = manualApproval && isPendingTranscriptToolSegment(segment);
        const pendingApprovalChanged = pendingApproval !== !!body.querySelector('.theia-mobile-agent-tool-pill-approval');
        if (!pendingApprovalChanged
            && this.toolUi.canPatchTranscriptToolResultStream(previous, segment)
            && this.toolUi.patchTranscriptToolResultStreamBody(body, segment)) {
            pill.open = wasOpen;
            return;
        }
        const speculativeOnly = !pendingApprovalChanged
            && !segment.result?.trim()
            && !segment.finished
            && previous.toolUseId === segment.toolUseId
            && previous.name === segment.name;
        if (speculativeOnly) {
            this.toolUi.ensureTranscriptToolSpeculativePlaceholder(body, segment);
            pill.open = wasOpen;
            return;
        }
        body.replaceChildren();
        if (pendingApproval) {
            body.append(this.createTranscriptToolApprovalActions(conv!.id, segment));
        }
        const todoChecklist = isTranscriptTodoTool(segment.name) && !!parseTranscriptTodoChecklist(segment.args);
        if (segment.result?.trim() || todoChecklist) {
            body.append(this.toolUi.createTranscriptToolResultBody(
                segment,
                descriptor.kind,
                { streaming: !descriptor.finished },
            ));
        } else if (!segment.finished) {
            this.toolUi.ensureTranscriptToolSpeculativePlaceholder(body, segment);
        }
        if (descriptor.resultFailed && !wasFailed) {
            pill.open = shouldOpenTranscriptToolDetails({
                finished: descriptor.finished,
                resultFailed: descriptor.resultFailed,
            });
        } else {
            pill.open = wasOpen;
        }
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
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-agent-thought-brief-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = '∴';
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-thought-brief-title';
        title.textContent = thinking
            ? nls.localize('qaap/mobileProjects/transcriptThoughtBriefly', 'Thought briefly')
            : nls.localize('qaap/mobileProjects/transcriptExploredWorkspace', 'Explored the workspace');
        summary.append(glyph, title);
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
                full.textContent = this.contentUi.cleanTranscriptDisplayText(thinking);
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
        const toolSegments = segments.filter((segment): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> =>
            segment.type === 'tool',
        );
        const descriptors = resolveTranscriptToolPillDescriptors(toolSegments, {
            resolvePath: args => this.resolversUi.extractTranscriptToolFullPath(args),
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
            strip.append(this.createTranscriptToolPill(segment, conv));
        }
        if (strip.childElementCount === 0) {
            return undefined;
        }
        return this.wrapTranscriptToolGroup(strip);
    }

    /**
     * Claude-Code-style collapsed activity line: one `details` row summarising the tool calls
     * ("Ran 4 commands, read 6 files ›") that expands into the individual tool pills.
     */
    protected wrapTranscriptToolGroup(strip: HTMLElement): HTMLDetailsElement {
        const group = document.createElement('details');
        group.className = 'theia-mobile-agent-tool-group';
        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-tool-group-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-tool-group-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-tool-group-label';
        summary.append(chevron, label);
        group.append(summary, strip);
        this.refreshTranscriptToolGroupSummary(group);
        return group;
    }

    /** Recompute the group summary label and open state from the pills currently inside. */
    refreshTranscriptToolGroupSummary(group: HTMLElement): void {
        const label = group.querySelector<HTMLElement>('.theia-mobile-agent-tool-group-label');
        if (!label) {
            return;
        }
        const pills = group.querySelectorAll('.theia-mobile-agent-tool-pill');
        let shells = 0;
        let fileReads = 0;
        let searches = 0;
        let edits = 0;
        let otherTools = 0;
        for (const pill of pills) {
            if (pill.classList.contains('theia-mod-terminal')) {
                shells++;
            } else if (pill.classList.contains('theia-mod-reading')) {
                fileReads++;
            } else if (pill.classList.contains('theia-mod-searching')) {
                searches++;
            } else if (pill.classList.contains('theia-mod-editing')) {
                edits++;
            } else {
                otherTools++;
            }
        }
        label.textContent = this.formatTranscriptToolGroupLabel({ fileReads, searches, shells, edits, otherTools });
        if (group instanceof HTMLDetailsElement
            && group.querySelector('.theia-mobile-agent-tool-pill.theia-mod-running, .theia-mobile-agent-tool-pill.theia-mod-failed')) {
            group.open = true;
        }
    }

    /** "Ran 4 commands, read 6 files, edited 2 files, used 5 tools" — verb-first summary. */
    protected formatTranscriptToolGroupLabel(stats: QaapTranscriptActivityStats): string {
        const parts: string[] = [];
        if (stats.shells > 0) {
            parts.push(stats.shells === 1
                ? nls.localize('qaap/mobileProjects/toolGroupOneCommand', 'Ran 1 command')
                : nls.localize('qaap/mobileProjects/toolGroupCommands', 'Ran {0} commands', String(stats.shells)));
        }
        if (stats.edits > 0) {
            parts.push(stats.edits === 1
                ? nls.localize('qaap/mobileProjects/toolGroupOneEdit', 'edited 1 file')
                : nls.localize('qaap/mobileProjects/toolGroupEdits', 'edited {0} files', String(stats.edits)));
        }
        if (stats.fileReads > 0) {
            parts.push(stats.fileReads === 1
                ? nls.localize('qaap/mobileProjects/toolGroupOneRead', 'read 1 file')
                : nls.localize('qaap/mobileProjects/toolGroupReads', 'read {0} files', String(stats.fileReads)));
        }
        if (stats.searches > 0) {
            parts.push(stats.searches === 1
                ? nls.localize('qaap/mobileProjects/toolGroupOneSearch', 'searched once')
                : nls.localize('qaap/mobileProjects/toolGroupSearches', 'searched {0} times', String(stats.searches)));
        }
        if (stats.otherTools > 0) {
            parts.push(stats.otherTools === 1
                ? nls.localize('qaap/mobileProjects/toolGroupOneTool', 'used 1 tool')
                : nls.localize('qaap/mobileProjects/toolGroupTools', 'used {0} tools', String(stats.otherTools)));
        }
        const joined = parts.join(', ');
        return joined.charAt(0).toUpperCase() + joined.slice(1);
    }

    /** Verb-first row label parts ("Ran" + command excerpt, "Read" + file name). */
    protected resolveToolRowParts(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        kind: string,
    ): ReturnType<typeof resolveTranscriptToolRowParts> {
        return resolveTranscriptToolRowParts(kind, segment.name, {
            path: this.resolversUi.extractTranscriptToolFullPath(segment.args),
            command: this.resolversUi.extractTranscriptToolCommand(segment.args),
        });
    }

    createTranscriptToolPill(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        conv?: QaapAgentConversationDTO,
    ): HTMLDetailsElement {
        const manualApproval = !!conv && conversationUsesInteractiveApprovals(conv);
        const descriptors = resolveTranscriptToolPillDescriptors([segment], {
            resolvePath: args => this.resolversUi.extractTranscriptToolFullPath(args),
        });
        const descriptor = descriptors[0];
        const kind = descriptor?.kind ?? this.resolversUi.resolveTranscriptToolKind(segment.name);
        const pill = document.createElement('details');
        pill.className = `theia-mobile-agent-tool-pill theia-mod-${kind}`;
        pill.setAttribute(TRANSCRIPT_TOOL_USE_ID_ATTR, segment.toolUseId);
        pill.classList.toggle('theia-mod-running', !(descriptor?.finished ?? segment.finished));
        pill.classList.toggle('theia-mod-done', descriptor?.finished ?? segment.finished);
        pill.classList.toggle('theia-mod-failed', descriptor?.resultFailed ?? false);
        pill.open = shouldOpenTranscriptToolDetails({
            finished: descriptor?.finished ?? segment.finished,
            resultFailed: descriptor?.resultFailed ?? false,
        });
        const todoChecklist = isTranscriptTodoTool(segment.name) && !!parseTranscriptTodoChecklist(segment.args);
        if (todoChecklist) {
            // The live task checklist stays visible, Claude-Code-style.
            pill.open = true;
        }
        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-tool-pill-summary';
        const icon = document.createElement('span');
        icon.className = `codicon ${this.toolUi.transcriptToolIconClass(kind)} theia-mobile-agent-tool-pill-icon`;
        icon.setAttribute('aria-hidden', 'true');
        const rowParts = this.resolveToolRowParts(segment, kind);
        const verb = document.createElement('span');
        verb.className = 'theia-mobile-agent-tool-pill-verb';
        verb.textContent = rowParts.verb;
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-tool-pill-label';
        label.textContent = rowParts.detail;
        summary.append(icon, verb, label);
        pill.append(summary);
        if (this.resolversUi.isTranscriptPureReadTool(segment.name)
            && !this.resolversUi.shouldShowTranscriptToolResultBody(segment, kind)) {
            return pill;
        }
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-tool-pill-body';
        if (manualApproval && isPendingTranscriptToolSegment(segment)) {
            body.append(this.createTranscriptToolApprovalActions(conv!.id, segment));
        }
        if (segment.result?.trim() || todoChecklist) {
            body.append(this.toolUi.createTranscriptToolResultBody(
                segment,
                kind,
                { streaming: !(descriptor?.finished ?? segment.finished) },
            ));
        } else if (!(descriptor?.finished ?? segment.finished)) {
            this.toolUi.ensureTranscriptToolSpeculativePlaceholder(body, segment);
        }
        pill.append(body);
        return pill;
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
            void approveAgentRequest(approvalId).then(() => this.host.transcriptLiveUi.ensureTranscriptConversationRefresh());
        });
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'theia-mobile-agent-tool-pill-approval-deny';
        reject.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalDeny', 'Deny');
        reject.addEventListener('click', event => {
            event.stopPropagation();
            void rejectAgentRequest(approvalId).then(() => this.host.transcriptLiveUi.ensureTranscriptConversationRefresh());
        });
        actions.append(approve, reject);
        wrap.append(title, actions);
        return wrap;
    }

    /** Claude-Code-style diff card for the latest edit: "Edited <file> +N −N" header + numbered lines. */
    createTranscriptInlineDiffStrip(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const editSegment = [...segments].reverse().find(segment =>
            segment.type === 'tool'
            && this.resolversUi.resolveTranscriptToolKind(segment.name) === 'editing'
            && !!segment.result?.trim(),
        );
        if (!editSegment || editSegment.type !== 'tool') {
            return undefined;
        }
        const card = extractTranscriptDiffCard(this.resolversUi.formatTranscriptToolResult(editSegment.result!));
        if (!card) {
            return undefined;
        }
        const path = this.resolversUi.extractTranscriptToolFullPath(editSegment.args);
        const fileName = path?.split('/').pop();

        const details = document.createElement('details');
        details.className = 'theia-mobile-agent-diff-card';
        details.open = true;

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-diff-card-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-diff-card-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-diff-card-label';
        label.textContent = fileName
            ? nls.localize('qaap/mobileProjects/diffCardEditedFile', 'Edited {0}', fileName)
            : nls.localize('qaap/mobileProjects/diffCardEdited', 'Edited a file');
        const stats = document.createElement('span');
        stats.className = 'theia-mobile-agent-diff-card-stats';
        const addedBadge = document.createElement('span');
        addedBadge.className = 'theia-mobile-agent-diff-card-added';
        addedBadge.textContent = `+${card.added}`;
        const removedBadge = document.createElement('span');
        removedBadge.className = 'theia-mobile-agent-diff-card-removed';
        removedBadge.textContent = `−${card.removed}`;
        stats.append(addedBadge, removedBadge);
        summary.append(chevron, label, stats);
        details.append(summary);

        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-diff-card-body';
        if (path) {
            const pathBar = document.createElement('div');
            pathBar.className = 'theia-mobile-agent-diff-card-path';
            pathBar.textContent = this.resolversUi.compactTranscriptPath(path);
            body.append(pathBar);
        }
        const lines = document.createElement('pre');
        lines.className = 'theia-mobile-agent-diff-card-lines';
        for (const line of card.lines) {
            const row = document.createElement('div');
            row.className = `theia-mobile-agent-diff-card-line theia-mod-${line.kind}`;
            const lineNo = document.createElement('span');
            lineNo.className = 'theia-mobile-agent-diff-card-lineno';
            lineNo.textContent = line.lineNumber !== undefined ? String(line.lineNumber) : '';
            const marker = document.createElement('span');
            marker.className = 'theia-mobile-agent-diff-card-marker';
            marker.textContent = line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ';
            const text = document.createElement('span');
            text.className = 'theia-mobile-agent-diff-card-text';
            text.textContent = line.text;
            row.append(lineNo, marker, text);
            lines.append(row);
        }
        body.append(lines);
        if (card.truncated) {
            const more = document.createElement('div');
            more.className = 'theia-mobile-agent-diff-card-more';
            more.textContent = nls.localize('qaap/mobileProjects/diffCardTruncated', '… more changes not shown');
            body.append(more);
        }
        details.append(body);
        return details;
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
        const items = this.resolversUi.resolveTranscriptActivityItems(segments, includeThinkingSteps);
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
        const stats = this.resolversUi.resolveTranscriptDiffStats(segments);
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
        const files = this.resolversUi.resolveTranscriptChangedFiles(segments);
        if (files.length === 0) {
            return undefined;
        }
        const stats = this.resolversUi.resolveTranscriptDiffStats(segments);

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
                this.host.executionSurfaceTabsUi.selectTranscriptTab('review', project, convSummary);
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
        const checks = this.resolversUi.resolveTranscriptVerificationChecks(segments);
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
            body.append(this.toolUi.createTranscriptSegmentDetails(segment));
        }
        details.append(body);
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
        const meta = this.createTranscriptStreamMeta(conv);
        if (meta) {
            line.append(meta);
        }
        row.append(line);
        return row;
    }

    /**
     * Claude-Code-style live status suffix: "· 1m 23s · ~4.2k tokens", ticking once per second.
     * With `ownerRow`, the meta removes itself once the row leaves streaming.
     */
    protected createTranscriptStreamMeta(conv: QaapAgentConversationDTO, ownerRow?: HTMLElement): HTMLElement | undefined {
        const turnStart = resolveTranscriptTurnStartMs(conv.messages);
        if (turnStart === undefined) {
            return undefined;
        }
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-agent-stream-meta';
        const update = (): void => {
            const parts = [formatTranscriptStreamElapsed(Date.now() - turnStart)];
            const tokens = formatTranscriptStreamTokens(resolveTranscriptTurnStreamChars(
                this.host.transcriptLastConv?.id === conv.id ? this.host.transcriptLastConv.messages : conv.messages,
            ));
            if (tokens) {
                parts.push(tokens);
            }
            meta.textContent = `· ${parts.join(' · ')}`;
        };
        update();
        const timer = window.setInterval(() => {
            if (!meta.isConnected) {
                window.clearInterval(timer);
                return;
            }
            if (ownerRow && !ownerRow.classList.contains('theia-mod-streaming')) {
                window.clearInterval(timer);
                (meta.closest('.theia-mobile-agent-stream-status') ?? meta).remove();
                return;
            }
            update();
        }, 1000);
        return meta;
    }

    resolveTranscriptStreamingActivity(conv: QaapAgentConversationDTO): { kind: string; title: string; detail: string } {
        const lastAgent = [...conv.messages].reverse().find(message => message.role === 'agent');
        const segments = lastAgent?.segments ?? [];
        const activeTool = [...segments].reverse().find((segment): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> =>
            segment.type === 'tool' && !segment.finished);
        if (activeTool) {
            const label = this.host.projectRowsUi.localizeActivityLabel(formatToolActivityLabel(activeTool.name, activeTool.args));
            return {
                kind: this.resolversUi.resolveTranscriptToolKind(activeTool.name),
                title: label,
                detail: this.resolversUi.resolveTranscriptToolDetail(activeTool),
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
}
