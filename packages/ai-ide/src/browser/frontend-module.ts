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

import { ContainerModule } from '@theia/core/shared/inversify';
import { ChatAgent, DefaultChatAgentId, FallbackChatAgentId } from '@theia/ai-chat/lib/common';
import { Agent, AIVariableContribution, bindToolProvider } from '@theia/ai-core/lib/common';
import { ArchitectAgent } from './architect-agent';
import { CoderAgent } from './coder-agent';
import { SummarizeSessionCommandContribution } from './summarize-session-command-contribution';
import {
    FileContentFunction,
    FileDiagnosticProvider,
    FindFilesByPattern,
    GetWorkspaceDirectoryStructure,
    GetWorkspaceFileList,
    WorkspaceFunctionScope
} from './workspace-functions';
import { WorkspaceSearchProvider } from './workspace-search-provider';
import {
    FrontendApplicationContribution,
    WidgetFactory,
    bindViewContribution,
    RemoteConnectionProvider,
    ServiceConnectionProvider
} from '@theia/core/lib/browser';
import { TaskListProvider, TaskRunnerProvider } from './workspace-task-provider';
import {
    LaunchListProvider,
    LaunchRunnerProvider,
    LaunchStopProvider,
} from './workspace-launch-provider';
import { WorkspacePreferencesSchema } from '../common/workspace-preferences';
import {
    ClearFileChanges,
    GetProposedFileState,
    ReplaceContentInFileFunctionHelper,
    SuggestFileReplacements,
    SuggestFileReplacements_Simple,
    SimpleSuggestFileReplacements,
    SuggestFileContent,
    WriteFileContent,
    WriteFileReplacements,
    SimpleWriteFileReplacements,
    FileChangeSetTitleProvider,
    DefaultFileChangeSetTitleProvider,
    ReplaceContentInFileFunctionHelperV2
} from './file-changeset-functions';
import { OrchestratorChatAgent, OrchestratorChatAgentId } from '../common/orchestrator-chat-agent';
import { UniversalChatAgent, UniversalChatAgentId } from '../common/universal-chat-agent';
import { AppTesterChatAgent } from './app-tester-chat-agent';
import { GitHubChatAgent } from './github-chat-agent';
import { CommandChatAgent } from '../common/command-chat-agents';
import { ListChatContext, ResolveChatContext, AddFileToChatContext } from './context-functions';
import { AIAgentConfigurationWidget } from './ai-configuration/agent-configuration-widget';
import { AIConfigurationSelectionService } from './ai-configuration/ai-configuration-service';
import { AIAgentConfigurationViewContribution } from './ai-configuration/ai-configuration-view-contribution';
import { AIConfigurationContainerWidget } from './ai-configuration/ai-configuration-widget';
import { AIVariableConfigurationWidget } from './ai-configuration/variable-configuration-widget';
import { ContextFilesVariableContribution } from '../common/context-files-variable';
import { AIToolsConfigurationWidget } from './ai-configuration/tools-configuration-widget';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TemplatePreferenceContribution } from './template-preference-contribution';
import { AIMCPConfigurationWidget } from './ai-configuration/mcp-configuration-widget';
import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { IdeChatWelcomeMessageProvider } from './ide-chat-welcome-message-provider';
import { AITokenUsageConfigurationWidget } from './ai-configuration/token-usage-configuration-widget';
import { TaskContextSummaryVariableContribution } from './task-background-summary-variable';
import { GitHubRepoVariableContribution } from './github-repo-variable-contribution';
import { TaskContextFileStorageService } from './task-context-file-storage-service';
import { TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { CommandContribution, PreferenceContribution } from '@theia/core';
import { AIPromptFragmentsConfigurationWidget } from './ai-configuration/prompt-fragments-configuration-widget';
import { BrowserAutomation, browserAutomationPath } from '../common/browser-automation-protocol';
import { GitHubRepoService, githubRepoServicePath } from '../common/github-repo-protocol';
import { CloseBrowserProvider, IsBrowserRunningProvider, LaunchBrowserProvider, QueryDomProvider } from './app-tester-chat-functions';
import { ModelAliasesConfigurationWidget } from './ai-configuration/model-aliases-configuration-widget';
import { aiIdePreferenceSchema } from '../common/ai-ide-preferences';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { AIIdeActivationServiceImpl } from './ai-ide-activation-service';
import { AiConfigurationPreferences } from '../common/ai-configuration-preferences';
import { TaskContextAgent } from './task-context-agent';
import { ProjectInfoAgent } from './project-info-agent';
import { SuggestTerminalCommand } from './ai-terminal-functions';
import { ContextFileValidationService } from '@theia/ai-chat/lib/browser/context-file-validation-service';
import { ContextFileValidationServiceImpl } from './context-file-validation-service-impl';
import { RememberCommandContribution } from './remember-command-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(PreferenceContribution).toConstantValue({ schema: aiIdePreferenceSchema });
    bind(PreferenceContribution).toConstantValue({ schema: WorkspacePreferencesSchema });

    bind(AIIdeActivationServiceImpl).toSelf().inSingletonScope();
    // rebinds the default implementation of '@theia/ai-core'
    rebind(AIActivationService).toService(AIIdeActivationServiceImpl);

    bind(ArchitectAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ArchitectAgent);
    bind(ChatAgent).toService(ArchitectAgent);

    bind(CoderAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CoderAgent);
    bind(ChatAgent).toService(CoderAgent);

    bind(TaskContextAgent).toSelf().inSingletonScope();
    bind(Agent).toService(TaskContextAgent);
    bind(ProjectInfoAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ProjectInfoAgent);
    bind(ChatAgent).toService(ProjectInfoAgent);

    bind(OrchestratorChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(OrchestratorChatAgent);
    bind(ChatAgent).toService(OrchestratorChatAgent);

    bind(UniversalChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(UniversalChatAgent);
    bind(ChatAgent).toService(UniversalChatAgent);

    bind(AppTesterChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AppTesterChatAgent);
    bind(ChatAgent).toService(AppTesterChatAgent);

    bind(GitHubChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(GitHubChatAgent);
    bind(ChatAgent).toService(GitHubChatAgent);
    bind(BrowserAutomation).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<BrowserAutomation>(browserAutomationPath);
    }).inSingletonScope();

    bind(CommandChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CommandChatAgent);
    bind(ChatAgent).toService(CommandChatAgent);

    bind(DefaultChatAgentId).toConstantValue({ id: OrchestratorChatAgentId });
    bind(FallbackChatAgentId).toConstantValue({ id: UniversalChatAgentId });

    bind(ChatWelcomeMessageProvider).to(IdeChatWelcomeMessageProvider);

    bindToolProvider(GetWorkspaceFileList, bind);
    bindToolProvider(FileContentFunction, bind);
    bindToolProvider(GetWorkspaceDirectoryStructure, bind);
    bindToolProvider(FileDiagnosticProvider, bind);
    bindToolProvider(FindFilesByPattern, bind);
    bind(WorkspaceFunctionScope).toSelf().inSingletonScope();
    bindToolProvider(WorkspaceSearchProvider, bind);

    bindToolProvider(SuggestFileContent, bind);
    bindToolProvider(WriteFileContent, bind);
    bindToolProvider(TaskListProvider, bind);
    bindToolProvider(TaskRunnerProvider, bind);
    bindToolProvider(LaunchListProvider, bind);
    bindToolProvider(LaunchRunnerProvider, bind);
    bindToolProvider(LaunchStopProvider, bind);
    bind(ReplaceContentInFileFunctionHelper).toSelf().inSingletonScope();
    bind(FileChangeSetTitleProvider).to(DefaultFileChangeSetTitleProvider).inSingletonScope();
    bind(ReplaceContentInFileFunctionHelperV2).toSelf().inSingletonScope();
    bindToolProvider(SuggestFileReplacements, bind);
    bindToolProvider(SuggestFileReplacements_Simple, bind);
    bindToolProvider(WriteFileReplacements, bind);
    bindToolProvider(ListChatContext, bind);
    bindToolProvider(ResolveChatContext, bind);
    bind(AIConfigurationSelectionService).toSelf().inSingletonScope();
    bind(AIConfigurationContainerWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIConfigurationContainerWidget.ID,
            createWidget: () => ctx.container.get(AIConfigurationContainerWidget)
        }))
        .inSingletonScope();

    bindToolProvider(LaunchBrowserProvider, bind);
    bindToolProvider(CloseBrowserProvider, bind);
    bindToolProvider(IsBrowserRunningProvider, bind);
    bindToolProvider(QueryDomProvider, bind);

    bindViewContribution(bind, AIAgentConfigurationViewContribution);
    bind(TabBarToolbarContribution).toService(AIAgentConfigurationViewContribution);

    bind(AIVariableConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIVariableConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIVariableConfigurationWidget)
        }))
        .inSingletonScope();

    bind(AIAgentConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIAgentConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIAgentConfigurationWidget)
        }))
        .inSingletonScope();

    bind(ModelAliasesConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: ModelAliasesConfigurationWidget.ID,
            createWidget: () => ctx.container.get(ModelAliasesConfigurationWidget)
        }))
        .inSingletonScope();

    bindToolProvider(SimpleSuggestFileReplacements, bind);
    bindToolProvider(SimpleWriteFileReplacements, bind);
    bindToolProvider(ClearFileChanges, bind);
    bindToolProvider(GetProposedFileState, bind);
    bindToolProvider(AddFileToChatContext, bind);

    bind(AIToolsConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIToolsConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIToolsConfigurationWidget)
        }))
        .inSingletonScope();

    bind(AIVariableContribution).to(ContextFilesVariableContribution).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: AiConfigurationPreferences });

    bind(FrontendApplicationContribution).to(TemplatePreferenceContribution);

    bind(AIMCPConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIMCPConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIMCPConfigurationWidget)
        }))
        .inSingletonScope();
    // Register the token usage configuration widget
    bind(AITokenUsageConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AITokenUsageConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AITokenUsageConfigurationWidget)
        }))
        .inSingletonScope();

    bind(TaskContextSummaryVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(TaskContextSummaryVariableContribution);

    bind(GitHubRepoService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<GitHubRepoService>(githubRepoServicePath);
    }).inSingletonScope();

    bind(GitHubRepoVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(GitHubRepoVariableContribution);
    bind(TaskContextFileStorageService).toSelf().inSingletonScope();
    rebind(TaskContextStorageService).toService(TaskContextFileStorageService);

    bind(CommandContribution).to(SummarizeSessionCommandContribution);
    bind(AIPromptFragmentsConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIPromptFragmentsConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIPromptFragmentsConfigurationWidget)
        }))
        .inSingletonScope();

    bindToolProvider(SuggestTerminalCommand, bind);

    bind(ContextFileValidationServiceImpl).toSelf().inSingletonScope();
    bind(ContextFileValidationService).toService(ContextFileValidationServiceImpl);

    bind(FrontendApplicationContribution).to(RememberCommandContribution);
});
