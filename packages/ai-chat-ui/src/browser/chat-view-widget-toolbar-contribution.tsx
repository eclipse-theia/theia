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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { AIChatContribution } from './ai-chat-ui-contribution';
import { Emitter, nls } from '@theia/core';
import { ChatCommands } from './chat-view-commands';

@injectable()
export class ChatViewWidgetToolbarContribution implements TabBarToolbarContribution {
    @inject(AIChatContribution)
    protected readonly chatContribution: AIChatContribution;

    protected readonly onChatWidgetStateChangedEmitter = new Emitter<void>();
    protected readonly onChatWidgetStateChanged = this.onChatWidgetStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.chatContribution.widget.then(widget => {
            widget.onStateChanged(() => this.onChatWidgetStateChangedEmitter.fire());
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: ChatCommands.SCROLL_LOCK_WIDGET.id,
            command: ChatCommands.SCROLL_LOCK_WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling Off'),
            onDidChange: this.onChatWidgetStateChanged,
            priority: 2
        });
        registry.registerItem({
            id: ChatCommands.SCROLL_UNLOCK_WIDGET.id,
            command: ChatCommands.SCROLL_UNLOCK_WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling On'),
            onDidChange: this.onChatWidgetStateChanged,
            priority: 2
        });
    }
}
