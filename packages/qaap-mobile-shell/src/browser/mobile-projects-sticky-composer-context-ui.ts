// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatAgent } from '@theia/ai-chat';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import {
    buildStickyComposerMentionOptions,
    buildStickyComposerVariableOptions,
    type StickyComposerTokenOption,
} from '../common/qaap-sticky-composer-mention';
import {
    resolveStickyComposerContextChip,
    resolveStickyComposerContextEntry,
    type StickyComposerContextChipView,
} from './qaap-sticky-composer-context-ui';
import {
    createComposerContextEntry,
    hasPendingComposerContextEntries,
    revokeComposerContextPreview,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import { type QaapAgentTaskAgentOption } from '../common/qaap-agent-task-client';
import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
import type { MobileProjectEntry } from './mobile-projects-types';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsStickyComposerContextHost {
stickyComposerContext: StickyComposerContextEntry[];
transcriptComposerContext: StickyComposerContextEntry[];
pickContextVariable?: (anchor: HTMLElement, handlers: MobileComposerAttachHandlers) => Promise<AIVariableResolutionRequest[]>;
formatContextChip?: (item: AIVariableResolutionRequest) => StickyComposerContextChipView | undefined;
            getComposerVariables?: () => readonly import('@theia/ai-core').AIVariable[];
renderStickyComposer(): void;
remountTranscriptStickyComposer(): void;
getOfferableCoderAgent(): ChatAgent | undefined;
}

export class MobileProjectsStickyComposerContextUi {
    constructor(protected readonly host: MobileProjectsStickyComposerContextHost) { }

    async onStickyComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.host.pickContextVariable) {
            return;
        }
        const variables = await this.host.pickContextVariable(anchor, this.createStickyComposerAttachHandlers());
        if (variables.length === 0) {
            return;
        }
        for (const request of variables) {
            this.host.stickyComposerContext.push(createComposerContextEntry(request));
        }
        this.host.renderStickyComposer();
    }
    createStickyComposerAttachHandlers(): MobileComposerAttachHandlers {
        return {
            appendOptimistic: entry => {
                this.host.stickyComposerContext.push(entry);
                this.host.renderStickyComposer();
            },
            finalizeOptimistic: (id, request) => {
                const entry = this.host.stickyComposerContext.find(item => item.id === id);
                if (!entry) {
                    return;
                }
                revokeComposerContextPreview(entry);
                entry.request = request;
                entry.pending = false;
                entry.localPreviewSrc = undefined;
                entry.displayName = undefined;
                this.host.renderStickyComposer();
            },
            removeOptimistic: id => {
                const index = this.host.stickyComposerContext.findIndex(item => item.id === id);
                if (index < 0) {
                    return;
                }
                revokeComposerContextPreview(this.host.stickyComposerContext[index]);
                this.host.stickyComposerContext.splice(index, 1);
                this.host.renderStickyComposer();
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/stickyComposerAttachDeviceFailed',
                        'Could not attach files from this device.',
                    ),
                    { kind: 'warning', duration: 2800 },
                );
            },
        };
    }
    createTranscriptComposerAttachHandlers(): MobileComposerAttachHandlers {
        return {
            appendOptimistic: entry => {
                this.host.transcriptComposerContext.push(entry);
                this.host.remountTranscriptStickyComposer();
            },
            finalizeOptimistic: (id, request) => {
                const entry = this.host.transcriptComposerContext.find(item => item.id === id);
                if (!entry) {
                    return;
                }
                revokeComposerContextPreview(entry);
                entry.request = request;
                entry.pending = false;
                entry.localPreviewSrc = undefined;
                entry.displayName = undefined;
                this.host.remountTranscriptStickyComposer();
            },
            removeOptimistic: id => {
                const index = this.host.transcriptComposerContext.findIndex(item => item.id === id);
                if (index < 0) {
                    return;
                }
                revokeComposerContextPreview(this.host.transcriptComposerContext[index]);
                this.host.transcriptComposerContext.splice(index, 1);
                this.host.remountTranscriptStickyComposer();
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/stickyComposerAttachDeviceFailed',
                        'Could not attach files from this device.',
                    ),
                    { kind: 'warning', duration: 2800 },
                );
            },
        };
    }
    hasPendingComposerAttachments(): boolean {
        return hasPendingComposerContextEntries(this.host.stickyComposerContext)
            || hasPendingComposerContextEntries(this.host.transcriptComposerContext);
    }
    notifyPendingComposerAttachments(): void {
        MobileSnackbar.show(
            nls.localize(
                'qaap/mobileProjects/stickyComposerAttachmentsPending',
                'Wait for attachments to finish preparing before sending.',
            ),
            { kind: 'warning', duration: 2600 },
        );
    }
    formatComposerContextEntry(entry: StickyComposerContextEntry): StickyComposerContextChipView {
        const fromProvider = this.host.formatContextChip?.(entry.request);
        const base = fromProvider ?? resolveStickyComposerContextEntry(entry);
        return base;
    }
    formatComposerContextChip(item: AIVariableResolutionRequest): StickyComposerContextChipView {
        return this.host.formatContextChip?.(item) ?? resolveStickyComposerContextChip(item);
    }
    resolveComposerMentionOptions(
        backendAgents: readonly QaapAgentTaskAgentOption[],
        coderOnly = false,
    ): StickyComposerTokenOption[] {
        const coder = this.host.getOfferableCoderAgent();
        return buildStickyComposerMentionOptions(
            coderOnly ? [] : backendAgents,
            coder ? { name: coder.name } : undefined,
        );
    }
    resolveComposerVariableOptions(): StickyComposerTokenOption[] {
        return buildStickyComposerVariableOptions(this.host.getComposerVariables?.() ?? []);
    }
}

