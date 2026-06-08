// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import type { QaapAgentConversationDTO } from '../common/qaap-agent-conversation-client';
import {
    TRANSCRIPT_VIRTUAL_MIN_MESSAGES,
    TranscriptVirtualList,
} from './qaap-transcript-virtual-list';

export { TRANSCRIPT_VIRTUAL_MIN_MESSAGES };

/**
 * Owns the windowed transcript list for long threads. Rendering callbacks stay on the panel
 * so message rows can access composer/context state without a wide deps surface.
 */
export class MobileProjectsTranscriptUi implements Disposable {

    protected list: TranscriptVirtualList | undefined;
    protected listConvId: string | undefined;

    shouldVirtualize(conv: QaapAgentConversationDTO): boolean {
        const isEmptyChat = conv.messages.length === 0 && conv.status !== 'streaming';
        return !isEmptyChat && conv.messages.length >= TRANSCRIPT_VIRTUAL_MIN_MESSAGES;
    }

    get activeList(): TranscriptVirtualList | undefined {
        return this.list;
    }

    get activeConversationId(): string | undefined {
        return this.listConvId;
    }

    mount(
        scrollHost: HTMLElement,
        conv: QaapAgentConversationDTO,
        renderItem: (index: number) => HTMLElement,
    ): TranscriptVirtualList {
        if (!this.list || this.listConvId !== conv.id) {
            this.disposeList();
            this.listConvId = conv.id;
            this.list = new TranscriptVirtualList({ scrollHost, renderItem });
        }
        return this.list;
    }

    disposeList(): void {
        this.list?.dispose();
        this.list = undefined;
        this.listConvId = undefined;
    }

    dispose(): void {
        this.disposeList();
    }
}
