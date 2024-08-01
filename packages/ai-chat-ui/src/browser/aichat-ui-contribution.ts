// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core';
import { Widget } from '@theia/core/lib/browser';
import { ChatCommands } from './chat-view-commands';
import { ChatViewWidget } from './chat-view-widget';

export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';

@injectable()
export class AIChatContribution extends AbstractViewContribution<ChatViewWidget> {

    constructor() {
        super({
            widgetId: ChatViewWidget.ID,
            widgetName: ChatViewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: AI_CHAT_TOGGLE_COMMAND_ID,
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ChatCommands.LOCK__WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked),
            isVisible: widget => this.withWidget(widget, chatWidget => !chatWidget.isLocked),
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.lock();
                return true;
            })
        });
        registry.registerCommand(ChatCommands.UNLOCK__WIDGET, {
            isEnabled: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked),
            isVisible: widget => this.withWidget(widget, chatWidget => chatWidget.isLocked),
            execute: widget => this.withWidget(widget, chatWidget => {
                chatWidget.unlock();
                return true;
            })
        });
    }

    protected withWidget(
        widget: Widget | undefined = this.tryGetWidget(),
        predicate: (output: ChatViewWidget) => boolean = () => true
    ): boolean | false {
        return widget instanceof ChatViewWidget ? predicate(widget) : false;
    }
}
