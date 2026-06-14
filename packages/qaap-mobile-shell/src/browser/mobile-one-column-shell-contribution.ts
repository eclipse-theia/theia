// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
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

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { toArray } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { SplitPanel, Widget as LuminoWidget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ChatService } from '@theia/ai-chat';
import { AIVariableService, FrontendLanguageModelRegistry } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { QuickInputService } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { pickMobileContextVariable } from './qaap-mobile-context-attach-menu';
import { resolveStickyComposerAttachmentPreview } from './qaap-sticky-composer-attachment-preview';
import { FileUploadService } from '@theia/filesystem/lib/common/upload/file-upload';
import { resolveStickyComposerContextChip } from './qaap-sticky-composer-context-ui';
import {
    matchesMobileOneColumnLayout,
    MOBILE_ONE_COLUMN_LAYOUT_MEDIA_QUERY,
    MOBILE_ONE_COLUMN_LAYOUT_CLASS,
} from '@theia/core/lib/browser/shell/mobile-layout-state';
import { hasQaapLeftRightSplitPanel } from '@theia/qaap-shell/lib/browser/qaap-shell-layout';
import { QaapSidePanelHandler } from '@theia/qaap-shell/lib/browser/qaap-side-panel-handler';
import { QaapDesktopTerminalLayoutContribution } from './qaap-desktop-terminal-layout-contribution';
import { QaapDiffReviewWidget } from './qaap-diff-review-widget';
import { QaapCommitMessageAi } from './qaap-commit-message-ai';
import { QaapWorkHubDiffDelegate, QaapWorkHubDiffService } from './qaap-work-hub-diff-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsPanel } from './mobile-projects-panel';
import { resolveAgentVerifyChecksForCwd } from './qaap-agent-verify-checks-resolver';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { MobileProjectChatViewWidgetFactory } from './mobile-project-ai-chat-input-widget';
import { openTranscriptWorkspaceFile, createTranscriptFilesViewServices } from './qaap-transcript-file-open';
import { createTranscriptTerminalViewServices } from './qaap-transcript-terminal-view';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { LabelProvider } from '@theia/core/lib/browser';
import { MarkdownPreviewHandler } from '@theia/preview/lib/browser/markdown/markdown-preview-handler';
import { MobileProjectsReadmeContribution } from './mobile-projects-readme-contribution';
import { MobileProjectEntry, type MobileProjectsHubView } from './mobile-projects-types';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import { MobileSnackbar } from './mobile-snackbar';
import { MobileAgentTaskComposer } from './mobile-agent-task-composer';
import { MobileWorkHubPreferencesSheet } from './mobile-work-hub-preferences-sheet';
import { MobileWorkHubAiConfigurationSheet } from './mobile-work-hub-ai-configuration-sheet';
import { AIConfigurationSelectionService } from '@theia/ai-ide/lib/browser/ai-configuration/ai-configuration-service';
import {
    clearMobileWorkHubBootGuard,
    installMobileWorkHubBootGuard,
    markPreferAgentsSurface,
    markPreferDesktopIde,
    peekPreferDesktopIde,
    shouldBootstrapMobileAgentsChat,
    shouldPreferWorkHubAgentsLayout,
    QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT,
    QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT,
    setMobileActiveTranscriptChrome,
    setMobileWorkHubComposerHeaderChrome,
    setMobileWorkHubHideBottomChrome,
} from './mobile-projects-open';
import { MiniBrowserOpenHandler } from '@theia/mini-browser/lib/browser/mini-browser-open-handler';
import { QaapMiniBrowserOpenHandler } from '@theia/qaap-adapters/lib/browser/qaap-mini-browser-open-handler';
import { syncQaapMiniBrowserPreviewSuspension } from '@theia/qaap-adapters/lib/browser/qaap-mini-browser-preview-frame';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { QaapMobileProjectsDashboardCommands } from './mobile-projects-dashboard-commands';
import { QaapWorkbenchHistoryNavWidget } from './qaap-workbench-top-bar-widgets';
import {
    QAAP_MOBILE_OPEN_DESKTOP_IDE_COMMAND,
    QAAP_WORK_HUB_OVERVIEW_COMMAND,
} from './qaap-workbench-account-menu';
import { hasDesktopSessionsSidebarCollapsed } from './mobile-work-hub-sessions-sidebar';
import { writeStoredComposerSurface } from '../common/qaap-composer-surface';
import { resolveInitialLandingBodyClass } from './mobile-shell-landing-state';
import { MobileShellLandingController, type MobileShellLandingHost } from './mobile-shell-landing-controller';
import {
    MobileShellBottomBarController,
    type MobileShellBottomBarHost,
} from './mobile-shell-bottom-bar-controller';
import {
    MobileShellOverlayHostController,
    type MobileShellOverlayHost,
} from './mobile-shell-overlay-host';
import {
    MobileShellSideSheetController,
    type MobileShellSideSheetHost,
} from './mobile-shell-side-sheet-controller';
import {
    MobileShellWorkHubBootstrapController,
    type MobileShellWorkHubBootstrapHost,
} from './mobile-shell-work-hub-bootstrap';
import {
    MobileShellIdeFallbackController,
    type MobileShellIdeFallbackHost,
} from './mobile-shell-ide-fallback';
import {
    MobileShellHubNavigationController,
    type MobileShellHubNavigationHost,
} from './mobile-shell-hub-navigation-controller';
import {
    MobileShellPullRequestPanelController,
    type MobileShellPullRequestPanelHost,
} from './mobile-shell-pull-request-panel-controller';
import {
    MobileShellTranscriptChromeController,
    type MobileShellTranscriptChromeHost,
} from './mobile-shell-transcript-chrome-controller';
import { MobileShellSessionState } from './mobile-shell-session-state';
import {
    BottomBarSecondaryItem,
    EXPLORER_VIEW_CONTAINER_ID,
    MINI_BROWSER_PREVIEW_WIDGET_ID,
    MOBILE_BOTTOM_OPEN_CLASS,
    MobileBottomButton,
    MobileBottomButtonId,
    WORKBENCH_CHAT_VIEW_WIDGET_ID,
} from './mobile-shell-bottom-bar-widget';

const GETTING_STARTED_WIDGET_COMMAND = 'getting.started.widget';

/**
 * Narrow-viewport workbench: full-width editor, side panels as sheets, bottom activity strip,
 * edge swipes and backdrop; main editor tabs in a horizontally scrollable tab row.
 */
@injectable()
export class MobileOneColumnShellContribution implements FrontendApplicationContribution, CommandContribution, QaapWorkHubDiffDelegate {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(StatusBarImpl)
    protected readonly statusBar: StatusBarImpl;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(MobileProjectsService)
    protected readonly projectsService: MobileProjectsService;

    @inject(QaapDesktopTerminalLayoutContribution)
    protected readonly desktopTerminalLayout: QaapDesktopTerminalLayoutContribution;

    @inject(MobileProjectsActiveTasks)
    protected readonly activeTasks: MobileProjectsActiveTasks;

    @inject(QaapBackgroundContextProvider)
    protected readonly backgroundContext: QaapBackgroundContextProvider;

    @inject(MobileProjectsConversations)
    protected readonly conversations: MobileProjectsConversations;

    @inject(MobileWorkHubInboxStream)
    protected readonly inboxStream: MobileWorkHubInboxStream;

