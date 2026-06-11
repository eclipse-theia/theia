// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { formatReadToolDetailFromArgs } from '../common/qaap-agent-conversation-list-metrics';
import { shouldOpenTranscriptToolDetails as shouldOpenTranscriptToolDetailsSegment } from '../common/qaap-agent-transcript-segments';
import { isTranscriptErrorOutput, isTranscriptTerminalOutputText } from '../common/qaap-transcript-content-display';
import { createTranscriptCodeView, resolveTranscriptCodeLanguage } from './qaap-transcript-code-view';
import {
    registerDeferredTranscriptMarkdown,
    registerDeferredTranscriptToolBody,
    type TranscriptDeferredToolBodyHydrate,
} from './qaap-transcript-row-defer';
import type { QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import type { MobileProjectsTranscriptMessagesResolversUi } from './mobile-projects-transcript-messages-resolvers-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';

/** Lightweight stdout/stderr host inside a streaming tool pill (no syntax highlight per tick). */
export const TRANSCRIPT_TOOL_RESULT_STREAM_CLASS = 'theia-mobile-agent-tool-result-stream';

export class MobileProjectsTranscriptMessagesToolUi {
    constructor(
        protected readonly host: MobileProjectsTranscriptMessagesHost,
        protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi,
        protected readonly resolversUi: MobileProjectsTranscriptMessagesResolversUi,
    ) { }

    renderTranscriptRichContent(
        host: HTMLElement,
        content: string,
        options?: { readonly streaming?: boolean; readonly defer?: boolean; readonly sync?: boolean },
    ): void {
        const clean = this.contentUi.cleanTranscriptDisplayText(content).trim();
        if (isTranscriptTerminalOutputText(clean)) {
            if (options?.defer) {
                host.classList.add('theia-mod-deferred-terminal');
                host.textContent = clean.split('\n').slice(0, 3).join('\n');
                return;
            }
            host.replaceChildren(this.createTranscriptTextTerminalWindow(clean));
            return;
        }
        host.classList.add('theia-mod-markdown');
        if (options?.sync) {
            if (options.defer) {
                host.classList.add('theia-mod-deferred-markdown');
                const excerpt = clean.length > 180 ? `${clean.slice(0, 180).trimEnd()}…` : clean;
                host.textContent = excerpt;
                registerDeferredTranscriptMarkdown({ host, content: clean, streaming: options.streaming });
                return;
            }
            this.contentUi.renderTranscriptMarkdownImmediate(host, clean);
            return;
        }
        if (options?.streaming) {
            this.contentUi.renderTranscriptStreamingMarkdown(host, clean, { defer: options?.defer });
            return;
        }
        this.contentUi.renderTranscriptMarkdown(host, clean, { defer: options?.defer });
    }

    createTranscriptTextTerminalWindow(content: string): HTMLElement {
        const details = document.createElement('details');
        const failed = isTranscriptErrorOutput(content);
        details.className = `theia-mobile-agent-shell-window ${failed ? 'theia-mod-failed' : 'theia-mod-done'} theia-mod-text-output`;
        details.open = shouldOpenTranscriptToolDetailsSegment({ finished: true, resultFailed: failed });
        const cleanContent = this.contentUi.cleanTranscriptDisplayText(content);
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

    createTranscriptSegmentDetails(
        segment: QaapAgentMessageSegmentDTO,
        options?: { readonly defer?: boolean },
    ): HTMLElement {
        if (segment.type === 'thinking') {
            const details = document.createElement('details');
            details.className = 'theia-mobile-agent-transcript-details theia-mod-thinking';
            details.open = false;
            const summary = document.createElement('summary');
            summary.textContent = nls.localize('qaap/mobileProjects/transcriptThinking', 'Thinking');
            const pre = document.createElement('pre');
            pre.textContent = this.contentUi.cleanTranscriptDisplayText(segment.content);
            details.append(summary, pre);
            return details;
        }
        if (segment.type === 'tool') {
            if (this.resolversUi.isTranscriptShellTool(segment.name)) {
                return this.createTranscriptShellDetails(segment);
            }
            return this.createTranscriptToolWindow(segment, options);
        }
        const block = document.createElement('div');
        block.className = 'theia-mobile-agent-transcript-content';
        this.renderTranscriptRichContent(block, segment.content ?? '', { defer: options?.defer });
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
        const fullPath = this.resolversUi.extractTranscriptToolFullPath(segment.args);
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
            ?? (fullPath ? this.resolversUi.splitTranscriptFilePath(fullPath).fileName : '');
        line.append(verb, detail);
        if (fullPath) {
            this.attachTranscriptFileOpenAction(line, fullPath);
        }
        return line;
    }

    createTranscriptToolWindow(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        options?: { readonly defer?: boolean },
    ): HTMLElement {
        const kind = this.resolversUi.resolveTranscriptToolKind(segment.name);
        const fullPath = this.resolversUi.extractTranscriptToolFullPath(segment.args);
        const target = fullPath ? this.resolversUi.compactTranscriptPath(fullPath)
            : this.resolversUi.extractTranscriptToolShortArg(segment.args);
        const hasResult = !!segment.result?.trim();
        const showResultBody = this.resolversUi.shouldShowTranscriptToolResultBody(segment, kind);
        const pureRead = this.resolversUi.isTranscriptPureReadTool(segment.name);

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
        const shouldOpen = this.resolversUi.shouldOpenTranscriptToolDetails(segment);
        details.open = shouldOpen;
        details.classList.add(segment.finished ? 'theia-mod-done' : 'theia-mod-running');
        details.append(head);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-tool-body';
        const deferBody = !!options?.defer && showResultBody && !shouldOpen;
        if (deferBody) {
            body.classList.add('theia-mod-deferred-tool-body');
            const hydrate: TranscriptDeferredToolBodyHydrate = {
                body,
                segment,
                kind,
            };
            registerDeferredTranscriptToolBody(hydrate);
        } else {
            body.append(this.createTranscriptToolResultBody(segment, kind));
        }
        details.append(body);
        return details;
    }

    createTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        _kind: string,
        options?: { readonly streaming?: boolean },
    ): HTMLElement {
        const text = this.resolversUi.formatTranscriptToolResult(segment.result!);
        if (options?.streaming && !segment.finished) {
            return this.createTranscriptToolResultStreamBody(text);
        }
        const fullPath = this.resolversUi.extractTranscriptToolFullPath(segment.args);
        const language = resolveTranscriptCodeLanguage(fullPath, text);
        const view = createTranscriptCodeView(text, language);
        return this.createTranscriptClampedBlock(view, text.split('\n').length);
    }

    createTranscriptToolResultStreamBody(text: string): HTMLElement {
        const pre = document.createElement('pre');
        pre.className = TRANSCRIPT_TOOL_RESULT_STREAM_CLASS;
        pre.textContent = text;
        return pre;
    }

    /** Patch a running tool's stdout in place — skips code-view rebuild while output grows. */
    patchTranscriptToolResultStreamBody(
        pillBody: HTMLElement,
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
    ): boolean {
        const streamHost = pillBody.querySelector<HTMLElement>(`.${TRANSCRIPT_TOOL_RESULT_STREAM_CLASS}`);
        if (!streamHost) {
            return false;
        }
        streamHost.textContent = this.resolversUi.formatTranscriptToolResult(segment.result!);
        return true;
    }

    canPatchTranscriptToolResultStream(
        previous: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        next: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
    ): boolean {
        if (next.finished || previous.finished) {
            return false;
        }
        if (previous.toolUseId !== next.toolUseId || previous.name !== next.name) {
            return false;
        }
        const previousArgs = previous.args ?? '';
        const incomingArgs = next.args ?? '';
        if (incomingArgs !== previousArgs) {
            return false;
        }
        const previousResult = previous.result ?? '';
        const incomingResult = next.result ?? '';
        return incomingResult === previousResult
            || (incomingResult.startsWith(previousResult) && incomingResult.length >= previousResult.length);
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
            const { fileName, dirPath } = this.resolversUi.splitTranscriptFilePath(options.fullPath);
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
            const lineCount = this.resolversUi.countTranscriptResultLines(options.result);
            if (lineCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'theia-mobile-agent-tool-badge';
                badge.textContent = lineCount === 1
                    ? nls.localize('qaap/mobileProjects/transcriptToolLineCountOne', '1 line')
                    : nls.localize('qaap/mobileProjects/transcriptToolLineCount', '{0} lines', String(lineCount));
                head.append(badge);
            }
        } else if (options.hasResult && options.kind === 'searching' && options.result) {
            const matchLines = this.resolversUi.countTranscriptResultLines(options.result);
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
        const failed = this.resolversUi.transcriptToolResultFailed(segment.result);
        details.open = this.resolversUi.shouldOpenTranscriptToolDetails(segment);
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
        const command = this.resolversUi.extractTranscriptToolCommand(segment.args)
            ?? this.contentUi.cleanTranscriptDisplayText(segment.args);
        label.textContent = command && command !== '{}'
            ? this.resolversUi.compactTranscriptCommand(command)
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
                this.resolversUi.formatTranscriptToolResult(segment.result),
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
}
