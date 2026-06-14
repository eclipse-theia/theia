// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { LabelProvider } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { QuickInputService } from '@theia/core';
import { AIVariableService, FrontendLanguageModelRegistry } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatService } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { FileUploadService } from '@theia/filesystem/lib/common/upload/file-upload';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { MarkdownPreviewHandler } from '@theia/preview/lib/browser/markdown/markdown-preview-handler';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectEntry } from './mobile-projects-types';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import { MobileProjectChatViewWidgetFactory } from './mobile-project-ai-chat-input-widget';
import { QaapDiffReviewWidget } from './qaap-diff-review-widget';
import { QaapCommitMessageAi } from './qaap-commit-message-ai';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { resolveAgentVerifyChecksForCwd } from './qaap-agent-verify-checks-resolver';
import { openTranscriptWorkspaceFile, createTranscriptFilesViewServices } from './qaap-transcript-file-open';
import { createTranscriptTerminalViewServices } from './qaap-transcript-terminal-view';
import { pickMobileContextVariable } from './qaap-mobile-context-attach-menu';
import { resolveStickyComposerAttachmentPreview } from './qaap-sticky-composer-attachment-preview';
import { resolveStickyComposerContextChip } from './qaap-sticky-composer-context-ui';

export interface MobileProjectsPanelFactoryDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    onProjectOpenInIde(project: MobileProjectEntry): void;
    onDismiss(): void;
    onWorkspaceOpened(): void;
    onProjectsChanged(): void;
    onCurrentProjectActivated(): void | Promise<void>;
    onResumePreview(project: MobileProjectEntry): void;
    onOpenAgentOnTask(project: MobileProjectEntry): void;
    onOpenPullRequest(pullRequest: QaapGithubPullRequestSummary): void;
    onShowAgentsHub(): void;
    onShowRoutinesHub(): void;
    onHubLandingViewChanged(): void;
    onEnterActiveTranscript(): void;
    onExitActiveTranscript(): void;
    openWorkHubPreferencesSheet(query?: string): Promise<void>;
    openWorkHubAiConfigurationSheet(tabId?: string): Promise<void>;
}

export interface MobileProjectsPanelFactoryDeps {
    projectsService: MobileProjectsService;
    commands: CommandRegistry;
    widgetManager: WidgetManager;
    mobileProjectChatViewWidgetFactory: MobileProjectChatViewWidgetFactory;
    chatService: ChatService;
    chatAgentService: ChatAgentService;
    messageService: MessageService;
    variableService: AIVariableService;
    quickInputService: QuickInputService;
    fileUploadService: FileUploadService;
    fileService: FileService;
    workspaceService: WorkspaceService;
    editorManager: EditorManager;
    monacoEditorProvider: MonacoEditorProvider;
    labelProvider: LabelProvider;
    markdownPreviewHandler: MarkdownPreviewHandler;
    terminalService: TerminalService;
    previewSurfaceRegistry: QaapPreviewSurfaceRegistry;
    elementInspectorService: ElementInspectorService;
    clipboardService: ClipboardService;
    preferenceService: PreferenceService;
    languageModelRegistry?: FrontendLanguageModelRegistry;
    commitMessageAi?: QaapCommitMessageAi;
    projectBootstrap: QaapProjectBootstrapService;
    activeTasks: MobileProjectsActiveTasks;
    conversations: MobileProjectsConversations;
    backgroundContext: QaapBackgroundContextProvider;
    inboxStream: MobileWorkHubInboxStream;
    conversationFlags: MobileProjectsConversationFlags;
}

export interface MobileProjectsPanelFactoryOptions {
    deps: MobileProjectsPanelFactoryDeps;
    delegate: MobileProjectsPanelFactoryDelegate;
}

/** DI wiring for {@link MobileProjectsPanel} — kept out of the shell contribution orchestrator. */
export class MobileProjectsPanelFactory {

    protected readonly deps: MobileProjectsPanelFactoryDeps;
    protected readonly delegate: MobileProjectsPanelFactoryDelegate;

    constructor(options: MobileProjectsPanelFactoryOptions) {
        this.deps = options.deps;
        this.delegate = options.delegate;
    }

