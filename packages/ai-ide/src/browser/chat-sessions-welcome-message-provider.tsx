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
    ChatAgentService, ChatService, ChatSession, ChatSessionMetadata, ChatSessionStatus
} from '@theia/ai-chat';
import { BYPASS_MODEL_REQUIREMENT_PREF, PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF, WELCOME_SCREEN_SESSIONS_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionItem } from './chat-session-item';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { CommandRegistry, ContributionProvider, DisposableCollection, Emitter, Event, PreferenceService } from '@theia/core';
import { ApplicationShell, buttonKeyboardProps, HoverService, isActivationKey } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

/** When both Active and Restored sections are non-empty, keep at least this many Restored slots. */
const RESTORED_MIN_RESERVATION = 5;

export interface SectionedSessions {
    active: ChatSessionMetadata[];
    restored: ChatSessionMetadata[];
}

/** A session row with its optional child sessions. */
export interface SessionRow {
    session: ChatSessionMetadata;
    isRestored: boolean;
    childSessions: SessionRow[];
}

/**
 * The id of a session's immediate parent for tree building. Falls back to the root session id for
 * sessions persisted before immediate-parent tracking existed, so their hierarchy still renders
 * (flat under the root, as before).
 */
function parentIdOf(session: ChatSessionMetadata): string | undefined {
    return session.parentSessionId ?? session.rootSessionId;
}

export interface VisibleSessionSlots {
    activeCount: number;
    restoredCount: number;
}

/**
 * Allocates the capped number of visible items between the Active and Restored sections of the
 * overview. When both sections are non-empty, up to {@link RESTORED_MIN_RESERVATION} slots are
 * reserved for Restored so active sessions cannot crowd it out entirely. A cap of 0 hides the
 * inline list (every session stays reachable via the "Browse all chats..." link).
 */
export function computeVisibleSessionSlots(activeTotal: number, restoredTotal: number, maxSessions: number): VisibleSessionSlots {
    const cap = Math.max(0, maxSessions);
    if (cap === 0) {
        return { activeCount: 0, restoredCount: 0 };
    }
    if (restoredTotal === 0) {
        return { activeCount: Math.min(activeTotal, cap), restoredCount: 0 };
    }
    if (activeTotal === 0) {
        return { activeCount: 0, restoredCount: Math.min(restoredTotal, cap) };
    }
    const reserved = Math.min(restoredTotal, Math.min(RESTORED_MIN_RESERVATION, Math.max(1, cap - 1)));
    const activeCount = Math.min(activeTotal, cap - reserved);
    const restoredCount = Math.min(restoredTotal, cap - activeCount);
    return { activeCount, restoredCount };
}

interface SessionsListProps {
    rows: SessionRow[];
    /** Total cap on items shown on the home view; overflow surfaces via the Browse all link. */
    maxSessions: number;
    renderRow: (row: SessionRow) => React.ReactNode;
    onBrowseAll: () => void;
}

