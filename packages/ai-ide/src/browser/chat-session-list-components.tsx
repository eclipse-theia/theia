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

import { ChatAgentService, ChatService, ChatSessionMetadata } from '@theia/ai-chat';
import { AI_CHAT_OPEN_SESSION } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { formatTimeAgo } from '@theia/ai-chat-ui/lib/browser/chat-date-utils';
import { CommandRegistry, ContributionProvider } from '@theia/core';
import { buttonKeyboardProps, HoverService, isActivationKey } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { ChatSessionItem } from './chat-session-item';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionListService } from './chat-session-list-service';

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
export function parentIdOf(session: ChatSessionMetadata): string | undefined {
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

export interface SessionsListProps {
    rows: SessionRow[];
    /** Total cap on items shown; overflow surfaces via the Browse all link. Defaults to no cap. */
    maxSessions?: number;
    renderRow: (row: SessionRow) => React.ReactNode;
    onBrowseAll?: () => void;
}

export function SessionsList({ rows, maxSessions = Number.MAX_SAFE_INTEGER, renderRow, onBrowseAll }: SessionsListProps): React.ReactElement {
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
        <div className="theia-ChatSessions-List">
            {activeVisible.length > 0 && (
                <div className="theia-ChatSessions-Group">
                    <div className="theia-ChatSessions-Header">
                        {nls.localizeByDefault('Active')}
                    </div>
                    {activeVisible.map(row => renderRow(row))}
                </div>
            )}
            {restoredVisible.length > 0 && (
                <div className="theia-ChatSessions-Group">
                    <div className="theia-ChatSessions-Header">
                        {nls.localize('theia/ai/ide/sectionRestored', 'Restored')}
                    </div>
                    {restoredVisible.map(row => renderRow(row))}
                </div>
            )}
            {hiddenCount > 0 && onBrowseAll && (
                <div className="theia-ChatSessions-Footer">
                    <a className="theia-ChatSessions-FooterLink"
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

export interface SessionRowRendererProps {
    chatService: ChatService;
    chatAgentService: ChatAgentService;
    hoverService: HoverService;
    markdownRenderer: MarkdownRenderer;
    sessionListService: ChatSessionListService;
    commandRegistry: CommandRegistry;
    chatSessionItemActionContributions: ContributionProvider<ChatSessionItemActionContribution>;
}

export function getSessionActions(
    session: ChatSessionMetadata,
    contributions: ContributionProvider<ChatSessionItemActionContribution>,
    commandRegistry: CommandRegistry
): ChatSessionItemAction[] {
    return contributions
        .getContributions()
        .flatMap(c => c.getActions(session))
        .filter(action => commandRegistry.isEnabled(action.commandId, session))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

export function createSessionRowRenderer(props: SessionRowRendererProps): (row: SessionRow) => React.ReactNode {
    const {
        chatService, chatAgentService, hoverService, markdownRenderer,
        sessionListService, commandRegistry, chatSessionItemActionContributions
    } = props;

    const renderAtDepth = (row: SessionRow, depth: number): React.ReactNode => {
        const hasChildSessions = row.childSessions.length > 0;
        const isExpanded = hasChildSessions && sessionListService.isExpanded(row.session.sessionId);
        const descendantNeedsAttention = sessionListService.descendantRequiresAction(row);

        return (
            <React.Fragment key={row.session.sessionId}>
                <ChatSessionItem
                    session={row.session}
                    isRestored={row.isRestored}
                    chatService={chatService}
                    chatAgentService={chatAgentService}
                    hoverService={hoverService}
                    markdownRenderer={markdownRenderer}
                    unreadState={sessionListService}
                    onClick={async () => {
                        await commandRegistry.executeCommand(AI_CHAT_OPEN_SESSION.id, row.session.sessionId);
                    }}
                    actions={getSessionActions(row.session, chatSessionItemActionContributions, commandRegistry)}
                    onAction={(action: ChatSessionItemAction, s: ChatSessionMetadata) => {
                        commandRegistry.executeCommand(action.commandId, s);
                    }}
                    formatTimeAgo={date => formatTimeAgo(date)}
                    hasChildSessions={hasChildSessions}
                    isChildSession={depth > 0}
                    depth={depth}
                    isExpanded={isExpanded}
                    descendantNeedsAttention={descendantNeedsAttention}
                    onToggleExpand={hasChildSessions ? () => sessionListService.toggleExpand(row.session.sessionId) : undefined}
                />
                {isExpanded && row.childSessions.map(child => renderAtDepth(child, depth + 1))}
            </React.Fragment>
        );
    };

    return (row: SessionRow): React.ReactNode => renderAtDepth(row, 0);
}
