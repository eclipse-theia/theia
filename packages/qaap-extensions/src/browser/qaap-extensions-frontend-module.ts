// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-login.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { VariableContribution } from '@theia/variable-resolver/lib/browser';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser/variable-resolver-service';
import { QaapVariableResolverService } from './qaap-variable-resolver-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { CodeCompletionAgent, CodeCompletionAgentImpl } from '@theia/ai-code-completion/lib/browser/code-completion-agent';
import { WindowBlinkService } from '@theia/ai-core/lib/browser/window-blink-service';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { DebugFrontendContribution } from '@theia/memory-inspector/lib/browser/memory-inspector-frontend-contribution';
import { PreviewContribution } from '@theia/preview/lib/browser/preview-contribution';
import { WorkspaceFrontendContribution } from '@theia/workspace/lib/browser/workspace-frontend-contribution';
import { WebviewResourceCache } from '@theia/plugin-ext/lib/main/browser/webview/webview-resource-cache';
import { PluginViewWelcomePolicy } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-welcome-policy';
import { WorkspaceTrustDialogFactory } from '@theia/workspace/lib/browser/workspace-trust-dialog-factory';
import { QaapAiChatMobileContribution } from './qaap-ai-chat-mobile-contribution';
import { QaapAiPreferenceBrandingContribution, QaapAiPreferenceBrandingStartup } from './qaap-ai-preference-branding-contribution';
import { QaapHubActionsContribution } from './qaap-hub-actions-contribution';
import { QaapHubChatSyncContribution } from './qaap-hub-chat-sync-contribution';
import { QaapMobileAppTesterContribution } from './qaap-mobile-app-tester-contribution';
import { QaapMissionUndoContribution } from './qaap-mission-undo-contribution';
import { QaapPushNotificationContribution } from './qaap-push-notification-contribution';
import { QaapShellCommandPermissionService } from './qaap-shell-command-permission-service';
import { ShellCommandPermissionService } from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { QaapCodeCompletionAgentImpl } from './qaap-code-completion-agent';
import { QaapGettingStartedWidget } from './qaap-getting-started-widget';
import { QaapOutlineMobileContribution } from './qaap-outline-mobile-contribution';
import { QaapMemoryInspectorMobileContribution } from './qaap-memory-inspector-mobile-contribution';
import { QaapFileNavigatorContribution } from './qaap-file-navigator-contribution';
import { QaapWindowBlinkService } from './qaap-window-blink-service';
import { QaapPreviewContribution } from './qaap-preview-contribution';
import { QaapWorkspaceFrontendContribution } from './qaap-workspace-frontend-contribution';
import { QaapWebviewResourceCache } from './qaap-webview-resource-cache';
import { QaapPluginViewWelcomePolicy } from './qaap-plugin-view-welcome-policy';
import { QaapWorkspaceTrustDialogFactory } from './qaap-workspace-trust-dialog-factory';
import { createQaapFileNavigatorWidget } from './qaap-navigator-widget-factory';
import { QaapVsxExtensionsMobileContribution } from './qaap-vsx-extensions-mobile-contribution';
import { QaapAgentCompletionContribution } from './qaap-agent-completion-contribution';
import { QaapEditorVariableContribution } from './qaap-editor-variable-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(QaapAiChatMobileContribution).toSelf().inSingletonScope();
    rebind(AIChatContribution).toService(QaapAiChatMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapAiChatMobileContribution);

    bind(QaapOutlineMobileContribution).toSelf().inSingletonScope();
    rebind(OutlineViewContribution).toService(QaapOutlineMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapOutlineMobileContribution);

    bind(QaapMemoryInspectorMobileContribution).toSelf().inSingletonScope();
    rebind(DebugFrontendContribution).toService(QaapMemoryInspectorMobileContribution);
    bind(ShellLayoutTransformer).toService(QaapMemoryInspectorMobileContribution);

    rebind(FileNavigatorWidget).toDynamicValue(ctx => createQaapFileNavigatorWidget(ctx.container));

    bind(QaapFileNavigatorContribution).toSelf().inSingletonScope();
    rebind(FileNavigatorContribution).toService(QaapFileNavigatorContribution);

    bind(QaapWindowBlinkService).toSelf().inSingletonScope();
    rebind(WindowBlinkService).toService(QaapWindowBlinkService);

    bind(QaapCodeCompletionAgentImpl).toSelf().inSingletonScope();
    rebind(CodeCompletionAgentImpl).toService(QaapCodeCompletionAgentImpl);
    rebind(CodeCompletionAgent).toService(QaapCodeCompletionAgentImpl);

    bind(QaapAgentCompletionContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapAgentCompletionContribution);

    bind(QaapAiPreferenceBrandingContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapAiPreferenceBrandingContribution);
    bind(QaapAiPreferenceBrandingStartup).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapAiPreferenceBrandingStartup);

    bind(QaapHubActionsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapHubActionsContribution);
    bind(FrontendApplicationContribution).toService(QaapHubActionsContribution);

    bind(QaapMobileAppTesterContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapMobileAppTesterContribution);

    bind(QaapMissionUndoContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapMissionUndoContribution);

    bind(QaapHubChatSyncContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapHubChatSyncContribution);

    bind(QaapPushNotificationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapPushNotificationContribution);

    bind(QaapShellCommandPermissionService).toSelf().inSingletonScope();
    rebind(ShellCommandPermissionService).toService(QaapShellCommandPermissionService);

    bind(QaapWorkspaceFrontendContribution).toSelf().inSingletonScope();
    rebind(WorkspaceFrontendContribution).toService(QaapWorkspaceFrontendContribution);

    bind(QaapGettingStartedWidget).toSelf();
    rebind(GettingStartedWidget).toService(QaapGettingStartedWidget);

    bind(QaapPreviewContribution).toSelf().inSingletonScope();
    rebind(PreviewContribution).toService(QaapPreviewContribution);

    bind(QaapWorkspaceTrustDialogFactory).toSelf().inSingletonScope();
    rebind(WorkspaceTrustDialogFactory).toService(QaapWorkspaceTrustDialogFactory);

    rebind(WebviewResourceCache).to(QaapWebviewResourceCache).inSingletonScope();

    bind(QaapPluginViewWelcomePolicy).toSelf().inSingletonScope();
    bind(PluginViewWelcomePolicy).toService(QaapPluginViewWelcomePolicy);

    bind(QaapVsxExtensionsMobileContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapVsxExtensionsMobileContribution);

    bind(QaapEditorVariableContribution).toSelf().inSingletonScope();
    bind(VariableContribution).toService(QaapEditorVariableContribution);

    bind(QaapVariableResolverService).toSelf().inSingletonScope();
    rebind(VariableResolverService).toService(QaapVariableResolverService);
});