function SessionsList({ rows, maxSessions, renderRow, onBrowseAll }: SessionsListProps): React.ReactElement {
    // Children are rendered inline by their parent row, so only top-level rows appear in the
    // sections. A child whose parent session is not in the list falls back to top-level (orphan).
    const topLevelRows = rows.filter(row => {
        const parentId = parentIdOf(row.session);
        if (!parentId) {
            return true;
        }
        return !rows.some(r => r.session.sessionId === parentId);
    });

    const activeRows = topLevelRows.filter(row => !row.isRestored);
    const restoredRows = topLevelRows.filter(row => row.isRestored);

    const { activeCount, restoredCount } = computeVisibleSessionSlots(activeRows.length, restoredRows.length, maxSessions);
    const activeVisible = activeRows.slice(0, activeCount);
    const restoredVisible = restoredRows.slice(0, restoredCount);
    const hiddenCount = topLevelRows.length - activeVisible.length - restoredVisible.length;

    return (
        <div className="theia-WelcomeMessage-SessionsList">
            {activeVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localizeByDefault('Active')}
                    </div>
                    {activeVisible.map(row => renderRow(row))}
                </div>
            )}
            {restoredVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localize('theia/ai/ide/sectionRestored', 'Restored')}
                    </div>
                    {restoredVisible.map(row => renderRow(row))}
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

    private readonly unreadSessions = new Map<string, { unread: boolean; requiresAction: boolean; seenRequests: number; seenCompleted: number; listener: DisposableCollection }>();
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

    /** Expanded root session IDs (default collapsed). */
    protected expandedRoots = new Set<string>();

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
            // `loadSessions` fires `onStateChangedEmitter` once the (re)load settles, so we don't
            // fire it again here: a single session event should trigger a single re-render.
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

        try {
            const index = await this.chatService.getPersistedSessions();
            this._persistedSessions = Object.values(index)
                .toSorted((a, b) => b.saveDate - a.saveDate);
        } catch (error) {
            console.error('Failed to load persisted sessions:', error);
            this._persistedSessions = [];
        } finally {
            // Fire once after the load settles; the data was stale until now anyway.
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
            requiresAction: ChatSessionStatus.requiresUserAction(session.model.status),
            seenRequests: reqs.length,
            seenCompleted: this.countCompleted(reqs),
            listener: new DisposableCollection()
        };
        this.unreadSessions.set(session.id, state);

        session.model.onDidChange(() => {
            const requiresAction = ChatSessionStatus.requiresUserAction(session.model.status);
            // Only react to a change in whether this session needs user action (approval/input) - i.e. a
            // transition into or out of that state - not to every model change while the state is stable.
            if (requiresAction !== state.requiresAction) {
                state.requiresAction = requiresAction;
                // When a delegated child starts needing action, auto-expand its ancestors so the whole
                // subtree is revealed naturally. Don't auto-collapse afterwards: leave that to the user.
                if (requiresAction) {
                    this.expandAncestors(session);
                }
                this.onStateChangedEmitter.fire();
            }
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
     * Splits sessions into active vs. restored. Active sessions are sourced from
     * `chatService.getSessions()` (in-memory). Restored sessions are the persisted index entries
     * that aren't already loaded as an active session.
     */
    protected getSections(): SectionedSessions {
        const activeRaw = this.chatService.getSessions().filter(s => !!s.title);
        const activeIds = new Set(activeRaw.map(s => s.id));
        const active: ChatSessionMetadata[] = activeRaw
            .toSorted((a, b) => (b.lastInteraction?.getTime() ?? 0) - (a.lastInteraction?.getTime() ?? 0))
            .map(session => ({
                sessionId: session.id,
                title: session.title!,
                saveDate: session.lastInteraction?.getTime() ?? Date.now(),
                location: session.model.location,
                pinnedAgentId: session.pinnedAgent?.id,
                hasError: session.model.status === 'failed',
                rootSessionId: session.rootSessionId,
                parentSessionId: session.parentSessionId
            }));
        const restored = this._persistedSessions.filter(metadata => !activeIds.has(metadata.sessionId));
        return { active, restored };
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this._inputEnabled) {
            return undefined;
        }
        const sections = this.getSections();
        const sessionCount = sections.active.length + sections.restored.length;
        if (!this.isPersistenceEnabled() || sessionCount === 0) {
            // Empty state: let other providers (IDE welcome) show their onboarding content.
            return undefined;
        }
        return this.renderSessionsSection(sections);
    }

    /**
     * Builds one {@link SessionRow} per session (carrying its own restored flag), then nests each child
     * row under its immediate parent's row to reconstruct the full (multi-level) delegation hierarchy.
     * Two passes on purpose: the first creates a row for every session so the second can link each child
     * to its parent. Sessions are ordered by recency, not parent-first, so a child may precede its parent
     * here; linking in a single pass would miss parents not yet created.
     */
    protected buildRows(sections: SectionedSessions): SessionRow[] {
        const allSessions = [...sections.active, ...sections.restored];
        const activeIds = new Set(sections.active.map(s => s.sessionId));
        const rowsById = new Map<string, SessionRow>();
        for (const session of allSessions) {
            rowsById.set(session.sessionId, { session, isRestored: !activeIds.has(session.sessionId), childSessions: [] });
        }
        for (const session of allSessions) {
            const parentId = parentIdOf(session);
            if (parentId) {
                rowsById.get(parentId)?.childSessions.push(rowsById.get(session.sessionId)!);
            }
        }
        return [...rowsById.values()];
    }

    protected renderSessionsSection(sections: SectionedSessions): React.ReactNode {
        const maxSessions = this.preferenceService.get<number>(WELCOME_SCREEN_SESSIONS_PREF, 20);
        const rows = this.buildRows(sections);

        return (
            <div className="theia-WelcomeMessage" key="sessions-section">
                <div className="theia-WelcomeMessage-SessionsSection">
                    <SessionsList
                        rows={rows}
                        maxSessions={maxSessions}
                        renderRow={this.renderSessionRow}
                        onBrowseAll={this.handleBrowseAllChats}
                    />
                </div>
            </div>
        );
    }

    protected toggleExpand = (sessionId: string): void => {
        this.expandedRoots = new Set(this.expandedRoots);
        if (this.expandedRoots.has(sessionId)) {
            this.expandedRoots.delete(sessionId);
        } else {
            this.expandedRoots.add(sessionId);
        }
        this.onStateChangedEmitter.fire();
    };

    /** Whether a loaded session currently needs user action (approval or input). */
    protected sessionRequiresAction(sessionId: string): boolean {
        const session = this.chatService.getSession(sessionId);
        return session !== undefined && ChatSessionStatus.requiresUserAction(session.model.status);
    }

    /** Whether any descendant (at any depth) of the given row currently needs user action. */
    protected descendantRequiresAction(row: SessionRow): boolean {
        return row.childSessions.some(child =>
            this.sessionRequiresAction(child.session.sessionId) || this.descendantRequiresAction(child));
    }

    /**
     * Expands every ancestor of the given session (walking the immediate-parent chain) so a deeply
     * delegated session becomes visible. The caller is responsible for triggering a re-render.
     */
    protected expandAncestors(session: ChatSession): void {
        // Resolve the next ancestor for a given session id. Prefer the loaded session, but fall back to
        // the persisted index: an ancestor may not be loaded in memory (e.g. a child opened directly via
        // "Browse all chats"). Without the fallback the walk stops at the first persisted-only ancestor,
        // leaving the child hidden under a still-collapsed root.
        const persistedById = new Map(this._persistedSessions.map(metadata => [metadata.sessionId, metadata]));
        const parentIdFor = (id: string): string | undefined => {
            const loaded = this.chatService.getSession(id);
            if (loaded) {
                return loaded.parentSessionId ?? loaded.rootSessionId;
            }
            const metadata = persistedById.get(id);
            return metadata && parentIdOf(metadata);
        };
        const visited = new Set<string>();
        let parentId = session.parentSessionId ?? session.rootSessionId;
        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            this.expandedRoots.add(parentId);
            parentId = parentIdFor(parentId);
        }
    }

    /** Collects the enabled session-item actions for a session, sorted by priority. */
    protected getSessionActions(session: ChatSessionMetadata): ChatSessionItemAction[] {
        return this.chatSessionItemActionContributions
            .getContributions()
            .flatMap(c => c.getActions(session))
            .filter(action => this.commandRegistry.isEnabled(action.commandId, session))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    protected renderSessionRow = (row: SessionRow): React.ReactNode => this.renderSessionRowAtDepth(row, 0);

    /** Renders a session row and, when expanded, its child rows recursively so nested delegations show. */
    protected renderSessionRowAtDepth(row: SessionRow, depth: number): React.ReactNode {
        const hasChildSessions = row.childSessions.length > 0;
        const isExpanded = hasChildSessions && this.expandedRoots.has(row.session.sessionId);
        const descendantNeedsAttention = this.descendantRequiresAction(row);

        return (
            <React.Fragment key={row.session.sessionId}>
                <ChatSessionItem
                    session={row.session}
                    isRestored={row.isRestored}
                    chatService={this.chatService}
                    chatAgentService={this.chatAgentService}
                    hoverService={this.hoverService}
                    markdownRenderer={this.markdownRenderer}
                    unreadState={this}
                    onClick={() => this.handleSessionItemClick(row.session.sessionId)}
                    actions={this.getSessionActions(row.session)}
                    onAction={this.handleSessionItemAction}
                    formatTimeAgo={date => formatTimeAgo(date)}
                    hasChildSessions={hasChildSessions}
                    isChildSession={depth > 0}
                    depth={depth}
                    isExpanded={isExpanded}
                    descendantNeedsAttention={descendantNeedsAttention}
                    onToggleExpand={hasChildSessions ? () => this.toggleExpand(row.session.sessionId) : undefined}
                />
                {isExpanded && row.childSessions.map(child => this.renderSessionRowAtDepth(child, depth + 1))}
            </React.Fragment>
        );
    };

    protected handleSessionItemAction = (action: ChatSessionItemAction, session: ChatSessionMetadata): void => {
        this.commandRegistry.executeCommand(action.commandId, session);
    };

    protected handleSessionItemClick = async (sessionId: string): Promise<void> => {
        await this.chatService.getOrRestoreSession(sessionId);
        this.chatService.setActiveSession(sessionId, { focus: true });
    };

    protected handleBrowseAllChats = (): void => {
        this.commandRegistry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
    };
}
