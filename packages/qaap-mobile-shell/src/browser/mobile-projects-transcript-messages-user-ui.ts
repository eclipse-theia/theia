// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { conversationToSummary, rewindConversationToMessage, type QaapAgentConversationDTO, type QaapAgentMessageDTO } from '../common/qaap-agent-conversation-client';
import { normalizeAgentMessageContentForDisplay } from '../common/qaap-agent-message-content';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsTranscriptMessagesContentUi } from './mobile-projects-transcript-messages-content-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptMessagesToolUi } from './mobile-projects-transcript-messages-tool-ui';

export class MobileProjectsTranscriptMessagesUserUi {
    constructor(
        protected readonly host: MobileProjectsTranscriptMessagesHost,
        protected readonly contentUi: MobileProjectsTranscriptMessagesContentUi,
        protected readonly toolUi: MobileProjectsTranscriptMessagesToolUi,
        protected readonly renderMessages: (host: HTMLElement, conv: QaapAgentConversationDTO) => void,
    ) { }

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
        this.toolUi.renderTranscriptRichContent(contentEl, displayContent);
        row.append(contentEl);
        if (msg.error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = msg.error;
            row.append(err);
        }
        wrap.append(row);

        const plainText = this.contentUi.cleanTranscriptDisplayText(displayContent).trim();
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
        const plainText = this.contentUi.cleanTranscriptDisplayText(normalizeAgentMessageContentForDisplay(msg.content)).trim();
        if (!plainText) {
            return;
        }
        if (summary.source === 'theia-chat') {
            this.host.transcriptComposerDraft = plainText;
            this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
            return;
        }
        try {
            const updated = await rewindConversationToMessage(conv.id, msg.id);
            this.host.conversations?.recordSnapshot(conversationToSummary(updated));
            this.host.transcriptLastFingerprint = undefined;
            if (this.host.transcriptChatHost) {
                this.renderMessages(this.host.transcriptChatHost, updated);
            }
            this.host.transcriptComposerDraft = plainText;
            this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
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
                this.renderMessages(this.host.transcriptChatHost, updated);
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
}
