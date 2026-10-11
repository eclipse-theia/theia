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

import { AI_CHAT_HOME, ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { AIViewContribution, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { Command, CommandRegistry, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AISessionsWidget } from './ai-sessions-widget';

export const AI_SESSIONS_TOGGLE_COMMAND_ID = 'aiSessions:toggle';

export const AI_SESSIONS_NEW_SESSION = Command.toLocalizedCommand({
    id: 'aiSessions:newSession',
    iconClass: codicon('add'),
    category: ChatCommands.CHAT_CATEGORY,
    label: 'New Chat'
}, 'theia/ai-ide/newChat', ChatCommands.CHAT_CATEGORY_KEY);

@injectable()
export class AISessionsViewContribution extends AIViewContribution<AISessionsWidget> implements TabBarToolbarContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    constructor() {
        super({
            widgetId: AISessionsWidget.ID,
            widgetName: AISessionsWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left'
            },
            toggleCommandId: AI_SESSIONS_TOGGLE_COMMAND_ID
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(AI_SESSIONS_NEW_SESSION, this.commandHandlerFactory({
            execute: () => this.commandRegistry.executeCommand(AI_CHAT_HOME.id)
        }));
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: AI_SESSIONS_NEW_SESSION.id,
            command: AI_SESSIONS_NEW_SESSION.id,
            tooltip: nls.localizeByDefault('New Chat'),
            isVisible: widget => this.activationService.isActive && widget instanceof AISessionsWidget,
            when: ENABLE_AI_CONTEXT_KEY
        });
    }
}
