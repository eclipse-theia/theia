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
    ChatAgentService, ChatService, ChatSessionMetadata
} from '@theia/ai-chat';
import { BYPASS_MODEL_REQUIREMENT_PREF, WELCOME_SCREEN_SESSIONS_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionListService } from './chat-session-list-service';
import { SectionedSessions, SessionRow, SessionsList } from './chat-session-list-components';
import { ChatSessionItem } from './chat-session-item';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { CommandRegistry, ContributionProvider, Emitter, Event, PreferenceService } from '@theia/core';
import { ApplicationShell, HoverService } from '@theia/core/lib/browser';
import { AISessionsWidget } from './ai-sessions-widget';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

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

    @inject(ChatSessionListService)
    protected readonly sessionListService: ChatSessionListService;

    protected _inputEnabled = false;

    protected _sessionsWidgetAttached = false;

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        if (!this._markdownRenderer) {
            this._markdownRenderer = this.markdownRendererFactory();
        }
        return this._markdownRenderer;
    }

    protected readonly onStateChangedEmitter = new Emitter<void>();
    readonly onStateChanged: Event<void> = this.onStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.sessionListService.onStateChanged(() => {
            this.onStateChangedEmitter.fire();
        });

        this.updateInputEnabled();
        this.languageModelRegistry.onChange(() => {
            this.updateInputEnabled();
        });
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                this.updateInputEnabled();
            } else if (e.preferenceName === WELCOME_SCREEN_SESSIONS_PREF) {
                this.onStateChangedEmitter.fire();
            }
        });

        this._sessionsWidgetAttached = this.isSessionsWidgetAttached();
        this.shell.onDidAddWidget(widget => {
            if (widget.id === AISessionsWidget.ID) {
                this._sessionsWidgetAttached = true;
                this.onStateChangedEmitter.fire();
            }
        });
        this.shell.onDidRemoveWidget(widget => {
            if (widget.id === AISessionsWidget.ID) {
                this._sessionsWidgetAttached = false;
                this.onStateChangedEmitter.fire();
            }
        });
    }

    protected isSessionsWidgetAttached(): boolean {
        const areas: ApplicationShell.Area[] = ['left', 'right', 'main', 'bottom'];
        return areas.some(area =>
            this.shell.getWidgets(area).some(w => w.id === AISessionsWidget.ID && !w.isDisposed)
        );
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

    renderWelcomeMessage(): React.ReactNode {
        if (this._sessionsWidgetAttached) {
            return undefined;
        }
        if (!this._inputEnabled) {
            return undefined;
        }
        const sections = this.sessionListService.getSections();
        const sessionCount = sections.active.length + sections.restored.length;
        if (!this.sessionListService.isPersistenceEnabled() || sessionCount === 0) {
            return undefined;
        }
        return this.renderSessionsSection(sections);
    }

    protected renderSessionsSection(sections: SectionedSessions): React.ReactNode {
        const maxSessions = this.preferenceService.get<number>(WELCOME_SCREEN_SESSIONS_PREF, 20);
        const rows = this.sessionListService.buildRows(sections);

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

    protected getSessionActions(session: ChatSessionMetadata): ChatSessionItemAction[] {
        return this.chatSessionItemActionContributions
            .getContributions()
            .flatMap(c => c.getActions(session))
            .filter(action => this.commandRegistry.isEnabled(action.commandId, session))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    protected renderSessionRow = (row: SessionRow): React.ReactNode => this.renderSessionRowAtDepth(row, 0);

    protected renderSessionRowAtDepth(row: SessionRow, depth: number): React.ReactNode {
        const hasChildSessions = row.childSessions.length > 0;
        const isExpanded = hasChildSessions && this.sessionListService.isExpanded(row.session.sessionId);
        const descendantNeedsAttention = this.sessionListService.descendantRequiresAction(row);

        return (
            <React.Fragment key={row.session.sessionId}>
                <ChatSessionItem
                    session={row.session}
                    isRestored={row.isRestored}
                    chatService={this.chatService}
                    chatAgentService={this.chatAgentService}
                    hoverService={this.hoverService}
                    markdownRenderer={this.markdownRenderer}
                    unreadState={this.sessionListService}
                    onClick={() => this.handleSessionItemClick(row.session.sessionId)}
                    actions={this.getSessionActions(row.session)}
                    onAction={this.handleSessionItemAction}
                    formatTimeAgo={date => formatTimeAgo(date)}
                    hasChildSessions={hasChildSessions}
                    isChildSession={depth > 0}
                    depth={depth}
                    isExpanded={isExpanded}
                    descendantNeedsAttention={descendantNeedsAttention}
                    onToggleExpand={hasChildSessions ? () => this.sessionListService.toggleExpand(row.session.sessionId) : undefined}
                />
                {isExpanded && row.childSessions.map(child => this.renderSessionRowAtDepth(child, depth + 1))}
            </React.Fragment>
        );
    }

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
