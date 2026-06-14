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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { ArrayExt, toArray } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { BoxLayout, BoxPanel, Panel, SplitPanel, Widget as LuminoWidget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ApplicationShell, MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/application-shell';
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
import { MobileHaptics } from './mobile-haptics';
import { installMobileHorizontalTouchScroll } from './mobile-horizontal-touch-scroll';
import { markMobileSidePanelCollapsed } from './mobile-side-sheet-collapse';
import { MobileKeyboardHelper } from './mobile-keyboard-helper';
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
import { MobilePullRequestPanel } from './mobile-pull-request-panel';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import { MobileSnackbar } from './mobile-snackbar';
import { MobileAgentTaskComposer } from './mobile-agent-task-composer';
import { MobileWorkHubPreferencesSheet } from './mobile-work-hub-preferences-sheet';
import { MobileWorkHubAiConfigurationSheet } from './mobile-work-hub-ai-configuration-sheet';
import { AIConfigurationSelectionService } from '@theia/ai-ide/lib/browser/ai-configuration/ai-configuration-service';
import {
    clearMobileProjectsHomeVisible,
    clearMobileWorkHubBootGuard,
    installMobileWorkHubBootGuard,
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    consumeMobileProjectsPanelDismiss,
    markMobileProjectsHomeVisible,
    markMobileProjectsLeftLanding,
    markMobileProjectsPanelDismiss,
    markPreferAgentsSurface,
    markPreferDesktopIde,
    peekPreferDesktopIde,
    shouldBootstrapMobileAgentsChat,
    shouldPreferWorkHubAgentsLayout,
    shouldSkipMobileProjectsLanding,
    QAAP_AUTH_OPEN_FIRST_REPO_EVENT,
    QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT,
    QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT,
    setMobileActiveTranscriptChrome,
    setMobileLandingHubListChrome,
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
    dismissQaapAccountMenu,
    QAAP_MOBILE_OPEN_DESKTOP_IDE_COMMAND,
    QAAP_WORK_HUB_OVERVIEW_COMMAND,
} from './qaap-workbench-account-menu';
import { hasDesktopSessionsSidebarCollapsed } from './mobile-work-hub-sessions-sidebar';
import { writeStoredComposerSurface } from '../common/qaap-composer-surface';

class MobileBottomBarWidget extends LuminoWidget {
    constructor() {
        const node = document.createElement('nav');
        node.className = 'theia-mobile-bottom-activity-bar';
        node.setAttribute('role', 'navigation');
        super({ node });
        this.id = 'theia-mobile-bottom-bar';
    }
}

/**
 * Commands referenced for active-state and click-through; declared as strings so `@theia/core` stays free of
 * optional dependencies (`@theia/ai-chat-ui`, `@theia/terminal`, `@theia/mini-browser`, …).
 * Breakpoint for the shell matches {@link mobile-workbench.css} / {@link MOBILE_ONE_COLUMN_LAYOUT_MEDIA_QUERY}.
 */
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
/** Shared preview tab id ({@link MiniBrowserOpenHandler.PREVIEW_URI}). */
const MINI_BROWSER_PREVIEW_WIDGET_ID = 'mini-browser:__minibrowser__preview__';
const GETTING_STARTED_WIDGET_COMMAND = 'getting.started.widget';
const EXPLORER_VIEW_CONTAINER_ID = 'explorer-view-container';
const OPEN_AI_CONFIGURATION_COMMAND = 'aiConfiguration:open';
const EDIT_CHAT_SESSION_SETTINGS_COMMAND = 'chat:widget:session-settings';

/** Shell class toggled while the bottom (terminal) panel is expanded on mobile. */
const MOBILE_BOTTOM_OPEN_CLASS = 'theia-mod-mobile-bottom-open';

/** Keep editor / preview chrome visible when the bottom panel (inspector, terminal, …) is open. */
const MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO = 0.28;

/** Default bottom share when no persisted sash size exists yet. */
const MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO = 0.38;

/** {@link ApplicationShell} overlay host for {@link MAXIMIZED_CLASS} bottom panel (not in public API). */
interface ShellWithMaximizedOverlay {
    readonly maximizedElement: HTMLElement;
}

type MobileBottomButtonId =
    | 'projects'
    | 'agent'
    | 'preview'
    | 'explore'
    | 'pr'
    | 'terminal'
    | 'hub-home'
    | 'hub-projects'
    | 'hub-tasks'
    | 'hub-review'
    | 'hub-inbox'
    | 'hub-team'
    | 'hub-automations';

interface MobileBottomButton {
    id: MobileBottomButtonId;
    label: string;
    icon: string;
    commandId?: string;
}

interface BottomBarSecondaryItem {
    label: string;
    icon?: string;
    detail?: string;
    run: () => Promise<void> | void;
}

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

    protected bottomChromeHost: HTMLElement | undefined;
    protected bottomChromeTouchScrollDispose = Disposable.NULL;
    protected statusBarShellIndex = -1;
    protected bottomBarWidget: MobileBottomBarWidget | undefined;
    protected get bottomBar(): HTMLElement | undefined { return this.bottomBarWidget?.node; }
    protected leftEdge: HTMLElement | undefined;
    protected rightEdge: HTMLElement | undefined;
    protected keyboardHelper: MobileKeyboardHelper | undefined;
    protected mobileActive = false;
    /** When the user restores the split panel, do not auto-maximize again until the panel closes. */
    protected suppressMobileBottomAutoMaximize = false;
    protected snapRaf = 0;
    protected shellHooked = false;
    protected projectsPanel: MobileProjectsPanel | undefined;
    protected pullRequestPanel: MobilePullRequestPanel | undefined;
    protected agentTaskComposer: MobileAgentTaskComposer | undefined;
    protected workHubPreferencesSheet: MobileWorkHubPreferencesSheet | undefined;
    protected workHubAiConfigurationSheet: MobileWorkHubAiConfigurationSheet | undefined;
    protected projectsCount = 0;
    protected authOpenFirstRepoListenerInstalled = false;
    /**
     * True once the user has actively left the mobile landing (Projects panel) in this session,
     * either by opening a workspace from the dashboard or by tapping Focus on the active project.
     * Subsequent re-opens of the Projects view are sheet-style.
     */
    protected landingLeftThisSession = false;
    /** True when the current transcript was opened from the Work Hub Agents landing overlay. */
    protected transcriptOpenedFromWorkHubLanding = false;
    /** Prevents duplicate `restoreAgentsSurfaceAfterReload` calls during mobile layout bootstrap. */
    protected agentsBootstrapStarted = false;
    /** Bumped to cancel in-flight Agents bootstrap when the user opens the desktop IDE. */
    protected agentsBootstrapEpoch = 0;

    protected leftEdgeTouchStartX = 0;
    protected rightEdgeTouchStartX = 0;

    protected readonly onDismissProjectsPanelEvent = (): void => {
        this.onProjectsWorkspaceOpened();
    };

    protected readonly onLandingHubListChanged = (): void => {
        this.refreshBottomBar();
        this.scheduleSnapAndUiRefresh();
    };

    onStart(_app: FrontendApplication): void {
        this.workHubDiff.setDelegate(this);
        this.syncLandingStateFromStorage();
        installMobileWorkHubBootGuard();
        if (this.mobileMq?.matches && !this.hasPendingHubAction()) {
            if (shouldBootstrapMobileAgentsChat()) {
                this.landingLeftThisSession = true;
                document.body.classList.remove('theia-mobile-mod-landing');
                setMobileWorkHubComposerHeaderChrome(true);
            } else if (!shouldSkipMobileProjectsLanding()) {
                document.body.classList.add('theia-mobile-mod-landing');
            }
        }
        this.mobileMq?.addEventListener('change', this.onMediaChange);
        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT, this.onDismissProjectsPanelEvent);
        window.addEventListener(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT, this.onLandingHubListChanged);
        if (!this.authOpenFirstRepoListenerInstalled) {
            this.authOpenFirstRepoListenerInstalled = true;
            window.addEventListener(QAAP_AUTH_OPEN_FIRST_REPO_EVENT, this.onAuthOpenFirstRepo);
            this.toDispose.push(Disposable.create(() => {
                window.removeEventListener(QAAP_AUTH_OPEN_FIRST_REPO_EVENT, this.onAuthOpenFirstRepo);
            }));
        }
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
        if (peekPreferDesktopIde() || !this.workspaceService.opened || this.isProjectsLandingSession()) {
            return;
        }
        if (this.mobileActive || document.body.classList.contains('theia-mobile-mod-workhub-composer-header')) {
            markPreferAgentsSurface();
        }
    };

    onDidInitializeLayout(app: FrontendApplication): void {
        this.ensureShellHooks(app.shell);
        void this.bootstrapWorkHubSurfaceAfterLayout();
    }

    /** Paint Work Hub immediately; hydrate workspace-dependent state once MRU restore is ready. */
    protected async bootstrapWorkHubSurfaceAfterLayout(): Promise<void> {
        await this.workspaceService.ready;
        this.onMediaChange();
        if (this.shouldActivateMobileLayout() && !peekPreferDesktopIde()) {
            if (!this.mobileActive) {
                this.enterMobileLayout();
            }
            if (!this.tryBootstrapMobileAgentsChat()) {
                void this.showMobileProjectsHome('tasks');
            }
            this.scheduleSnapAndUiRefresh();
        }
        this.onMediaChange();
        if (this.mobileActive) {
            await this.collapseMobileSideSheets();
            if (!peekPreferDesktopIde()) {
                this.applyMobileProjectsPanelDismissAfterReload();
                if (!this.tryBootstrapMobileAgentsChat() && !this.projectsPanel?.isVisible()) {
                    void this.showMobileProjectsHome('tasks');
                }
            }
            this.scheduleSnapAndUiRefresh();
            return;
        }
        if (this.shouldActivateMobileLayout() && !peekPreferDesktopIde()) {
            this.enterMobileLayout();
            if (!this.tryBootstrapMobileAgentsChat() && !this.projectsPanel?.isVisible()) {
                void this.showMobileProjectsHome('tasks');
            }
            this.scheduleSnapAndUiRefresh();
            return;
        }
        if (!this.shouldActivateMobileLayout()) {
            // Desktop is showing the classic IDE (a project is open) — reveal the shell so the
            // boot guard, if it was installed early, never leaves the workbench hidden.
            clearMobileWorkHubBootGuard();
            void this.ensureWelcomeInMainArea();
            window.requestAnimationFrame(() => this.ensureDesktopSidePanelSizes());
        }
    }

    onStop(_app: FrontendApplication): void {
        this.workHubDiff.setDelegate(undefined);
        this.mobileMq?.removeEventListener('change', this.onMediaChange);
        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT, this.onDismissProjectsPanelEvent);
        window.removeEventListener(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT, this.onLandingHubListChanged);
        this.teardownMobileUi();
        this.toDispose.dispose();
    }

    protected readonly onMediaChange = (): void => {
        this.persistAgentsSurfaceForActiveSession();
        if (this.shouldActivateMobileLayout()) {
            this.enterMobileLayout();
        } else {
            this.leaveMobileLayout();
        }
    };

    /** Remember Agents for reload / wide viewport before the media query drops mobile layout. */
    protected persistAgentsSurfaceForActiveSession(): void {
        if (peekPreferDesktopIde() || !this.workspaceService.opened || this.isProjectsLandingSession()) {
            return;
        }
        if (!this.mobileActive || !this.landingLeftThisSession) {
            return;
        }
        if (document.body.classList.contains('theia-mobile-mod-workhub-composer-header')) {
            markPreferAgentsSurface();
        }
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
        if (this.shellHooked || shell !== this.shell) {
            return;
        }
        this.shellHooked = true;
        const leftBar = shell.leftPanelHandler.tabBar;
        const rightBar = shell.rightPanelHandler.tabBar;
        this.toDispose.pushAll([
            Disposable.create(() => { leftBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
            Disposable.create(() => { rightBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
        ]);
        leftBar.currentChanged.connect(this.onSidePanelTabChanged);
        rightBar.currentChanged.connect(this.onSidePanelTabChanged);
        this.toDispose.push(shell.onDidChangeActiveWidget(() => {
            if (this.mobileActive) {
                this.refreshBottomBar();
            }
        }));
        this.toDispose.push(shell.onDidChangeCurrentWidget(() => {
            if (this.mobileActive) {
                this.refreshBottomBar();
            }
        }));
        const bottomPanel = shell.bottomPanel;
        const onBottomPanelLayout = (): void => {
            if (this.mobileActive) {
                this.scheduleSnapAndUiRefresh();
            }
        };
        bottomPanel.widgetAdded.connect(onBottomPanelLayout);
        bottomPanel.widgetRemoved.connect(onBottomPanelLayout);
        this.toDispose.pushAll([
            Disposable.create(() => { bottomPanel.widgetAdded.disconnect(onBottomPanelLayout); }),
            Disposable.create(() => { bottomPanel.widgetRemoved.disconnect(onBottomPanelLayout); }),
        ]);
        this.toDispose.push(shell.onDidAddWidget(widget => {
            if (this.mobileActive && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
                void this.applyMobileBottomPanelMaximizedSize();
            }
        }));
        this.toDispose.push(shell.onDidRemoveWidget(widget => {
            if (this.mobileActive && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
            }
        }));
        this.toDispose.push(shell.onDidToggleMaximized(() => {
            if (!this.mobileActive) {
                return;
            }
            if (!this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS) && this.shell.isExpanded('bottom')) {
                this.suppressMobileBottomAutoMaximize = true;
            }
            this.syncMobileMaximizedOverlayInsets();
        }));
        this.toDispose.push(this.commands.onWillExecuteCommand(event => {
            if (!this.mobileActive) {
                return;
            }
            if (event.commandId === OPEN_AI_CONFIGURATION_COMMAND || event.commandId === EDIT_CHAT_SESSION_SETTINGS_COMMAND) {
                void this.dismissMobileSideSheets();
            }
        }));
        this.toDispose.push(this.commands.onDidExecuteCommand(event => {
            if (!this.mobileActive) {
                return;
            }
            if (event.commandId === WORKBENCH_TOGGLE_TERMINAL
                || event.commandId === CommonCommands.TOGGLE_BOTTOM_PANEL.id
                || event.commandId === 'terminal:new') {
                this.scheduleSnapAndUiRefresh();
                void this.applyMobileBottomPanelMaximizedSize();
            }
        }));
    }

    /** Bottom panel is visible with at least one widget (matches Projects “open” semantics for the bar). */
    protected isTerminalBottomPanelOpen(): boolean {
        return this.isMobileBottomTerminalVisible();
    }

    /** Bottom terminal area is shown (may still be mid expand animation). */
    protected isMobileBottomTerminalVisible(): boolean {
        const bottom = this.shell.bottomPanel;
        return !bottom.isHidden && !bottom.isEmpty;
    }

    protected getBottomPanelPendingUpdate(): Promise<void> {
        const state = (this.shell as ApplicationShell & { bottomPanelState?: { pendingUpdate: Promise<void> } }).bottomPanelState;
        return state?.pendingUpdate ?? Promise.resolve();
    }

    protected readonly onSidePanelTabChanged = (): void => {
        this.scheduleSnapAndUiRefresh();
    };

    /** Work Hub landing is active — user has not opened/focused a project in this session yet. */
    protected isProjectsLandingSession(): boolean {
        return !this.landingLeftThisSession && !shouldSkipMobileProjectsLanding();
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
            this.applyMobileProjectsPanelDismissAfterReload();
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
        const bottomSplit = this.getBottomAreaSplitPanel();
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
        this.syncMobileBottomSplit();
    }

    protected getBottomAreaSplitPanel(): SplitPanel | undefined {
        const parent = this.shell.mainPanel.parent;
        return parent instanceof SplitPanel ? parent : undefined;
    }

    /** Measured height of the bottom dock inside `#theia-bottom-split-panel` (px). */
    protected measureMobileBottomPanelHeightPx(): number | undefined {
        const parent = this.shell.bottomPanel.parent;
        if (!(parent instanceof SplitPanel) || !parent.isVisible) {
            return undefined;
        }
        const index = parent.widgets.indexOf(this.shell.bottomPanel) - 1;
        if (index < 0) {
            return undefined;
        }
        const handle = parent.handles[index];
        if (handle.classList.contains('lm-mod-hidden')) {
            return undefined;
        }
        const parentHeight = parent.node.clientHeight;
        if (parentHeight <= 0) {
            return undefined;
        }
        return parentHeight - handle.offsetTop;
    }

    /**
     * Main/bottom ratios for the center-column split. Never collapses main to 0 — that pushed
     * mini-browser toolbars and `#theia-top-panel` off-screen when resizing the inspector sash.
     */
    protected resolveMobileBottomSplitSizes(): [number, number] {
        const split = this.getBottomAreaSplitPanel();
        const total = split?.node.clientHeight ?? 0;
        if (total <= 0) {
            const bottom = MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO;
            return [1 - bottom, bottom];
        }
        let bottomPx = this.measureMobileBottomPanelHeightPx();
        if (!bottomPx || bottomPx <= 0) {
            const state = (this.shell as ApplicationShell & { bottomPanelState?: { lastPanelSize?: number } }).bottomPanelState;
            bottomPx = state?.lastPanelSize ?? Math.round(total * MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO);
        }
        const minBottomPx = 120;
        const maxBottomPx = Math.round(total * (1 - MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO));
        bottomPx = Math.max(minBottomPx, Math.min(maxBottomPx, bottomPx));
        const mainPx = Math.max(Math.round(total * MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO), total - bottomPx);
        const adjustedBottomPx = total - mainPx;
        return [mainPx / total, adjustedBottomPx / total];
    }

    /** Vertical split between main editor and bottom panel inside the center column. */
    protected syncMobileBottomSplit(): void {
        if (this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            return;
        }
        const split = this.getBottomAreaSplitPanel();
        if (!split) {
            return;
        }
        try {
            if (this.shell.isExpanded('bottom')) {
                const current = split.relativeSizes();
                if (current.length >= 2 && current[0] >= MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO) {
                    return;
                }
                const [main, bottom] = this.resolveMobileBottomSplitSizes();
                split.setRelativeSizes([main, bottom]);
            } else {
                split.setRelativeSizes([1, 0]);
            }
        } catch {
            /* layout not ready */
        }
    }

    /**
     * Mobile default: same as the panel "maximize" chevron — detach the bottom dock into the shell
     * overlay so the terminal fills the workspace above the bottom activity bar.
     */
    protected async applyMobileBottomPanelMaximizedSize(): Promise<void> {
        if (!this.mobileActive || this.suppressMobileBottomAutoMaximize) {
            return;
        }
        await this.getBottomPanelPendingUpdate();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const bottomPanel = this.shell.bottomPanel;
        if (!this.isMobileBottomTerminalVisible() || bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            return;
        }
        bottomPanel.toggleMaximized();
        this.syncMobileMaximizedOverlayInsets();
    }

    protected restoreMobileBottomPanelFromMaximized(): void {
        const bottomPanel = this.shell.bottomPanel;
        if (bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            bottomPanel.toggleMaximized();
        }
        this.clearMobileMaximizedOverlayInsets();
    }

    protected getMaximizedOverlayElement(): HTMLElement | undefined {
        return (this.shell as unknown as ShellWithMaximizedOverlay).maximizedElement;
    }

    /** Keep the maximized terminal above the pinned mobile bottom chrome (activity bar + status). */
    protected syncMobileMaximizedOverlayInsets(): void {
        const overlay = this.getMaximizedOverlayElement();
        if (!overlay || !this.mobileActive) {
            return;
        }
        if (!this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            this.clearMobileMaximizedOverlayInsets();
            return;
        }
        const topRect = this.shell.topPanel.node.getBoundingClientRect();
        overlay.style.top = `${topRect.bottom}px`;
        overlay.style.bottom = [
            'calc(',
            'var(--theia-mobile-bottom-bar-height, 56px)',
            '+ var(--theia-mobile-status-chrome-height, 34px)',
            '+ var(--theia-mobile-keyboard-inset, 0px)',
            '+ env(safe-area-inset-bottom, 0px)',
            ')',
        ].join(' ');
    }

    protected clearMobileMaximizedOverlayInsets(): void {
        const overlay = this.getMaximizedOverlayElement();
        overlay?.style.removeProperty('bottom');
        overlay?.style.removeProperty('top');
    }

    protected updateMobileShellStateClasses(): void {
        this.shell.node.classList.toggle(MOBILE_BOTTOM_OPEN_CLASS, this.shell.isExpanded('bottom'));
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
            this.relayoutMobileSidePanelHandler('left');
        }
        if (this.shell.isExpanded('right')) {
            this.relayoutMobileSidePanelHandler('right');
        }
        MessageLoop.postMessage(this.shell.mainPanel, LuminoWidget.Msg.UpdateRequest);
    }

    protected teardownMobileUi(preserveProjectsLanding = false): void {
        this.removeBottomBarSecondaryMenu();
        this.removeBackdrop();
        setMobileWorkHubHideBottomChrome(false);
        setMobileWorkHubComposerHeaderChrome(false);
        setMobileActiveTranscriptChrome(false);
        document.body.classList.remove('theia-mobile-mod-landing');
        this.unpinBottomChromeFromBody();
        this.detachBottomBarFromShell();
        if (this.leftEdge?.parentElement) {
            this.leftEdge.removeEventListener('touchstart', this.onLeftEdgeTouchStart);
            this.leftEdge.removeEventListener('touchend', this.onLeftEdgeTouchEnd);
            this.leftEdge.parentElement.removeChild(this.leftEdge);
        }
        this.leftEdge = undefined;
        if (this.rightEdge?.parentElement) {
            this.rightEdge.removeEventListener('touchstart', this.onRightEdgeTouchStart);
            this.rightEdge.removeEventListener('touchend', this.onRightEdgeTouchEnd);
            this.rightEdge.parentElement.removeChild(this.rightEdge);
        }
        this.rightEdge = undefined;
        this.keyboardHelper?.dispose();
        this.keyboardHelper = undefined;
        if (preserveProjectsLanding) {
            this.applyLandingChrome();
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
        this.disposePullRequestPanel();
        this.shell.node.classList.remove(MOBILE_BOTTOM_OPEN_CLASS);
    }

    protected removeBackdrop(): void {
        document.querySelector('.theia-mobile-sheet-backdrop')?.remove();
    }

    protected ensureOverlayElements(): void {
        if (!this.mobileActive) {
            return;
        }
        this.removeBackdrop();
        if (!this.bottomBarWidget) {
            this.bottomBarWidget = new MobileBottomBarWidget();
            this.bottomBarWidget.node.setAttribute(
                'aria-label',
                nls.localize('theia/core/mobileBottomBar', 'Primary views')
            );
        }
        this.pinBottomChromeToBody();
        if (!this.leftEdge) {
            this.leftEdge = document.createElement('div');
            this.leftEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-left';
            this.leftEdge.addEventListener('touchstart', this.onLeftEdgeTouchStart, { passive: true });
            this.leftEdge.addEventListener('touchend', this.onLeftEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.leftEdge);
        }
        if (!this.rightEdge) {
            this.rightEdge = document.createElement('div');
            this.rightEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-right';
            this.rightEdge.addEventListener('touchstart', this.onRightEdgeTouchStart, { passive: true });
            this.rightEdge.addEventListener('touchend', this.onRightEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.rightEdge);
        }
        if (!this.keyboardHelper) {
            this.keyboardHelper = new MobileKeyboardHelper(this.shell.node);
            this.keyboardHelper.install();
        }
        this.applyMobileProjectsPanelDismissAfterReload();
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
        this.updateBackdropVisibility();
    }

    protected readonly onAuthOpenFirstRepo = (): void => {
        // Defer until the shell is ready — avoids racing OAuth return with layout init (mobile OOM).
        window.setTimeout(() => { void this.openFirstRepoAfterAuth(); }, 1500);
    };

    /** Post-OAuth: open the only repo automatically, otherwise show the clone picker. */
    protected async openFirstRepoAfterAuth(): Promise<void> {
        if (!this.mobileMq?.matches) {
            return;
        }
        try {
            const repos = await this.projectsService.listGithubRepositories();
            if (repos.length === 1 && repos[0].github) {
                this.projectsService.openInCurrentWindow(repos[0]);
                return;
            }
        } catch {
            /* fall through to picker */
        }
        this.ensureProjectsPanel();
        const panel = this.projectsPanel;
        if (panel) {
            await panel.showOpenRepositoryDialog();
        }
    }

    /**
     * After a workspace open the page reloads; the dismiss flag survives in sessionStorage.
     * Restore in-memory state before any async panel.show() so the landing cannot flash back.
     */
    protected syncLandingStateFromStorage(): void {
        if (shouldSkipMobileProjectsLanding() || shouldBootstrapMobileAgentsChat()) {
            this.landingLeftThisSession = true;
            document.body.classList.remove('theia-mobile-mod-landing');
        }
    }

    /** After clone/open the page reloads; keep the projects sheet closed on the new workspace. */
    protected applyMobileProjectsPanelDismissAfterReload(): void {
        const dismissed = consumeMobileProjectsPanelDismiss();
        if (dismissed) {
            this.landingLeftThisSession = true;
            this.hideProjectsPanel();
            document.body.classList.remove('theia-mobile-mod-landing');
        }
        if (this.tryBootstrapMobileAgentsChat()) {
            return;
        }
        if (!dismissed) {
            return;
        }
        void this.ensureMainContentAfterWorkspaceReload();
        void this.projectBootstrap.refreshFromCurrentWorkspace();
    }

    /**
     * Open the inline agentic chat shell when a workspace is already targeted — skips the IDE
     * flash and the project-list landing. Returns true when bootstrap was started.
     */
    protected shouldContinueAgentsBootstrap(epoch: number): boolean {
        return epoch === this.agentsBootstrapEpoch
            && !peekPreferDesktopIde()
            && shouldBootstrapMobileAgentsChat();
    }

    protected cancelAgentsBootstrap(): void {
        this.agentsBootstrapEpoch++;
        this.agentsBootstrapStarted = false;
    }

    protected disposeProjectsPanelForDesktopIde(): void {
        const panel = this.projectsPanel;
        if (!panel) {
            return;
        }
        panel.hide();
        panel.dispose();
        if (panel.node.parentElement) {
            panel.node.parentElement.removeChild(panel.node);
        }
        this.projectsPanel = undefined;
    }

    protected tryBootstrapMobileAgentsChat(): boolean {
        if (peekPreferDesktopIde() || !shouldBootstrapMobileAgentsChat()) {
            return false;
        }
        if (!this.mobileActive) {
            this.enterMobileLayout();
        }
        const panel = this.projectsPanel;
        if (panel?.isVisible() && panel.isHomeMode() && panel.getHubView() === 'tasks') {
            this.landingLeftThisSession = true;
            markPreferAgentsSurface();
            document.body.classList.remove('theia-mobile-mod-landing');
            setMobileWorkHubComposerHeaderChrome(true);
            this.syncMobileHubPrimaryBottomChrome();
            this.refreshBottomBar();
            void this.releaseMobileWorkHubBootGuardWhenReady();
            return true;
        }
        if (this.agentsBootstrapStarted) {
            return true;
        }
        this.agentsBootstrapStarted = true;
        const epoch = this.agentsBootstrapEpoch;
        this.landingLeftThisSession = true;
        document.body.classList.remove('theia-mobile-mod-landing');
        void this.restoreAgentsSurfaceAfterReload(epoch);
        return true;
    }

    /** Close restored IDE editor tabs so the Work Hub surface can take the main area after reload. */
    protected async collapseIdeMainAreaForWorkHub(): Promise<void> {
        const widgets = [...toArray(this.shell.mainPanel.widgets())];
        for (const widget of widgets) {
            await this.shell.closeWidget(widget.id, { save: false });
        }
    }

    /** After reload: return to the Agents execution shell instead of restoring IDE editor tabs. */
    protected async restoreAgentsSurfaceAfterReload(epoch: number = this.agentsBootstrapEpoch): Promise<void> {
        try {
            if (!this.shouldContinueAgentsBootstrap(epoch)) {
                return;
            }
            await this.workspaceService.ready;
            if (!this.shouldContinueAgentsBootstrap(epoch)) {
                return;
            }
            await this.collapseIdeMainAreaForWorkHub();
            if (!this.shouldContinueAgentsBootstrap(epoch)) {
                return;
            }
            document.body.classList.remove('theia-mobile-mod-landing');
            void this.projectBootstrap.refreshFromCurrentWorkspace();
            if (this.projectsPanel && !this.projectsPanel.isHomeMode()) {
                this.projectsPanel.hide();
                this.projectsPanel.dispose();
                this.projectsPanel.node.parentElement?.removeChild(this.projectsPanel.node);
                this.projectsPanel = undefined;
            }
            this.ensureProjectsPanel(true);
            const panel = this.projectsPanel;
            if (!panel || !this.shouldContinueAgentsBootstrap(epoch)) {
                return;
            }
            this.projectsService.setHubView('tasks');
            panel.preferComposerSurface('task');
            setMobileWorkHubComposerHeaderChrome(true);
            await panel.show({ preferredHubView: 'tasks' });
            if (!this.shouldContinueAgentsBootstrap(epoch)) {
                panel.hide();
                this.disposeProjectsPanelForDesktopIde();
                return;
            }
            this.ensureDesktopWorkHubSessionsSidebarOpen();
            markPreferAgentsSurface();
            await this.collapseMobileSideSheets();
            if (!this.shouldContinueAgentsBootstrap(epoch)) {
                panel.hide();
                this.disposeProjectsPanelForDesktopIde();
                return;
            }
            this.syncMobileHubPrimaryBottomChrome();
            this.refreshBottomBar();
            this.refreshWorkbenchTopBar();
            await this.releaseMobileWorkHubBootGuardWhenReady();
        } finally {
            if (epoch === this.agentsBootstrapEpoch) {
                this.agentsBootstrapStarted = false;
            }
        }
    }

    /**
     * Projects landing visible on every mobile session — even when a workspace is already open,
     * the user must explicitly tap into it from the dashboard. Once the user has left the landing
     * in this session, this method is a no-op.
     *
     * Skipped when the hub has a pending action queued (e.g. tapping a task in another project
     * before reload): the user already chose to enter the workspace, so we drop them straight into
     * the agent the hub is about to open.
     */
    protected ensureMobileProjectsHomeVisible(): void {
        if (!this.mobileActive || this.landingLeftThisSession || shouldSkipMobileProjectsLanding()) {
            return;
        }
        if (shouldPreferWorkHubAgentsLayout() || shouldBootstrapMobileAgentsChat()) {
            return;
        }
        if (this.hasPendingHubAction()) {
            this.landingLeftThisSession = true;
            clearMobileProjectsHomeVisible();
            void this.projectBootstrap.refreshFromCurrentWorkspace();
            return;
        }
        markMobileProjectsHomeVisible();
        document.body.classList.add('theia-mobile-mod-landing');
        this.ensureProjectsPanel();
        const panel = this.projectsPanel;
        if (panel?.isHomeMode() && !panel.isVisible()) {
            void panel.show().then(() => {
                if (this.landingLeftThisSession || shouldSkipMobileProjectsLanding()) {
                    panel.hide();
                    document.body.classList.remove('theia-mobile-mod-landing');
                    return;
                }
                this.applyLandingChrome();
                this.syncMobileHubPrimaryBottomChrome();
                this.refreshBottomBar();
            });
        } else {
            this.applyLandingChrome();
            this.syncMobileHubPrimaryBottomChrome();
            this.refreshBottomBar();
        }
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
        if (this.projectsPanel && forceHomeMode !== undefined && this.projectsPanel.isHomeMode() !== forceHomeMode) {
            this.projectsPanel.hide();
            this.projectsPanel.dispose();
            this.projectsPanel.node.parentElement?.removeChild(this.projectsPanel.node);
            this.projectsPanel = undefined;
        }
        if (this.projectsPanel) {
            return;
        }
        // On mobile every session lands on the Projects view, regardless of whether a workspace is
        // already opened. The landing is full-screen and hides the bottom navigation; once the user
        // explicitly enters a project (Focus / open), `landingLeftThisSession` flips so the workspace
        // remains visible until the top-bar return action asks for Projects again.
        const homeMode = forceHomeMode ?? (this.mobileActive && !this.landingLeftThisSession);
        this.projectsPanel = new MobileProjectsPanel(
            this.projectsService,
            this.commands,
            {
                onProjectOpen: (project: MobileProjectEntry) => { void this.onProjectsPanelOpen(project); },
                onProjectOpenInIde: (project: MobileProjectEntry) => { void this.onProjectsPanelOpenInIde(project); },
                onDismiss: () => {
                    this.onLandingDismissed();
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
                onShowAgentsHub: () => this.openMobileWorkHubLanding('tasks'),
                onShowRoutinesHub: () => this.openMobileWorkHubLanding('routines'),
                onHubLandingViewChanged: () => {
                    this.syncMobileHubPrimaryBottomChrome();
                    this.refreshBottomBar();
                    this.refreshWorkbenchTopBar();
                },
                onEnterActiveTranscript: () => this.onEnterActiveTranscript(),
                onExitActiveTranscript: () => { void this.onExitActiveTranscript(); },
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
        this.shell.node.appendChild(this.projectsPanel.node);
        if (forceHomeMode === undefined && homeMode && !shouldSkipMobileProjectsLanding()) {
            void this.projectsPanel.show().then(() => {
                if (this.landingLeftThisSession || shouldSkipMobileProjectsLanding()) {
                    this.projectsPanel?.hide();
                    document.body.classList.remove('theia-mobile-mod-landing');
                    return;
                }
                this.applyLandingChrome();
            });
        }
    }

    /** Hub queues a pending action across reloads via this sessionStorage key — see qaap-hub-actions-contribution. */
    protected hasPendingHubAction(): boolean {
        try {
            return typeof sessionStorage !== 'undefined'
                && sessionStorage.getItem('qaap.hub.pendingAction') !== null;
        } catch {
            return false;
        }
    }

    /** Add/remove the body class that lets CSS hide the bottom nav while the landing is up. */
    protected applyLandingChrome(): void {
        const panel = this.projectsPanel;
        const isLanding = !!(panel?.isHomeMode() && panel?.isVisible());
        document.body.classList.toggle('theia-mobile-mod-landing', isLanding);
        if (isLanding) {
            this.ensureDesktopWorkHubSessionsSidebarOpen();
            this.releaseMobileWorkHubBootGuard();
        }
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

    /** Lift the boot guard only once Work Hub landing or the Agents chat shell is actually visible. */
    protected releaseMobileWorkHubBootGuard(): void {
        const panel = this.projectsPanel;
        const agentsReady = panel?.isVisible() === true
            && panel.isHomeMode()
            && panel.getHubView() === 'tasks'
            && (panel.isAgentsHubShellActive() || panel.node.classList.contains('theia-mod-agents-hub-landing'));
        const landingReady = panel?.isHomeMode() === true && panel.isVisible();
        if (agentsReady || landingReady) {
            clearMobileWorkHubBootGuard();
        }
    }

    /** Wait for composer-header CSS + panel paint before revealing the shell (avoids IDE stacking). */
    protected async releaseMobileWorkHubBootGuardWhenReady(): Promise<void> {
        if (typeof window !== 'undefined') {
            await new Promise<void>(resolve => {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => resolve());
                });
            });
        }
        this.releaseMobileWorkHubBootGuard();
    }

    /**
     * The user dismissed the landing — by opening a project or focusing the active workspace.
     * Drop the landing-mode panel so the next Projects open creates a sheet variant, and lift the
     * landing chrome lock so the bottom nav comes back.
     */
    protected onLandingDismissed(): void {
        markMobileProjectsLeftLanding();
        markMobileProjectsPanelDismiss();
        markPreferAgentsSurface();
        clearMobileProjectsHomeVisible();
        this.landingLeftThisSession = true;
        if (this.projectsPanel?.isHomeMode()) {
            this.projectsPanel.dispose();
            if (this.projectsPanel.node.parentElement) {
                this.projectsPanel.node.parentElement.removeChild(this.projectsPanel.node);
            }
            this.projectsPanel = undefined;
        }
        document.body.classList.remove('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(false);
        void this.projectBootstrap.refreshFromCurrentWorkspace();
        this.tryBootstrapMobileAgentsChat();
    }

    /** Hide the full-screen landing the moment the user picks a project. */
    protected leaveMobileProjectsLandingNow(): void {
        markMobileProjectsLeftLanding();
        markMobileProjectsPanelDismiss();
        markPreferAgentsSurface();
        clearMobileProjectsHomeVisible();
        this.landingLeftThisSession = true;
        document.body.classList.remove('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(false);
        const panel = this.projectsPanel;
        if (panel?.isHomeMode()) {
            panel.hide();
            this.onLandingDismissed();
            return;
        }
        panel?.hide();
        this.applyLandingChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    /** Remove every PR overlay node under the app shell (fixes stacked sheets after re-open). */
    protected removeAllMobilePrPanelsFromShell(): void {
        this.shell.node.querySelectorAll('.theia-mobile-pr').forEach(el => el.remove());
    }

    protected isPullRequestPanelShown(): boolean {
        return Boolean(this.shell.node.querySelector('.theia-mobile-pr.theia-mod-visible'));
    }

    protected disposePullRequestPanel(): void {
        this.pullRequestPanel?.dispose();
        this.pullRequestPanel = undefined;
        this.removeAllMobilePrPanelsFromShell();
    }

    protected openPullRequestPanel(): void {
        this.disposePullRequestPanel();
        this.pullRequestPanel = new MobilePullRequestPanel({
            onDismiss: () => {
                this.scheduleSnapAndUiRefresh();
                this.refreshBottomBar();
            },
        });
        this.shell.node.appendChild(this.pullRequestPanel.node);
        this.pullRequestPanel.show();
    }

    protected async openPullRequestFromInbox(pullRequest: QaapGithubPullRequestSummary): Promise<void> {
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        this.openPullRequestPanel();
        this.pullRequestPanel?.showWithPullRequest(pullRequest);
        this.refreshBottomBar();
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
        this.applyLandingChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    protected hidePullRequestPanel(): void {
        this.disposePullRequestPanel();
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
        this.cancelAgentsBootstrap();
        clearPreferAgentsSurface();
        markPreferDesktopIde();
        setMobileWorkHubComposerHeaderChrome(false);
        setMobileWorkHubHideBottomChrome(false);
        setMobileActiveTranscriptChrome(false);
        document.body.classList.remove('theia-mobile-mod-landing');
        clearMobileWorkHubBootGuard();
        this.disposeProjectsPanelForDesktopIde();
        if (this.shouldActivateMobileLayout()) {
            if (!this.mobileActive) {
                this.enterMobileLayout();
            } else {
                this.syncMobileHubPrimaryBottomChrome();
                this.refreshBottomBar();
                this.refreshWorkbenchTopBar();
                this.forceCenterColumnFullWidth();
                this.scheduleSnapAndUiRefresh();
            }
        } else {
            this.leaveMobileLayout();
        }
        this.onMediaChange();
        window.requestAnimationFrame(() => {
            if (!this.shouldActivateMobileLayout()) {
                void this.ensureDesktopSidePanelSizes();
            }
            this.requestFullShellRelayout();
        });
    }

    /** Top-bar «Back to Work Hub» from mobile desktop-IDE mode — restore the Agents execution shell. */
    protected returnToAgentsFromDesktopIde(): void {
        this.cancelAgentsBootstrap();
        clearPreferDesktopIde();
        this.landingLeftThisSession = true;
        document.body.classList.remove('theia-mobile-mod-landing');
        if (!this.mobileActive && this.shouldActivateMobileLayout()) {
            this.enterMobileLayout();
        }
        if (!this.tryBootstrapMobileAgentsChat()) {
            void this.restoreAgentsSurfaceAfterReload();
        }
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    protected toggleWorkHubSessionsSidebar(): void {
        this.ensureProjectsPanel();
        this.projectsPanel?.toggleWorkHubSessionsSidebar();
    }

    /**
     * Mockup chat-active: transcript on body replaces the Work Hub landing (mod-landing hides it).
     */
    protected onEnterActiveTranscript(): void {
        if (document.body.classList.contains('theia-mobile-mod-active-transcript')) {
            setMobileActiveTranscriptChrome(true);
            return;
        }
        this.transcriptOpenedFromWorkHubLanding = document.body.classList.contains('theia-mobile-mod-landing');
        if (this.transcriptOpenedFromWorkHubLanding) {
            this.landingLeftThisSession = true;
            markMobileProjectsLeftLanding();
            document.body.classList.remove('theia-mobile-mod-landing');
            setMobileLandingHubListChrome(false);
            this.projectsPanel?.hide();
        }
        setMobileActiveTranscriptChrome(true);
        markPreferAgentsSurface();
        this.syncMobileHubPrimaryBottomChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    protected async onExitActiveTranscript(): Promise<void> {
        setMobileActiveTranscriptChrome(false);
        if (this.transcriptOpenedFromWorkHubLanding) {
            this.transcriptOpenedFromWorkHubLanding = false;
            this.landingLeftThisSession = false;
            await this.openMobileWorkHubLanding('tasks');
            return;
        }
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
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
        this.landingLeftThisSession = false;
        clearPreferAgentsSurface();
        if (preferredHubView === 'home' || preferredHubView === undefined) {
            markMobileProjectsHomeVisible();
        } else {
            clearMobileProjectsHomeVisible();
            markPreferAgentsSurface();
        }
        document.body.classList.add('theia-mobile-mod-landing');
        if (this.projectsPanel && !this.projectsPanel.isHomeMode()) {
            this.projectsPanel.hide();
            this.projectsPanel.dispose();
            this.projectsPanel.node.parentElement?.removeChild(this.projectsPanel.node);
            this.projectsPanel = undefined;
        }
        this.ensureProjectsPanel(true);
        const panel = this.projectsPanel;
        if (!panel) {
            return;
        }
        if (preferredHubView !== undefined && preferredHubView !== 'home') {
            this.projectsService.setHubView(preferredHubView);
        }
        await panel.show(preferredHubView !== undefined ? { preferredHubView } : undefined);
        this.applyLandingChrome();
        this.syncMobileHubPrimaryBottomChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
    }

    /**
     * Abre el Work Hub a pantalla completa y selecciona una pestaña del landing (Home, Agents, Routines).
     */
    /** Quita overlays de transcript/agente en `body` que quedan por encima del Work Hub (z-index 12950). */
    protected dismissMobileAgentTranscriptOverlays(): void {
        document.body.querySelectorAll('.theia-mobile-agent-transcript-root').forEach(node => {
            node.remove();
        });
    }

    protected isMobileWorkHubLandingVisible(): boolean {
        return document.body.classList.contains('theia-mobile-mod-landing')
            && this.projectsPanel?.isVisible() === true
            && this.projectsPanel.isHomeMode() === true;
    }

    /**
     * Cambia la pestaña del Work Hub de forma síncrona (sin esperar a cerrar sheets).
     * Devuelve true si el panel landing ya estaba visible y la vista se aplicó al instante.
     */
    protected syncHubLandingNavigation(view: MobileProjectsHubView): boolean {
        this.landingLeftThisSession = false;
        markMobileProjectsHomeVisible();
        if (view !== 'home') {
            this.projectsService.setHubView(view);
        }
        document.body.classList.add('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(true);
        const panel = this.projectsPanel;
        if (!(panel?.isHomeMode() === true && panel.isVisible())) {
            return false;
        }
        if (panel.isProjectDetailView()) {
            panel.closeProjectDetail();
        }
        if (view === 'tasks') {
            this.conversations.warmLiveTransport();
            this.activeTasks.start();
            panel.preferComposerSurface('task');
        } else if (view === 'chat' || view === 'review') {
            this.conversations.warmLiveTransport();
        }
        panel.navigateHubTab(view);
        this.applyLandingChrome();
        this.syncMobileHubPrimaryBottomChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
        this.ensureDesktopWorkHubSessionsSidebarOpen();
        return true;
    }

    /** Cierra overlays que no deben bloquear la navegación entre pestañas del hub. */
    protected async finalizeHubLandingNavigation(): Promise<void> {
        this.hidePullRequestPanel();
        try {
            await this.dismissSheetsAsync();
            if (this.shell.isExpanded('bottom')) {
                await this.shell.collapsePanel('bottom');
            }
            await this.collapseMobileSidePanels();
        } catch (e) {
            console.error('[qaap-mobile-shell] finalizeHubLandingNavigation failed', e);
        }
    }

    protected async openMobileWorkHubLanding(view: MobileProjectsHubView): Promise<void> {
        dismissQaapAccountMenu();
        clearPreferDesktopIde();
        installMobileWorkHubBootGuard();
        if (!this.mobileActive) {
            this.enterMobileLayout();
        }
        this.dismissMobileAgentTranscriptOverlays();
        if (this.syncHubLandingNavigation(view)) {
            void this.finalizeHubLandingNavigation();
            return;
        }
        void this.finalizeHubLandingNavigation();
        await this.showMobileProjectsHome(view);
        const resolved = this.projectsPanel;
        if (!resolved) {
            return;
        }
        if (resolved.isProjectDetailView()) {
            resolved.closeProjectDetail();
        }
        if (view === 'tasks') {
            this.conversations.warmLiveTransport();
            this.activeTasks.start();
            resolved.preferComposerSurface('task');
        } else if (view === 'chat' || view === 'review') {
            this.conversations.warmLiveTransport();
        }
        resolved.navigateHubTab(view);
        if (view !== 'home') {
            markPreferAgentsSurface();
        }
        this.syncMobileHubPrimaryBottomChrome();
        this.refreshBottomBar();
        this.refreshWorkbenchTopBar();
        this.ensureDesktopWorkHubSessionsSidebarOpen();
    }

    protected async togglePullRequestPanel(): Promise<void> {
        if (this.isPullRequestPanelShown()) {
            this.disposePullRequestPanel();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        this.hideProjectsPanel();
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        this.openPullRequestPanel();
        this.refreshBottomBar();
    }

    protected async onProjectsPanelOpen(project: MobileProjectEntry): Promise<void> {
        this.leaveMobileProjectsLandingNow();
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
        this.onLandingDismissed();
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

    /**
     * Bottom activity strip + status bar live on `document.body` in mobile mode so Lumino layout
     * metrics and shell height cannot leave a gap under the status track.
     */
    protected ensureBottomChromeHost(): HTMLElement {
        if (!this.bottomChromeHost) {
            const host = document.createElement('div');
            host.className = 'theia-mobile-bottom-chrome-host';
            host.setAttribute('aria-hidden', 'false');
            document.body.appendChild(host);
            this.bottomChromeHost = host;
        }
        return this.bottomChromeHost;
    }

    protected pinBottomChromeToBody(): void {
        const bottomWidget = this.bottomBarWidget;
        if (!bottomWidget) {
            return;
        }
        const host = this.ensureBottomChromeHost();
        const layout = this.shell.layout as BoxLayout | null;
        if (layout instanceof BoxLayout && this.statusBar.parent === this.shell) {
            const widgets = layout.widgets as ReadonlyArray<LuminoWidget>;
            this.statusBarShellIndex = ArrayExt.findFirstIndex(widgets, w => w === this.statusBar);
            if (this.statusBarShellIndex >= 0) {
                layout.removeWidget(this.statusBar);
            }
        }
        if (bottomWidget.parent) {
            bottomWidget.parent = null;
        }
        BoxPanel.setStretch(bottomWidget, 0);
        if (!host.contains(bottomWidget.node)) {
            host.appendChild(bottomWidget.node);
        }
        if (!host.contains(this.statusBar.node)) {
            host.appendChild(this.statusBar.node);
        }
        this.installBottomChromeTouchScroll();
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
    }

    protected installBottomChromeTouchScroll(): void {
        this.bottomChromeTouchScrollDispose.dispose();
        if (typeof window === 'undefined') {
            return;
        }
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const narrow = this.mobileMq?.matches ?? false;
        if (!coarse && !narrow) {
            this.bottomChromeTouchScrollDispose = Disposable.NULL;
            return;
        }
        const bottomNode = this.bottomBarWidget?.node;
        const toDispose = new DisposableCollection();
        if (bottomNode) {
            toDispose.push(installMobileHorizontalTouchScroll(bottomNode));
        }
        toDispose.push(installMobileHorizontalTouchScroll(this.statusBar.node));
        this.bottomChromeTouchScrollDispose = toDispose;
    }

    protected unpinBottomChromeFromBody(): void {
        this.bottomChromeTouchScrollDispose.dispose();
        this.bottomChromeTouchScrollDispose = Disposable.NULL;
        if (this.bottomChromeHost) {
            while (this.bottomChromeHost.firstChild) {
                this.bottomChromeHost.removeChild(this.bottomChromeHost.firstChild);
            }
            this.bottomChromeHost.parentElement?.removeChild(this.bottomChromeHost);
            this.bottomChromeHost = undefined;
        }
        const layout = this.shell.layout as BoxLayout | null;
        if (layout instanceof BoxLayout && this.statusBar.parent !== this.shell) {
            if (this.statusBarShellIndex >= 0) {
                layout.insertWidget(this.statusBarShellIndex, this.statusBar);
            } else {
                layout.addWidget(this.statusBar);
            }
            BoxPanel.setStretch(this.statusBar, 0);
            MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
        }
        this.statusBarShellIndex = -1;
    }

    protected detachBottomBarFromShell(): void {
        const widget = this.bottomBarWidget;
        if (!widget) {
            return;
        }
        if (widget.parent) {
            widget.parent = null;
        }
        this.bottomBarWidget = undefined;
    }

    protected readonly onLeftEdgeTouchStart = (e: TouchEvent): void => {
        this.leftEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onLeftEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (x - this.leftEdgeTouchStartX <= 40) {
            return;
        }
        MobileHaptics.fire(MobileHaptics.MEDIUM);
        if (this.mobileActive && this.workspaceService.opened) {
            void this.toggleProjectsPanel();
            return;
        }
        void this.shell.leftPanelHandler.expand();
    };

    protected readonly onRightEdgeTouchStart = (e: TouchEvent): void => {
        this.rightEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onRightEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (this.rightEdgeTouchStartX - x > 40) {
            MobileHaptics.fire(MobileHaptics.MEDIUM);
            void this.shell.rightPanelHandler.expand();
        }
    };

    protected async dismissMobileSideSheets(): Promise<void> {
        await this.collapseMobileSideSheets();
        this.updateBackdropVisibility();
        if (this.mobileActive) {
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected scheduleSnapAndUiRefresh(): void {
        if (!this.mobileActive) {
            return;
        }
        this.persistAgentsSurfaceForActiveSession();
        if (this.snapRaf) {
            cancelAnimationFrame(this.snapRaf);
        }
        this.snapRaf = requestAnimationFrame(() => {
            this.snapRaf = 0;
            const snap = (): void => {
                this.snapCenterFullWidth();
                this.updateMobileShellStateClasses();
                this.refreshBottomBar();
                this.updateBackdropVisibility();
                this.requestSheetRelayout();
                this.syncIdeMiniBrowserPreviewSuspension();
            };
            void Promise.all([
                this.shell.leftPanelHandler.state.pendingUpdate,
                this.shell.rightPanelHandler.state.pendingUpdate,
                this.getBottomPanelPendingUpdate(),
            ]).then(snap, snap);
        });
    }

    /** Pause mini-browser dev-server iframes while Work Hub is foreground (avoids Vite HMR console noise). */
    protected syncIdeMiniBrowserPreviewSuspension(): void {
        const userViewingIdePreview = peekPreferDesktopIde() && !!this.getActivePreviewWidget();
        syncQaapMiniBrowserPreviewSuspension(this.shell, userViewingIdePreview);
    }

    /**
     * Reset the scroll position of any virtualised list inside the side panel container so the user
     * always lands on the top of the view when they re-open a sheet or switch tabs. Targets:
     * `react-virtuoso` scrollers (file tree, search results, SCM, etc.) plus generic `.ps`
     * (perfect-scrollbar) containers used by Theia views.
     */
    protected resetSheetScroll(side: 'left' | 'right'): void {
        if (!this.shell.isExpanded(side)) {
            return;
        }
        const container = side === 'left' ? this.shell.leftPanelHandler.container : this.shell.rightPanelHandler.container;
        const root = container.node;
        const scrollers = root.querySelectorAll<HTMLElement>(
            '[data-virtuoso-scroller="true"], .body.ps, .ps[tabindex]'
        );
        scrollers.forEach(el => {
            if (el.scrollTop > 0) {
                el.scrollTop = 0;
            }
        });
    }

    protected snapCenterFullWidth(): void {
        if (!this.mobileActive) {
            return;
        }
        this.forceCenterColumnFullWidth();
        this.requestSheetRelayout();
    }

    protected requestSheetRelayout(): void {
        if (!this.mobileActive || typeof window === 'undefined') {
            return;
        }
        requestAnimationFrame(() => {
            if (!this.mobileActive) {
                return;
            }
            if (this.shell.isExpanded('left')) {
                this.relayoutMobileSidePanelHandler('left');
            }
            if (this.shell.isExpanded('right')) {
                this.relayoutMobileSidePanelHandler('right');
            }
        });
    }

    /**
     * Force Lumino's `BoxLayout` to discard its cached sizes and re-measure from the host's
     * `clientWidth`/`clientHeight`. This is required because the sheet container is taken out of
     * the SplitLayout flow via `position: fixed` in CSS and expanded to full viewport width, while
     * Lumino still thinks it has the narrow split allocation.
     */
    protected relayoutSheetTree(widget: LuminoWidget): void {
        MessageLoop.sendMessage(widget, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.UpdateRequest);
        if (widget instanceof Panel) {
            for (const child of toArray(widget.widgets)) {
                this.relayoutSheetTree(child);
            }
        }
    }

    protected relayoutMobileSidePanelHandler(side: 'left' | 'right'): void {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        if (handler instanceof QaapSidePanelHandler) {
            handler.relayoutForMobileSheet();
        } else {
            this.relayoutSheetTree(handler.container);
        }
    }

    protected updateBackdropVisibility(): void {
        /* No interactive backdrop — it sat above the shell and closed sheets on the first in-panel touch. */
        this.removeBackdrop();
        if (!this.isAnyMobileSideSheetVisible()) {
            return;
        }
        window.requestAnimationFrame(() => {
            this.requestSheetRelayout();
            if (this.shell.isExpanded('left')) {
                this.relayoutMobileSidePanelHandler('left');
            }
            if (this.shell.isExpanded('right')) {
                this.relayoutMobileSidePanelHandler('right');
            }
        });
    }

    protected isWorkHubLandingBottomBar(): boolean {
        if (!this.mobileActive || peekPreferDesktopIde()) {
            return false;
        }
        if (document.body.classList.contains('theia-mobile-mod-workhub-composer-header')
            || document.body.classList.contains('theia-mobile-mod-active-transcript')) {
            return true;
        }
        const panel = this.projectsPanel;
        if (panel?.isVisible() && panel.isHomeMode() && panel.getHubView() === 'tasks'
            && (panel.isAgentsHubShellActive() || panel.node.classList.contains('theia-mod-agents-hub-landing'))) {
            return true;
        }
        const onLandingPanel = document.body.classList.contains('theia-mobile-mod-landing')
            && panel?.isHomeMode() === true
            && panel.isVisible();
        if (onLandingPanel) {
            return true;
        }
        return this.isMobileWorkspaceHubPrimaryBottomBar();
    }

    /** Chat vacío en el área principal: misma barra Home · Agents · Routines que en el landing. */
    protected isMobileWorkspaceHubPrimaryBottomBar(): boolean {
        return this.landingLeftThisSession
            && !document.body.classList.contains('theia-mobile-mod-landing')
            && this.isMainAgentSurfaceEmpty();
    }

    protected isMainAgentSurfaceEmpty(): boolean {
        const shell = this.shell.node;
        if (shell.querySelector('.theia-mobile-agent-transcript-empty')) {
            return true;
        }
        const transcript = shell.querySelector(
            '.theia-mobile-agent-transcript-root.theia-mod-visible .theia-mobile-agent-transcript',
        );
        if (transcript && transcript.querySelector('.theia-mobile-agent-transcript-msg') === null) {
            return transcript.querySelector('.theia-mobile-agent-transcript-empty') !== null;
        }
        return false;
    }

    protected syncMobileHubPrimaryBottomChrome(): void {
        if (peekPreferDesktopIde()) {
            setMobileWorkHubHideBottomChrome(false);
            setMobileWorkHubComposerHeaderChrome(false);
            if (this.bottomChromeHost) {
                this.bottomChromeHost.setAttribute('aria-hidden', 'false');
            }
            return;
        }
        const hideBottomChrome = this.isWorkHubLandingBottomBar();
        setMobileWorkHubHideBottomChrome(hideBottomChrome);
        if (hideBottomChrome) {
            setMobileLandingHubListChrome(false);
        }
        if (this.bottomChromeHost) {
            this.bottomChromeHost.setAttribute('aria-hidden', hideBottomChrome ? 'true' : 'false');
        }
    }

    /** Icon-only hub tabs (reference mock) while the project list is visible. */
    /** Agents is the default shell; overview and routines live in the sessions sidebar. */
    protected getWorkHubLandingBottomButtons(): MobileBottomButton[] {
        return [
            {
                id: 'hub-tasks',
                label: nls.localize('qaap/mobileBottomBar/hubAgents', 'Agents'),
                icon: 'codicon-sparkle',
            },
        ];
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
            this.applyLandingChrome();
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

    /** Primary workspace views. Projects is isolated in the top-bar return action. */
    protected getMobileBottomButtons(): MobileBottomButton[] {
        if (this.isWorkHubLandingBottomBar()) {
            return this.getWorkHubLandingBottomButtons();
        }
        return [
            { id: 'agent', label: nls.localize('theia/core/mobileBottomBar/agent', 'Agent'), icon: 'codicon-sparkle', commandId: WORKBENCH_AI_CHAT_TOGGLE },
            { id: 'preview', label: nls.localize('theia/core/mobileBottomBar/preview', 'Preview'), icon: 'codicon-play' },
            { id: 'terminal', label: nls.localize('theia/core/mobileBottomBar/terminal', 'Terminal'), icon: 'codicon-terminal' },
            { id: 'explore', label: nls.localize('qaap/mobileBottomBar/explore', 'Explore'), icon: 'codicon-folder-opened' },
            { id: 'pr', label: nls.localize('qaap/mobileBottomBar/pr', 'PR'), icon: 'codicon-git-pull-request' },
        ];
    }

    protected isMobileBottomButtonActive(id: MobileBottomButtonId): boolean {
        if (!this.isMobileWorkHubLandingVisible()) {
            switch (id) {
                case 'hub-home':
                case 'hub-inbox':
                case 'hub-projects':
                case 'hub-tasks':
                case 'hub-review':
                case 'hub-team':
                case 'hub-automations':
                    return false;
                default:
                    break;
            }
        }
        switch (id) {
            case 'hub-home':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'home';
            case 'hub-inbox':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'review';
            case 'hub-projects':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'repos'
                    && !this.projectsPanel.isProjectDetailView();
            case 'hub-tasks':
                if (this.isMobileWorkHubLandingVisible()) {
                    return this.projectsPanel?.getHubView() === 'tasks';
                }
                return this.isMobileWorkspaceHubPrimaryBottomBar() && this.isMainAgentSurfaceEmpty();
            case 'hub-review':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'review';
            case 'hub-team':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'tasks';
            case 'hub-automations':
                return this.isMobileWorkHubLandingVisible()
                    && this.projectsPanel?.getHubView() === 'routines';
            case 'projects':
                return !!this.projectsPanel?.isVisible();
            case 'pr':
                return this.isPullRequestPanelShown();
            case 'agent':
                return this.isMobileAgentSheetVisible();
            case 'preview':
                return !!this.getActivePreviewWidget();
            case 'explore':
                return this.isMobileExploreSheetVisible();
            case 'terminal':
                return this.isTerminalBottomPanelOpen();
            default:
                return false;
        }
    }

    protected canToggleTerminalBottomPanel(): boolean {
        if (this.isTerminalBottomPanelOpen()) {
            return true;
        }
        const toggleBottom = CommonCommands.TOGGLE_BOTTOM_PANEL.id;
        if (this.commands.getCommand(toggleBottom) && this.commands.isEnabled(toggleBottom)) {
            return true;
        }
        return !!(this.commands.getCommand(WORKBENCH_TOGGLE_TERMINAL) && this.commands.isEnabled(WORKBENCH_TOGGLE_TERMINAL));
    }

    /** Show or hide the bottom terminal panel (same behavior as the workbench top-bar terminal control). */
    protected async toggleTerminalBottomPanel(): Promise<void> {
        if (this.isTerminalBottomPanelOpen()) {
            if (this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
                this.suppressMobileBottomAutoMaximize = false;
                this.restoreMobileBottomPanelFromMaximized();
                await this.shell.collapsePanel('bottom');
                this.scheduleSnapAndUiRefresh();
                return;
            }
            this.suppressMobileBottomAutoMaximize = false;
            await this.applyMobileBottomPanelMaximizedSize();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        this.suppressMobileBottomAutoMaximize = false;
        const toggleBottom = CommonCommands.TOGGLE_BOTTOM_PANEL.id;
        if (this.commands.getCommand(toggleBottom) && this.commands.isEnabled(toggleBottom)) {
            try {
                await this.commands.executeCommand(toggleBottom);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${toggleBottom}`, e);
            }
        } else if (this.commands.getCommand(WORKBENCH_TOGGLE_TERMINAL) && this.commands.isEnabled(WORKBENCH_TOGGLE_TERMINAL)) {
            try {
                await this.commands.executeCommand(WORKBENCH_TOGGLE_TERMINAL);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${WORKBENCH_TOGGLE_TERMINAL}`, e);
            }
        }
        await this.applyMobileBottomPanelMaximizedSize();
        this.scheduleSnapAndUiRefresh();
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
        if (!this.bottomBar || !this.mobileActive) {
            return;
        }
        this.syncMobileHubPrimaryBottomChrome();
        dismissQaapAccountMenu();
        this.bottomBar.replaceChildren();
        if (this.isWorkHubLandingBottomBar()) {
            return;
        }
        for (const def of this.getMobileBottomButtons()) {
            this.bottomBar.appendChild(this.createMobileBottomButton(def));
        }
    }

    protected createMobileBottomButton(def: MobileBottomButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-bottom-activity-btn';
        btn.dataset.actionId = def.id;
        btn.title = def.label;
        const icon = document.createElement('span');
        icon.className = `theia-mobile-bottom-activity-icon codicon ${def.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-bottom-activity-label';
        label.textContent = def.id === 'projects' && this.projectsCount > 0
            ? `${def.label} ${this.projectsCount}`
            : def.label;
        btn.append(icon, label);
        if (def.id === 'terminal') {
            if (!this.canToggleTerminalBottomPanel()) {
                btn.classList.add('theia-mod-unavailable');
            }
        } else {
            const commandId = def.commandId;
            if (commandId && !this.commands.getCommand(commandId)) {
                btn.classList.add('theia-mod-unavailable');
            }
        }
        if (this.isMobileBottomButtonActive(def.id)) {
            btn.classList.add('theia-mod-active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.setAttribute('aria-pressed', 'false');
        }
        const isHubLandingTab = def.id === 'hub-tasks';
        let hubTabNavAt = 0;
        const onHubTabActivate = (): void => {
            const now = Date.now();
            if (now - hubTabNavAt < 320) {
                return;
            }
            hubTabNavAt = now;
            void this.onMobileBottomButtonClick(def, btn);
        };
        if (isHubLandingTab) {
            // Sin long-press: en iOS el click sintético a veces se pierde tras touchend del menú secundario.
            btn.addEventListener('pointerup', event => {
                if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                onHubTabActivate();
            });
            btn.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onHubTabActivate();
            });
        } else {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                void this.onMobileBottomButtonClick(def, btn);
            });
            this.installBottomBarLongPress(btn, def);
        }
        return btn;
    }

    /**
     * Touch long-press on a bottom-bar button surfaces a secondary action sheet
     * (e.g. "New terminal", "Refresh projects"). Pointer chains: a long-press
     * raises the menu and we swallow the subsequent `click` so the primary
     * action does not also fire.
     */
    protected installBottomBarLongPress(btn: HTMLButtonElement, def: MobileBottomButton): void {
        let timer: number | undefined;
        let startX = 0;
        let startY = 0;
        let fired = false;
        const LONG_PRESS_MS = 480;
        const MOVE_THRESHOLD = 12;
        const cancel = (): void => {
            if (timer !== undefined) {
                window.clearTimeout(timer);
                timer = undefined;
            }
        };
        btn.addEventListener('touchstart', ev => {
            if (ev.touches.length !== 1) {
                cancel();
                return;
            }
            const touch = ev.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            fired = false;
            cancel();
            timer = window.setTimeout(() => {
                timer = undefined;
                fired = true;
                MobileHaptics.fire(MobileHaptics.MEDIUM);
                void this.showBottomBarSecondaryMenu(btn, def);
            }, LONG_PRESS_MS);
        }, { passive: true });
        btn.addEventListener('touchmove', ev => {
            if (timer === undefined) {
                return;
            }
            const touch = ev.touches[0];
            if (!touch) {
                cancel();
                return;
            }
            if (Math.abs(touch.clientX - startX) > MOVE_THRESHOLD
                || Math.abs(touch.clientY - startY) > MOVE_THRESHOLD) {
                cancel();
            }
        }, { passive: true });
        btn.addEventListener('touchend', ev => {
            cancel();
            if (fired && ev.cancelable) {
                ev.preventDefault();
            }
        });
        btn.addEventListener('touchcancel', () => cancel(), { passive: true });
        btn.addEventListener('click', ev => {
            if (fired) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                fired = false;
            }
        }, true);
    }

    protected async showBottomBarSecondaryMenu(anchor: HTMLElement, def: MobileBottomButton): Promise<void> {
        const items = await this.getBottomBarSecondaryItems(def);
        if (items.length === 0) {
            MobileSnackbar.show(def.label, { duration: 800 });
            return;
        }
        this.removeBottomBarSecondaryMenu();
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-bottom-actionsheet';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', def.label);
        for (const item of items) {
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'theia-mobile-bottom-actionsheet-item';
            itemBtn.setAttribute('role', 'menuitem');
            if (item.icon) {
                const ic = document.createElement('span');
                ic.className = `codicon ${item.icon}`;
                ic.setAttribute('aria-hidden', 'true');
                itemBtn.appendChild(ic);
            }
            const lbl = document.createElement('span');
            lbl.className = 'theia-mobile-bottom-actionsheet-label';
            lbl.textContent = item.label;
            itemBtn.appendChild(lbl);
            if (item.detail) {
                const det = document.createElement('span');
                det.className = 'theia-mobile-bottom-actionsheet-detail';
                det.textContent = item.detail;
                itemBtn.appendChild(det);
            }
            itemBtn.addEventListener('click', () => {
                this.removeBottomBarSecondaryMenu();
                MobileHaptics.fire(MobileHaptics.LIGHT);
                void item.run();
            });
            menu.appendChild(itemBtn);
        }
        document.body.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - menuRect.width / 2;
        const minLeft = 8;
        const maxLeft = window.innerWidth - menuRect.width - 8;
        if (left < minLeft) { left = minLeft; }
        if (left > maxLeft) { left = maxLeft; }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.bottom = `calc(${Math.round(window.innerHeight - rect.top + 8)}px)`;
        menu.classList.add('theia-mod-visible');

        const onDocPointer = (ev: PointerEvent): void => {
            if (menu.contains(ev.target as Node)) {
                return;
            }
            this.removeBottomBarSecondaryMenu();
        };
        document.addEventListener('pointerdown', onDocPointer, { capture: true, once: false });
        this.bottomBarMenuCleanup = () => {
            document.removeEventListener('pointerdown', onDocPointer, true);
        };
    }

    protected bottomBarMenuCleanup: (() => void) | undefined;

    protected removeBottomBarSecondaryMenu(): void {
        const existing = document.querySelector('.theia-mobile-bottom-actionsheet');
        existing?.parentElement?.removeChild(existing);
        this.bottomBarMenuCleanup?.();
        this.bottomBarMenuCleanup = undefined;
    }

    protected async getBottomBarSecondaryItems(def: MobileBottomButton): Promise<BottomBarSecondaryItem[]> {
        if (def.id === 'hub-home' || def.id === 'hub-projects' || def.id === 'hub-tasks' || def.id === 'hub-review' || def.id === 'hub-team' || def.id === 'hub-automations') {
            return [];
        }
        switch (def.id) {
            case 'projects':
                return this.getProjectsSecondaryItems();
            case 'terminal':
                return this.getTerminalSecondaryItems();
            case 'agent':
                return this.getAgentSecondaryItems();
            case 'pr':
                return this.getPullRequestSecondaryItems();
            case 'preview':
                return this.getPreviewSecondaryItems();
            case 'explore':
                return this.getExploreSecondaryItems();
            default:
                return [];
        }
    }

    protected async getProjectsSecondaryItems(): Promise<BottomBarSecondaryItem[]> {
        const items: BottomBarSecondaryItem[] = [];
        let projects: MobileProjectEntry[] = [];
        try {
            projects = await this.projectsService.loadProjects();
        } catch {
            projects = [];
        }
        const switchable = projects.filter(p => !p.isCurrent).slice(0, 4);
        for (const project of switchable) {
            items.push({
                label: project.name,
                detail: project.github?.fullName ?? project.branch,
                icon: 'codicon-repo',
                run: () => this.onProjectsPanelOpen(project),
            });
        }
        if (items.length > 0) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/projectsAll', 'All projects'),
                icon: 'codicon-list-unordered',
                run: () => this.toggleProjectsPanel(),
            });
        }
        items.push({
            label: nls.localize('qaap/mobileBottomBar/projectsRefresh', 'Refresh'),
            icon: 'codicon-refresh',
            run: async () => {
                await this.refreshProjectsCount();
                this.refreshBottomBar();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileBottomBar/projectsRefreshed', 'Work Hub refreshed'),
                    { kind: 'success', duration: 1200 }
                );
            },
        });
        return items;
    }

    protected getTerminalSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const newTerminal = 'terminal:new';
        if (this.commands.getCommand(newTerminal)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newTerminal', 'New terminal'),
                icon: 'codicon-add',
                run: () => this.executeAndDismiss(newTerminal),
            });
        }
        const killAll = 'terminal:kill-all';
        if (this.commands.getCommand(killAll)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/closeAllTerminals', 'Close all terminals'),
                icon: 'codicon-trash',
                run: () => this.executeAndDismiss(killAll),
            });
        }
        if (this.isTerminalBottomPanelOpen()) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/collapseTerminal', 'Collapse panel'),
                icon: 'codicon-chevron-down',
                run: async () => { await this.shell.collapsePanel('bottom'); this.scheduleSnapAndUiRefresh(); },
            });
        }
        return items;
    }

    protected getAgentSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        if (this.commands.getCommand(EDIT_CHAT_SESSION_SETTINGS_COMMAND)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/agentSettings', 'Session settings'),
                icon: 'codicon-settings',
                run: () => this.executeAndDismiss(EDIT_CHAT_SESSION_SETTINGS_COMMAND),
            });
        }
        if (this.commands.getCommand(OPEN_AI_CONFIGURATION_COMMAND)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/agentConfig', 'AI configuration'),
                icon: 'codicon-extensions',
                run: () => this.executeAndDismiss(OPEN_AI_CONFIGURATION_COMMAND),
            });
        }
        return items;
    }

    protected getPullRequestSecondaryItems(): BottomBarSecondaryItem[] {
        return [{
            label: nls.localize('qaap/mobileBottomBar/prRefresh', 'Refresh pull requests'),
            icon: 'codicon-refresh',
            run: async () => {
                this.hideProjectsPanel();
                this.openPullRequestPanel();
                this.refreshBottomBar();
            },
        }];
    }

    protected getPreviewSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const descriptor = this.projectBootstrap.descriptor;
        const phase = this.projectBootstrap.phase;
        if (descriptor) {
            if (phase === 'detected') {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewInstall', 'Install dependencies'),
                    detail: descriptor.installCommand,
                    icon: 'codicon-cloud-download',
                    run: () => this.projectBootstrap.runInstall(),
                });
            }
            if (descriptor.devCommand && (phase === 'ready-to-run' || phase === 'detected' || phase === 'run-failed')) {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewRunDev', 'Run dev server'),
                    detail: descriptor.devCommandLabel ?? descriptor.devCommand,
                    icon: 'codicon-play',
                    run: () => this.projectBootstrap.runDevServer(),
                });
            }
            if (phase === 'dismissed') {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewShowBanner', 'Show project setup'),
                    icon: 'codicon-rocket',
                    run: () => this.projectBootstrap.reset(),
                });
            }
            if (this.projectBootstrap.previewUrl) {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewFocus', 'Open dev preview'),
                    detail: this.projectBootstrap.previewUrl,
                    icon: 'codicon-link-external',
                    run: () => this.projectBootstrap.focusPreview(),
                });
            }
        }
        const reload = 'mini-browser.reload';
        if (this.commands.getCommand(reload)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/previewReload', 'Reload preview'),
                icon: 'codicon-refresh',
                run: () => this.executeAndDismiss(reload),
            });
        }
        return items;
    }

    protected getExploreSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const newFile = 'file.newFile';
        if (this.commands.getCommand(newFile)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newFile', 'New file'),
                icon: 'codicon-new-file',
                run: () => this.executeAndDismiss(newFile),
            });
        }
        const newFolder = 'file.newFolder';
        if (this.commands.getCommand(newFolder)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newFolder', 'New folder'),
                icon: 'codicon-new-folder',
                run: () => this.executeAndDismiss(newFolder),
            });
        }
        return items;
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
        MobileHaptics.fire(MobileHaptics.LIGHT);
        if (def.id === 'hub-tasks') {
            btn.blur();
        }
        if (def.id === 'hub-inbox') {
            dismissQaapAccountMenu();
            await this.openMobileWorkHubLanding('review');
            this.conversations.start();
            this.inboxStream.start();
            return;
        }
        if (def.id === 'hub-projects') {
            await this.openMobileWorkHubLanding('repos');
            return;
        }
        if (def.id === 'hub-tasks') {
            await this.openMobileWorkHubLanding('tasks');
            return;
        }
        if (def.id === 'hub-review') {
            dismissQaapAccountMenu();
            await this.openMobileWorkHubLanding('review');
            this.conversations.start();
            this.inboxStream.start();
            return;
        }
        if (def.id === 'hub-team') {
            await this.openMobileWorkHubLanding('tasks');
            return;
        }
        if (def.id === 'projects') {
            await this.toggleProjectsPanel();
            return;
        }
        if (def.id === 'pr') {
            await this.togglePullRequestPanel();
            return;
        }
        if (def.id === 'terminal') {
            this.hideProjectsPanel();
            this.hidePullRequestPanel();
            await this.collapseMobileSidePanels();
            await this.toggleTerminalBottomPanel();
            await this.collapseMobileSidePanels();
            this.settleMobileSidePanelsCollapsed();
            return;
        }
        if (def.id === 'agent') {
            this.hidePullRequestPanel();
            await this.toggleMobileAgentSheet();
            return;
        }
        if (def.id === 'preview') {
            this.hidePullRequestPanel();
            await this.toggleMobilePreview();
            return;
        }
        if (def.id === 'explore') {
            this.hidePullRequestPanel();
            await this.toggleMobileExploreSheet();
            return;
        }
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        // Main-area actions: collapse side sheets first so preview / quick input are visible.
        if (this.shouldDismissSheetsForButton(def.id)) {
            await this.dismissSheetsAsync();
        }
        const commandId = def.commandId;
        if (commandId && this.commands.getCommand(commandId) && this.commands.isEnabled(commandId)) {
            try {
                await this.commands.executeCommand(commandId);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${commandId}`, e);
            }
            this.relayoutMainPreviewWidgets();
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected relayoutMainPreviewWidgets(): void {
        for (const widget of toArray(this.shell.mainPanel.widgets())) {
            if (widget.id.startsWith('mini-browser:')) {
                this.relayoutSheetTree(widget);
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
        return this.shell.isExpanded('right') && !this.isSidePanelSheetCollapsedInDom('right');
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
        if (!this.shell.isExpanded('left') || this.isSidePanelSheetCollapsedInDom('left')) {
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
        const other: 'left' | 'right' = side === 'left' ? 'right' : 'left';
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.shell.isExpanded(other)) {
            await this.shell.collapsePanel(other);
        }
        try {
            const widget = await this.widgetManager.getOrCreateWidget(widgetId);
            const area = widget.isAttached ? this.shell.getAreaFor(widget) : undefined;
            if (!widget.isAttached || area !== side) {
                await this.shell.addWidget(widget, { area: side });
            }
            await this.shell.activateWidget(widgetId);
            if (!this.shell.isExpanded(side)) {
                this.shell.expandPanel(side);
            }
            const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
            await handler.state.pendingUpdate;
            this.relayoutMobileSidePanelHandler(side);
            this.resetSheetScroll(side);
        } catch (e) {
            console.error(`[qaap-mobile-shell] openMobileSideSheet(${side}, ${widgetId})`, e);
        }
    }

    protected shouldDismissSheetsForButton(id: MobileBottomButtonId): boolean {
        // Agent lives in the right-side panel by design, so keep that sheet open. Projects uses its
        // own overlay. All other actions target the main editor area, the bottom panel, or a global
        // prompt; the side sheets must be closed so the result is visible.
        return id !== 'agent' && id !== 'projects' && id !== 'pr';
    }

    /** Collapse expanded side sheets and await layout so follow-up UI (e.g. quick input) is stable. */
    protected async dismissSheetsAsync(): Promise<void> {
        await this.dismissMobileSideSheets();
    }

    /** Collapse side + bottom overlays so the main editor column is visible on mobile. */
    protected async collapseMobileSideSheets(): Promise<void> {
        const tasks: Promise<void>[] = [];
        if (this.shell.isExpanded('left')) {
            tasks.push(this.shell.collapsePanel('left'));
        }
        if (this.shell.isExpanded('right')) {
            tasks.push(this.shell.collapsePanel('right'));
        }
        if (this.shell.isExpanded('bottom')) {
            tasks.push(this.shell.collapsePanel('bottom'));
        }
        if (tasks.length) {
            await Promise.all(tasks);
        }
    }

    protected async collapseMobileSidePanels(): Promise<void> {
        const tasks: Promise<void>[] = [];
        if (this.shell.isExpanded('left') || !this.isSidePanelSheetCollapsedInDom('left')) {
            tasks.push(this.shell.collapsePanel('left'));
        }
        if (this.shell.isExpanded('right') || !this.isSidePanelSheetCollapsedInDom('right')) {
            tasks.push(this.shell.collapsePanel('right'));
        }
        if (tasks.length) {
            await Promise.all(tasks);
        }
        this.markMobileSidePanelCollapsed('left');
        this.markMobileSidePanelCollapsed('right');
        this.updateBackdropVisibility();
    }

    protected settleMobileSidePanelsCollapsed(): void {
        window.requestAnimationFrame(() => {
            void this.collapseMobileSidePanels();
            window.setTimeout(() => { void this.collapseMobileSidePanels(); }, 150);
        });
    }

    protected markMobileSidePanelCollapsed(side: 'left' | 'right'): void {
        if (!this.mobileActive || this.shell.isExpanded(side)) {
            return;
        }
        markMobileSidePanelCollapsed(side);
    }

    protected isSidePanelSheetCollapsedInDom(side: 'left' | 'right'): boolean {
        const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
        const panel = document.getElementById(id);
        return !panel
            || panel.classList.contains('theia-mod-collapsed')
            || panel.classList.contains('lm-mod-hidden');
    }

    protected isAnyMobileSideSheetVisible(): boolean {
        const leftOpen = this.shell.isExpanded('left') && !this.isSidePanelSheetCollapsedInDom('left');
        const rightOpen = this.shell.isExpanded('right') && !this.isSidePanelSheetCollapsedInDom('right');
        return leftOpen || rightOpen;
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
