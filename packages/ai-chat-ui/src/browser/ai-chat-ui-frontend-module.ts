// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses as the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// Thin (lazy) registration of the chat: the only ai-chat-ui module that ends
// up in the static bundle. It only holds the chat preferences, the tab
// command and an asynchronous widget factory; the full chat DI tree is
// loaded via dynamic import() on first widget creation
// (see on-demand-chat-registrations.ts).

import { bindViewContribution, AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { isOSX } from '@theia/core/lib/common/os';
import { ContainerModule, injectable, interfaces } from '@theia/core/shared/inversify';
import { bindChatViewPreferences } from './chat-view-preferences';
import { AI_CHAT_TOGGLE_COMMAND_ID, CHAT_VIEW_WIDGET_ID, CHAT_VIEW_WIDGET_LABEL } from './chat-contract';

/** Guard against loading the on-demand registrations more than once. */
const CHAT_UI_MODULE_LOADED = Symbol.for('aiChatUiOnDemandRegistrationsLoaded');

/**
 * Lightweight chat tab: commands, menus and keybindings are registered like
 * the original AIChatContribution, but without importing the widget and the
 * chat services.
 */
@injectable()
export class LazyChatViewContribution extends AbstractViewContribution<Widget> {
    constructor() {
        super({
            widgetId: CHAT_VIEW_WIDGET_ID,
            widgetName: CHAT_VIEW_WIDGET_LABEL,
            defaultWidgetOptions: { area: 'right', rank: 100 },
            toggleCommandId: AI_CHAT_TOGGLE_COMMAND_ID,
            toggleKeybinding: isOSX ? 'ctrl+cmd+i' : 'ctrl+alt+i'
        });
    }
}

export default new ContainerModule((bind: interfaces.Bind) => {
    bindChatViewPreferences(bind);
    bindViewContribution(bind, LazyChatViewContribution);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: CHAT_VIEW_WIDGET_ID,
        createWidget: async (): Promise<Widget> => {
            if (!container.isBound(CHAT_UI_MODULE_LOADED)) {
                container.bind(CHAT_UI_MODULE_LOADED).toConstantValue(true);
                const { default: chatRegistrations, registerChatContributions } =
                    await import('./on-demand-chat-registrations');
                container.load(chatRegistrations);
                await registerChatContributions(container);
            }
            const { ChatViewWidget } = await import('./chat-view-widget');
            return container.get<Widget>(ChatViewWidget);
        }
    })).inSingletonScope();
});
