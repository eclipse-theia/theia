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
import { ChatAgentService, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata } from '@theia/ai-chat';
import { BYPASS_MODEL_REQUIREMENT_PREF, PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF, WELCOME_SCREEN_SESSIONS_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { ChatSessionCardActionContribution } from './chat-session-card-action-contribution';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { CommandRegistry, ContributionProvider, DisposableCollection, Emitter, Event, PreferenceService } from '@theia/core';
import { Card, CardActionButton, codicon, HoverService } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

const TOOLTIP_SNIPPET_MAX_LENGTH = 1000;

/** Minimal view of the unread state that React components can subscribe to. */
interface UnreadStateProvider {
    isUnread(sessionId: string): boolean;
    readonly onUnreadChanged: Event<string>;
}

interface SessionCardsGridProps {
    sessions: ChatSessionMetadata[];
    maxRows: number;
    renderCard: (session: ChatSessionMetadata) => React.ReactNode;
}

function SessionCardsGrid({ sessions, maxRows, renderCard }: SessionCardsGridProps): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const gridRef = React.useRef<HTMLDivElement | null>(null);
    const [columns, setColumns] = React.useState(1);

    const detectColumns = React.useCallback(() => {
        const el = gridRef.current;
        if (!el) {
            return;
        }

        const gridStyle = getComputedStyle(el);
        const gap = parseFloat(gridStyle.columnGap || gridStyle.gap || '0') || 0;

        const containerWidth = el.getBoundingClientRect().width;

        // If we have at least one child, use its actual laid-out width.
        const first = el.firstElementChild as HTMLElement | null;
        if (!first) {
            setColumns(1);
            return;
        }

        const itemWidth = first.getBoundingClientRect().width || 1;
        const cols = Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));

        setColumns(prev => (prev !== cols ? cols : prev));
    }, []);

    // Detect columns synchronously before first paint to avoid flash
    React.useLayoutEffect(() => {
        detectColumns();
    }, [detectColumns]);

    // Track subsequent resizes
    React.useEffect(() => {
        const el = gridRef.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(detectColumns);
        observer.observe(el);
        return () => observer.disconnect();
    }, [detectColumns]);

    const maxVisible = maxRows * columns;
    const visibleSessions = sessions.slice(0, maxVisible);

    return (
        <div ref={gridRef} className="theia-WelcomeMessage-SessionCards">
            {visibleSessions.map(renderCard)}
        </div>
    );
}

/** Subscribes the component to the unread flag for one session. */
function useUnreadMessages(sessionId: string, provider: UnreadStateProvider): boolean {
    const [hasUnread, setHasUnread] = React.useState(() => provider.isUnread(sessionId));

    React.useEffect(() => {
        setHasUnread(provider.isUnread(sessionId));
        const disposable = provider.onUnreadChanged(changedId => {
            if (changedId === sessionId) {
                setHasUnread(provider.isUnread(sessionId));
            }
        });
        return () => disposable.dispose();
    }, [sessionId, provider]);

    return hasUnread;
}

/** Re-renders the caller whenever the formatted time-ago string would change. */
function useTimeAgo(date: number): string {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

    React.useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const schedule = () => {
            const ageMs = Date.now() - date;
            // Update frequently when very recent, then progressively slower.
            const delayMs = ageMs < 60_000 ? 10_000
                : ageMs < 3_600_000 ? 60_000
                    : 3_600_000;
            timeoutId = setTimeout(() => { forceUpdate(); schedule(); }, delayMs);
        };

        schedule();
        return () => clearTimeout(timeoutId);
    }, [date]);

    return formatTimeAgo(date);
}

interface ChatSessionCardProps {
    session: ChatSessionMetadata;
    chatService: ChatService;
    chatAgentService: ChatAgentService;
    hoverService: HoverService;
    markdownRenderer: MarkdownRenderer;
    unreadState: UnreadStateProvider;
    onClick: () => void;
    actionButtons?: CardActionButton[];
}

