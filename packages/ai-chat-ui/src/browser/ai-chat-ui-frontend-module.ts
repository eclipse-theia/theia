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

import '../../src/browser/style/index.css';
import { bindRootContributionProvider, CommandContribution, MenuContribution } from '@theia/core';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory, KeybindingContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { EditorSelectionResolver } from '@theia/editor/lib/browser/editor-manager';
import { AIChatContribution } from './ai-chat-ui-contribution';
import { AIChatNavigationService } from './ai-chat-navigation-service';
import { AIChatInputConfiguration, AIChatInputWidget } from './chat-input-widget';
import { ChatNodeToolbarActionContribution, DefaultChatNodeToolbarActionContribution } from './chat-node-toolbar-action-contribution';
import { ChatResponsePartRenderer } from './chat-response-part-renderer';
import {
    CodePartRenderer,
    CodePartRendererAction,
    CommandPartRenderer,
    CopyToClipboardButtonAction,
    ErrorPartRenderer,
    HorizontalLayoutPartRenderer,
    InsertCodeAtCursorButtonAction,
    MarkdownPartRenderer,
    ToolCallPartRenderer,
    NotAvailableToolCallRenderer,
    ThinkingPartRenderer,
    ProgressPartRenderer,
    DelegationResponseRenderer,
    TextPartRenderer,
} from './chat-response-renderer';
import { UnknownPartRenderer } from './chat-response-renderer/unknown-part-renderer';
import {
    GitHubSelectionResolver,
    TextFragmentSelectionResolver,
    TypeDocSymbolSelectionResolver,
} from './chat-response-renderer/ai-selection-resolver';
import { QuestionPartRenderer } from './chat-response-renderer/question-part-renderer';
import { createChatViewTreeWidget, ChatWelcomeMessageProvider } from './chat-tree-view';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { ChatViewMenuContribution } from './chat-view-contribution';
import { ChatViewLanguageContribution } from './chat-view-language-contribution';
import { ChatViewWidget } from './chat-view-widget';
import { ChatViewWidgetToolbarContribution } from './chat-view-widget-toolbar-contribution';
import { ContextVariablePicker } from './context-variable-picker';
import { ChangeSetActionRenderer, ChangeSetActionService } from './change-set-actions/change-set-action-service';
import { ChangeSetAcceptAction } from './change-set-actions/change-set-accept-action';
import { AIChatTreeInputArgs, AIChatTreeInputConfiguration, AIChatTreeInputFactory, AIChatTreeInputWidget } from './chat-tree-view/chat-view-tree-input-widget';
import { SubChatWidget, SubChatWidgetFactory } from './chat-tree-view/sub-chat-widget';
import { ChatInputHistoryService } from './chat-input-history';
import { ChatInputHistoryContribution } from './chat-input-history-contribution';
import { ChatInputModeContribution } from './chat-input-mode-contribution';
import { ChatInputFocusService } from './chat-input-focus-service';
import { ChatFocusContribution } from './chat-focus-contribution';
import { ChatCapabilitiesService, ChatCapabilitiesServiceImpl } from './chat-capabilities-service';
import { ChatInputCapabilitiesContribution } from './chat-input-capabilities-contribution';
import { GenericCapabilitiesContribution, GenericCapabilitiesService, GenericCapabilitiesServiceImpl } from './generic-capabilities-service';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(AIChatNavigationService).toSelf().inSingletonScope();

    bindViewContribution(bind, AIChatContribution);
    bind(TabBarToolbarContribution).toService(AIChatContribution);

    bind(ChatInputHistoryService).toSelf().inSingletonScope();
    bind(ChatInputHistoryContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputHistoryContribution);
    bind(KeybindingContribution).toService(ChatInputHistoryContribution);

    bind(ChatInputFocusService).toSelf().inSingletonScope();

    bind(ChatInputModeContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputModeContribution);
    bind(KeybindingContribution).toService(ChatInputModeContribution);

    bind(ChatFocusContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatFocusContribution);
    bind(KeybindingContribution).toService(ChatFocusContribution);

    bind(ChatCapabilitiesServiceImpl).toSelf().inSingletonScope();
    bind(ChatCapabilitiesService).toService(ChatCapabilitiesServiceImpl);

    bindContributionProvider(bind, GenericCapabilitiesContribution);
    bind(GenericCapabilitiesServiceImpl).toSelf().inSingletonScope();
    bind(GenericCapabilitiesService).toService(GenericCapabilitiesServiceImpl);

    bind(ChatInputCapabilitiesContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputCapabilitiesContribution);
    bind(KeybindingContribution).toService(ChatInputCapabilitiesContribution);

    bindRootContributionProvider(bind, ChatResponsePartRenderer);
    bindRootContributionProvider(bind, ChatWelcomeMessageProvider);

    bindChatViewWidget(bind);

    bind(AIChatInputWidget).toSelf();
    bind(AIChatInputConfiguration).toConstantValue({
        showContext: true,
        showPinnedAgent: true,
        showChangeSet: true,
        showCapabilities: true,
        enablePromptHistory: true
    } satisfies AIChatInputConfiguration);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: AIChatInputWidget.ID,
        createWidget: () => container.get(AIChatInputWidget)
    })).inSingletonScope();

    bind(ChatViewTreeWidget).toDynamicValue(ctx =>
        createChatViewTreeWidget(ctx.container)
    );
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ChatViewTreeWidget.ID,
        createWidget: () => container.get(ChatViewTreeWidget)
    })).inSingletonScope();

    bind(AIChatTreeInputFactory).toFactory(ctx => (args: AIChatTreeInputArgs) => {
        const container = ctx.container.createChild();
        container.bind(AIChatTreeInputArgs).toConstantValue(args);
        container.bind(AIChatTreeInputConfiguration).toConstantValue({
            showContext: true,
            showPinnedAgent: true,
            showChangeSet: false,
            showSuggestions: false,
            showCapabilities: true,
            enablePromptHistory: false
        } satisfies AIChatInputConfiguration);
        container.bind(AIChatTreeInputWidget).toSelf().inSingletonScope();
        const widget = container.get(AIChatTreeInputWidget);
        const noOp = () => { };
        widget.node.classList.add('chat-input-widget');
        widget.chatModel = args.node.request.session;
        widget.initialValue = args.initialValue;
        widget.setEnabled(true);
        widget.onQuery = args.onQuery;
        // We need to set those values here, otherwise the widget will throw an error
        widget.onUnpin = args.onUnpin ?? noOp;
        widget.onCancel = args.onCancel ?? noOp;
        widget.onDeleteChangeSet = args.onDeleteChangeSet ?? noOp;
        widget.onDeleteChangeSetElement = args.onDeleteChangeSetElement ?? noOp;
        return widget;
    });

    bind(ContextVariablePicker).toSelf().inSingletonScope();

    bind(ChatResponsePartRenderer).to(HorizontalLayoutPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ErrorPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(MarkdownPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CodePartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CommandPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ToolCallPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(NotAvailableToolCallRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ErrorPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ThinkingPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(QuestionPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ProgressPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(TextPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(DelegationResponseRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(UnknownPartRenderer).inSingletonScope();
    [CommandContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).to(ChatViewMenuContribution).inSingletonScope()
    );

    bindRootContributionProvider(bind, CodePartRendererAction);
    bindRootContributionProvider(bind, ChangeSetActionRenderer);
    bind(CopyToClipboardButtonAction).toSelf().inSingletonScope();
    bind(CodePartRendererAction).toService(CopyToClipboardButtonAction);
    bind(InsertCodeAtCursorButtonAction).toSelf().inSingletonScope();
    bind(CodePartRendererAction).toService(InsertCodeAtCursorButtonAction);

    bind(EditorSelectionResolver).to(GitHubSelectionResolver).inSingletonScope();
    bind(EditorSelectionResolver).to(TypeDocSymbolSelectionResolver).inSingletonScope();
    bind(EditorSelectionResolver).to(TextFragmentSelectionResolver).inSingletonScope();

    bind(ChatViewWidgetToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(ChatViewWidgetToolbarContribution);

    bind(FrontendApplicationContribution).to(ChatViewLanguageContribution).inSingletonScope();
    bind(ChangeSetActionService).toSelf().inSingletonScope();
    bind(ChangeSetAcceptAction).toSelf().inSingletonScope();
    bind(ChangeSetActionRenderer).toService(ChangeSetAcceptAction);

    bindRootContributionProvider(bind, ChatNodeToolbarActionContribution);
    bind(DefaultChatNodeToolbarActionContribution).toSelf().inSingletonScope();
    bind(ChatNodeToolbarActionContribution).toService(DefaultChatNodeToolbarActionContribution);

    bind(SubChatWidgetFactory).toFactory(ctx => () => {
        const container = ctx.container.createChild();
        container.bind(SubChatWidget).toSelf().inSingletonScope();
        const widget = container.get(SubChatWidget);
        return widget;
    });

});

function bindChatViewWidget(bind: interfaces.Bind): void {
    let chatViewWidget: ChatViewWidget | undefined;
    bind(ChatViewWidget).toSelf();

    bind(WidgetFactory).toDynamicValue(context => ({
        id: ChatViewWidget.ID,
        createWidget: () => {
            if (chatViewWidget?.isDisposed !== false) {
                chatViewWidget = context.container.get<ChatViewWidget>(ChatViewWidget);
            }
            return chatViewWidget;
        }
    })).inSingletonScope();
}
