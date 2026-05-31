// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatAgentLocation, ChatAgentService, ChatService, type ChatSession } from '@theia/ai-chat';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { ApplicationShell, codicon, Message, ReactWidget, WidgetManager } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

/**
 * Desktop Work Hub parity — local Theia chat sessions for the active workspace.
 * VPS agent work lives in {@link QaapAgentTasksWidget}; this surface is Chat-only.
 */
@injectable()
export class QaapAgentChatWidget extends ReactWidget {

    static readonly ID = 'qaap-agent-chat';
    static readonly LABEL = nls.localize('qaap/agentChat/label', 'Chat');

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected streamDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = QaapAgentChatWidget.ID;
        this.title.label = QaapAgentChatWidget.LABEL;
        this.title.caption = QaapAgentChatWidget.LABEL;
        this.title.iconClass = codicon('comment-discussion');
        this.title.closable = true;
        this.addClass('qaap-agent-chat');
    }

    protected override onAfterAttach(message: Message): void {
        super.onAfterAttach(message);
        this.streamDispose.dispose();
        this.streamDispose = new DisposableCollection();
        this.streamDispose.push(this.chatService.onSessionEvent(() => this.update()));
        this.update();
    }

    protected override onBeforeDetach(message: Message): void {
        this.streamDispose.dispose();
        super.onBeforeDetach(message);
    }

    protected render(): React.ReactNode {
        const sessions = this.sortedSessions();
        return (
            <div className='qaap-agent-chat-body'>
                <div className='qaap-agent-chat-head'>
                    <p className='qaap-agent-chat-subtitle'>
                        {nls.localize(
                            'qaap/agentChat/subtitle',
                            'Local workspace chat — persists on this device.',
                        )}
                    </p>
                    <button
                        type='button'
                        className='qaap-agent-chat-new'
                        onClick={this.onNewChat}
                    >
                        {nls.localize('qaap/agentChat/new', 'New chat')}
                    </button>
                </div>
                <div className='qaap-agent-chat-list'>
                    {sessions.length === 0
                        ? <div className='qaap-agent-chat-empty'>
                            {nls.localize(
                                'qaap/agentChat/empty',
                                'No chat sessions yet. Start one above or from the Agent view.',
                            )}
                        </div>
                        : sessions.map(session => this.renderSession(session))}
                </div>
            </div>
        );
    }

    protected sortedSessions(): ChatSession[] {
        return [...this.chatService.getSessions()].sort(
            (a, b) => (b.lastInteraction?.getTime() ?? 0) - (a.lastInteraction?.getTime() ?? 0),
        );
    }

    protected renderSession(session: ChatSession): React.ReactNode {
        const title = session.title?.trim()
            || nls.localize('qaap/agentChat/untitled', 'Untitled chat');
        const active = this.chatService.getActiveSession()?.id === session.id;
        return (
            <button
                key={session.id}
                type='button'
                className={`qaap-agent-chat-row${active ? ' qaap-mod-active' : ''}`}
                onClick={() => void this.openSession(session.id)}
            >
                <i className={`${codicon('comment')} qaap-agent-chat-row-icon`} aria-hidden='true' />
                <span className='qaap-agent-chat-row-title'>{title}</span>
                {session.lastInteraction && (
                    <span className='qaap-agent-chat-row-since'>
                        {this.formatSince(session.lastInteraction)}
                    </span>
                )}
            </button>
        );
    }

    protected formatSince(date: Date): string {
        const delta = Date.now() - date.getTime();
        const minutes = Math.floor(delta / 60_000);
        if (minutes < 1) {
            return nls.localize('qaap/agentChat/justNow', 'Just now');
        }
        if (minutes < 60) {
            return nls.localize('qaap/agentChat/minutesAgo', '{0}m ago', String(minutes));
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return nls.localize('qaap/agentChat/hoursAgo', '{0}h ago', String(hours));
        }
        const days = Math.floor(hours / 24);
        return nls.localize('qaap/agentChat/daysAgo', '{0}d ago', String(days));
    }

    protected readonly onNewChat = (): void => {
        const coder = this.chatAgentService.getAgent('Coder');
        const session = this.chatService.createSession(ChatAgentLocation.Panel, undefined, coder);
        void this.openSession(session.id);
    };

    protected async openSession(sessionId: string): Promise<void> {
        this.chatService.setActiveSession(sessionId, { focus: true });
        const widget = await this.widgetManager.getOrCreateWidget(ChatViewWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
