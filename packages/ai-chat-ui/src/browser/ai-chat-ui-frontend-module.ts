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
import '../../src/browser/style/tool-call-rendering.css';
import '../../src/browser/style/mermaid-rendering.css';
import '../../src/browser/style/mcp-app-frame.css';
import { bindRootContributionProvider, CommandContribution, MenuContribution } from '@theia/core';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory, KeybindingContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { EditorSelectionResolver } from '@theia/editor/lib/browser/editor-manager';
import { AIChatContribution } from './ai-chat-ui-contribution.js';
import { AIChatInputConfiguration, AIChatInputWidget } from './chat-input-widget.js';
import { ChatNodeToolbarActionContribution, DefaultChatNodeToolbarActionContribution } from './chat-node-toolbar-action-contribution.js';
import { ChatResponsePartRenderer } from './chat-response-part-renderer.js';
import {
    CodePartRenderer,
    CodePartRendererAction,
    CommandPartRenderer,
    CompactionPartRenderer,
    CopyToClipboardButtonAction,
    ErrorPartRenderer,
    HorizontalLayoutPartRenderer,
    InsertCodeAtCursorButtonAction,
    MarkdownPartRenderer,
    MermaidPartRenderer,
    ToolCallPartRenderer,
    ServerToolCallPartRenderer,
    NotAvailableToolCallRenderer,
    ThinkingPartRenderer,
    ProgressPartRenderer,
    DelegationToolRenderer,
    TextPartRenderer,
} from './chat-response-renderer/index.js';
import { UnknownPartRenderer } from './chat-response-renderer/unknown-part-renderer.js';
import {
    GitHubSelectionResolver,
    TextFragmentSelectionResolver,
    TypeDocSymbolSelectionResolver,
} from './chat-response-renderer/ai-selection-resolver.js';
import { QuestionPartRenderer } from './chat-response-renderer/question-part-renderer.js';
import { ExternalResourceAllowlistContribution } from './chat-response-renderer/external-resource-allowlist-contribution.js';
import { ChatFindContribution } from './chat-find/chat-find-contribution.js';
import { ChatFindMatcher } from './chat-find/chat-find-matcher.js';
import { createChatViewTreeWidget, ChatWelcomeMessageProvider } from './chat-tree-view/index.js';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget.js';
import { ChatViewMenuContribution } from './chat-view-contribution.js';
import { ChatViewLanguageContribution } from './chat-view-language-contribution.js';
import { bindChatViewPreferences } from './chat-view-preferences.js';
import { ChatViewWidget } from './chat-view-widget.js';
import { ChatBannerProvider } from './chat-banner-provider.js';
import { ChatBannerWidget } from './chat-banner-widget.js';
import { ChatViewWidgetToolbarContribution } from './chat-view-widget-toolbar-contribution.js';
import { ContextVariablePicker } from './context-variable-picker.js';
import { ChangeSetActionRenderer, ChangeSetActionService } from './change-set-actions/change-set-action-service.js';
import { ChangeSetAcceptAction } from './change-set-actions/change-set-accept-action.js';
import { AIChatTreeInputArgs, AIChatTreeInputConfiguration, AIChatTreeInputFactory, AIChatTreeInputWidget } from './chat-tree-view/chat-view-tree-input-widget.js';
import { SubChatWidget, SubChatWidgetFactory } from './chat-tree-view/sub-chat-widget.js';
import { ChatInputHistoryService } from './chat-input-history.js';
import { ChatInputHistoryContribution } from './chat-input-history-contribution.js';
import { ChatInputModeContribution } from './chat-input-mode-contribution.js';
import { ChatInputPasteContribution } from './chat-input-paste-contribution.js';
import { ChatInputFocusService } from './chat-input-focus-service.js';
import { ChatFocusContribution } from './chat-focus-contribution.js';
import { ChatCapabilitiesService, ChatCapabilitiesServiceImpl } from './chat-capabilities-service.js';
import { ChatInputCapabilitiesContribution } from './chat-input-capabilities-contribution.js';
import { GenericCapabilitiesContribution, GenericCapabilitiesService, GenericCapabilitiesServiceImpl } from './generic-capabilities-service.js';
import { ToolConfirmationKeybindingContribution } from './tool-confirmation-keybinding-contribution.js';
import { ChatSessionNotificationContribution } from './chat-session-notification-contribution.js';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bindChatViewPreferences(bind);

    bindViewContribution(bind, AIChatContribution);
    bind(FrontendApplicationContribution).toService(AIChatContribution);
    bind(TabBarToolbarContribution).toService(AIChatContribution);

    bind(ChatInputHistoryService).toSelf().inSingletonScope();
    bind(ChatInputHistoryContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputHistoryContribution);
    bind(KeybindingContribution).toService(ChatInputHistoryContribution);

    bind(ChatInputFocusService).toSelf().inSingletonScope();

    bind(ChatInputModeContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputModeContribution);
    bind(KeybindingContribution).toService(ChatInputModeContribution);

    bind(ChatInputPasteContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputPasteContribution);
    bind(KeybindingContribution).toService(ChatInputPasteContribution);

    bind(ChatFocusContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatFocusContribution);
    bind(KeybindingContribution).toService(ChatFocusContribution);

    bind(ChatFindContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatFindContribution);
    bind(KeybindingContribution).toService(ChatFindContribution);

    bind(ChatCapabilitiesServiceImpl).toSelf().inSingletonScope();
    bind(ChatCapabilitiesService).toService(ChatCapabilitiesServiceImpl);

    bindRootContributionProvider(bind, GenericCapabilitiesContribution);
    bind(GenericCapabilitiesServiceImpl).toSelf().inSingletonScope();
    bind(GenericCapabilitiesService).toService(GenericCapabilitiesServiceImpl);

    bind(ChatInputCapabilitiesContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatInputCapabilitiesContribution);
    bind(KeybindingContribution).toService(ChatInputCapabilitiesContribution);

    bind(ToolConfirmationKeybindingContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ToolConfirmationKeybindingContribution);
    bind(KeybindingContribution).toService(ToolConfirmationKeybindingContribution);

    bind(ChatSessionNotificationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ChatSessionNotificationContribution);

    bindRootContributionProvider(bind, ChatResponsePartRenderer);
    bindRootContributionProvider(bind, ChatWelcomeMessageProvider);
    bindRootContributionProvider(bind, ChatBannerProvider);
    bind(ChatBannerWidget).toSelf();

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

    bind(ChatFindMatcher).toSelf().inSingletonScope();
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
    bind(MermaidPartRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(MermaidPartRenderer);
    bind(ChatResponsePartRenderer).to(CommandPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ToolCallPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ServerToolCallPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(NotAvailableToolCallRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ErrorPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ThinkingPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CompactionPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(QuestionPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(ProgressPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(TextPartRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(DelegationToolRenderer).inSingletonScope();
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
    bind(ExternalResourceAllowlistContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ExternalResourceAllowlistContribution);
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
