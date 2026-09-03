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
import { ChatAgent, ChatAgentRecommendationService } from '@theia/ai-chat/lib/common';
import { Agent, AIVariableContribution, bindToolProvider } from '@theia/ai-core/lib/common';
import { ArchitectAgent } from './architect-agent';
import { CoderAgent } from './coder-agent';
import { SummarizeSessionCommandContribution } from './summarize-session-command-contribution';
import {
    AccessibleRootContribution,
    FileContentFunction,
    FileDiagnosticProvider,
    FindFilesByPattern,
    GetWorkspaceDirectoryStructure,
    GetWorkspaceFileList,
    WorkspaceFunctionScope
} from './workspace-functions';
import { WorkspaceSearchProvider } from './workspace-search-provider';
import { MemoryDirectoryVariableContribution } from './memory-directory-variable-contribution';
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
    WriteFileReplacements_Simple,
    SimpleWriteFileReplacements,
    FileChangeSetTitleProvider,
    DefaultFileChangeSetTitleProvider,
    ReplaceContentInFileFunctionHelperV2
} from './file-changeset-functions';
import { OrchestratorChatAgent } from '../common/orchestrator-chat-agent';
import { UniversalChatAgent } from '../common/universal-chat-agent';
import { AppTesterChatAgent } from './app-tester-chat-agent';
import { GitHubChatAgent } from './github-chat-agent';
import { CommandChatAgent } from '../common/command-chat-agents';
import { ListChatContext, ResolveChatContext, AddFileToChatContext } from './context-functions';
import { AgentsConfigurationCategory } from './ai-configuration/categories/agents-configuration-category';
import { GeneralConfigurationCategory } from './ai-configuration/categories/general-configuration-category';
import { ModelsConfigurationCategory } from './ai-configuration/categories/models-configuration-category';
import { ModelAliasesConfigurationCategory } from './ai-configuration/categories/model-aliases-configuration-category';
import { VariablesConfigurationCategory } from './ai-configuration/categories/variables-configuration-category';
import { TokenUsageConfigurationCategory } from './ai-configuration/categories/token-usage-configuration-category';
import { ToolsConfigurationCategory } from './ai-configuration/categories/tools-configuration-category';
import { PromptsAndSkillsConfigurationCategory } from './ai-configuration/categories/prompts-and-skills-configuration-category';
import { PromptSnippetsConfigurationCategory } from './ai-configuration/categories/prompt-snippets-configuration-category';
import { AiConfigurationOpenPreferenceRenderer, AiConfigurationOpenPreferenceRendererContribution } from './ai-configuration/ai-configuration-open-preference-renderer';
import { PreferenceNodeRendererContribution } from '@theia/preferences/lib/browser/views/components/preference-node-renderer-creator';
import { AiConfigurationBreadcrumbsContribution } from './ai-configuration/ai-configuration-breadcrumbs-contribution';
import { BreadcrumbsContribution } from '@theia/core/lib/browser/breadcrumbs/breadcrumbs-constants';
import { AiConfigurationLabelProviderContribution } from './ai-configuration/ai-configuration-label-provider-contribution';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { AiConfigurationCategory } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AIConfigurationSelectionService } from './ai-configuration/ai-configuration-service';
import { AIConfigurationViewContribution } from './ai-configuration/ai-configuration-view-contribution';
import { AIConfigurationContainerWidget } from './ai-configuration/ai-configuration-widget';
import { AiConfigurationDetailWidget } from './ai-configuration/ai-configuration-detail-widget';
import { AiConfigurationTreeWidget, createAiConfigurationTreeContainer } from './ai-configuration/ai-configuration-tree-widget';
import { AiConfigurationSearchWidget } from './ai-configuration/ai-configuration-search-widget';
import { ContextFilesVariableContribution } from '../common/context-files-variable';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TemplatePreferenceContribution } from './template-preference-contribution';
import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { IdeChatWelcomeMessageProvider } from './ide-chat-welcome-message-provider';
import { ChatSessionsWelcomeMessageProvider } from './chat-sessions-welcome-message-provider';
import { ChatSessionItemActionContribution, DefaultChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { AiAllowAllModeChatBanner } from './ai-allow-all-mode-chat-banner';
import { ChatBannerProvider } from '@theia/ai-chat-ui/lib/browser/chat-banner-provider';
import { DefaultChatAgentRecommendationService } from './default-chat-agent-recommendation-service';
import { TaskContextSummaryVariableContribution } from './task-background-summary-variable';
import { GitHubRepoVariableContribution } from './github-repo-variable-contribution';
import { TaskContextFileStorageService } from './task-context-file-storage-service';
import { TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { bindRootContributionProvider, CommandContribution, PreferenceContribution } from '@theia/core';
import { BrowserAutomation, browserAutomationPath } from '../common/browser-automation-protocol';
import { GitHubRepoService, githubRepoServicePath } from '../common/github-repo-protocol';
import { CloseBrowserProvider, IsBrowserRunningProvider, LaunchBrowserProvider, QueryDomProvider } from './app-tester-chat-functions';
import { GetSkillFileContent } from './skill-file-functions';
import { aiIdePreferenceSchema } from '../common/ai-ide-preferences';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { AIIdeActivationServiceImpl } from './ai-ide-activation-service';
import { AiConfigurationPreferences } from '../common/ai-configuration-preferences';
import { WorkspaceRestrictionContribution } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AIWorkspaceRestrictionContribution } from './ai-workspace-restriction-contribution';

import { ProjectInfoAgent } from './project-info-agent';
import { CreateSkillAgent } from './create-skill-agent';
import { SuggestTerminalCommand } from './ai-terminal-functions';
import { TodoWriteTool } from './todo-tool';
import { TodoToolRenderer } from './todo-tool-renderer';
import { UserInteractionTool } from './user-interaction-tool';
import { UserInteractionToolRenderer } from './user-interaction-tool-renderer';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ContextFileValidationService } from '@theia/ai-chat/lib/browser/context-file-validation-service';
import { ContextFileValidationServiceImpl } from './context-file-validation-service-impl';
import { RememberCommandContribution } from './remember-command-contribution';
import { CreateTaskContextFunction, GetTaskContextFunction, EditTaskContextFunction, ListTaskContextsFunction, RewriteTaskContextFunction } from './task-context-functions';
import { FixGitHubTicketCommandContribution } from './implement-gh-ticket-command-contribution';
import { AnalyzesGhTicketCommandContribution } from './analyze-gh-ticket-command-contribution';
import { AddressGhReviewCommandContribution } from './address-pr-review-command-contribution';
import { AppTesterCapabilityContribution } from './apptester-capability-contribution';
import { GitHubCapabilityContribution } from './github-capability-contribution';
import { ShellExecutionCapabilityContribution } from './shell-execution-capability-contribution';
import { MemoryCapabilityContribution } from './memory-capability-contribution';
import { OpenEditorsHintContribution } from './open-editors-hint-contribution';
import { AgentModeConfirmationService, AgentModeConfirmationServiceImpl } from './agent-mode-confirmation-service';
import { ExploreAgent } from './explore-agent';
import { CodeReviewerAgent } from './code-reviewer-agent';
import { CodeReviewCapabilityContribution } from './code-review-capability-contribution';
import { PRReviewAgent } from './review/pr-review-agent';
import { PRReviewCapabilityContribution } from './review/pr-review-capability-contribution';
import { PerspectiveContribution } from '@theia/core/lib/browser/perspective-service';
import { AIFirstPerspectiveContribution } from './ai-first-perspective-contribution';
import { ChatSessionListService } from './chat-session-list-service';
import { AISessionsWidget } from './ai-sessions-widget';
import { AISessionsViewContribution } from './ai-sessions-view-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(PreferenceContribution).toConstantValue({ schema: aiIdePreferenceSchema });
    bind(PreferenceContribution).toConstantValue({ schema: WorkspacePreferencesSchema });

    bind(AgentModeConfirmationServiceImpl).toSelf().inSingletonScope();
    bind(AgentModeConfirmationService).toService(AgentModeConfirmationServiceImpl);

    bind(AIIdeActivationServiceImpl).toSelf().inSingletonScope();
    // rebinds the default implementation of '@theia/ai-core'
    rebind(AIActivationService).toService(AIIdeActivationServiceImpl);

    bind(AIWorkspaceRestrictionContribution).toSelf().inSingletonScope();
    bind(WorkspaceRestrictionContribution).toService(AIWorkspaceRestrictionContribution);

    bind(ArchitectAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ArchitectAgent);
    bind(ChatAgent).toService(ArchitectAgent);

    bind(CoderAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CoderAgent);
    bind(ChatAgent).toService(CoderAgent);

    bind(ProjectInfoAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ProjectInfoAgent);
    bind(ChatAgent).toService(ProjectInfoAgent);

    bind(CreateSkillAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CreateSkillAgent);
    bind(ChatAgent).toService(CreateSkillAgent);

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

    bind(ExploreAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ExploreAgent);
    bind(ChatAgent).toService(ExploreAgent);

    bind(CodeReviewerAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CodeReviewerAgent);
    bind(ChatAgent).toService(CodeReviewerAgent);

    bind(PRReviewAgent).toSelf().inSingletonScope();
    bind(Agent).toService(PRReviewAgent);
    bind(ChatAgent).toService(PRReviewAgent);

    bind(ChatSessionListService).toSelf().inSingletonScope();

    bind(ChatWelcomeMessageProvider).to(IdeChatWelcomeMessageProvider).inSingletonScope();
    bind(ChatWelcomeMessageProvider).to(ChatSessionsWelcomeMessageProvider).inSingletonScope();
    bind(ChatBannerProvider).to(AiAllowAllModeChatBanner).inSingletonScope();
    bindRootContributionProvider(bind, ChatSessionItemActionContribution);
    bind(DefaultChatSessionItemActionContribution).toSelf().inSingletonScope();
    bind(ChatSessionItemActionContribution).toService(DefaultChatSessionItemActionContribution);
    bind(ChatAgentRecommendationService).to(DefaultChatAgentRecommendationService).inSingletonScope();

    bindToolProvider(GetWorkspaceFileList, bind);
    bindToolProvider(FileContentFunction, bind);
    bindToolProvider(GetWorkspaceDirectoryStructure, bind);
    bindToolProvider(FileDiagnosticProvider, bind);
    bindToolProvider(FindFilesByPattern, bind);
    bindToolProvider(GetSkillFileContent, bind);
    bind(WorkspaceFunctionScope).toSelf().inSingletonScope();
    bindToolProvider(WorkspaceSearchProvider, bind);

    bindRootContributionProvider(bind, AccessibleRootContribution);
    bind(MemoryDirectoryVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(MemoryDirectoryVariableContribution);
    bind(AccessibleRootContribution).toService(MemoryDirectoryVariableContribution);

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
    bindToolProvider(WriteFileReplacements_Simple, bind);
    bindToolProvider(ListChatContext, bind);
    bindToolProvider(ResolveChatContext, bind);
    bind(AIConfigurationSelectionService).toSelf().inSingletonScope();
    // The container widget owns these children and disposes them when the view is closed. They must
    // therefore be transient: a reopened container gets fresh children instead of injecting the
    // already-disposed singletons from the previous instance (which rendered an empty view and logged
    // "node does not belong to this tree" errors on layout restore).
    bind(AiConfigurationSearchWidget).toSelf();
    bind(AiConfigurationDetailWidget).toSelf();
    bind(AiConfigurationTreeWidget)
        .toDynamicValue(({ container }) => createAiConfigurationTreeContainer(container).get(AiConfigurationTreeWidget));
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

    bindViewContribution(bind, AIConfigurationViewContribution);
    bind(TabBarToolbarContribution).toService(AIConfigurationViewContribution);

    bind(AgentsConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(AgentsConfigurationCategory);

    bind(GeneralConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(GeneralConfigurationCategory);

    bind(ModelsConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(ModelsConfigurationCategory);

    bind(ModelAliasesConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(ModelAliasesConfigurationCategory);

    bind(VariablesConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(VariablesConfigurationCategory);

    bind(TokenUsageConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(TokenUsageConfigurationCategory);

    bind(ToolsConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(ToolsConfigurationCategory);

    bind(PromptsAndSkillsConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(PromptsAndSkillsConfigurationCategory);

    bind(PromptSnippetsConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(PromptSnippetsConfigurationCategory);

    // Renders the Settings-UI "AI Features" placeholder as a button that opens the AI Configuration view (#316).
    bind(AiConfigurationOpenPreferenceRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(AiConfigurationOpenPreferenceRendererContribution).inSingletonScope();

    // Real Theia breadcrumbs for the AI Configuration view.
    bind(AiConfigurationBreadcrumbsContribution).toSelf().inSingletonScope();
    bind(BreadcrumbsContribution).toService(AiConfigurationBreadcrumbsContribution);
    // Give the view's resource URI a readable name (window title, breadcrumbs) instead of "/".
    bind(AiConfigurationLabelProviderContribution).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(AiConfigurationLabelProviderContribution);

    bindToolProvider(SimpleSuggestFileReplacements, bind);
    bindToolProvider(SimpleWriteFileReplacements, bind);
    bindToolProvider(ClearFileChanges, bind);
    bindToolProvider(GetProposedFileState, bind);
    bindToolProvider(AddFileToChatContext, bind);

    bind(AIVariableContribution).to(ContextFilesVariableContribution).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: AiConfigurationPreferences });

    bind(FrontendApplicationContribution).to(TemplatePreferenceContribution);

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

    bindToolProvider(SuggestTerminalCommand, bind);

    // Task context functions for Architect planning mode
    bindToolProvider(CreateTaskContextFunction, bind);
    bindToolProvider(GetTaskContextFunction, bind);
    bindToolProvider(EditTaskContextFunction, bind);
    bindToolProvider(ListTaskContextsFunction, bind);
    bindToolProvider(RewriteTaskContextFunction, bind);
    bindToolProvider(TodoWriteTool, bind);
    bindToolProvider(UserInteractionTool, bind);
    bind(ChatResponsePartRenderer).to(TodoToolRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(UserInteractionToolRenderer).inSingletonScope();

    bind(ContextFileValidationServiceImpl).toSelf().inSingletonScope();
    bind(ContextFileValidationService).toService(ContextFileValidationServiceImpl);

    bind(FrontendApplicationContribution).to(RememberCommandContribution);
    bind(FrontendApplicationContribution).to(FixGitHubTicketCommandContribution);
    bind(FrontendApplicationContribution).to(AddressGhReviewCommandContribution);
    bind(FrontendApplicationContribution).to(AnalyzesGhTicketCommandContribution);
    bind(FrontendApplicationContribution).to(AppTesterCapabilityContribution);
    bind(FrontendApplicationContribution).to(GitHubCapabilityContribution);
    bind(FrontendApplicationContribution).to(ShellExecutionCapabilityContribution);
    bind(FrontendApplicationContribution).to(MemoryCapabilityContribution);
    bind(FrontendApplicationContribution).to(OpenEditorsHintContribution);

    bind(FrontendApplicationContribution).to(CodeReviewCapabilityContribution);
    bind(FrontendApplicationContribution).to(PRReviewCapabilityContribution);

    bind(AIFirstPerspectiveContribution).toSelf().inSingletonScope();
    bind(PerspectiveContribution).toService(AIFirstPerspectiveContribution);

    bind(AISessionsWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AISessionsWidget.ID,
            createWidget: () => ctx.container.get(AISessionsWidget)
        }))
        .inSingletonScope();
    bindViewContribution(bind, AISessionsViewContribution);
    bind(TabBarToolbarContribution).toService(AISessionsViewContribution);
});
