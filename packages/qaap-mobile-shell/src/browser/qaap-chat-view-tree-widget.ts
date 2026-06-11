// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatRequestModel } from '@theia/ai-chat';
import { ChatViewTreeWidget } from '@theia/ai-chat-ui/lib/browser/chat-tree-view/chat-view-tree-widget';
import { Disposable } from '@theia/core/lib/common/disposable';
import { injectable } from '@theia/core/shared/inversify';
import { QaapChatUiPerfCollector } from '../common/qaap-chat-ui-perf';
import { QaapChatViewStreamUpdateScheduler } from '../common/qaap-chat-view-stream-update-scheduler';
import { resolveTranscriptStreamingCoalesceDelayMs } from '../common/qaap-transcript-streaming-coalesce';

/**
 * Chat tree with RAF-coalesced streaming updates and opt-in UI perf metrics.
 * Replaces upstream {@link ChatViewTreeWidget} via product-layer rebind.
 */
@injectable()
export class QaapChatViewTreeWidget extends ChatViewTreeWidget {

    protected liveResponseScheduler: QaapChatViewStreamUpdateScheduler | undefined;
    protected liveResponseTurnId: string | undefined;

    protected override trackLiveResponse(request: ChatRequestModel): void {
        if (request.response.isComplete) {
            return;
        }
        this.disposeLiveResponseScheduler();

        const turnId = request.id;
        this.liveResponseTurnId = turnId;
        QaapChatUiPerfCollector.get().beginTurn(turnId, this.chatModelId, 'chat-view');

        this.liveResponseScheduler = new QaapChatViewStreamUpdateScheduler(
            () => this.flushCoalescedLiveResponseUpdate(turnId),
            () => resolveTranscriptStreamingCoalesceDelayMs(this.isLiveResponseNearBottom()),
        );

        const disposable = request.response.onDidChange(() => {
            QaapChatUiPerfCollector.get().recordContentChange(turnId);
            this.liveResponseScheduler?.schedule();
            if (request.response.isComplete) {
                this.liveResponseScheduler?.flushNow();
                QaapChatUiPerfCollector.get().finishTurn(turnId);
                this.disposeLiveResponseScheduler();
                disposable.dispose();
            }
        });
        this.toDisposeOnChatModelChange.pushAll([
            Disposable.create(() => {
                this.liveResponseScheduler?.flushNow();
                if (this.liveResponseTurnId === turnId) {
                    QaapChatUiPerfCollector.get().finishTurn(turnId);
                    this.disposeLiveResponseScheduler();
                }
            }),
            disposable,
        ]);
    }

    protected flushCoalescedLiveResponseUpdate(turnId: string): void {
        QaapChatUiPerfCollector.get().recordPaint(turnId);
        this.scheduleUpdateScrollToRow();
        this.update();
    }

    protected isLiveResponseNearBottom(): boolean {
        return this.shouldScrollToEnd && this.atBottom;
    }

    protected disposeLiveResponseScheduler(): void {
        this.liveResponseScheduler?.dispose();
        this.liveResponseScheduler = undefined;
        this.liveResponseTurnId = undefined;
    }
}
