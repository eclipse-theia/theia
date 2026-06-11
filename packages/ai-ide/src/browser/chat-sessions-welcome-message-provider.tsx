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
import {
    ChatAgentService, ChatService, ChatSession, ChatSessionMetadata
} from '@theia/ai-chat';
import { BYPASS_MODEL_REQUIREMENT_PREF, PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF, WELCOME_SCREEN_SESSIONS_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionRow } from './chat-session-row';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { CommandRegistry, ContributionProvider, DisposableCollection, Emitter, Event, PreferenceService } from '@theia/core';
import { ApplicationShell, buttonKeyboardProps, HoverService, isActivationKey } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

/** When both Active and Restored sections are non-empty, keep at least this many Restored slots. */
const RESTORED_MIN_RESERVATION = 5;

interface SectionedSessions {
    active: ChatSessionMetadata[];
    recent: ChatSessionMetadata[];
}

interface SessionsListProps {
    sections: SectionedSessions;
    /** Total cap on rows shown on the home view; overflow surfaces via the Browse all link. */
    maxSessions: number;
    renderRow: (session: ChatSessionMetadata, isRestored: boolean) => React.ReactNode;
    onBrowseAll: () => void;
}

function SessionsList({ sections, maxSessions, renderRow, onBrowseAll }: SessionsListProps): React.ReactElement {
    const cap = Math.max(1, maxSessions);
    const maxActive = sections.active.length;
    const maxRestored = sections.recent.length;
    const total = maxActive + maxRestored;

    let activeCount: number;
    let restoredCount: number;
    if (maxRestored === 0) {
        activeCount = Math.min(maxActive, cap);
        restoredCount = 0;
    } else if (maxActive === 0) {
        activeCount = 0;
        restoredCount = Math.min(maxRestored, cap);
    } else {
        const reserved = Math.min(maxRestored, Math.min(RESTORED_MIN_RESERVATION, Math.max(1, cap - 1)));
        activeCount = Math.min(maxActive, cap - reserved);
        restoredCount = Math.min(maxRestored, cap - activeCount);
    }
    const activeVisible = sections.active.slice(0, activeCount);
    const restoredVisible = sections.recent.slice(0, restoredCount);
    const hiddenCount = total - activeVisible.length - restoredVisible.length;

    return (
        <div className="theia-WelcomeMessage-SessionsList">
            {activeVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localizeByDefault('Active')}
                    </div>
                    {activeVisible.map(s => renderRow(s, false))}
                </div>
            )}
            {restoredVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localize('theia/ai/ide/sectionRestored', 'Restored')}
                    </div>
                    {restoredVisible.map(s => renderRow(s, true))}
                </div>
            )}
            {hiddenCount > 0 && (
                <div className="theia-WelcomeMessage-SessionsFooter">
                    <a className="theia-WelcomeMessage-FooterLink"
                        {...buttonKeyboardProps(nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...'))}
                        onClick={onBrowseAll}
                        onKeyDown={e => {
                            if (isActivationKey(e)) {
                                e.preventDefault();
                                onBrowseAll();
                            }
                        }}>
                        {nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...')}
                    </a>
                </div>
            )}
        </div>
    );
}

@injectable()
export class ChatSessionsWelcomeMessageProvider implements ChatWelcomeMessageProvider {

    readonly priority = 50;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MarkdownRendererFactory)
    protected readonly markdownRendererFactory: MarkdownRendererFactory;

    @inject(ContributionProvider) @named(ChatSessionItemActionContribution)
    protected readonly chatSessionItemActionContributions: ContributionProvider<ChatSessionItemActionContribution>;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected _inputEnabled = false;

    private readonly unreadSessions = new Map<string, { unread: boolean; seenRequests: number; seenCompleted: number; listener: DisposableCollection }>();
    private readonly onUnreadChangedEmitter = new Emitter<string>();
    readonly onUnreadChanged: Event<string> = this.onUnreadChangedEmitter.event;

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        if (!this._markdownRenderer) {
            this._markdownRenderer = this.markdownRendererFactory();
        }
        return this._markdownRenderer;
    }

    /** Persisted sessions index sorted newest first. May include duplicates of active sessions. */
    protected _persistedSessions: ChatSessionMetadata[] = [];

    protected readonly onStateChangedEmitter = new Emitter<void>();
    readonly onStateChanged: Event<void> = this.onStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        for (const session of this.chatService.getSessions()) {
            this.watchSession(session);
        }

        this.chatService.onSessionEvent(event => {
            if (event.type === 'created') {
                const s = this.chatService.getSession(event.sessionId);
                if (s) {
                    this.watchSession(s);
                }
            } else if (event.type === 'activeChange' && event.sessionId) {
                this.markSessionRead(event.sessionId);
            } else if (event.type === 'deleted') {
                this.unwatchSession(event.sessionId);
            }
            this.loadSessions();
            this.onStateChangedEmitter.fire();
        });

        this.loadSessions();
        this.updateInputEnabled();
        this.languageModelRegistry.onChange(() => {
            this.updateInputEnabled();
        });
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PERSISTED_SESSION_LIMIT_PREF || e.preferenceName === SESSION_STORAGE_PREF) {
                this.loadSessions();
            } else if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                this.updateInputEnabled();
            } else if (e.preferenceName === WELCOME_SCREEN_SESSIONS_PREF) {
                this.onStateChangedEmitter.fire();
            }
        });
    }

    protected async updateInputEnabled(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        const hasReadyModels = models.some(model => model.status.status === 'ready');
        const bypassed = this.preferenceService.get<boolean>(BYPASS_MODEL_REQUIREMENT_PREF, false);
        const enabled = hasReadyModels || bypassed;
        if (this._inputEnabled !== enabled) {
            this._inputEnabled = enabled;
            this.onStateChangedEmitter.fire();
        }
    }

    protected async loadSessions(): Promise<void> {
        if (!this.isPersistenceEnabled()) {
            this._persistedSessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        const hasSessions = await this.chatService.hasPersistedSessions();
        if (!hasSessions) {
            this._persistedSessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        this.onStateChangedEmitter.fire();

        try {
            const index = await this.chatService.getPersistedSessions();
            this._persistedSessions = Object.values(index)
                .toSorted((a, b) => b.saveDate - a.saveDate);
        } catch (error) {
            console.error('Failed to load persisted sessions:', error);
            this._persistedSessions = [];
        } finally {
            this.onStateChangedEmitter.fire();
        }
    }

    protected isPersistenceEnabled(): boolean {
        const limit = this.preferenceService.get<number>(PERSISTED_SESSION_LIMIT_PREF, 25);
        return limit !== 0;
    }

    isUnread(sessionId: string): boolean {
        return this.unreadSessions.get(sessionId)?.unread === true;
    }

    protected watchSession(session: ChatSession): void {
        if (this.unreadSessions.has(session.id)) {
            return;
        }
        const reqs = session.model.getRequests();
        const state = {
            unread: false,
            seenRequests: reqs.length,
            seenCompleted: this.countCompleted(reqs),
            listener: new DisposableCollection()
        };
        this.unreadSessions.set(session.id, state);

        session.model.onDidChange(() => {
            const current = session.model.getRequests();
            if (current.length > state.seenRequests || this.countCompleted(current) > state.seenCompleted) {
                // Only silently update the seen counts (instead of flashing the unread badge)
                // when the user is actually looking at this session: it must be the active
                // session AND the chat view must currently be the focused widget. Otherwise,
                // the user may have switched away (e.g. to the editor) while the chat agent
                // is still running, and we want the badge to appear so they notice the new
                // response when they return.
                const activeSession = this.chatService.getActiveSession();
                const chatViewFocused = ChatViewWidget.findActive(this.shell) !== undefined;
                if (chatViewFocused && activeSession && activeSession.id === session.id) {
                    state.seenRequests = current.length;
                    state.seenCompleted = this.countCompleted(current);
                } else if (!state.unread) {
                    state.unread = true;
                    this.onUnreadChangedEmitter.fire(session.id);
                }
            }
        }, undefined, state.listener);
    }

    protected markSessionRead(sessionId: string): void {
        const state = this.unreadSessions.get(sessionId);
        if (!state) {
            return;
        }
        const session = this.chatService.getSession(sessionId);
        const reqs = session?.model.getRequests() ?? [];
        state.seenRequests = reqs.length;
        state.seenCompleted = this.countCompleted(reqs);
        if (state.unread) {
            state.unread = false;
            this.onUnreadChangedEmitter.fire(sessionId);
        }
    }

    protected unwatchSession(sessionId: string): void {
        const state = this.unreadSessions.get(sessionId);
        if (state) {
            state.listener.dispose();
            this.unreadSessions.delete(sessionId);
        }
    }

    private countCompleted(reqs: ReturnType<ChatSession['model']['getRequests']>): number {
        return reqs.filter(r => r.response.isComplete).length;
    }

    /**
     * Splits sessions into active vs. recent (restored). Active sessions are sourced from
     * `chatService.getSessions()` (in-memory). Recent sessions are the persisted index entries
     * that aren't already loaded as an active session.
     */
    protected getSections(): SectionedSessions {
        const activeRaw = this.chatService.getSessions().filter(s => !!s.title);
        const activeIds = new Set(activeRaw.map(s => s.id));
        const active: ChatSessionMetadata[] = activeRaw
            .toSorted((a, b) => (b.lastInteraction?.getTime() ?? 0) - (a.lastInteraction?.getTime() ?? 0))
            .map(session => {
                const lastReq = session.model.getRequests().at(-1);
                const hasError = lastReq?.response.isComplete === true && lastReq?.response.isError === true;
                return {
                    sessionId: session.id,
                    title: session.title!,
                    saveDate: session.lastInteraction?.getTime() ?? Date.now(),
                    location: session.model.location,
                    pinnedAgentId: session.pinnedAgent?.id,
                    hasError
                };
            });
        const recent = this._persistedSessions.filter(metadata => !activeIds.has(metadata.sessionId));
        return { active, recent };
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this._inputEnabled) {
            return undefined;
        }
        const sections = this.getSections();
        const sessionCount = sections.active.length + sections.recent.length;
        if (!this.isPersistenceEnabled() || sessionCount === 0) {
            // Empty state: let other providers (IDE welcome) show their onboarding content.
            return undefined;
        }
        return this.renderSessionsSection(sections);
    }

    protected renderSessionsSection(sections: SectionedSessions): React.ReactNode {
        const maxSessions = this.preferenceService.get<number>(WELCOME_SCREEN_SESSIONS_PREF, 20);
        return (
            <div className="theia-WelcomeMessage" key="sessions-section">
                <div className="theia-WelcomeMessage-SessionsSection">
                    <SessionsList
                        sections={sections}
                        maxSessions={maxSessions}
                        renderRow={this.renderSessionRow}
                        onBrowseAll={this.handleBrowseAllChats}
                    />
                </div>
            </div>
        );
    }

    protected renderSessionRow = (session: ChatSessionMetadata, isRestored: boolean): React.ReactNode => {
        const actions = this.chatSessionItemActionContributions
            .getContributions()
            .flatMap(c => c.getActions(session))
            .filter(action => this.commandRegistry.isEnabled(action.commandId, session))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            .map((action: ChatSessionItemAction) => ({
                iconClass: action.iconClass,
                title: action.tooltip ?? '',
                onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    this.commandRegistry.executeCommand(action.commandId, session);
                }
            }));
        return (
            <ChatSessionRow
                key={session.sessionId}
                session={session}
                isRestored={isRestored}
                chatService={this.chatService}
                chatAgentService={this.chatAgentService}
                hoverService={this.hoverService}
                markdownRenderer={this.markdownRenderer}
                unreadState={this}
                onClick={() => this.handleSessionRowClick(session.sessionId)}
                actions={actions}
                formatTimeAgo={date => formatTimeAgo(date)}
            />
        );
    };

    protected handleSessionRowClick = async (sessionId: string): Promise<void> => {
        await this.chatService.getOrRestoreSession(sessionId);
        this.chatService.setActiveSession(sessionId, { focus: true });
    };

    protected handleBrowseAllChats = (): void => {
        this.commandRegistry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
    };
}
