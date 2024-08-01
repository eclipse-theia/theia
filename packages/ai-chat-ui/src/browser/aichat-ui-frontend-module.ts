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

import { bindContributionProvider, CommandContribution } from '@theia/core';
import { bindViewContribution, WidgetFactory, } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AIChatCommandContribution } from './ai-chat-command-contribution';
import { AIChatContribution } from './aichat-ui-contribution';
import { ChatInputWidget } from './chat-input-widget';
import { CodePartRenderer, CommandPartRenderer, HorizontalLayoutPartRenderer, MarkdownPartRenderer, TextPartRenderer, ToolCallPartRenderer } from './chat-response-renderer';
import { createChatViewTreeWidget } from './chat-tree-view';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { ChatViewWidget } from './chat-view-widget';
import { ChatResponsePartRenderer } from './types';

import { EditorManager } from '@theia/editor/lib/browser';
import '../../src/browser/style/index.css';
import {
    AIEditorManager, AIEditorSelectionResolver,
    GitHubSelectionResolver, TextFragmentSelectionResolver, TypeDocSymbolSelectionResolver
} from './chat-response-renderer/ai-editor-manager';
import { ChatViewWidgetToolbarContribution } from './chat-view-widget-toolbar-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export default new ContainerModule((bind, _ubind, _isBound, rebind) => {
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
    bind(ChatResponsePartRenderer).to(HorizontalLayoutPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(TextPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(MarkdownPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CodePartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CommandPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ToolCallPartRenderer).inSingletonScope();
    bind(CommandContribution).to(AIChatCommandContribution);

    bind(AIEditorManager).toSelf().inSingletonScope();
    rebind(EditorManager).toService(AIEditorManager);

    bindContributionProvider(bind, AIEditorSelectionResolver);
    bind(AIEditorSelectionResolver).to(GitHubSelectionResolver).inSingletonScope();
    bind(AIEditorSelectionResolver).to(TypeDocSymbolSelectionResolver).inSingletonScope();
    bind(AIEditorSelectionResolver).to(TextFragmentSelectionResolver).inSingletonScope();

    bind(ChatViewWidgetToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(ChatViewWidgetToolbarContribution);
});
