// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import {
    ChatAgentService, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata
} from '@theia/ai-chat';
import { DisposableCollection, Event } from '@theia/core';
import { buttonKeyboardProps, codicon, HoverService, isActivationKey } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { ChatSessionItemAction } from './chat-session-item-action-contribution';
import { buildRestoredSessionTooltip, buildSessionTooltip } from './chat-session-tooltip';

/** Minimal view of the unread state that React components can subscribe to. */
export interface UnreadStateProvider {
    isUnread(sessionId: string): boolean;
    readonly onUnreadChanged: Event<string>;
}

export interface ChatSessionItemProps {
    session: ChatSessionMetadata;
    /** Whether the session is restored from disk (true) or actively loaded in the chat service (false). */
    isRestored: boolean;
    chatService: ChatService;
    chatAgentService: ChatAgentService;
    hoverService: HoverService;
    markdownRenderer: MarkdownRenderer;
    unreadState: UnreadStateProvider;
    onClick: () => void;
    /** Actions shown in the item's action bar on hover/focus, already filtered and sorted. */
    actions?: ChatSessionItemAction[];
    /** Invoked when an action is triggered, with the action and this item's session. */
    onAction?: (action: ChatSessionItemAction, session: ChatSessionMetadata) => void;
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
function useTimeAgo(date: number, formatter: (date: number) => string): string {
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

    return formatter(date);
}

export interface ChatSessionItemComponentProps extends ChatSessionItemProps {
    formatTimeAgo: (date: number) => string;
}

export function ChatSessionItem(props: ChatSessionItemComponentProps): React.ReactElement {
    const { session, isRestored, chatService, chatAgentService, hoverService, markdownRenderer, unreadState, onClick, actions, onAction, formatTimeAgo } = props;

    // eslint-disable-next-line no-null/no-null
    const itemRef = React.useRef<HTMLDivElement | null>(null);
    const hoverActiveRef = React.useRef(false);

    const timeAgo = useTimeAgo(session.saveDate, formatTimeAgo);
    const [isWorking, setIsWorking] = React.useState(false);
    const [hasError, setHasError] = React.useState(session.hasError === true);
    const hasUnread = useUnreadMessages(session.sessionId, unreadState);

    React.useEffect(() => {
        setHasError(session.hasError === true);
    }, [session.hasError]);

    const agent = session.pinnedAgentId ? chatAgentService.getAgent(session.pinnedAgentId) : undefined;
    const agentIcon = agent?.iconClass ?? codicon('comment-discussion');
    const agentLabel = agent ? `@${agent.name}` : undefined;
    const subtitle = agentLabel ? `${agentLabel} · ${timeAgo}` : timeAgo;
    const title = session.title || nls.localizeByDefault('Untitled Chat');

    React.useEffect(() => {
        const trash = new DisposableCollection();

        const attach = (s: ChatSession) => {
            const recompute = () => {
                const requests = s.model.getRequests();
                setIsWorking(requests.some(ChatRequestModel.isInProgress));
                const lastReq = requests.at(-1);
                setHasError(lastReq?.response.isComplete === true && lastReq?.response.isError === true);
            };
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

    const handleMouseEnter = React.useCallback((e: React.MouseEvent) => {
        if ((e.target as Element).closest('.theia-chat-session-item-action')) {
            return;
        }
        hoverActiveRef.current = true;
        const target = itemRef.current;
        if (!target) { return; }

        // Don't restore on hover: restoring would promote the item from Restored to Active.
        // For restored items we build a metadata-only tooltip; the rich tooltip is shown only
        // once the session is actually opened.
        const loadedSession = chatService.getSession(session.sessionId);
        const tooltip = loadedSession
            ? buildSessionTooltip(loadedSession, session, chatAgentService, markdownRenderer, hasUnread, isWorking, hasError)
            : buildRestoredSessionTooltip(session, chatAgentService);
        // The tooltip may hold a markdown render result; dispose it once the hover is torn down
        // (or right away if we no longer intend to show it).
        if (!hoverActiveRef.current) { tooltip.dispose(); return; }
        hoverService.requestHover({ content: tooltip.element, target, position: 'left', onHide: () => tooltip.dispose() });
    }, [session, chatService, chatAgentService, hoverService, markdownRenderer, hasUnread, isWorking, hasError]);

    React.useEffect(() => () => { hoverActiveRef.current = false; }, []);

    const handleMouseLeave = React.useCallback(() => {
        hoverActiveRef.current = false;
        hoverService.cancelHover();
    }, [hoverService]);

    const handleMouseOver = React.useCallback((e: React.MouseEvent) => {
        if ((e.target as Element).closest('.theia-chat-session-item-action')) {
            hoverActiveRef.current = false;
            hoverService.cancelHover();
        }
    }, [hoverService]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (isActivationKey(e)) {
            e.preventDefault();
            onClick();
        }
    }, [onClick]);

    const showUnread = hasUnread && !isWorking && !hasError;
    const itemClasses = [
        'theia-chat-session-item',
        isWorking && 'theia-chat-session-item-working',
        hasError && !isWorking && 'theia-chat-session-item-error',
        showUnread && 'theia-chat-session-item-unread'
    ].filter(Boolean).join(' ');

    const iconClass = isWorking ? `${codicon('loading')} theia-animation-spin` : agentIcon;

    return (
        <div ref={itemRef}
            className={itemClasses}
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseOver={handleMouseOver}>
            <div className="theia-chat-session-item-icon-col">
                {isRestored ? (
                    <span className={`${codicon('archive')} theia-chat-session-item-archive-icon`}
                        title={nls.localize('theia/ai/ide/restoredSession', 'Restored session')} />
                ) : (
                    <span className={`theia-chat-session-item-agent-icon ${iconClass}`} />
                )}
                {showUnread && (
                    <span className="theia-chat-session-item-unread-dot"
                        aria-label={nls.localize('theia/ai/ide/tooltip/unread', 'Unread')} />
                )}
            </div>
            <div className="theia-chat-session-item-content">
                <div className="theia-chat-session-item-title-line">
                    <span className="theia-chat-session-item-title" title={title}>{title}</span>
                </div>
                <div className="theia-chat-session-item-subtitle">{subtitle}</div>
            </div>
            {actions && actions.length > 0 && onAction && (
                <div className="theia-chat-session-item-actions">
                    {actions.map(action => (
                        <button key={action.commandId}
                            className={`theia-chat-session-item-action ${action.iconClass}`}
                            title={action.tooltip ?? ''}
                            {...buttonKeyboardProps(action.tooltip ?? '')}
                            onClick={e => { e.stopPropagation(); onAction(action, session); }} />
                    ))}
                </div>
            )}
        </div>
    );
}
