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

import { ChatAgentService, ChatService } from '@theia/ai-chat';
import { ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionListService } from './chat-session-list-service';
import { createSessionRowRenderer, SessionsList } from './chat-session-list-components';
import { CommandRegistry, ContributionProvider, nls } from '@theia/core';
import { codicon, HoverService, ReactWidget } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

@injectable()
export class AISessionsWidget extends ReactWidget {

    static readonly ID = 'ai-sessions-widget';
    static readonly LABEL = nls.localize('theia/ai-ide/sessionsView', 'AI Sessions');

    @inject(ChatSessionListService)
    protected readonly sessionListService: ChatSessionListService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MarkdownRendererFactory)
    protected readonly markdownRendererFactory: MarkdownRendererFactory;

    @inject(ContributionProvider) @named(ChatSessionItemActionContribution)
    protected readonly chatSessionItemActionContributions: ContributionProvider<ChatSessionItemActionContribution>;

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        if (!this._markdownRenderer) {
            this._markdownRenderer = this.markdownRendererFactory();
        }
        return this._markdownRenderer;
    }

    @postConstruct()
    protected init(): void {
        this.id = AISessionsWidget.ID;
        this.title.label = AISessionsWidget.LABEL;
        this.title.caption = AISessionsWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('history');
        this.addClass('ai-sessions-view');

        this.toDispose.pushAll([
            this.sessionListService.onStateChanged(() => this.update()),
            this.sessionListService.onUnreadChanged(() => this.update())
        ]);

        this.update();
    }

    protected render(): React.ReactNode {
        const sections = this.sessionListService.getSections();
        const total = sections.active.length + sections.restored.length;

        if (total === 0) {
            return (
                <div className="ai-sessions-view-empty">
                    <span className={codicon('comment-discussion')} />
                    <p>{nls.localize('theia/ai-ide/noSessions', 'No chat sessions yet.')}</p>
                </div>
            );
        }

        const rows = this.sessionListService.buildRows(sections);

        const renderRow = createSessionRowRenderer({
            chatService: this.chatService,
            chatAgentService: this.chatAgentService,
            hoverService: this.hoverService,
            markdownRenderer: this.markdownRenderer,
            sessionListService: this.sessionListService,
            commandRegistry: this.commandRegistry,
            chatSessionItemActionContributions: this.chatSessionItemActionContributions
        });

        return (
            <div className="ai-sessions-view-content">
                <SessionsList
                    rows={rows}
                    renderRow={renderRow}
                />
            </div>
        );
    }
}
