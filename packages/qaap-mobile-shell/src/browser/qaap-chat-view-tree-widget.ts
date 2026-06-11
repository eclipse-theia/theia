// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatModel, ChatRequestModel, type ChatChangeEvent } from '@theia/ai-chat';
import {
    ChatViewTreeWidget,
} from '@theia/ai-chat-ui/lib/browser/chat-tree-view/chat-view-tree-widget';
import { CompositeTreeNode } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';
import { injectable } from '@theia/core/shared/inversify';
import { QaapChatUiPerfCollector } from '../common/qaap-chat-ui-perf';
import { QaapChatViewStreamUpdateScheduler } from '../common/qaap-chat-view-stream-update-scheduler';
import {
    needsCoalescedTreePaintWithoutRecreate,
    shouldSkipChatModelTreeRecreate,
} from '../common/qaap-chat-view-tree-incremental';
import { resolveTranscriptStreamingCoalesceDelayMs } from '../common/qaap-transcript-streaming-coalesce';

/**
 * Chat tree with RAF-coalesced streaming updates, skipped tree recreation on content-only
 * model changes, and opt-in UI perf metrics. Replaces upstream {@link ChatViewTreeWidget}
 * via product-layer rebind.
 */
@injectable()
export class QaapChatViewTreeWidget extends ChatViewTreeWidget {

    protected paintScheduler: QaapChatViewStreamUpdateScheduler | undefined;
    protected paintSchedulerTurnId: string | undefined;
    protected liveResponseTurnId: string | undefined;

    public override trackChatModel(chatModel: ChatModel): void {
        this.toDisposeOnChatModelChange.dispose();
        this.recreateModelTree(chatModel);

        chatModel.getRequests().forEach(request => {
            this.trackLiveResponse(request);
        });
        this.toDisposeOnChatModelChange.pushAll([
            Disposable.create(() => {
                this.chatInputs.forEach(widget => widget.dispose());
                this.chatInputs.clear();
                this.disposePaintScheduler();
            }),
            chatModel.onDidChange(event => {
                if (event.kind === 'enableEdit') {
                    this.scrollToRow = this.rows.get(event.request.id)?.index;
                    this.update();
                    return;
                } else if (event.kind === 'cancelEdit') {
                    this.disposeChatInputWidget(event.request);
                    this.scrollToRow = undefined;
                    this.update();
                    return;
                } else if (event.kind === 'changeHierarchyBranch') {
                    this.scrollToRow = undefined;
                }

                const skipRecreate = this.shouldSkipChatModelTreeRecreate(chatModel, event);
                if (!skipRecreate) {
                    this.recreateModelTree(chatModel);
                } else if (needsCoalescedTreePaintWithoutRecreate(event)) {
                    this.scheduleCoalescedTreePaint();
                }

                if (event.kind === 'addRequest' && !event.request.response.isComplete) {
                    this.trackLiveResponse(event.request);
                } else if (event.kind === 'submitEdit') {
                    event.branch.succeedingBranches().forEach(branch => {
                        this.disposeChatInputWidget(branch.get());
                    });
                    this.onDidSubmitEditEmitter.fire(
                        event.newRequest,
                    );
                }
            }),
        ]);
    }

    protected override trackLiveResponse(request: ChatRequestModel): void {
        if (request.response.isComplete) {
            return;
        }
        this.disposeLiveResponseTracking();

        const turnId = request.id;
        this.liveResponseTurnId = turnId;
        this.paintSchedulerTurnId = turnId;
        QaapChatUiPerfCollector.get().beginTurn(turnId, this.chatModelId, 'chat-view');

        const disposable = request.response.onDidChange(() => {
            QaapChatUiPerfCollector.get().recordContentChange(turnId);
            this.scheduleCoalescedTreePaint(turnId);
            if (request.response.isComplete) {
                this.paintScheduler?.flushNow();
                QaapChatUiPerfCollector.get().finishTurn(turnId);
                this.disposeLiveResponseTracking();
                disposable.dispose();
            }
        });
        this.toDisposeOnChatModelChange.pushAll([
            Disposable.create(() => {
                this.paintScheduler?.flushNow();
                if (this.liveResponseTurnId === turnId) {
                    QaapChatUiPerfCollector.get().finishTurn(turnId);
                    this.disposeLiveResponseTracking();
                }
            }),
            disposable,
        ]);
    }

    protected shouldSkipChatModelTreeRecreate(chatModel: ChatModel, event: ChatChangeEvent): boolean {
        const childIds = CompositeTreeNode.is(this.model.root)
            ? this.model.root.children?.map(node => node.id)
            : undefined;
        const branches = chatModel.getBranches();
        const requestIds = branches.map(branch => branch.get().id);
        const responseIds = branches.map(branch => branch.get().response.id);
        return shouldSkipChatModelTreeRecreate(event, childIds, requestIds, responseIds);
    }

    protected scheduleCoalescedTreePaint(turnId?: string): void {
        if (turnId) {
            this.paintSchedulerTurnId = turnId;
        }
        if (!this.paintScheduler) {
            this.paintScheduler = new QaapChatViewStreamUpdateScheduler(
                () => this.flushCoalescedTreePaint(),
                () => resolveTranscriptStreamingCoalesceDelayMs(this.isLiveResponseNearBottom()),
            );
        }
        this.paintScheduler.schedule();
    }

    protected flushCoalescedTreePaint(): void {
        const turnId = this.paintSchedulerTurnId;
        if (turnId) {
            QaapChatUiPerfCollector.get().recordPaint(turnId);
        }
        this.scheduleUpdateScrollToRow();
        this.update();
    }

    protected isLiveResponseNearBottom(): boolean {
        return this.shouldScrollToEnd && this.atBottom;
    }

    protected disposeLiveResponseTracking(): void {
        this.liveResponseTurnId = undefined;
        this.paintSchedulerTurnId = undefined;
    }

    protected disposePaintScheduler(): void {
        this.paintScheduler?.dispose();
        this.paintScheduler = undefined;
        this.disposeLiveResponseTracking();
    }
}