    create(homeMode: boolean): MobileProjectsPanel {
        const deps = this.deps;
        const delegate = this.delegate;
        return new MobileProjectsPanel(
            deps.projectsService,
            deps.commands,
            {
                onProjectOpen: project => delegate.onProjectOpen(project),
                onProjectOpenInIde: project => delegate.onProjectOpenInIde(project),
                onDismiss: () => delegate.onDismiss(),
                onWorkspaceOpened: () => delegate.onWorkspaceOpened(),
                onProjectsChanged: () => delegate.onProjectsChanged(),
                onCurrentProjectActivated: () => delegate.onCurrentProjectActivated(),
                onResumePreview: project => delegate.onResumePreview(project),
                onOpenAgentOnTask: project => delegate.onOpenAgentOnTask(project),
                onOpenPullRequest: pullRequest => delegate.onOpenPullRequest(pullRequest),
                onShowAgentsHub: () => delegate.onShowAgentsHub(),
                onShowRoutinesHub: () => delegate.onShowRoutinesHub(),
                onHubLandingViewChanged: () => delegate.onHubLandingViewChanged(),
                onEnterActiveTranscript: () => delegate.onEnterActiveTranscript(),
                onExitActiveTranscript: () => delegate.onExitActiveTranscript(),
            },
            {
                homeMode,
                activeTasks: deps.activeTasks,
                conversations: deps.conversations,
                backgroundContext: deps.backgroundContext,
                inboxStream: deps.inboxStream,
                conversationFlags: deps.conversationFlags,
                // Fresh widget id per panel: avoids duplicate ai-chat:/input.aichatviewlanguage registration.
                createChatInputWidget: id => deps.widgetManager.getOrCreateWidget<AIChatInputWidget>(
                    'mobile-projects-chat-input',
                    { source: 'mobile-projects', id },
                ),
                createChatViewWidget: id => Promise.resolve(
                    deps.mobileProjectChatViewWidgetFactory(id),
                ),
                chatService: deps.chatService,
                chatAgentService: deps.chatAgentService,
                messageService: deps.messageService,
                pickContextVariable: (anchor, handlers) => pickMobileContextVariable(
                    anchor,
                    deps.variableService,
                    deps.quickInputService,
                    {
                        fileUploadService: deps.fileUploadService,
                        fileService: deps.fileService,
                        workspaceService: deps.workspaceService,
                    },
                    handlers,
                ),
                formatContextChip: item => resolveStickyComposerContextChip(item, deps.labelProvider),
                resolveAttachmentPreview: item => resolveStickyComposerAttachmentPreview(
                    item,
                    deps.fileService,
                    deps.workspaceService,
                ),
                getComposerVariables: () => deps.variableService.getVariables(),
                createDiffReviewWidget: () => deps.widgetManager.getOrCreateWidget(QaapDiffReviewWidget.ID),
                resolveVerifyChecks: cwd => resolveAgentVerifyChecksForCwd(cwd, deps.fileService),
                openTranscriptFile: filePath => openTranscriptWorkspaceFile(
                    filePath,
                    deps.workspaceService,
                    deps.editorManager,
                ),
                createTranscriptFilesViewServices: () => createTranscriptFilesViewServices(
                    deps.workspaceService,
                    deps.fileService,
                    deps.editorManager,
                    deps.commands,
                    deps.monacoEditorProvider,
                    deps.labelProvider,
                    deps.markdownPreviewHandler,
                ),
                createTranscriptTerminalViewServices: () => createTranscriptTerminalViewServices(
                    deps.terminalService,
                    deps.workspaceService,
                ),
                previewSurfaceRegistry: deps.previewSurfaceRegistry,
                previewInspectorDeps: {
                    service: deps.elementInspectorService,
                    commands: deps.commands,
                },
                clipboard: deps.clipboardService,
                readPreference: key => deps.preferenceService.get(key),
                getRegisteredLanguageModels: deps.languageModelRegistry
                    ? () => deps.languageModelRegistry!.getLanguageModels()
                    : undefined,
                quickInputService: deps.quickInputService,
                commitMessageAi: deps.commitMessageAi,
                openPreferencesSheet: query => delegate.openWorkHubPreferencesSheet(query),
                openAiConfigurationSheet: tabId => delegate.openWorkHubAiConfigurationSheet(tabId),
                projectBootstrap: deps.projectBootstrap,
            },
        );
    }
}