    @inject(MobileProjectsConversationFlags)
    protected readonly conversationFlags: MobileProjectsConversationFlags;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileUploadService)
    protected readonly fileUploadService: FileUploadService;

    @inject(MobileProjectsReadmeContribution)
    protected readonly projectsReadme: MobileProjectsReadmeContribution;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(FrontendLanguageModelRegistry) @optional()
    protected readonly languageModelRegistry?: FrontendLanguageModelRegistry;

    @inject(MobileProjectChatViewWidgetFactory)
    protected readonly mobileProjectChatViewWidgetFactory: MobileProjectChatViewWidgetFactory;

    @inject(QaapWorkHubDiffService)
    protected readonly workHubDiff: QaapWorkHubDiffService;

    @inject(QaapCommitMessageAi) @optional()
    protected readonly commitMessageAi?: QaapCommitMessageAi;

    @inject(QaapProjectBootstrapService)
    protected readonly projectBootstrap: QaapProjectBootstrapService;

    @inject(QaapMiniBrowserOpenHandler)
    protected readonly miniBrowserOpenHandler: QaapMiniBrowserOpenHandler;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MonacoEditorProvider)
    protected readonly monacoEditorProvider: MonacoEditorProvider;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(MarkdownPreviewHandler)
    protected readonly markdownPreviewHandler: MarkdownPreviewHandler;

    @inject(QaapPreviewSurfaceRegistry)
    protected readonly previewSurfaceRegistry: QaapPreviewSurfaceRegistry;

    @inject(ElementInspectorService)
    protected readonly elementInspectorService: ElementInspectorService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    protected readonly toDispose = new DisposableCollection();
    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_ONE_COLUMN_LAYOUT_MEDIA_QUERY) : undefined;

    protected bottomBarController!: MobileShellBottomBarController;
    private bottomBarHost!: MobileShellBottomBarHost;
    protected overlayController!: MobileShellOverlayHostController;
    private overlayHost!: MobileShellOverlayHost;
    protected sideSheetController!: MobileShellSideSheetController;
    private sideSheetHost!: MobileShellSideSheetHost;
    protected workHubBootstrap!: MobileShellWorkHubBootstrapController;
    private workHubBootstrapHost!: MobileShellWorkHubBootstrapHost;
    protected ideFallback!: MobileShellIdeFallbackController;
    private ideFallbackHost!: MobileShellIdeFallbackHost;
    protected hubNavigation!: MobileShellHubNavigationController;
    private hubNavigationHost!: MobileShellHubNavigationHost;
    protected pullRequestPanelController!: MobileShellPullRequestPanelController;
    private pullRequestPanelHost!: MobileShellPullRequestPanelHost;
    protected transcriptChrome!: MobileShellTranscriptChromeController;
    private transcriptChromeHost!: MobileShellTranscriptChromeHost;
    protected readonly sessionState = new MobileShellSessionState();
    protected get bottomBar(): HTMLElement | undefined { return this.bottomBarController.getBottomBarNode(); }
    protected mobileActive = false;
    protected projectsPanel: MobileProjectsPanel | undefined;
    protected agentTaskComposer: MobileAgentTaskComposer | undefined;
    protected workHubPreferencesSheet: MobileWorkHubPreferencesSheet | undefined;
    protected workHubAiConfigurationSheet: MobileWorkHubAiConfigurationSheet | undefined;
    protected projectsCount = 0;
    protected landing!: MobileShellLandingController;
    private landingHost!: MobileShellLandingHost;
    /**
     * True once the user has actively left the mobile landing (Projects panel) in this session,
     * either by opening a workspace from the dashboard or by tapping Focus on the active project.
     * Subsequent re-opens of the Projects view are sheet-style.
     */
    protected get landingLeftThisSession(): boolean {
        return this.sessionState.landingLeftThisSession;
    }
    protected set landingLeftThisSession(value: boolean) {
        this.sessionState.landingLeftThisSession = value;
    }
    protected get transcriptOpenedFromWorkHubLanding(): boolean {
        return this.sessionState.transcriptOpenedFromWorkHubLanding;
    }
    protected set transcriptOpenedFromWorkHubLanding(value: boolean) {
        this.sessionState.transcriptOpenedFromWorkHubLanding = value;
    }

    protected readonly onDismissProjectsPanelEvent = (): void => {
        this.onProjectsWorkspaceOpened();
    };

    protected readonly onLandingHubListChanged = (): void => {
        this.refreshBottomBar();
        this.scheduleSnapAndUiRefresh();
    };

    @postConstruct()
    protected initLandingController(): void {
        this.initBottomBarController();
        this.initSideSheetController();
        this.initOverlayController();
        this.initPullRequestPanelController();
        this.initIdeFallbackController();
        this.initWorkHubBootstrapController();
        this.landingHost = {
            getProjectsPanel: () => this.projectsPanel,
            setProjectsPanel: panel => { this.projectsPanel = panel; },
            ensureProjectsPanel: forceHomeMode => this.workHubBootstrap.ensureProjectsPanel(forceHomeMode),
            hideProjectsPanel: () => this.hideProjectsPanel(),
            tryBootstrapMobileAgentsChat: () => this.workHubBootstrap.tryBootstrapMobileAgentsChat(),
            ensureMainContentAfterWorkspaceReload: () => this.ensureMainContentAfterWorkspaceReload(),
            refreshProjectBootstrapFromWorkspace: () => { void this.projectBootstrap.refreshFromCurrentWorkspace(); },
            ensureDesktopWorkHubSessionsSidebarOpen: () => this.ensureDesktopWorkHubSessionsSidebarOpen(),
            syncMobileHubPrimaryBottomChrome: () => this.bottomBarController.syncMobileHubPrimaryBottomChrome(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
            scheduleSnapAndUiRefresh: () => this.scheduleSnapAndUiRefresh(),
        };
        this.landing = new MobileShellLandingController({
            host: this.landingHost,
            projectsService: this.projectsService,
            sessionState: this.sessionState,
            mobileMq: this.mobileMq,
        });
        this.initHubNavigationController();
        this.initTranscriptChromeController();
        this.patchWorkHubBootstrapLandingHost();
    }

    protected initTranscriptChromeController(): void {
        this.transcriptChromeHost = {
            getProjectsPanel: () => this.projectsPanel,
            openMobileWorkHubLanding: view => this.hubNavigation.openMobileWorkHubLanding(view),
            syncMobileHubPrimaryBottomChrome: () => this.bottomBarController.syncMobileHubPrimaryBottomChrome(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
        };
        this.transcriptChrome = new MobileShellTranscriptChromeController({
            host: this.transcriptChromeHost,
            sessionState: this.sessionState,
        });
    }

    protected initPullRequestPanelController(): void {
        this.pullRequestPanelHost = {
            scheduleSnapAndUiRefresh: () => this.scheduleSnapAndUiRefresh(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            dismissSheetsAsync: () => this.sideSheetController.dismissSheetsAsync(),
            hideProjectsPanel: () => this.hideProjectsPanel(),
        };
        this.pullRequestPanelController = new MobileShellPullRequestPanelController({
            host: this.pullRequestPanelHost,
            shell: this.shell,
        });
    }

    protected initHubNavigationController(): void {
        this.hubNavigationHost = {
            isMobileActive: () => this.mobileActive,
            enterMobileLayout: () => this.enterMobileLayout(),
            getProjectsPanel: () => this.projectsPanel,
            applyLandingChrome: () => this.landing.applyLandingChrome(),
            warmLiveTransport: () => this.conversations.warmLiveTransport(),
            startActiveTasks: () => this.activeTasks.start(),
            syncMobileHubPrimaryBottomChrome: () => this.bottomBarController.syncMobileHubPrimaryBottomChrome(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
            ensureDesktopWorkHubSessionsSidebarOpen: () => this.ensureDesktopWorkHubSessionsSidebarOpen(),
            hidePullRequestPanel: () => this.pullRequestPanelController.hidePullRequestPanel(),
            dismissSheetsAsync: () => this.sideSheetController.dismissSheetsAsync(),
            collapseMobileSidePanels: () => this.sideSheetController.collapseMobileSidePanels(),
            showMobileProjectsHome: view => this.workHubBootstrap.showMobileProjectsHome(view),
        };
        this.hubNavigation = new MobileShellHubNavigationController({
            host: this.hubNavigationHost,
            shell: this.shell,
            projectsService: this.projectsService,
            sessionState: this.sessionState,
        });
    }

    protected patchWorkHubBootstrapLandingHost(): void {
        Object.assign(this.workHubBootstrapHost, {
            applyLandingChrome: () => this.landing.applyLandingChrome(),
            releaseMobileWorkHubBootGuardWhenReady: () => this.landing.releaseMobileWorkHubBootGuardWhenReady(),
            isProjectsLandingSession: () => this.landing.isProjectsLandingSession(),
            hasPendingHubAction: () => this.landing.hasPendingHubAction(),
            applyMobileProjectsPanelDismissAfterReload: () => this.landing.applyMobileProjectsPanelDismissAfterReload(),
        });
    }

    protected initSideSheetController(): void {
        this.sideSheetHost = {
            isMobileActive: () => this.mobileActive,
            forceCenterColumnFullWidth: () => this.forceCenterColumnFullWidth(),
            persistAgentsSurfaceForActiveSession: () => this.workHubBootstrap.persistAgentsSurfaceForActiveSession(),
            updateMobileShellStateClasses: () => this.bottomBarController.updateMobileShellStateClasses(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            updateBackdropVisibility: () => this.overlayController.updateBackdropVisibility(),
            syncIdeMiniBrowserPreviewSuspension: () => this.syncIdeMiniBrowserPreviewSuspension(),
            getBottomPanelPendingUpdate: () => this.bottomBarController.getBottomPanelPendingUpdate(),
            prepareSideSheetOpen: side => this.prepareSideSheetOpen(side),
            mountSideSheetWidget: (side, widgetId) => this.mountSideSheetWidget(side, widgetId),
        };
        this.sideSheetController = new MobileShellSideSheetController({
            host: this.sideSheetHost,
            shell: this.shell,
            commands: this.commands,
            bottomBarController: this.bottomBarController,
        });
    }

    protected initOverlayController(): void {
        this.overlayHost = {
            isMobileActive: () => this.mobileActive,
            isWorkspaceOpened: () => this.workspaceService.opened,
            toggleProjectsPanel: () => this.toggleProjectsPanel(),
            isAnyMobileSideSheetVisible: () => this.sideSheetController.isAnyMobileSideSheetVisible(),
            requestSheetRelayout: () => this.sideSheetController.requestSheetRelayout(),
            relayoutMobileSidePanelHandler: side => this.sideSheetController.relayoutMobileSidePanelHandler(side),
        };
        this.overlayController = new MobileShellOverlayHostController({
            host: this.overlayHost,
            shell: this.shell,
        });
    }

    protected initIdeFallbackController(): void {
        this.ideFallbackHost = {
            isMobileActive: () => this.mobileActive,
            shouldActivateMobileLayout: () => this.shouldActivateMobileLayout(),
            enterMobileLayout: () => this.enterMobileLayout(),
            leaveMobileLayout: () => this.leaveMobileLayout(),
            onMediaChange: () => this.onMediaChange(),
            cancelAgentsBootstrap: () => this.workHubBootstrap.cancelAgentsBootstrap(),
            getProjectsPanel: () => this.projectsPanel,
            setProjectsPanel: panel => { this.projectsPanel = panel; },
            tryBootstrapMobileAgentsChat: () => this.workHubBootstrap.tryBootstrapMobileAgentsChat(),
            restoreAgentsSurfaceAfterReload: () => this.workHubBootstrap.restoreAgentsSurfaceAfterReload(),
            syncMobileHubPrimaryBottomChrome: () => this.bottomBarController.syncMobileHubPrimaryBottomChrome(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
            forceCenterColumnFullWidth: () => this.forceCenterColumnFullWidth(),
            scheduleSnapAndUiRefresh: () => this.scheduleSnapAndUiRefresh(),
            ensureDesktopSidePanelSizes: () => this.ensureDesktopSidePanelSizes(),
            requestFullShellRelayout: () => this.requestFullShellRelayout(),
        };
        this.ideFallback = new MobileShellIdeFallbackController({
            host: this.ideFallbackHost,
            sessionState: this.sessionState,
        });
    }

    protected initWorkHubBootstrapController(): void {
        this.workHubBootstrapHost = {
            isMobileActive: () => this.mobileActive,
            getProjectsPanel: () => this.projectsPanel,
            setProjectsPanel: panel => { this.projectsPanel = panel; },
            shouldActivateMobileLayout: () => this.shouldActivateMobileLayout(),
            enterMobileLayout: () => this.enterMobileLayout(),
            onMediaChange: () => this.onMediaChange(),
            scheduleSnapAndUiRefresh: () => this.scheduleSnapAndUiRefresh(),
            collapseMobileSideSheets: () => this.collapseMobileSideSheets(),
            ensureWelcomeInMainArea: () => this.ensureWelcomeInMainArea(),
            ensureDesktopSidePanelSizes: () => this.ensureDesktopSidePanelSizes(),
            createProjectsPanel: homeMode => this.createProjectsPanel(homeMode),
            appendProjectsPanelToShell: panel => { this.shell.node.appendChild(panel.node); },
            disposeProjectsPanelForDesktopIde: () => this.ideFallback.disposeProjectsPanelForDesktopIde(),
            syncMobileHubPrimaryBottomChrome: () => this.bottomBarController.syncMobileHubPrimaryBottomChrome(),
            refreshBottomBar: () => this.bottomBarController.refreshBottomBar(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
            ensureDesktopWorkHubSessionsSidebarOpen: () => this.ensureDesktopWorkHubSessionsSidebarOpen(),
            applyLandingChrome: () => undefined,
            releaseMobileWorkHubBootGuardWhenReady: async () => undefined,
            isProjectsLandingSession: () => false,
            hasPendingHubAction: () => false,
            applyMobileProjectsPanelDismissAfterReload: () => undefined,
            refreshProjectBootstrapFromWorkspace: () => { void this.projectBootstrap.refreshFromCurrentWorkspace(); },
        };
        this.workHubBootstrap = new MobileShellWorkHubBootstrapController({
            host: this.workHubBootstrapHost,
            shell: this.shell,
            workspaceService: this.workspaceService,
            projectsService: this.projectsService,
            sessionState: this.sessionState,
        });
    }

    protected initBottomBarController(): void {
        this.bottomBarHost = {
            isMobileActive: () => this.mobileActive,
            getLandingLeftThisSession: () => this.sessionState.landingLeftThisSession,
            getProjectsCount: () => this.projectsCount,
            getProjectsPanel: () => this.projectsPanel,
            isMobileWorkHubLandingVisible: () => this.hubNavigation.isMobileWorkHubLandingVisible(),
            isPullRequestPanelShown: () => this.pullRequestPanelController.isPullRequestPanelShown(),
            isMobileAgentSheetVisible: () => this.isMobileAgentSheetVisible(),
            isMobileExploreSheetVisible: () => this.isMobileExploreSheetVisible(),
            getActivePreviewWidget: () => this.getActivePreviewWidget(),
            isSidePanelSheetCollapsedInDom: side => this.sideSheetController.isSidePanelSheetCollapsedInDom(side),
            scheduleSnapAndUiRefresh: () => this.sideSheetController.scheduleSnapAndUiRefresh(),
            refreshWorkbenchTopBar: () => this.refreshWorkbenchTopBar(),
            hideProjectsPanel: () => this.hideProjectsPanel(),
            hidePullRequestPanel: () => this.pullRequestPanelController.hidePullRequestPanel(),
            toggleProjectsPanel: () => this.toggleProjectsPanel(),
            togglePullRequestPanel: () => this.pullRequestPanelController.togglePullRequestPanel(),
            openMobileWorkHubLanding: view => this.hubNavigation.openMobileWorkHubLanding(view),
            collapseMobileSidePanels: () => this.sideSheetController.collapseMobileSidePanels(),
            dismissSheetsAsync: () => this.sideSheetController.dismissSheetsAsync(),
            settleMobileSidePanelsCollapsed: () => this.sideSheetController.settleMobileSidePanelsCollapsed(),
            onProjectsPanelOpen: project => this.onProjectsPanelOpen(project),
            refreshProjectsCount: () => this.refreshProjectsCount(),
            toggleMobileAgentSheet: () => this.toggleMobileAgentSheet(),
            toggleMobilePreview: () => this.toggleMobilePreview(),
            toggleMobileExploreSheet: () => this.toggleMobileExploreSheet(),
            openPullRequestPanel: () => this.pullRequestPanelController.openPullRequestPanel(),
            executeAndDismiss: commandId => this.executeAndDismiss(commandId),
            relayoutMainPreviewWidgets: () => this.relayoutMainPreviewWidgets(),
            conversationsStart: () => this.conversations.start(),
            inboxStreamStart: () => this.inboxStream.start(),
        };
        this.bottomBarController = new MobileShellBottomBarController({
            host: this.bottomBarHost,
            shell: this.shell,
            statusBar: this.statusBar,
            commands: this.commands,
            projectsService: this.projectsService,
            projectBootstrap: this.projectBootstrap,
            mobileMq: this.mobileMq,
        });
    }

    onStart(_app: FrontendApplication): void {
        this.workHubDiff.setDelegate(this);
        this.landing.syncFromStorage();
        installMobileWorkHubBootGuard();
        switch (resolveInitialLandingBodyClass(this.mobileMq?.matches === true)) {
            case 'agents':
                this.landingLeftThisSession = true;
                document.body.classList.remove('theia-mobile-mod-landing');
                setMobileWorkHubComposerHeaderChrome(true);
                break;
            case 'landing':
                document.body.classList.add('theia-mobile-mod-landing');
                break;
            case 'none':
                break;
        }
        this.mobileMq?.addEventListener('change', this.onMediaChange);
        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT, this.onDismissProjectsPanelEvent);
        window.addEventListener(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT, this.onLandingHubListChanged);
        this.landing.installAuthListener(this.toDispose);
        window.addEventListener('beforeunload', this.persistWorkHubSurfacePreference);
        this.toDispose.push(Disposable.create(() => {
            window.removeEventListener('beforeunload', this.persistWorkHubSurfacePreference);
        }));
        if (this.mobileMq?.matches || shouldPreferWorkHubAgentsLayout() || shouldBootstrapMobileAgentsChat()) {
            window.requestAnimationFrame(() => this.onMediaChange());
        }
    }

    /** Persist Agents surface choice so reload / wide viewport does not fall back to the IDE. */
    protected readonly persistWorkHubSurfacePreference = (): void => {
        if (peekPreferDesktopIde() || !this.workspaceService.opened || this.landing.isProjectsLandingSession()) {
            return;
        }
        if (this.mobileActive || document.body.classList.contains('theia-mobile-mod-workhub-composer-header')) {
            markPreferAgentsSurface();
        }
    };

    onDidInitializeLayout(app: FrontendApplication): void {
        this.ensureShellHooks(app.shell);
        void this.workHubBootstrap.bootstrapWorkHubSurfaceAfterLayout();
    }

    protected readonly onMediaChange = (): void => {
        this.workHubBootstrap.persistAgentsSurfaceForActiveSession();
        if (this.shouldActivateMobileLayout()) {
            this.enterMobileLayout();
        } else {
            this.leaveMobileLayout();
        }
    };

    onStop(_app: FrontendApplication): void {
        this.workHubDiff.setDelegate(undefined);
        this.mobileMq?.removeEventListener('change', this.onMediaChange);
        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT, this.onDismissProjectsPanelEvent);
        window.removeEventListener(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT, this.onLandingHubListChanged);
        this.teardownMobileUi();
        this.toDispose.dispose();
    }

    /** Work Hub is the default surface on every viewport; desktop IDE requires an explicit choice. */
    protected shouldActivateMobileLayout(): boolean {
        if (Boolean(this.mobileMq?.matches)) {
            return true;
        }
        if (peekPreferDesktopIde()) {
            return false;
        }
        if (shouldBootstrapMobileAgentsChat()) {
            return true;
        }
        if (shouldPreferWorkHubAgentsLayout()) {
            return true;
        }
        // Desktop also starts in Work Hub. The classic IDE is entered only through "Open IDE".
        return true;
    }

    /** Agents / Work Hub surface — not when the user explicitly chose the classic IDE. */
    protected shouldActivateWorkHubLayout(): boolean {
        return this.shouldActivateMobileLayout() && !peekPreferDesktopIde();
    }

    protected readonly onWindowResize = (): void => {
        this.onMediaChange();
    };

    protected ensureShellHooks(shell: ApplicationShell): void {
        this.sideSheetController.ensureShellHooks(shell, this.toDispose);
    }

    /** Bottom panel is visible with at least one widget (matches Projects “open” semantics for the bar). */
    protected isTerminalBottomPanelOpen(): boolean {
        return this.bottomBarController.isTerminalBottomPanelOpen();
    }

    /** Bottom terminal area is shown (may still be mid expand animation). */
    protected isMobileBottomTerminalVisible(): boolean {
        return this.bottomBarController.isMobileBottomTerminalVisible();
    }

    protected getBottomPanelPendingUpdate(): Promise<void> {
        return this.bottomBarController.getBottomPanelPendingUpdate();
    }

    /** Work Hub landing is active — user has not opened/focused a project in this session yet. */
    protected isProjectsLandingSession(): boolean {
        return this.landing.isProjectsLandingSession();
    }

    protected enterMobileLayout(): void {
        this.ensureShellHooks(this.shell);
        if (this.mobileActive) {
            if (!peekPreferDesktopIde()
                && !this.projectsPanel?.isVisible()
                && !this.projectsPanel?.isAgentsHubShellActive()) {
                this.tryBootstrapMobileAgentsChat();
            }
            return;
        }
        this.mobileActive = true;
        this.shell.node.classList.add(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        this.forceCenterColumnFullWidth();
        this.ensureOverlayElements();
        // Restored layout often leaves a side sheet expanded; collapse so the editor column is visible.
        void this.collapseMobileSideSheets().then(() => {
            if (peekPreferDesktopIde()) {
                this.syncMobileHubPrimaryBottomChrome();
                this.refreshBottomBar();
                this.refreshWorkbenchTopBar();
                this.scheduleSnapAndUiRefresh();
                return;
            }
            if (!peekPreferDesktopIde() && this.landingLeftThisSession && this.workspaceService.opened) {
                markPreferAgentsSurface();
            }
            this.landing.applyMobileProjectsPanelDismissAfterReload();
            if (!this.tryBootstrapMobileAgentsChat()) {
                this.ensureMobileProjectsHomeVisible();
            }
            this.scheduleSnapAndUiRefresh();
        });
    }

    protected leaveMobileLayout(): void {
        if (!this.mobileActive) {
            return;
        }
        const preserveProjectsLanding = this.isProjectsLandingSession();
        this.mobileActive = false;
        this.restoreMobileBottomPanelFromMaximized();
        this.shell.node.classList.remove(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        this.teardownMobileUi(preserveProjectsLanding);
        if (preserveProjectsLanding) {
            window.requestAnimationFrame(() => this.requestFullShellRelayout());
            return;
        }
        this.restoreDesktopSplitLayout();
        window.requestAnimationFrame(() => {
            void this.ensureDesktopSidePanelSizes();
            this.requestFullShellRelayout();
        });
    }

    /** Reset split + side panel pixel sizes after mobile (persisted layout often keeps width 0). */
    protected async ensureDesktopSidePanelSizes(): Promise<void> {
        if (this.shouldActivateMobileLayout() || !hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        this.restoreDesktopSplitLayout();
        const splitWidth = this.shell.leftRightSplitPanel.node.clientWidth;
        if (splitWidth <= 0) {
            return;
        }
        const target = Math.max(280, Math.min(360, Math.round(splitWidth * 0.22)));
        if (this.shell.isExpanded('left')) {
            await this.setSidePanelSize('left', target);
        }
        if (this.shell.isExpanded('right')) {
            await this.setSidePanelSize('right', target);
        }
        this.requestFullShellRelayout();
        await this.desktopTerminalLayout.ensureDesktopTerminalNormal();
    }

    protected async setSidePanelSize(side: 'left' | 'right', size: number): Promise<void> {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        if (handler instanceof QaapSidePanelHandler) {
            await handler.applyPanelSize(size);
        }
    }

    protected restoreDesktopSplitLayout(): void {
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        try {
            // Leave desktop sidebars collapsed by default; individual views restore/expand themselves.
            this.shell.leftRightSplitPanel.setRelativeSizes([0, 1, 0]);
        } catch {
            /* layout not ready */
        }
        const bottomSplit = this.bottomBarController.getBottomAreaSplitPanel();
        if (bottomSplit) {
            try {
                bottomSplit.setRelativeSizes([1, 0]);
            } catch {
                /* layout not ready */
            }
        }
    }

    protected forceCenterColumnFullWidth(): void {
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        try {
            // Side sheets are `position: fixed` overlays — center must always keep full split width
            // so the editor stack and bottom (terminal) panel can lay out inside #theia-bottom-split-panel.
            this.shell.leftRightSplitPanel.setRelativeSizes([0, 1, 0]);
        } catch {
            /* layout not ready */
        }
        this.bottomBarController.syncMobileBottomSplit();
    }

    protected getBottomAreaSplitPanel(): SplitPanel | undefined {
        return this.bottomBarController.getBottomAreaSplitPanel();
    }

    protected measureMobileBottomPanelHeightPx(): number | undefined {
        return this.bottomBarController.measureMobileBottomPanelHeightPx();
    }

    protected resolveMobileBottomSplitSizes(): [number, number] {
        return this.bottomBarController.resolveMobileBottomSplitSizes();
    }

    protected syncMobileBottomSplit(): void {
        this.bottomBarController.syncMobileBottomSplit();
    }

    protected async applyMobileBottomPanelMaximizedSize(): Promise<void> {
        return this.bottomBarController.applyMobileBottomPanelMaximizedSize();
    }

    protected restoreMobileBottomPanelFromMaximized(): void {
        this.bottomBarController.restoreMobileBottomPanelFromMaximized();
    }

    protected getMaximizedOverlayElement(): HTMLElement | undefined {
        return this.bottomBarController.getMaximizedOverlayElement();
    }

    protected syncMobileMaximizedOverlayInsets(): void {
        this.bottomBarController.syncMobileMaximizedOverlayInsets();
    }

    protected clearMobileMaximizedOverlayInsets(): void {
        this.bottomBarController.clearMobileMaximizedOverlayInsets();
    }

    protected updateMobileShellStateClasses(): void {
        this.bottomBarController.updateMobileShellStateClasses();
    }

    protected requestFullShellRelayout(): void {
        MessageLoop.sendMessage(this.shell, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.UpdateRequest);
        MessageLoop.postMessage(this.shell.mainPanel, LuminoWidget.Msg.FitRequest);
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        const split = this.shell.leftRightSplitPanel;
        MessageLoop.sendMessage(split, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(split, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(split, LuminoWidget.Msg.UpdateRequest);
        for (const child of toArray(split.widgets)) {
            MessageLoop.sendMessage(child, LuminoWidget.ResizeMessage.UnknownSize);
            MessageLoop.postMessage(child, LuminoWidget.Msg.FitRequest);
            MessageLoop.postMessage(child, LuminoWidget.Msg.UpdateRequest);
        }
        if (this.shell.isExpanded('left')) {
            this.sideSheetController.relayoutMobileSidePanelHandler('left');
        }
        if (this.shell.isExpanded('right')) {
            this.sideSheetController.relayoutMobileSidePanelHandler('right');
        }
        MessageLoop.postMessage(this.shell.mainPanel, LuminoWidget.Msg.UpdateRequest);
    }

    protected teardownMobileUi(preserveProjectsLanding = false): void {
        this.bottomBarController.removeBottomBarSecondaryMenu();
        this.overlayController.removeBackdrop();
        setMobileWorkHubHideBottomChrome(false);
        setMobileWorkHubComposerHeaderChrome(false);
        setMobileActiveTranscriptChrome(false);
        document.body.classList.remove('theia-mobile-mod-landing');
        this.bottomBarController.unpinBottomChromeFromBody();
        this.bottomBarController.detachBottomBarFromShell();
        this.overlayController.teardown();
        if (preserveProjectsLanding) {
            this.landing.applyLandingChrome();
            this.shell.node.classList.remove(MOBILE_BOTTOM_OPEN_CLASS);
            return;
        }
        this.hideProjectsPanel();
        if (this.projectsPanel) {
            this.projectsPanel.dispose();
            if (this.projectsPanel.node.parentElement) {
                this.projectsPanel.node.parentElement.removeChild(this.projectsPanel.node);
            }
        }
        this.projectsPanel = undefined;
        this.pullRequestPanelController.disposePullRequestPanel();
        this.shell.node.classList.remove(MOBILE_BOTTOM_OPEN_CLASS);
    }

    protected ensureOverlayElements(): void {
        if (!this.mobileActive) {
            return;
        }
        this.overlayController.removeBackdrop();
        this.bottomBarController.ensureBottomBarWidget();
        this.bottomBarController.pinBottomChromeToBody();
        this.overlayController.ensureMounted();
        this.landing.applyMobileProjectsPanelDismissAfterReload();
        if (peekPreferDesktopIde()) {
            this.syncMobileHubPrimaryBottomChrome();
            this.refreshBottomBar();
            this.refreshWorkbenchTopBar();
        } else {
            this.ensureProjectsPanel();
            if (!this.tryBootstrapMobileAgentsChat()) {
                this.ensureMobileProjectsHomeVisible();
            }
        }
        void this.refreshProjectsCount();
        if (!peekPreferDesktopIde()) {
            this.refreshBottomBar();
        }
        this.overlayController.updateBackdropVisibility();
    }

    protected cancelAgentsBootstrap(): void {
        this.workHubBootstrap.cancelAgentsBootstrap();
    }

    protected disposeProjectsPanelForDesktopIde(): void {
        this.ideFallback.disposeProjectsPanelForDesktopIde();
    }

    protected tryBootstrapMobileAgentsChat(): boolean {
        return this.workHubBootstrap.tryBootstrapMobileAgentsChat();
    }

    protected async restoreAgentsSurfaceAfterReload(): Promise<void> {
        return this.workHubBootstrap.restoreAgentsSurfaceAfterReload();
    }

    protected ensureMobileProjectsHomeVisible(): void {
        this.workHubBootstrap.ensureMobileProjectsHomeVisible();
    }

    /**
     * Tras abrir un proyecto el panel se cierra y el main puede quedar vacío unos instantes; reintenta
     * Welcome y README hasta que haya un widget en el área principal.
     */
    protected async ensureMainContentAfterWorkspaceReload(): Promise<void> {
        if (!this.landingLeftThisSession || !this.workspaceService.opened) {
            return;
        }
        if (shouldBootstrapMobileAgentsChat() || shouldPreferWorkHubAgentsLayout()) {
            return;
        }
        const fillMain = async (): Promise<void> => {
            if (toArray(this.shell.mainPanel.widgets()).length > 0) {
                return;
            }
            await this.ensureWelcomeInMainArea();
            if (toArray(this.shell.mainPanel.widgets()).length === 0) {
                await this.projectsReadme.retryPendingReadmeOpen();
            }
        };
        await fillMain();
        for (const delayMs of [400, 1200, 2500]) {
            window.setTimeout(() => { void fillMain(); }, delayMs);
        }
    }

    protected ensureProjectsPanel(forceHomeMode?: boolean): void {
        this.workHubBootstrap.ensureProjectsPanel(forceHomeMode);
    }

    protected createProjectsPanel(homeMode: boolean): MobileProjectsPanel {
        // On mobile every session lands on the Projects view, regardless of whether a workspace is
        // already opened. The landing is full-screen and hides the bottom navigation; once the user
        // explicitly enters a project (Focus / open), `landingLeftThisSession` flips so the workspace
        // remains visible until the top-bar return action asks for Projects again.
        return new MobileProjectsPanel(
            this.projectsService,
            this.commands,
            {
                onProjectOpen: (project: MobileProjectEntry) => { void this.onProjectsPanelOpen(project); },
                onProjectOpenInIde: (project: MobileProjectEntry) => { void this.onProjectsPanelOpenInIde(project); },
                onDismiss: () => {
                    this.landing.onLandingDismissed();
                    this.scheduleSnapAndUiRefresh();
                    this.refreshBottomBar();
                    this.refreshWorkbenchTopBar();
                },
                onWorkspaceOpened: () => this.onProjectsWorkspaceOpened(),
                onProjectsChanged: () => { void this.refreshProjectsCount().then(() => this.refreshBottomBar()); },
                onCurrentProjectActivated: () => this.onCurrentProjectActivated(),
                onResumePreview: (project) => {
                    void this.commands.executeCommand('qaap.hub.resumePreview', project);
                },
                onOpenAgentOnTask: (project) => {
                    void this.commands.executeCommand('qaap.mobile.openAgentOnTask', project);
                },
                onOpenPullRequest: pullRequest => {
                    void this.openPullRequestFromInbox(pullRequest);
                },
                onShowAgentsHub: () => { void this.hubNavigation.openMobileWorkHubLanding('tasks'); },
                onShowRoutinesHub: () => { void this.hubNavigation.openMobileWorkHubLanding('routines'); },
                onHubLandingViewChanged: () => {
                    this.syncMobileHubPrimaryBottomChrome();
                    this.refreshBottomBar();
                    this.refreshWorkbenchTopBar();
                },
                onEnterActiveTranscript: () => this.transcriptChrome.onEnterActiveTranscript(),
                onExitActiveTranscript: () => { void this.transcriptChrome.onExitActiveTranscript(); },
            },
            {
                homeMode,
                activeTasks: this.activeTasks,
                conversations: this.conversations,
                backgroundContext: this.backgroundContext,
                inboxStream: this.inboxStream,
                conversationFlags: this.conversationFlags,
                // Use WidgetManager with our own factory id (registered by the mobile-shell
                // module) so each call returns a fresh `MobileProjectAIChatInputWidget` instance.
                // That subclass overrides `getResourceUri` to mint a per-instance URI, which is
                // what unblocks the empty agent-input card: the vanilla AIChatInputWidget calls
                // `resources.add('ai-chat:/input.aichatviewlanguage', '')` in its postConstruct,
                // and the workspace Agent AI view already owns that key — a second registration
                // throws "Cannot add already existing in-memory resource" and the create promise
                // never resolves.
                createChatInputWidget: id => this.widgetManager.getOrCreateWidget<AIChatInputWidget>(
                    'mobile-projects-chat-input',
                    { source: 'mobile-projects', id },
                ),
                createChatViewWidget: id => Promise.resolve(
                    this.mobileProjectChatViewWidgetFactory(id)
                ),
                chatService: this.chatService,
                chatAgentService: this.chatAgentService,
                messageService: this.messageService,
                pickContextVariable: (anchor, handlers) => pickMobileContextVariable(
                    anchor,
                    this.variableService,
                    this.quickInputService,
                    {
                        fileUploadService: this.fileUploadService,
                        fileService: this.fileService,
                        workspaceService: this.workspaceService,
                    },
                    handlers,
                ),
                formatContextChip: item => resolveStickyComposerContextChip(item, this.labelProvider),
                resolveAttachmentPreview: item => resolveStickyComposerAttachmentPreview(
                    item,
                    this.fileService,
                    this.workspaceService,
                ),
                getComposerVariables: () => this.variableService.getVariables(),
                createDiffReviewWidget: () => this.widgetManager.getOrCreateWidget(QaapDiffReviewWidget.ID),
                resolveVerifyChecks: cwd => resolveAgentVerifyChecksForCwd(cwd, this.fileService),
                openTranscriptFile: filePath => openTranscriptWorkspaceFile(
                    filePath,
                    this.workspaceService,
                    this.editorManager,
                ),
                createTranscriptFilesViewServices: () => createTranscriptFilesViewServices(
                    this.workspaceService,
                    this.fileService,
                    this.editorManager,
                    this.commands,
                    this.monacoEditorProvider,
                    this.labelProvider,
                    this.markdownPreviewHandler,
                ),
                createTranscriptTerminalViewServices: () => createTranscriptTerminalViewServices(
                    this.terminalService,
                    this.workspaceService,
                ),
                previewSurfaceRegistry: this.previewSurfaceRegistry,
                previewInspectorDeps: {
                    service: this.elementInspectorService,
                    commands: this.commands,
                },
                clipboard: this.clipboardService,
                readPreference: key => this.preferenceService.get(key),
                getRegisteredLanguageModels: this.languageModelRegistry
                    ? () => this.languageModelRegistry!.getLanguageModels()
                    : undefined,
                quickInputService: this.quickInputService,
                commitMessageAi: this.commitMessageAi,
                openPreferencesSheet: query => this.openWorkHubPreferencesSheet(query),
                openAiConfigurationSheet: tabId => this.openWorkHubAiConfigurationSheet(tabId),
                projectBootstrap: this.projectBootstrap,
            }
        );
    }

    protected ensureDesktopWorkHubSessionsSidebarOpen(): void {
        if (matchesMobileOneColumnLayout() || peekPreferDesktopIde() || hasDesktopSessionsSidebarCollapsed()) {
            return;
        }
        const panel = this.projectsPanel;
        if (!panel?.isVisible() || !panel.isHomeMode() || panel.isWorkHubSessionsSidebarVisible()) {
            return;
        }
        panel.openWorkHubSessionsSidebar();
    }

    /** Remove every PR overlay node under the app shell (fixes stacked sheets after re-open). */
    protected removeAllMobilePrPanelsFromShell(): void {
        this.pullRequestPanelController.removeAllMobilePrPanelsFromShell();
    }

    protected isPullRequestPanelShown(): boolean {
        return this.pullRequestPanelController.isPullRequestPanelShown();
    }

    protected disposePullRequestPanel(): void {
        this.pullRequestPanelController.disposePullRequestPanel();
    }

    protected openPullRequestPanel(): void {
        this.pullRequestPanelController.openPullRequestPanel();
    }

    protected async openPullRequestFromInbox(pullRequest: QaapGithubPullRequestSummary): Promise<void> {
        return this.pullRequestPanelController.openPullRequestFromInbox(pullRequest);
    }

    protected async refreshProjectsCount(): Promise<void> {
        try {
            const projects = await this.projectsService.loadProjects();
            this.projectsCount = projects.length;
        } catch {
            this.projectsCount = 0;
        }
    }

    protected hideProjectsPanel(): void {
        this.projectsPanel?.hide();
        this.landing.applyLandingChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    protected hidePullRequestPanel(): void {
        this.pullRequestPanelController.hidePullRequestPanel();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapMobileProjectsDashboardCommands.TOGGLE, {
            execute: () => {
                if (peekPreferDesktopIde()) {
                    this.returnToAgentsFromDesktopIde();
                    return;
                }
                return this.toggleProjectsPanel();
            },
            isEnabled: () => this.shouldActivateMobileLayout() && this.workspaceService.opened,
            isVisible: () => matchesMobileOneColumnLayout() && this.workspaceService.opened,
        });
        // Project card "Open agent" button. Submits to the backend agent-task runner so the work
        // is a detached child process, not a tab-bound chat; the agent keeps going after the
        // user closes the tab.
        registry.registerCommand({ id: 'qaap.mobile.openAgentOnTask' }, {
            execute: (project: MobileProjectEntry) => this.openAgentTaskComposer(project),
        });
        registry.registerCommand({ id: 'qaap.mobile.toggleSessionsSidebar' }, {
            execute: () => this.toggleWorkHubSessionsSidebar(),
            isEnabled: () => this.mobileActive && this.workspaceService.opened,
            isVisible: () => matchesMobileOneColumnLayout() && this.workspaceService.opened,
        });
        registry.registerCommand({
            id: QAAP_WORK_HUB_OVERVIEW_COMMAND,
            label: nls.localize('qaap/accountMenu/workHubOverview', 'Work Hub overview'),
        }, {
            execute: () => this.openMobileWorkHubLanding('tasks'),
            isEnabled: () => this.mobileActive,
            isVisible: () => matchesMobileOneColumnLayout(),
        });
        registry.registerCommand({
            id: QAAP_MOBILE_OPEN_DESKTOP_IDE_COMMAND,
            label: nls.localize('qaap/mobile/openDesktopIde', 'Open IDE'),
        }, {
            execute: () => this.openDesktopIde(),
            isEnabled: () => this.workspaceService.opened
                && this.shouldActivateMobileLayout()
                && !peekPreferDesktopIde(),
            isVisible: () => this.workspaceService.opened && this.shouldActivateWorkHubLayout(),
        });
    }

    protected openDesktopIde(): void {
        this.ideFallback.openDesktopIde();
    }

    /** Top-bar «Back to Work Hub» from mobile desktop-IDE mode — restore the Agents execution shell. */
    protected returnToAgentsFromDesktopIde(): void {
        this.ideFallback.returnToAgentsFromDesktopIde();
    }

    protected toggleWorkHubSessionsSidebar(): void {
        this.ensureProjectsPanel();
        this.projectsPanel?.toggleWorkHubSessionsSidebar();
    }

    protected onEnterActiveTranscript(): void {
        this.transcriptChrome.onEnterActiveTranscript();
    }

    protected async onExitActiveTranscript(): Promise<void> {
        return this.transcriptChrome.onExitActiveTranscript();
    }

    protected async openAgentTaskComposer(project: MobileProjectEntry): Promise<void> {
        if (!project) {
            return;
        }
        const cwd = this.projectsService.getProjectCwd(project);
        if (!this.agentTaskComposer) {
            this.agentTaskComposer = new MobileAgentTaskComposer(this.activeTasks, {
                onSubmitted: () => {
                    MobileSnackbar.show(
                        nls.localize('qaap/mobileProjects/agentTaskQueued', 'Agent task started'),
                        { kind: 'success' }
                    );
                },
            }, this.backgroundContext);
            document.body.appendChild(this.agentTaskComposer.node);
            this.toDispose.push(Disposable.create(() => {
                this.agentTaskComposer?.dispose();
                this.agentTaskComposer?.node.parentElement?.removeChild(this.agentTaskComposer.node);
                this.agentTaskComposer = undefined;
            }));
        }
        await this.agentTaskComposer.show(project, cwd);
    }

    protected async openWorkHubPreferencesSheet(query?: string): Promise<void> {
        if (!this.workHubPreferencesSheet) {
            this.workHubPreferencesSheet = new MobileWorkHubPreferencesSheet(this.widgetManager, this.preferenceService);
            document.body.appendChild(this.workHubPreferencesSheet.node);
            this.toDispose.push(Disposable.create(() => {
                this.workHubPreferencesSheet?.dispose();
                this.workHubPreferencesSheet = undefined;
            }));
        }
        await this.workHubPreferencesSheet.show(query);
    }

    protected async openWorkHubAiConfigurationSheet(tabId?: string): Promise<void> {
        if (!this.workHubAiConfigurationSheet) {
            this.workHubAiConfigurationSheet = new MobileWorkHubAiConfigurationSheet(
                this.widgetManager,
                this.aiConfigurationSelectionService,
            );
            document.body.appendChild(this.workHubAiConfigurationSheet.node);
            this.toDispose.push(Disposable.create(() => {
                this.workHubAiConfigurationSheet?.dispose();
                this.workHubAiConfigurationSheet = undefined;
            }));
        }
        await this.workHubAiConfigurationSheet.show(tabId);
    }

    protected async toggleProjectsPanel(): Promise<void> {
        if (this.projectsPanel?.isHomeMode() && this.projectsPanel.isVisible()) {
            return;
        }
        this.hidePullRequestPanel();
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        await this.showMobileProjectsHome('tasks');
    }

    protected async showMobileProjectsHome(preferredHubView?: MobileProjectsHubView): Promise<void> {
        return this.workHubBootstrap.showMobileProjectsHome(preferredHubView);
    }

    /**
     * Abre el Work Hub a pantalla completa y selecciona una pestaña del landing (Home, Agents, Routines).
     */
    protected dismissMobileAgentTranscriptOverlays(): void {
        this.hubNavigation.dismissMobileAgentTranscriptOverlays();
    }

    protected isMobileWorkHubLandingVisible(): boolean {
        return this.hubNavigation.isMobileWorkHubLandingVisible();
    }

    protected syncHubLandingNavigation(view: MobileProjectsHubView): boolean {
        return this.hubNavigation.syncHubLandingNavigation(view);
    }

    protected async finalizeHubLandingNavigation(): Promise<void> {
        return this.hubNavigation.finalizeHubLandingNavigation();
    }

    protected async openMobileWorkHubLanding(view: MobileProjectsHubView): Promise<void> {
        return this.hubNavigation.openMobileWorkHubLanding(view);
    }

    protected async togglePullRequestPanel(): Promise<void> {
        return this.pullRequestPanelController.togglePullRequestPanel();
    }

    protected async onProjectsPanelOpen(project: MobileProjectEntry): Promise<void> {
        this.landing.leaveMobileProjectsLandingNow();
        try {
            if (project.isCurrent) {
                await this.onCurrentProjectActivated();
                return;
            }
            await this.projectsService.openInCurrentWindowAsync(project);
        } finally {
            this.scheduleSnapAndUiRefresh();
        }
    }

    /** Sessions sidebar "Open in IDE" — leave Agents and surface the editor stack. */
    protected async onProjectsPanelOpenInIde(project: MobileProjectEntry): Promise<void> {
        try {
            this.openDesktopIde();
            if (project.isCurrent) {
                await this.onCurrentProjectActivated();
                return;
            }
            await this.projectsService.openInCurrentWindowAsync(project);
        } finally {
            if (!peekPreferDesktopIde()) {
                this.scheduleSnapAndUiRefresh();
            }
        }
    }

    /** Dismiss the projects sheet after clone/create/open so the IDE workspace is visible. */
    protected onProjectsWorkspaceOpened(): void {
        this.landing.onLandingDismissed();
        this.hideProjectsPanel();
        this.scheduleSnapAndUiRefresh();
    }

    /**
     * Called when the user taps the project that already matches the active workspace.
     * Brings the README to the editor (or falls back to any existing main widget) instead of
     * reloading the window.
     */
    protected async onCurrentProjectActivated(): Promise<void> {
        const opened = await this.projectsReadme.openReadmeForCurrentWorkspace();
        if (opened) {
            return;
        }
        // No README to show: focus an existing editor if any, so the user lands in the editor area.
        const widgets = toArray(this.shell.mainPanel.widgets());
        const target = this.shell.activeWidget && widgets.includes(this.shell.activeWidget)
            ? this.shell.activeWidget
            : widgets[0];
        if (target) {
            void this.shell.activateWidget(target.id);
        }
    }

    protected ensureBottomChromeHost(): HTMLElement {
        return this.bottomBarController.ensureBottomChromeHost();
    }

    protected pinBottomChromeToBody(): void {
        this.bottomBarController.pinBottomChromeToBody();
    }

    protected installBottomChromeTouchScroll(): void {
        this.bottomBarController.installBottomChromeTouchScroll();
    }

    protected unpinBottomChromeFromBody(): void {
        this.bottomBarController.unpinBottomChromeFromBody();
    }

    protected detachBottomBarFromShell(): void {
        this.bottomBarController.detachBottomBarFromShell();
    }

    protected async dismissMobileSideSheets(): Promise<void> {
        return this.sideSheetController.dismissMobileSideSheets();
    }

    protected scheduleSnapAndUiRefresh(): void {
        this.sideSheetController.scheduleSnapAndUiRefresh();
    }

    /** Pause mini-browser dev-server iframes while Work Hub is foreground (avoids Vite HMR console noise). */
    protected syncIdeMiniBrowserPreviewSuspension(): void {
        const userViewingIdePreview = peekPreferDesktopIde() && !!this.getActivePreviewWidget();
        syncQaapMiniBrowserPreviewSuspension(this.shell, userViewingIdePreview);
    }

    protected async prepareSideSheetOpen(side: 'left' | 'right'): Promise<void> {
        const other: 'left' | 'right' = side === 'left' ? 'right' : 'left';
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.shell.isExpanded(other)) {
            await this.shell.collapsePanel(other);
        }
    }

    protected async mountSideSheetWidget(side: 'left' | 'right', widgetId: string): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(widgetId);
        const area = widget.isAttached ? this.shell.getAreaFor(widget) : undefined;
        if (!widget.isAttached || area !== side) {
            await this.shell.addWidget(widget, { area: side });
        }
        await this.shell.activateWidget(widgetId);
        if (!this.shell.isExpanded(side)) {
            this.shell.expandPanel(side);
        }
    }

    protected isWorkHubLandingBottomBar(): boolean {
        return this.bottomBarController.isWorkHubLandingBottomBar();
    }

    protected isMobileWorkspaceHubPrimaryBottomBar(): boolean {
        return this.bottomBarController.isMobileWorkspaceHubPrimaryBottomBar();
    }

    protected isMainAgentSurfaceEmpty(): boolean {
        return this.bottomBarController.isMainAgentSurfaceEmpty();
    }

    protected syncMobileHubPrimaryBottomChrome(): void {
        this.bottomBarController.syncMobileHubPrimaryBottomChrome();
    }

    protected getWorkHubLandingBottomButtons(): MobileBottomButton[] {
        return this.bottomBarController.getWorkHubLandingBottomButtons();
    }

    async openDiffInWorkHub(projectId?: string): Promise<void> {
        if (!this.mobileActive) {
            const widget = await this.widgetManager.getOrCreateWidget(QaapDiffReviewWidget.ID);
            if (!widget.isAttached) {
                this.shell.addWidget(widget, { area: 'main' });
            }
            await this.shell.activateWidget(widget.id);
            return;
        }
        const onHubLanding = this.projectsPanel?.isHomeMode() === true
            && this.projectsPanel.isVisible()
            && document.body.classList.contains('theia-mobile-mod-landing')
            && !this.landingLeftThisSession;
        if (onHubLanding) {
            this.landing.applyLandingChrome();
            await this.projectsPanel?.openDiffView(projectId);
            this.refreshBottomBar();
            return;
        }
        await this.openProjectScopedDiffView(projectId);
    }

    /** Working-changes review inside the active workspace sheet (not the cross-project Work Hub tab). */
    protected async openProjectScopedDiffView(projectId?: string): Promise<void> {
        this.hidePullRequestPanel();
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        if (this.projectsPanel?.isHomeMode()) {
            this.projectsPanel.hide();
            this.projectsPanel.dispose();
            this.projectsPanel.node.parentElement?.removeChild(this.projectsPanel.node);
            this.projectsPanel = undefined;
        }
        this.ensureProjectsPanel(false);
        const panel = this.projectsPanel;
        if (!panel) {
            return;
        }
        document.body.classList.remove('theia-mobile-mod-landing');
        await panel.show();
        const resolvedProjectId = projectId ?? (await this.projectsService.loadProjects())
            .find(project => project.isCurrent)?.id;
        await panel.openProjectDiffView(resolvedProjectId);
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    protected getMobileBottomButtons(): MobileBottomButton[] {
        return this.bottomBarController.getMobileBottomButtons();
    }

    protected isMobileBottomButtonActive(id: MobileBottomButtonId): boolean {
        return this.bottomBarController.isMobileBottomButtonActive(id);
    }

    protected canToggleTerminalBottomPanel(): boolean {
        return this.bottomBarController.canToggleTerminalBottomPanel();
    }

    protected async toggleTerminalBottomPanel(): Promise<void> {
        return this.bottomBarController.toggleTerminalBottomPanel();
    }

    protected refreshWorkbenchTopBar(): void {
        for (const widget of toArray(this.shell.topPanel.widgets)) {
            if (widget instanceof QaapWorkbenchHistoryNavWidget) {
                widget.refreshChrome();
                return;
            }
        }
    }

    protected refreshBottomBar(): void {
        this.bottomBarController.refreshBottomBar();
    }

    protected createMobileBottomButton(def: MobileBottomButton): HTMLButtonElement {
        return this.bottomBarController.createMobileBottomButton(def);
    }

    protected installBottomBarLongPress(btn: HTMLButtonElement, def: MobileBottomButton): void {
        this.bottomBarController.installBottomBarLongPress(btn, def);
    }

    protected async showBottomBarSecondaryMenu(anchor: HTMLElement, def: MobileBottomButton): Promise<void> {
        return this.bottomBarController.showBottomBarSecondaryMenu(anchor, def);
    }

    protected removeBottomBarSecondaryMenu(): void {
        this.bottomBarController.removeBottomBarSecondaryMenu();
    }

    protected async getBottomBarSecondaryItems(def: MobileBottomButton): Promise<BottomBarSecondaryItem[]> {
        return this.bottomBarController.getBottomBarSecondaryItems(def);
    }

    protected async getProjectsSecondaryItems(): Promise<BottomBarSecondaryItem[]> {
        return this.bottomBarController.getProjectsSecondaryItems();
    }

    protected getTerminalSecondaryItems(): BottomBarSecondaryItem[] {
        return this.bottomBarController.getTerminalSecondaryItems();
    }

    protected getAgentSecondaryItems(): BottomBarSecondaryItem[] {
        return this.bottomBarController.getAgentSecondaryItems();
    }

    protected getPullRequestSecondaryItems(): BottomBarSecondaryItem[] {
        return this.bottomBarController.getPullRequestSecondaryItems();
    }

    protected getPreviewSecondaryItems(): BottomBarSecondaryItem[] {
        return this.bottomBarController.getPreviewSecondaryItems();
    }

    protected getExploreSecondaryItems(): BottomBarSecondaryItem[] {
        return this.bottomBarController.getExploreSecondaryItems();
    }

    protected async executeAndDismiss(commandId: string): Promise<void> {
        try {
            await this.commands.executeCommand(commandId);
        } catch (e) {
            console.error(`[qaap-mobile-shell] secondary action failed: ${commandId}`, e);
        }
        this.scheduleSnapAndUiRefresh();
    }

    protected async onMobileBottomButtonClick(def: MobileBottomButton, btn: HTMLButtonElement): Promise<void> {
        return this.bottomBarController.onMobileBottomButtonClick(def, btn);
    }

    protected relayoutMainPreviewWidgets(): void {
        for (const widget of toArray(this.shell.mainPanel.widgets())) {
            if (widget.id.startsWith('mini-browser:')) {
                this.sideSheetController.relayoutSheetTree(widget);
            }
        }
    }

    protected async toggleMobileAgentSheet(): Promise<void> {
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.isMobileAgentSheetVisible()) {
            await this.collapseMobileSidePanels();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        const project = await this.resolveCurrentProjectForAgent();
        if (project) {
            const cwd = this.projectsService.getProjectCwd(project);
            writeStoredComposerSurface(cwd, 'chat');
            this.projectsPanel?.preferComposerSurface('chat', cwd);
        }
        // Mobile "Agent" opens Theia AI Chat in the right sheet.
        await this.openMobileSideSheet('right', WORKBENCH_CHAT_VIEW_WIDGET_ID);
        this.scheduleSnapAndUiRefresh();
    }

    protected isMobileAgentSheetVisible(): boolean {
        return this.shell.isExpanded('right') && !this.sideSheetController.isSidePanelSheetCollapsedInDom('right');
    }

    protected async resolveCurrentProjectForAgent(): Promise<MobileProjectEntry | undefined> {
        try {
            const projects = await this.projectsService.loadProjects();
            const currentName = this.projectsService.getCurrentWorkspaceName()?.toLowerCase();
            const currentCwd = this.projectsService.getCurrentWorkspaceCwd()?.toLowerCase();
            return projects.find(project => project.isCurrent)
                ?? projects.find(project => this.projectsService.projectMatchesCurrentWorkspace(project))
                ?? projects.find(project => !!currentName && project.name.toLowerCase() === currentName)
                ?? projects.find(project => {
                    if (!currentCwd) {
                        return false;
                    }
                    const projectCwd = this.projectsService.getProjectCwd(project)?.toLowerCase();
                    return !!projectCwd && projectCwd === currentCwd;
                });
        } catch {
            return undefined;
        }
    }

    protected async toggleMobileExploreSheet(): Promise<void> {
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.isMobileExploreSheetVisible()) {
            await this.collapseMobileSidePanels();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        await this.openMobileSideSheet('left', EXPLORER_VIEW_CONTAINER_ID);
        this.scheduleSnapAndUiRefresh();
    }

    protected isMobileExploreSheetVisible(): boolean {
        if (!this.shell.isExpanded('left') || this.sideSheetController.isSidePanelSheetCollapsedInDom('left')) {
            return false;
        }
        const currentTitle = this.shell.leftPanelHandler.tabBar.currentTitle;
        return currentTitle?.owner?.id === EXPLORER_VIEW_CONTAINER_ID;
    }

    protected getActivePreviewWidget(): LuminoWidget | undefined {
        const active = this.shell.activeWidget ?? this.shell.currentWidget;
        if (active?.id === MINI_BROWSER_PREVIEW_WIDGET_ID && this.shell.getAreaFor(active) === 'main') {
            return active;
        }
        return undefined;
    }

    protected findPreviewWidget(): LuminoWidget | undefined {
        for (const area of ['main', 'right', 'left', 'bottom'] as ApplicationShell.Area[]) {
            const match = this.shell.getWidgets(area).find(widget => widget.id === MINI_BROWSER_PREVIEW_WIDGET_ID);
            if (match) {
                return match;
            }
        }
        return undefined;
    }

    protected getMainPreviewWidget(): LuminoWidget | undefined {
        return this.shell.getWidgets('main').find(widget => widget.id === MINI_BROWSER_PREVIEW_WIDGET_ID);
    }

    /** True when the preview tab has mini-browser chrome (not a layout-restore shell with no content). */
    protected isMainPreviewWidgetLive(preview: LuminoWidget): boolean {
        if (!preview.isAttached) {
            return false;
        }
        return !!preview.node.querySelector(
            '.theia-mini-browser-toolbar, .theia-mini-browser-toolbar-read-only, .qaap-mini-browser-shell .theia-mini-browser'
        );
    }

    protected async closeStaleMainPreviewWidget(): Promise<void> {
        const preview = this.getMainPreviewWidget();
        if (!preview || this.isMainPreviewWidgetLive(preview)) {
            return;
        }
        await this.shell.closeWidget(preview.id, { save: false });
    }

    /** Preview lives in the editor column — never behind Work Hub chrome that hides `#theia-main-content-panel`. */
    protected ensureMobilePreviewEditorVisible(): void {
        if (!this.mobileActive) {
            return;
        }
        setMobileWorkHubHideBottomChrome(false);
        setMobileWorkHubComposerHeaderChrome(false);
        setMobileActiveTranscriptChrome(false);
        document.body.classList.remove('theia-mobile-mod-landing');
        if (!peekPreferDesktopIde()) {
            markPreferDesktopIde();
        }
    }

    protected async activateMainPreviewWidget(): Promise<boolean> {
        const preview = this.getMainPreviewWidget();
        if (!preview || !this.isMainPreviewWidgetLive(preview)) {
            return false;
        }
        await this.shell.activateWidget(preview.id);
        this.relayoutMainPreviewWidgets();
        return true;
    }

    protected async relocatePreviewToMainIfNeeded(): Promise<void> {
        const preview = this.findPreviewWidget();
        if (!preview?.isAttached) {
            return;
        }
        if (this.shell.getAreaFor(preview) === 'main') {
            return;
        }
        await this.shell.closeWidget(preview.id, { save: false });
    }

    protected async toggleMobilePreview(): Promise<void> {
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        this.ensureMobilePreviewEditorVisible();
        const activePreview = this.getActivePreviewWidget();
        if (activePreview) {
            activePreview.close();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        if (await this.activateMainPreviewWidget()) {
            this.scheduleSnapAndUiRefresh();
            return;
        }
        await this.relocatePreviewToMainIfNeeded();
        await this.closeStaleMainPreviewWidget();
        if (this.shouldDismissSheetsForButton('preview')) {
            await this.dismissSheetsAsync();
        }
        // Always mount mini-browser chrome first — never block the UI on install/dev-server bootstrap.
        await this.openMobilePreviewInMain();
        void this.bootstrapMobilePreviewInBackground();
    }

    /** After the preview tab is visible, attach to an existing URL or start install/dev as needed. */
    protected async bootstrapMobilePreviewInBackground(): Promise<void> {
        try {
            if (this.projectBootstrap.previewUrl) {
                await this.projectBootstrap.focusPreview();
                await this.activateMainPreviewWidget();
                return;
            }
            const phase = this.projectBootstrap.phase;
            const descriptor = this.projectBootstrap.descriptor;
            if (phase === 'run-failed' && this.projectBootstrap.needsInstall && descriptor?.installCommand) {
                await this.projectBootstrap.runInstall();
                return;
            }
            if (descriptor?.devCommand && (phase === 'ready-to-run' || phase === 'starting' || phase === 'run-failed')) {
                await this.projectBootstrap.runDevServer();
                return;
            }
            if (phase === 'detected' && descriptor?.installCommand) {
                await this.projectBootstrap.runInstall();
            }
        } catch (e) {
            console.error('[qaap-mobile-shell] bootstrapMobilePreviewInBackground failed', e);
        } finally {
            this.relayoutMainPreviewWidgets();
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected async openMobilePreviewInMain(): Promise<void> {
        try {
            await this.miniBrowserOpenHandler.openEmptyPreviewTab();
        } catch (e) {
            console.error('[qaap-mobile-shell] openEmptyPreviewTab failed', e);
            return;
        }
        if (!await this.activateMainPreviewWidget()) {
            const preview = await this.miniBrowserOpenHandler.getByUri(MiniBrowserOpenHandler.PREVIEW_URI);
            if (preview) {
                await this.shell.activateWidget(preview.id);
            }
        }
        this.relayoutMainPreviewWidgets();
        this.requestFullShellRelayout();
        this.scheduleSnapAndUiRefresh();
    }

    /**
     * Open a side sheet and show a view without `toggle` semantics (which would collapse an
     * already-active panel — the usual failure mode for Agent on mobile).
     */
    protected async openMobileSideSheet(side: 'left' | 'right', widgetId: string): Promise<void> {
        return this.sideSheetController.openMobileSideSheet(side, widgetId);
    }

    protected shouldDismissSheetsForButton(id: MobileBottomButtonId): boolean {
        return this.bottomBarController.shouldDismissSheetsForButton(id);
    }

    /** Collapse expanded side sheets and await layout so follow-up UI (e.g. quick input) is stable. */
    protected async dismissSheetsAsync(): Promise<void> {
        return this.sideSheetController.dismissSheetsAsync();
    }

    protected async collapseMobileSideSheets(): Promise<void> {
        return this.sideSheetController.collapseMobileSideSheets();
    }

    protected async collapseMobileSidePanels(): Promise<void> {
        return this.sideSheetController.collapseMobileSidePanels();
    }

    protected settleMobileSidePanelsCollapsed(): void {
        this.sideSheetController.settleMobileSidePanelsCollapsed();
    }

    protected isSidePanelSheetCollapsedInDom(side: 'left' | 'right'): boolean {
        return this.sideSheetController.isSidePanelSheetCollapsedInDom(side);
    }

    protected isAnyMobileSideSheetVisible(): boolean {
        return this.sideSheetController.isAnyMobileSideSheetVisible();
    }

    /** Open Welcome when the main dock is empty (layout restore / mobile entry often skip startup). */
    protected async ensureWelcomeInMainArea(): Promise<void> {
        // The classic IDE / Welcome is taking the main area — make sure the boot guard is lifted.
        clearMobileWorkHubBootGuard();
        if (toArray(this.shell.mainPanel.widgets()).length > 0) {
            return;
        }
        if (!this.commands.getCommand(GETTING_STARTED_WIDGET_COMMAND)
            || !this.commands.isEnabled(GETTING_STARTED_WIDGET_COMMAND)) {
            return;
        }
        try {
            await this.commands.executeCommand(GETTING_STARTED_WIDGET_COMMAND);
        } catch (e) {
            console.error('[qaap-mobile-shell] failed to open Welcome', e);
        }
    }

}
