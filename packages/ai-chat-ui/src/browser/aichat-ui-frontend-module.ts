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

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory, bindViewContribution,  } from '@theia/core/lib/browser';
import { bindContributionProvider, CommandContribution } from '@theia/core';
import { AIChatContribution } from './aichat-ui-contribution';
import { ChatViewWidget } from './chat-view-widget';
import { createChatViewTreeWidget } from './chat-tree-view';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { ChatInputWidget } from './chat-input-widget';
import { ChatResponsePartRenderer } from './types';
import { MarkdownPartRenderer, TextPartRenderer } from './chat-response-renderer';
import { AIChatCommandContribution } from './ai-chat-command-contribution';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindViewContribution(bind, AIChatContribution);
    bindContributionProvider(bind, ChatResponsePartRenderer);

    bind(ChatViewWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: ChatViewWidget.ID,
        createWidget: () => context.container.get<ChatViewWidget>(ChatViewWidget)
    })).inSingletonScope();

    bind(ChatInputWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: ChatInputWidget.ID,
        createWidget: () => context.container.get<ChatInputWidget>(ChatInputWidget)
    })).inSingletonScope();

    bind(ChatViewTreeWidget).toDynamicValue(ctx =>
        createChatViewTreeWidget(ctx.container)
    );

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ChatViewTreeWidget.ID,
        createWidget: () => container.get(ChatViewTreeWidget)
    })).inSingletonScope();
    bind(ChatResponsePartRenderer).to(TextPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(MarkdownPartRenderer).inSingletonScope();

    bind(CommandContribution).to(AIChatCommandContribution);
});