function ChatSessionCard(
    { session, chatService, chatAgentService, hoverService, markdownRenderer, unreadState, onClick, actionButtons }: ChatSessionCardProps
): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const hoverActiveRef = React.useRef(false);

    const timeAgo = useTimeAgo(session.saveDate);
    const [isWorking, setIsWorking] = React.useState(false);
    const hasUnread = useUnreadMessages(session.sessionId, unreadState);

    React.useEffect(() => {
        const trash = new DisposableCollection();

        const attach = (s: ChatSession) => {
            const recompute = () => setIsWorking(s.model.getRequests().some(ChatRequestModel.isInProgress));
            recompute();
            s.model.onDidChange(recompute, undefined, trash);
        };

        const existing = chatService.getSession(session.sessionId);
        if (existing) {
            attach(existing);
        } else {
            chatService.onSessionEvent(event => {
                if (event.type === 'created' && event.sessionId === session.sessionId) {
                    const s = chatService.getSession(session.sessionId);
                    if (s) {
                        attach(s);
                    }
                }
            }, undefined, trash);
        }

        return () => trash.dispose();
    }, [session.sessionId, chatService]);

    const handleMouseEnter = React.useCallback(async (e: React.MouseEvent) => {
        if ((e.target as Element).closest('.theia-Card-action-btn')) {
            return;
        }
        hoverActiveRef.current = true;
        const target = wrapperRef.current;
        if (!target) { return; }

        let chatSession: ChatSession | undefined = chatService.getSession(session.sessionId);
        if (!chatSession) {
            chatSession = await chatService.getOrRestoreSession(session.sessionId);
        }
        if (!hoverActiveRef.current || !chatSession) { return; }

        const content = buildSessionTooltip(chatSession, session, chatAgentService, markdownRenderer, hasUnread);
        hoverService.requestHover({ content, target, position: 'left' });
    }, [session, chatService, chatAgentService, hoverService, markdownRenderer, hasUnread]);
    React.useEffect(() => () => { hoverActiveRef.current = false; }, []); // Block mouseEnter proceeding on unmount

    const handleMouseLeave = React.useCallback(() => {
        hoverActiveRef.current = false;
        // Cancel any pending hover that has not yet been displayed
        // (if it was already shown the hover service handles mouse-out internally)
        hoverService.cancelHover();
    }, [hoverService]);

    const handleMouseOver = React.useCallback((e: React.MouseEvent) => {
        if ((e.target as Element).closest('.theia-Card-action-btn')) {
            hoverActiveRef.current = false;
            hoverService.cancelHover();
        }
    }, [hoverService]);

    return (
        <div ref={wrapperRef}
            className={`theia-chat-session-card-wrapper${isWorking ? ' theia-chat-session-card-working' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseOver={handleMouseOver}>
            <Card
                icon={isWorking ? `${codicon('loading')} theia-animation-spin` : codicon('comment-discussion')}
                title={session.title || nls.localizeByDefault('Untitled Chat')}
                subtitle={timeAgo}
                actionButtons={actionButtons}
                onClick={onClick}
            />
            {hasUnread && !isWorking && <div className="theia-chat-session-badge-unread" />}
        </div>
    );
}

function buildSessionTooltip(
    session: ChatSession, metadata: ChatSessionMetadata,
    agentService: ChatAgentService, markdownRenderer: MarkdownRenderer,
    isUnread: boolean
): HTMLElement {
    const requests = session.model.getRequests();
    const lastRequest = requests.at(-1);

    const container = document.createElement('div');
    container.className = 'theia-chat-session-tooltip';

    if (isUnread) {
        const badge = document.createElement('div');
        badge.className = 'theia-chat-session-badge-unread-tooltip';
        badge.textContent = nls.localize('theia/ai/ide/tooltip/unread', 'Unread');
        container.appendChild(badge);
    }

    if (lastRequest) {
        const lastResponse = lastRequest.response;
        let messageText: string | undefined;

        if (lastResponse.isComplete && !lastResponse.isError) {
            // Show the agent's response text (already markdown)
            messageText = lastResponse.response.asString() || undefined;
        } else if (!lastResponse.isComplete) {
            // Request is still pending / no response yet — show the user's request text
            messageText = lastRequest.request.text || undefined;
        } else {
            // Failure response — find the most recent successful exchange
            const lastSuccessfulRequest = requests.findLast(r => r.response.isComplete && !r.response.isError);
            messageText = lastSuccessfulRequest?.response.response.asString() || undefined;
        }

        if (messageText) {
            const snippet = messageText.length > TOOLTIP_SNIPPET_MAX_LENGTH
                ? messageText.substring(0, TOOLTIP_SNIPPET_MAX_LENGTH) + '\u2026'
                : messageText;
            const label = document.createElement('div');
            label.className = 'theia-chat-session-tooltip-label';
            label.textContent = nls.localize('theia/ai/ide/tooltip/lastMessage', 'Last message');
            container.appendChild(label);

            const snippetEl = document.createElement('div');
            snippetEl.className = 'theia-chat-session-tooltip-snippet';
            snippetEl.appendChild(markdownRenderer.render({ value: snippet }).element);
            container.appendChild(snippetEl);

            const hr = document.createElement('hr');
            container.appendChild(hr);
        }
    }

    const dl = document.createElement('dl');

    if (lastRequest) {
        const agentId = lastRequest.response.agentId ?? requests.findLast(r => r.response.agentId)?.response.agentId;
        if (agentId) {
            const agentName = agentService.getAgent(agentId)?.name ?? agentId;
            addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/agent', 'Agent'), '@' + agentName);
        }
    }

    const count = requests.length;
    const exchangeLabel = count === 1
        ? nls.localize('theia/ai/ide/tooltip/oneExchange', '1 exchange')
        : nls.localize('theia/ai/ide/tooltip/multipleExchanges', '{0} exchanges', count);
    addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/messages', 'Messages'), exchangeLabel);

    const date = session.lastInteraction ?? new Date(metadata.saveDate);
    addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/lastActivity', 'Last activity'), date.toLocaleString());

    container.appendChild(dl);
    return container;
}

function addDlEntry(dl: HTMLDListElement, term: string, detail: string): void {
    const dt = document.createElement('dt');
    dt.textContent = term;
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = detail;
    dl.appendChild(dd);
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

    @inject(ContributionProvider) @named(ChatSessionCardActionContribution)
    protected readonly chatSessionCardActionContributions: ContributionProvider<ChatSessionCardActionContribution>;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

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

    protected _sessions: ChatSessionMetadata[] = [];

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
        });

        this.loadSessions();
        this.updateInputEnabled();
        this.languageModelRegistry.onChange(() => {
            this.updateInputEnabled();
        });
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PERSISTED_SESSION_LIMIT_PREF || e.preferenceName === SESSION_STORAGE_PREF) {
                this.loadSessions();
            } else if (e.preferenceName === WELCOME_SCREEN_SESSIONS_PREF) {
                this.onStateChangedEmitter.fire();
            } else if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                this.updateInputEnabled();
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

        this.onStateChangedEmitter.fire();

        try {
            const index = await this.chatService.getPersistedSessions();
            this._sessions = Object.values(index)
                .toSorted((a, b) => b.saveDate - a.saveDate);
        } catch (error) {
            console.error('Failed to load persisted sessions:', error);
            this._sessions = [];
        } finally {
            this.onStateChangedEmitter.fire();
        }
    }

    protected isPersistenceEnabled(): boolean {
        const limit = this.preferenceService.get<number>(PERSISTED_SESSION_LIMIT_PREF, 25);
        return limit !== 0;
    }

    protected getMaxRows(): number {
        return this.preferenceService.get<number>(WELCOME_SCREEN_SESSIONS_PREF, 3);
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
                if (!state.unread) {
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

    renderWelcomeMessage(): React.ReactNode {
        if (!this._inputEnabled) {
            return undefined;
        }
        const maxRows = this.getMaxRows();
        if (!this.isPersistenceEnabled() || maxRows === 0 || this._sessions.length === 0) {
            return undefined;
        }
        return this.renderSessionsSection();
    }

    protected renderSessionsSection(): React.ReactNode {
        const maxRows = this.getMaxRows();

        return (
            <div className="theia-WelcomeMessage" key="sessions-section">
                <div className="theia-WelcomeMessage-SessionsSection">
                    <h2>
                        {nls.localize('theia/ai/ide/recentChats', 'Recent Chats')}
                    </h2>
                    <SessionCardsGrid
                        sessions={this._sessions}
                        maxRows={maxRows}
                        renderCard={this.renderSessionCard}
                    />
                    <div className="theia-WelcomeMessage-BrowseAllLink">
                        <a onClick={this.handleBrowseAllChats}>
                            {nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...')}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    protected renderSessionCard = (session: ChatSessionMetadata): React.ReactNode => {
        const actionButtons: CardActionButton[] = this.chatSessionCardActionContributions
            .getContributions()
            .flatMap(c => c.getActions(session))
            .filter(action => this.commandRegistry.isEnabled(action.commandId, session))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            .map(action => ({
                iconClass: action.iconClass,
                title: action.tooltip ?? '',
                onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    this.commandRegistry.executeCommand(action.commandId, session);
                }
            }));
        return (
            <ChatSessionCard
                key={session.sessionId}
                session={session}
                chatService={this.chatService}
                chatAgentService={this.chatAgentService}
                hoverService={this.hoverService}
                markdownRenderer={this.markdownRenderer}
                unreadState={this}
                onClick={() => this.handleSessionCardClick(session.sessionId)}
                actionButtons={actionButtons}
            />
        );
    };

    protected handleSessionCardClick = async (sessionId: string): Promise<void> => {
        await this.chatService.getOrRestoreSession(sessionId);
        this.chatService.setActiveSession(sessionId, { focus: true });
    };

    protected handleBrowseAllChats = (): void => {
        this.commandRegistry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
    };
}
