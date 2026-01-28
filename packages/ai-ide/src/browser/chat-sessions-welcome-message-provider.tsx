// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { formatTimeAgo } from '@theia/ai-chat-ui/lib/browser/chat-date-utils';
import { ChatService, ChatSessionMetadata } from '@theia/ai-chat';
import { PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { CommandRegistry, Emitter, Event, PreferenceService } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

/** Maximum number of session cards to show on the welcome screen */
const MAX_VISIBLE_SESSIONS = 5;

@injectable()
export class ChatSessionsWelcomeMessageProvider implements ChatWelcomeMessageProvider {

    readonly priority = 50;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected _sessions: ChatSessionMetadata[] = [];
    protected _loading = false;

    protected readonly onStateChangedEmitter = new Emitter<void>();
    readonly onStateChanged: Event<void> = this.onStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.loadSessions();
        this.chatService.onSessionEvent(() => this.loadSessions());
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PERSISTED_SESSION_LIMIT_PREF || e.preferenceName === SESSION_STORAGE_PREF) {
                this.loadSessions();
            }
        });
    }

    protected async loadSessions(): Promise<void> {
        if (!this.isPersistenceEnabled()) {
            this._sessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        // Check if there are any persisted sessions without initializing storage
        const hasSessions = await this.chatService.hasPersistedSessions();
        if (!hasSessions) {
            this._sessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        this._loading = true;
        this.onStateChangedEmitter.fire();

        try {
            const index = await this.chatService.getPersistedSessions();
            this._sessions = Object.values(index)
                .sort((a, b) => b.saveDate - a.saveDate);
        } catch (error) {
            console.error('Failed to load persisted sessions:', error);
            this._sessions = [];
        } finally {
            this._loading = false;
            this.onStateChangedEmitter.fire();
        }
    }

    protected isPersistenceEnabled(): boolean {
        const limit = this.preferenceService.get<number>(PERSISTED_SESSION_LIMIT_PREF, 25);
        return limit !== 0;
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this.isPersistenceEnabled() || this._sessions.length === 0) {
            return undefined;
        }
        return this.renderSessionsSection();
    }

    protected renderSessionsSection(): React.ReactNode {
        const visibleSessions = this._sessions.slice(0, MAX_VISIBLE_SESSIONS);
        const hasMoreSessions = this._sessions.length > MAX_VISIBLE_SESSIONS;

        return (
            <div className="theia-WelcomeMessage" key="sessions-section">
                <div className="theia-WelcomeMessage-SessionsSection">
                    <h2>
                        {nls.localize('theia/ai/ide/recentChats', 'Recent Chats')}
                    </h2>
                    <div className="theia-WelcomeMessage-SessionCards">
                        {visibleSessions.map(session => this.renderSessionCard(session))}
                    </div>
                    {(hasMoreSessions || this._sessions.length > 0) && (
                        <div className="theia-WelcomeMessage-BrowseAllLink">
                            <a onClick={this.handleBrowseAllChats}>
                                {nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...')}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected renderSessionCard(session: ChatSessionMetadata): React.ReactNode {
        const timeAgo = formatTimeAgo(session.saveDate);
        const title = session.title || nls.localizeByDefault('Untitled Chat');

        return (
            <div
                key={session.sessionId}
                className="theia-WelcomeMessage-SessionCard"
                onClick={() => this.handleSessionCardClick(session.sessionId)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.handleSessionCardClick(session.sessionId);
                    }
                }}
            >
                <div className={`theia-WelcomeMessage-SessionCard-Icon ${codicon('comment-discussion')}`}></div>
                <div className="theia-WelcomeMessage-SessionCard-Content">
                    <div className="theia-WelcomeMessage-SessionCard-Title" title={title}>
                        {title}
                    </div>
                    <div className="theia-WelcomeMessage-SessionCard-Time">
                        {timeAgo}
                    </div>
                </div>
            </div>
        );
    }

    protected handleSessionCardClick = async (sessionId: string): Promise<void> => {
        await this.chatService.getOrRestoreSession(sessionId);
        this.chatService.setActiveSession(sessionId, { focus: true });
    };

    protected handleBrowseAllChats = (): void => {
        this.commandRegistry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
    };
}
