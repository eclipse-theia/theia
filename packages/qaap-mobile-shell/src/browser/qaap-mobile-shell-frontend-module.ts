// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/mobile-workbench.css';
import '../../src/browser/style/qaap-catalog-card-tap-feedback.css';
import '../../src/browser/style/qaap-mobile-touch-scroll.css';
import '../../src/browser/style/qaap-empty-workbench-brand.css';
import '../../src/browser/style/qaap-project-bootstrap.css';
import '../../src/browser/style/qaap-chat-mic.css';
import '../../src/browser/style/qaap-chat-select-dropdown.css';
import '../../src/browser/style/qaap-diff-review.css';
import '../../src/browser/style/qaap-work-mission-control.css';
import '../../src/browser/style/qaap-work-hub-sessions-sidebar.css';
import '@theia/ai-claude-code/src/browser/style/claude-code-tool-renderers.css';

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';

import { bindToolProvider } from '@theia/ai-core/lib/common';
import { AIVariableContribution } from '@theia/ai-core/lib/common/variable-service';
import { ContainerModule } from '@theia/core/shared/inversify';
import { PreferenceContribution } from '@theia/core/lib/common/preferences/preference-schema';
import { QaapChatPreferencesContribution } from './qaap-chat-preferences-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { SCM_WIDGET_FACTORY_ID } from '@theia/scm/lib/browser/scm-contribution';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { ChatViewTreeWidget } from '@theia/ai-chat-ui/lib/browser/chat-tree-view/chat-view-tree-widget';
import { createQaapChatViewTreeWidget } from './qaap-chat-view-tree-container';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import {
    QaapBootstrapInstallTool,
    QaapBootstrapOpenPreviewTool,
    QaapBootstrapRunDevTool,
    QaapBootstrapStatusTool,
} from './qaap-bootstrap-tool-providers';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandContribution } from '@theia/core/lib/common/command';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { MobileOneColumnShellContribution } from './mobile-one-column-shell-contribution';
import { QaapShellLayoutRestoreContribution } from './qaap-shell-layout-restore-contribution';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileThemeChromeContribution } from './mobile-theme-chrome-contribution';
import { MobileEditorGestureContribution } from './mobile-editor-gesture-contribution';
import { QaapEmptyWorkbenchBrandingContribution } from './qaap-empty-workbench-branding-contribution';
import { QaapWatermarkCommandsContribution } from './qaap-watermark-commands-contribution';
import { LongPressContextMenuContribution } from './long-press-context-menu';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import {
    MobileProjectAIChatInputWidget,
    MobileProjectChatViewWidget,
    MobileProjectChatViewWidgetFactory,
} from './mobile-project-ai-chat-input-widget';
import { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsReadmeContribution } from './mobile-projects-readme-contribution';
import { QaapProjectBootstrapDetector } from './qaap-project-bootstrap-detector';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { QaapProjectBootstrapContribution } from './qaap-project-bootstrap-contribution';
import { MobileTouchScrollContribution } from './mobile-touch-scroll-contribution';
import { QaapBootstrapVariableContribution } from './qaap-bootstrap-variable-contribution';
import { createQaapScmWidgetContainer } from './qaap-scm-tree-widget';
import { QaapSelectComponentOverlayContribution } from './qaap-select-component-overlay-contribution';
import { QaapChatMicTranscribeContribution } from './qaap-chat-mic-transcribe-contribution';
import { QaapChatInputCodexLayoutContribution } from './qaap-chat-input-codex-contribution';
import { MobileConnectionStatusContribution } from './mobile-connection-status-contribution';
import { MobileChatSessionRestoreContribution } from './mobile-chat-session-restore-contribution';
import { QaapQaiqChatAgentContribution } from './qaap-qaiq-chat-agent-contribution';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import { QaapQaiqBashToolRenderer } from './qaap-qaiq-bash-tool-renderer';
import { QaapQaiqGenericToolRenderer } from './qaap-qaiq-generic-tool-renderer';
import { QaapMarkdownPartRenderer } from './qaap-markdown-part-renderer';
import { QaapDesktopTerminalLayoutContribution } from './qaap-desktop-terminal-layout-contribution';
import { QaapCommitMessageAi } from './qaap-commit-message-ai';
import { QaapDiffReviewWidget } from './qaap-diff-review-widget';
import { QaapDiffReviewContribution } from './qaap-diff-review-contribution';
import { QaapWorkHubDiffService } from './qaap-work-hub-diff-service';
export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    rebind(ChatViewTreeWidget).toDynamicValue(ctx =>
        createQaapChatViewTreeWidget(ctx.container)
    );
    bind(MobileProjectsActiveTasks).toSelf().inSingletonScope();
    bind(MobileProjectsConversations).toSelf().inSingletonScope();
    bind(MobileWorkHubInboxStream).toSelf().inSingletonScope();
    bind(MobileProjectsConversationFlags).toSelf().inSingletonScope();
    // Transient binding so each `getOrCreateWidget` call (with a unique options.id) gets a fresh
    // instance — the workspace Agent AI view already mounts an AIChatInputWidget with a fixed
    // resource URI, and a second one would collide unless this subclass mints its own URI.
    bind(MobileProjectAIChatInputWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: 'mobile-projects-chat-input',
        createWidget: () => container.get(MobileProjectAIChatInputWidget),
    })).inSingletonScope();
    bind(MobileProjectChatViewWidgetFactory).toFactory(ctx => (id: string) => {
        const child = ctx.container.createChild();
        child.bind(AIChatInputWidget).to(MobileProjectAIChatInputWidget);
        child.bind(ChatViewTreeWidget).toDynamicValue(treeCtx =>
            createQaapChatViewTreeWidget(treeCtx.container)
        );
        child.bind(ChatViewWidget).to(MobileProjectChatViewWidget);
        child.bind(MobileProjectChatViewWidget).toSelf();
        const widget = child.get(MobileProjectChatViewWidget);
        widget.id = `mobile-projects-chat-view-${id}`;
        widget.node.classList.add('theia-mobile-projects-real-agent-view');
        return widget;
    });
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: SCM_WIDGET_FACTORY_ID,
        createWidget: () => createQaapScmWidgetContainer(container).get(ScmWidget)
    })).inSingletonScope();
    bind(MobileProjectsService).toSelf().inSingletonScope();
    bind(MobileProjectsReadmeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileProjectsReadmeContribution);
    bind(MobileOneColumnShellContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOneColumnShellContribution);
    bind(CommandContribution).toService(MobileOneColumnShellContribution);
    bind(QaapShellLayoutRestoreContribution).toSelf().inSingletonScope();
    bind(ShellLayoutTransformer).toService(QaapShellLayoutRestoreContribution);
    bind(QaapDesktopTerminalLayoutContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapDesktopTerminalLayoutContribution);
    bind(MobileOnboardingTutorialContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOnboardingTutorialContribution);
    bind(CommandContribution).toService(MobileOnboardingTutorialContribution);
    bind(MobileThemeChromeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileThemeChromeContribution);
    bind(MobileEditorGestureContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileEditorGestureContribution);

    bind(QaapWatermarkCommandsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapWatermarkCommandsContribution);
    bind(KeybindingContribution).toService(QaapWatermarkCommandsContribution);

    bind(QaapEmptyWorkbenchBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapEmptyWorkbenchBrandingContribution);

    bind(LongPressContextMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(LongPressContextMenuContribution);

    bind(QaapProjectBootstrapDetector).toSelf().inSingletonScope();
    bind(QaapProjectBootstrapService).toSelf().inSingletonScope();
    bind(MobileTouchScrollContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileTouchScrollContribution);
    bind(QaapSelectComponentOverlayContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapSelectComponentOverlayContribution);
    bind(QaapChatMicTranscribeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapChatMicTranscribeContribution);
    bind(QaapChatInputCodexLayoutContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapChatInputCodexLayoutContribution);
    bind(QaapChatPreferencesContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapChatPreferencesContribution);
    bind(MobileConnectionStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileConnectionStatusContribution);
    bind(MobileChatSessionRestoreContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileChatSessionRestoreContribution);
    bind(QaapBackgroundContextProvider).toSelf().inSingletonScope();
    bind(QaapQaiqChatAgentContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapQaiqChatAgentContribution);

    bind(QaapQaiqBashToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(QaapQaiqBashToolRenderer);
    bind(QaapQaiqGenericToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(QaapQaiqGenericToolRenderer);

    bind(QaapMarkdownPartRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(QaapMarkdownPartRenderer);

    bind(QaapProjectBootstrapContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapProjectBootstrapContribution);

    bindToolProvider(QaapBootstrapStatusTool, bind);
    bindToolProvider(QaapBootstrapInstallTool, bind);
    bindToolProvider(QaapBootstrapRunDevTool, bind);
    bindToolProvider(QaapBootstrapOpenPreviewTool, bind);

    bind(QaapBootstrapVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(QaapBootstrapVariableContribution);

    bind(QaapCommitMessageAi).toSelf().inSingletonScope();
    bind(QaapWorkHubDiffService).toSelf().inSingletonScope();
    bind(QaapDiffReviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: QaapDiffReviewWidget.ID,
        createWidget: () => container.get(QaapDiffReviewWidget),
    })).inSingletonScope();
    bind(QaapDiffReviewContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapDiffReviewContribution);
    bind(FrontendApplicationContribution).toService(QaapDiffReviewContribution);
});
