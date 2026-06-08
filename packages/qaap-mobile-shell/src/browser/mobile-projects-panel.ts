// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';
import type { QuickPick } from '@theia/core/lib/common/quick-pick-service';
import { QuickInputService, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/browser';
import { AIVariable, AIVariableResolutionRequest, GenericCapabilitySelections } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent, ChatMode, ChatModel, ChatService, ChatSession } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { MobileProjectChatViewWidget } from './mobile-project-ai-chat-input-widget';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import {
    MobileProjectEntry,
    MobileProjectFilter,
    MobileProjectsHubView,
} from './mobile-projects-types';
import { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsParallelUi } from './mobile-projects-parallel-ui';
import { MobileProjectsTeamUi } from './mobile-projects-team-ui';
import { MobileProjectsTeamHubUi, type WorkHubApprovalItem } from './mobile-projects-team-hub-ui';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import {
    type WorkHubTeamMember,
} from '../common/qaap-work-hub-team';
import { MobileProjectsHomeUi, type WorkHubHomeNavigateTarget, type WorkHubHomeQuickActionId } from './mobile-projects-home-ui';
import { MobileProjectsService } from './mobile-projects-service';
import {
    TranscriptFollowUpQueue,
} from '../common/qaap-transcript-follow-up-queue';
import {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    type QaapAgentApprovalRequestDTO,
} from '../common/qaap-agent-approval-client';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    readStoredAgentModel,
    type QaapAgentTaskAgentOption,
    type QaapQaiqModelOption,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import {
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    type StickyComposerTokenOption,
} from '../common/qaap-sticky-composer-mention';
import {
    type StickyComposerContextChipView,
} from './qaap-sticky-composer-context-ui';
import {
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
import {
    type StickyComposerWorkspaceBarView,
} from './qaap-sticky-composer-workspace-bar';
import { type QaapSegmentedFieldController } from './qaap-mobile-form-ui';
import {
    buildQaapAccountMenuEntries,
    toggleQaapAccountMenu,
} from './qaap-workbench-account-menu';
import { readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import {
    type EmbeddedAgentPreviewChrome,
} from '@theia/qaap-adapters/lib/browser/qaap-agent-preview-chrome';
import type { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import type { QaapPreviewInspectorDeps } from '@theia/qaap-adapters/lib/browser/qaap-preview-inline-inspector';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    type ExecutionSurfaceTabId,
} from '../common/qaap-execution-surface-tabs';
import { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import {
    MobileProjectsTranscriptHistoryUi,
    type MobileProjectsTranscriptHistoryHost,
} from './mobile-projects-transcript-history-ui';
import {
    MobileProjectsTranscriptComposerUi,
    type MobileProjectsTranscriptComposerHost,
} from './mobile-projects-transcript-composer-ui';
import { MobileProjectsTranscriptStickyComposerUi, type MobileProjectsTranscriptStickyComposerHost } from './mobile-projects-transcript-sticky-composer-ui';
import { MobileProjectsTranscriptSheetUi, type MobileProjectsTranscriptSheetHost } from './mobile-projects-transcript-sheet-ui';
import { MobileProjectsExecutionSurfaceTabsUi, type MobileProjectsExecutionSurfaceTabsHost } from './mobile-projects-execution-surface-tabs-ui';
import { MobileProjectsTranscriptSurfacesUi, type MobileProjectsTranscriptSurfacesHost } from './mobile-projects-transcript-surfaces-ui';
import { MobileProjectsTranscriptVerifyUi, type MobileProjectsTranscriptVerifyHost } from './mobile-projects-transcript-verify-ui';
import { MobileProjectsTranscriptHeaderUi, type MobileProjectsTranscriptHeaderHost } from './mobile-projects-transcript-header-ui';
import { MobileProjectsTranscriptSubmitUi, type MobileProjectsTranscriptSubmitHost } from './mobile-projects-transcript-submit-ui';
import { MobileProjectsTasksHubUi, type MobileProjectsTasksHubHost } from './mobile-projects-tasks-hub-ui';
import { MobileProjectsWorkHubInboxUi, type MobileProjectsWorkHubInboxHost } from './mobile-projects-work-hub-inbox-ui';
import { MobileProjectsTheiaChatSessionUi, type MobileProjectsTheiaChatSessionHost } from './mobile-projects-theia-chat-session-ui';
import { MobileProjectsHubCatalogUi, type MobileProjectsHubCatalogHost } from './mobile-projects-hub-catalog-ui';
import { MobileProjectsHubRoutinesUi, type MobileProjectsHubRoutinesHost } from './mobile-projects-hub-routines-ui';
import { MobileProjectsHubRoutineEditorUi, type MobileProjectsHubRoutineEditorHost } from './mobile-projects-hub-routine-editor-ui';
import { MobileProjectsReposHubUi, type MobileProjectsReposHubHost } from './mobile-projects-repos-hub-ui';
import { MobileProjectsProjectActionsUi, type MobileProjectsProjectActionsHost } from './mobile-projects-project-actions-ui';
import { MobileProjectsInboxPrUi, type MobileProjectsInboxPrHost } from './mobile-projects-inbox-pr-ui';
import { MobileProjectsCardMenuUi, type MobileProjectsCardMenuHost } from './mobile-projects-card-menu-ui';
import {
    MobileProjectsProjectRowsUi,
    MOBILE_PROJECTS_CONVERSATIONS_COLLAPSED_LIMIT,
    type MobileProjectsProjectRowsHost,
} from './mobile-projects-project-rows-ui';
import { MobileProjectsHubTeamDataUi, type MobileProjectsHubTeamDataHost } from './mobile-projects-hub-team-data-ui';
import { MobileProjectsConversationActionsUi, type MobileProjectsConversationActionsHost } from './mobile-projects-conversation-actions-ui';
import { MobileProjectsAgentsHubInlineUi, type MobileProjectsAgentsHubInlineHost } from './mobile-projects-agents-hub-inline-ui';
import { MobileProjectsTranscriptLiveUi, type MobileProjectsTranscriptLiveHost } from './mobile-projects-transcript-live-ui';
import { MobileProjectsTranscriptMessagesUi, type MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
import {
    MobileProjectsBackgroundTaskUi,
    type MobileProjectsBackgroundTaskHost,
} from './mobile-projects-background-task-ui';
import {
    MobileProjectsChatServiceSummariesUi,
    type MobileProjectsChatServiceSummariesHost,
} from './mobile-projects-chat-service-summaries-ui';
import {
    MobileProjectsComposerHeaderUi,
    type MobileProjectsComposerHeaderHost,
} from './mobile-projects-composer-header-ui';
import {
    MobileProjectsConversationIndexUi,
    type MobileProjectsConversationIndexHost,
} from './mobile-projects-conversation-index-ui';
import {
    MobileProjectsConversationOpenUi,
    type MobileProjectsConversationOpenHost,
} from './mobile-projects-conversation-open-ui';
import {
    MobileProjectsDiffHubUi,
    type MobileProjectsDiffHubHost,
} from './mobile-projects-diff-hub-ui';
import {
    MobileProjectsHomeHubUi,
    type MobileProjectsHomeHubHost,
} from './mobile-projects-home-hub-ui';
import {
    MobileProjectsHubHeaderUi,
    type MobileProjectsHubHeaderHost,
} from './mobile-projects-hub-header-ui';
import {
    MobileProjectsHubLandingUi,
    type MobileProjectsHubLandingHost,
} from './mobile-projects-hub-landing-ui';
import {
    MobileProjectsHubListChromeUi,
    type MobileProjectsHubListChromeHost,
} from './mobile-projects-hub-list-chrome-ui';
import {
    MobileProjectsHubQueryUi,
    type MobileProjectsHubQueryHost,
} from './mobile-projects-hub-query-ui';
import {
    MobileProjectsHubRenderUi,
    type MobileProjectsHubRenderHost,
} from './mobile-projects-hub-render-ui';
import {
    MobileProjectsOverlayFactoryUi,
    type MobileProjectsOverlayFactoryHost,
} from './mobile-projects-overlay-factory-ui';
import {
    MobileProjectsProjectDetailUi,
    type MobileProjectsProjectDetailHost,
} from './mobile-projects-project-detail-ui';
import {
    MobileProjectsProjectNavigationUi,
    type MobileProjectsProjectNavigationHost,
} from './mobile-projects-project-navigation-ui';
import {
    MobileProjectsRenderListUi,
    type MobileProjectsRenderListHost,
} from './mobile-projects-render-list-ui';
import {
    MobileProjectsRepoFiltersUi,
    type MobileProjectsRepoFiltersHost,
} from './mobile-projects-repo-filters-ui';
import {
    MobileProjectsRepoLifecycleUi,
    type MobileProjectsRepoLifecycleHost,
} from './mobile-projects-repo-lifecycle-ui';
import {
    MobileProjectsSubtitleUi,
    type MobileProjectsSubtitleHost,
} from './mobile-projects-subtitle-ui';
import {
    MobileProjectsTasksHubAttentionUi,
    type MobileProjectsTasksHubAttentionHost,
} from './mobile-projects-tasks-hub-attention-ui';
import {
    MobileProjectsPanelLifecycleUi,
    type MobileProjectsPanelLifecycleHost,
} from './mobile-projects-panel-lifecycle-ui';
import {
    MobileProjectsPanelChromeUi,
    type MobileProjectsPanelChromeHost,
} from './mobile-projects-panel-chrome-ui';
import {
    MobileProjectsActiveTaskActionsUi,
    type MobileProjectsActiveTaskActionsHost,
} from './mobile-projects-active-task-actions-ui';
import {
    MobileProjectsWorkHubSearchUi,
    type MobileProjectsWorkHubSearchHost,
} from './mobile-projects-work-hub-search-ui';
import {
    MobileProjectsStickyComposerContextUi,
    type MobileProjectsStickyComposerContextHost,
} from './mobile-projects-sticky-composer-context-ui';
import {
    MobileProjectsStickyComposerAgentsUi,
    type MobileProjectsStickyComposerAgentsHost,
} from './mobile-projects-sticky-composer-agents-ui';
import {
    MobileProjectsStickyComposerSheetsUi,
    type MobileProjectsStickyComposerSheetsHost,
    type ComposerAgentPickerChrome,
    type ComposerAgentPickerView,
} from './mobile-projects-sticky-composer-sheets-ui';
import {
    MobileProjectsStickyComposerWorkspaceUi,
    type MobileProjectsStickyComposerWorkspaceHost,
} from './mobile-projects-sticky-composer-workspace-ui';
import {
    MobileProjectsStickyComposerColumnUi,
    type MobileProjectsStickyComposerColumnHost,
} from './mobile-projects-sticky-composer-column-ui';
import {
    MobileProjectsStickyComposerRenderUi,
    type MobileProjectsStickyComposerRenderHost,
} from './mobile-projects-sticky-composer-render-ui';
import {
    type QaapTranscriptLiveRefreshOptions,
} from './qaap-transcript-live-controller';
import {
    MobileProjectsSessionsSidebarUi,
    type MobileProjectsSessionsSidebarHost,
} from './mobile-projects-sessions-sidebar-ui';
import { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import {
    type WorkHubHomeAttentionItem,
    type WorkHubHomeRecentItem,
    type WorkHubHomeSnapshot,
} from '../common/qaap-work-hub-home';
import {
    type QaapComposerSurface,
} from '../common/qaap-composer-surface';
import {
    QAAP_WORK_HUB_GETTING_STARTED,
    type WorkHubCatalogAction,
} from '../common/mobile-work-hub-catalog';
import {
    type QaapWorkHubRoutine,
} from '../common/qaap-work-hub-routine';
import {
    type MobileWorkHubInboxItem,
} from './mobile-work-hub-inbox';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import {
    type QaapGitHistoryCommit,
} from '../common/qaap-git-review';
import {
    QaapDiffReviewWidget,
} from './qaap-diff-review-widget';
import type { TranscriptFilesViewServices } from './qaap-transcript-files-view';
import type { TranscriptTerminalSurface, TranscriptTerminalViewServices } from './qaap-transcript-terminal-view';
import {
    TranscriptWorkspaceSurfacesCache,
    type TranscriptWorkspaceSurfaceKey,
} from './qaap-transcript-workspace-surfaces-cache';

export interface MobileProjectsPanelDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    /** Leave the Agents shell and show the classic IDE for this project. */
    onProjectOpenInIde?(project: MobileProjectEntry): void | Promise<void>;
    onDismiss(): void;
    /** Work Hub inbox: open the mobile PR review sheet for this pull request. */
    onOpenPullRequest?(pullRequest: QaapGithubPullRequestSummary): void;
    /** Clone/create/open from the projects UI finished and switched the IDE workspace. */
    onWorkspaceOpened?(): void;
    onProjectsChanged?(): void;
    /**
     * Invoked when the user taps the project that already matches the active workspace.
     * The shell uses it to surface the README in the editor instead of triggering a no-op reload.
     */
    onCurrentProjectActivated?(project: MobileProjectEntry): void | Promise<void>;
    onResumePreview?(project: MobileProjectEntry): void | Promise<void>;
    onOpenAgentOnTask?(project: MobileProjectEntry): void | Promise<void>;
    /** Show Work Hub (Agents landing) when sidebar actions need the projects panel visible. */
    onShowAgentsHub?(): void | Promise<void>;
    /** Show Work Hub Routines from the sessions sidebar. */
    onShowRoutinesHub?(): void | Promise<void>;
    /** Shell bottom bar active state after in-panel hub tab changes. */
    onHubLandingViewChanged?(): void;
    /** Transcript sheet on body: leave Work Hub landing overlay (mockup chat-active). */
    onEnterActiveTranscript?(): void;
    /** Transcript closed: restore Agents hub if the user had opened chat from the landing. */
    onExitActiveTranscript?(): void;
}

export interface MobileProjectsPanelOptions {
    /**
     * Render as the workbench home view instead of a transient sheet: no drag-to-dismiss, no
     * outside-tap dismiss, no `dialog` ARIA role. The user lives here when there is no workspace
     * open, so the panel must not be dismissable.
     */
    homeMode?: boolean;
    /** Live cross-project task tracker. When provided the panel updates cards from SSE events. */
    activeTasks?: MobileProjectsActiveTasks;
    /**
     * Cross-project tracker of persistent agent conversations. When provided, each project card
     * lists its VPS-backed conversations and the inline composer creates / continues them instead
     * of firing fire-and-forget background tasks.
     */
    conversations?: MobileProjectsConversations;
    /** Resolves the editable global background-agent context for VPS conversations. */
    backgroundContext?: QaapBackgroundContextProvider;
    /** GitHub webhook inbox SSE — refreshes the Work Hub inbox without polling. */
    inboxStream?: MobileWorkHubInboxStream;
    /**
     * Browser-local store of per-conversation priority/pause overrides for Theia-chat sessions
     * (the VPS conversation store handles its own flags). Optional — when omitted the menu items
     * fall back to no-op.
     */
    conversationFlags?: MobileProjectsConversationFlags;
    /** Creates the same chat input widget used by the Agent view. */
    createChatInputWidget?: (id: string) => Promise<AIChatInputWidget>;
    /** Creates a full Agent chat view for opening real workspace chat sessions from Projects. */
    createChatViewWidget?: (id: string) => Promise<ChatViewWidget>;
    /** Embeds the diff-review React surface inside the Work Hub. */
    createDiffReviewWidget?: () => Promise<QaapDiffReviewWidget>;
    /** Context attach picker; anchor is the sticky composer attach button. */
    pickContextVariable?: (
        anchor: HTMLElement,
        handlers: MobileComposerAttachHandlers,
    ) => Promise<AIVariableResolutionRequest[]>;
    /** Labels/icons for attached context chips (Agent chat label provider). */
    formatContextChip?: (item: AIVariableResolutionRequest) => StickyComposerContextChipView;
    /** Loads image attachment previews (inline base64 or workspace files). */
    resolveAttachmentPreview?: (item: AIVariableResolutionRequest) => Promise<string | undefined>;
    /** Variables offered for `#` completion in the sticky composer (same pool as Agent chat). */
    getComposerVariables?: () => readonly AIVariable[];
    chatService?: ChatService;
    chatAgentService?: ChatAgentService;
    messageService?: MessageService;
    /** Picks compile/build/test verification commands from the conversation workspace. */
    resolveVerifyChecks?: (cwd: string) => Promise<Array<{ readonly label: string; readonly command: string }>>;
    /** Opens a workspace file when the user taps a transcript read chip. */
    openTranscriptFile?: (filePath: string) => void | Promise<void>;
    /** Codex-style workspace browser for the transcript Files tab. */
    createTranscriptFilesViewServices?: () => TranscriptFilesViewServices | undefined;
    /** Integrated terminal for the transcript Terminal tab (same {@link TerminalService} as the workbench). */
    createTranscriptTerminalViewServices?: () => TranscriptTerminalViewServices | undefined;
    /** Shared preview surfaces (element picker + inspector) for the transcript Preview tab. */
    previewSurfaceRegistry?: QaapPreviewSurfaceRegistry;
    /** Element Inspector service + commands for inline Design/CSS editing in Preview. */
    previewInspectorDeps?: QaapPreviewInspectorDeps;
    /** Clipboard for preview overflow actions (screenshot, copy URL). */
    clipboard?: ClipboardService;
    /** Reads AI provider settings (API keys + model lists) for the QAIQ model submenu. */
    readPreference?: (key: string) => unknown;
    /** Monaco quick input — Work Hub search opens as a top overlay instead of an inline field. */
    quickInputService?: QuickInputService;
    /** Opens AI / Settings preferences inside the Work Hub instead of the IDE main area. */
    openPreferencesSheet?: (query?: string) => Promise<void>;
    /** Opens AI Configuration (agents, MCP, prompts) inside the Work Hub overlay. */
    openAiConfigurationSheet?: (tabId?: string) => Promise<void>;
}

type WorkHubSearchTarget =
    | { readonly kind: 'project'; readonly projectId: string }
    | { readonly kind: 'conversation'; readonly projectId: string; readonly conversationId: string }
    | { readonly kind: 'pullRequest'; readonly pullRequest: QaapGithubPullRequestSummary }
    | { readonly kind: 'catalog'; readonly action: WorkHubCatalogAction }
    | { readonly kind: 'routine'; readonly routineId: string };

interface WorkHubSearchPickItem extends QuickPickItem {
    readonly target: WorkHubSearchTarget;
}

interface TranscriptTerminalSliderState {
    surfaces: TranscriptTerminalSurface[];
    activeIndex: number;
}

interface QaapDiffProjectTab {
    projectId: string;
    label: string;
    rootUri: string;
    rootFsPath: string;
    isActiveWorkspace: boolean;
    fileCount: number;
}

/** Tabs of the transcript sheet (execution view). 'messages' is the chat tab. */
type TranscriptTab = ExecutionSurfaceTabId;

/** A single verification step run on the project (build/test/lint). */
interface VerifyCheck {
    readonly label: string;
    readonly command: string;
}

/** Result of running a {@link VerifyCheck} via the agent-task backend. */
interface VerifyCheckResult {
    readonly check: VerifyCheck;
    state: 'idle' | 'running' | 'ok' | 'fail';
    durationMs?: number;
    exitCode?: number;
    logTail?: string;
}

export class MobileProjectsPanel {

    /** Max conversation rows per repo card before "More" expands the list. */
    protected static readonly CONVERSATIONS_COLLAPSED_LIMIT = MOBILE_PROJECTS_CONVERSATIONS_COLLAPSED_LIMIT;

    /** Max automatic verify→fix loops before the closed loop gives up (avoids runaway turns/cost). */
    protected readonly transcriptMarkdownIt = markdownit({ linkify: false }).use(markdownitemoji.full);

    protected readonly root: HTMLElement;
    protected readonly scroll: HTMLElement;
    protected readonly stickyComposerHost: HTMLElement;
    protected readonly subtitleEl: HTMLElement;
    protected readonly filtersHost: HTMLElement;
    protected readonly searchToggleBtn: HTMLButtonElement;
    protected workHubSearchQuickPick: QuickPick<WorkHubSearchPickItem> | undefined;
    protected workHubSearchQuickPickDispose: Disposable = Disposable.NULL;
    protected readonly accountBtn: HTMLButtonElement;
    protected readonly accountAvatar: HTMLSpanElement;
    protected readonly titleBlock: HTMLElement;
    protected readonly titleRow: HTMLElement;
    protected readonly titleEl: HTMLHeadingElement;
    protected readonly titleAttentionEl: HTMLSpanElement;
    protected readonly headerBackBtn: HTMLButtonElement;
    protected readonly sessionsMenuBtn: HTMLButtonElement;
    protected readonly newFabBtn: HTMLButtonElement;
    protected readonly headerSurfacePickerHost: HTMLElement;
    protected readonly headerExecutionTabsHost: HTMLElement;
    protected headerSurfacePicker?: QaapSegmentedFieldController<QaapComposerSurface>;
    protected headerExecutionTabsProjectId: string | undefined;
    protected filter: MobileProjectFilter = 'all';
    protected hubView: MobileProjectsHubView = 'tasks';
    protected query = '';
    protected cachedAgentApprovals: QaapAgentApprovalRequestDTO[] = [];
    protected agentApprovalsFetchGeneration = 0;
    /** Project ids whose conversation list is fully expanded (not capped at {@link CONVERSATIONS_COLLAPSED_LIMIT}). */
    protected readonly expandedConversationProjectIds = new Set<string>();
    protected readonly diffProjectTabsHost: HTMLElement;
    protected readonly diffWidgetHost: HTMLElement;
    protected diffProjectTabs: QaapDiffProjectTab[] = [];
    protected diffActiveProjectId: string | undefined;
    protected diffReviewWidget: QaapDiffReviewWidget | undefined;
    protected diffScanning = false;
    protected diffPendingPreferredProjectId: string | undefined;
    /** When true, diff is scoped to one repo (workspace sheet) instead of cross-project hub tabs. */
    protected diffScopedToProject = false;
    /** Project row to restore when leaving a scoped diff via the header back control. */
    protected diffReturnProjectId: string | undefined;
    protected projects: MobileProjectEntry[] = [];
    protected visible = false;
    /** Id of the single project row currently expanded; undefined when all are collapsed. */
    protected expandedId: string | undefined;
    /**
     * True when the expansion was driven by the user (vs. the auto-expand of the current workspace
     * at render time). When true, renderList hides the other project rows so the user can focus
     * on the expanded project's chats without surrounding noise; collapsing restores the full list.
     */
    protected soloExpanded = false;
    /** Once the user collapses the current workspace row, do not auto-expand it again. */
    protected suppressCurrentAutoExpand = false;
    /** Last measured lift for the home FAB so it does not jump when the sticky composer hides. */
    protected stickyComposerFabLiftPx = 0;
    protected stickyComposerFabLiftObserver: ResizeObserver | undefined;
    protected stickyComposerDraft = '';
    protected stickyComposerContext: StickyComposerContextEntry[] = [];
    protected stickyComposerFilesExpanded = true;
    protected stickyComposerPinnedAgentId: string | undefined;
    protected stickyComposerBackendAgents: QaapAgentTaskAgentOption[] = [];
    protected stickyComposerQaiqModels: QaapQaiqModelOption[] = [];
    protected stickyComposerAgentSheet: HTMLElement | undefined;
    protected stickyComposerModeSheet: HTMLElement | undefined;
    protected stickyComposerApprovalSheet: HTMLElement | undefined;
    protected stickyComposerWorkspaceSheet: HTMLElement | undefined;
    protected agentsHubSelectedProjectId: string | undefined;
    protected readonly composerWorkspaceBranchByProjectId = new Map<string, string>();
    protected stickyComposerModeId: string | undefined;
    protected stickyComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    protected stickyComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    protected stickyComposerSurface: QaapComposerSurface = 'task';
    protected tasksHubSurface: QaapComposerSurface = 'task';
    /** When true, Agents tab shows the legacy full inbox instead of the new landing. */
    protected agentsHubLegacyInbox = false;
    protected sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
    /** Project session groups expanded in the sessions sidebar accordion. */
    protected readonly sessionsSidebarExpandedProjectIds = new Set<string>();
    /** Per-project visible session count in the sidebar (undefined → default collapsed limit). */
    protected readonly sessionsSidebarVisibleConversationCountByProjectId = new Map<string, number>();
    protected sessionsSidebarAccordionDefaultsApplied = false;
    /** Suppresses hub-restore when closing a transcript immediately before opening another. */
    protected replacingTranscriptSheet = false;
    protected transcriptComposerHost: HTMLElement | undefined;
    /** `${projectId}|${summaryId}` while transcript sticky composer DOM is stable. */
    protected transcriptComposerMountKey: string | undefined;
    protected transcriptComposerProject: MobileProjectEntry | undefined;
    protected transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    protected transcriptComposerContext: StickyComposerContextEntry[] = [];
    protected transcriptComposerFilesExpanded = true;
    protected transcriptComposerPinnedAgentId: string | undefined;
    protected transcriptComposerDraft = '';
    protected readonly transcriptFollowUpQueue = new TranscriptFollowUpQueue();
    protected transcriptFollowUpFlushInFlight = false;
    /** Refreshes transcript sticky-composer send/stop affordance without a full remount. */
    protected transcriptComposerSendRefresh: (() => void) | undefined;
    protected transcriptComposerBackendAgents: QaapAgentTaskAgentOption[] = [];
    protected transcriptComposerQaiqModels: QaapQaiqModelOption[] = [];
    protected transcriptComposerAgentSheet: HTMLElement | undefined;
    protected transcriptComposerQaiqModelSheet: HTMLElement | undefined;
    protected transcriptComposerModeSheet: HTMLElement | undefined;
    protected transcriptComposerApprovalSheet: HTMLElement | undefined;
    protected transcriptComposerModeId: string | undefined;
    protected transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    protected transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    protected transcriptComposerPrefsConvId: string | undefined;
    protected transcriptComposerDraftPersistTimer: number | undefined;
    protected transcriptComposerPrefsPersistTimer: number | undefined;
    protected agentChatInputSession: ChatSession | undefined;
    protected transcriptChatInputWidget: AIChatInputWidget | undefined;
    protected transcriptChatViewWidget: MobileProjectChatViewWidget | undefined;
    protected transcriptScheduleRefresh: (() => void) | undefined;
    protected transcriptLastRenderedConversationId: string | undefined;
    protected transcriptLastRenderedMessageId: string | undefined;
    protected readonly transcriptUi = new MobileProjectsTranscriptUi();
    protected readonly transcriptHistoryUi = new MobileProjectsTranscriptHistoryUi(this as unknown as MobileProjectsTranscriptHistoryHost);
    protected readonly transcriptComposerUi = new MobileProjectsTranscriptComposerUi(this as unknown as MobileProjectsTranscriptComposerHost);
    protected readonly transcriptStickyComposerUi = new MobileProjectsTranscriptStickyComposerUi(this as unknown as MobileProjectsTranscriptStickyComposerHost);
    protected readonly backgroundTaskUi = new MobileProjectsBackgroundTaskUi(this as unknown as MobileProjectsBackgroundTaskHost);
    protected readonly chatServiceSummariesUi = new MobileProjectsChatServiceSummariesUi(this as unknown as MobileProjectsChatServiceSummariesHost);
    protected readonly composerHeaderUi = new MobileProjectsComposerHeaderUi(this as unknown as MobileProjectsComposerHeaderHost);
    protected readonly sessionsSidebarUi = new MobileProjectsSessionsSidebarUi(this as unknown as MobileProjectsSessionsSidebarHost);
    protected readonly conversationIndexUi = new MobileProjectsConversationIndexUi(this as unknown as MobileProjectsConversationIndexHost);
    protected readonly conversationOpenUi = new MobileProjectsConversationOpenUi(this as unknown as MobileProjectsConversationOpenHost);
    protected readonly diffHubUi = new MobileProjectsDiffHubUi(this as unknown as MobileProjectsDiffHubHost);
    protected readonly homeHubUi = new MobileProjectsHomeHubUi(this as unknown as MobileProjectsHomeHubHost);
    protected readonly hubHeaderUi = new MobileProjectsHubHeaderUi(this as unknown as MobileProjectsHubHeaderHost);
    protected readonly hubLandingUi = new MobileProjectsHubLandingUi(this as unknown as MobileProjectsHubLandingHost);
    protected readonly hubListChromeUi = new MobileProjectsHubListChromeUi(this as unknown as MobileProjectsHubListChromeHost);
    protected readonly hubQueryUi = new MobileProjectsHubQueryUi(this as unknown as MobileProjectsHubQueryHost);
    protected readonly hubRenderUi = new MobileProjectsHubRenderUi(this as unknown as MobileProjectsHubRenderHost);
    protected readonly overlayFactoryUi = new MobileProjectsOverlayFactoryUi(this as unknown as MobileProjectsOverlayFactoryHost);
    protected readonly panelLifecycleUi = new MobileProjectsPanelLifecycleUi(this as unknown as MobileProjectsPanelLifecycleHost);
    protected readonly panelChromeUi = new MobileProjectsPanelChromeUi(this as unknown as MobileProjectsPanelChromeHost);
    protected readonly activeTaskActionsUi = new MobileProjectsActiveTaskActionsUi(this as unknown as MobileProjectsActiveTaskActionsHost);
    protected readonly projectDetailUi = new MobileProjectsProjectDetailUi(this as unknown as MobileProjectsProjectDetailHost);
    protected readonly projectNavigationUi = new MobileProjectsProjectNavigationUi(this as unknown as MobileProjectsProjectNavigationHost);
    protected readonly renderListUi = new MobileProjectsRenderListUi(this as unknown as MobileProjectsRenderListHost);
    protected readonly repoFiltersUi = new MobileProjectsRepoFiltersUi(this as unknown as MobileProjectsRepoFiltersHost);
    protected readonly repoLifecycleUi = new MobileProjectsRepoLifecycleUi(this as unknown as MobileProjectsRepoLifecycleHost);
    protected readonly subtitleUi = new MobileProjectsSubtitleUi(this as unknown as MobileProjectsSubtitleHost);
    protected readonly tasksHubAttentionUi = new MobileProjectsTasksHubAttentionUi(this as unknown as MobileProjectsTasksHubAttentionHost);
    protected readonly workHubSearchUi = new MobileProjectsWorkHubSearchUi(this as unknown as MobileProjectsWorkHubSearchHost);
    protected readonly stickyComposerContextUi = new MobileProjectsStickyComposerContextUi(this as unknown as MobileProjectsStickyComposerContextHost);
    protected readonly stickyComposerAgentsUi = new MobileProjectsStickyComposerAgentsUi(this as unknown as MobileProjectsStickyComposerAgentsHost);
    protected readonly stickyComposerSheetsUi = new MobileProjectsStickyComposerSheetsUi(this as unknown as MobileProjectsStickyComposerSheetsHost);
    protected readonly stickyComposerWorkspaceUi = new MobileProjectsStickyComposerWorkspaceUi(this as unknown as MobileProjectsStickyComposerWorkspaceHost);
    protected readonly stickyComposerColumnUi = new MobileProjectsStickyComposerColumnUi(this as unknown as MobileProjectsStickyComposerColumnHost);
    protected readonly stickyComposerRenderUi = new MobileProjectsStickyComposerRenderUi(this as unknown as MobileProjectsStickyComposerRenderHost);
    protected readonly executionSurfaceTabsUi = new MobileProjectsExecutionSurfaceTabsUi(this as unknown as MobileProjectsExecutionSurfaceTabsHost);
    protected readonly transcriptSheetUi = new MobileProjectsTranscriptSheetUi(this as unknown as MobileProjectsTranscriptSheetHost);
    protected readonly transcriptSurfacesUi = new MobileProjectsTranscriptSurfacesUi(
        this as unknown as MobileProjectsTranscriptSurfacesHost,
        this.transcriptHistoryUi,
    );
    protected readonly transcriptHeaderUi = new MobileProjectsTranscriptHeaderUi(this as unknown as MobileProjectsTranscriptHeaderHost);
    protected readonly transcriptSubmitUi = new MobileProjectsTranscriptSubmitUi(this as unknown as MobileProjectsTranscriptSubmitHost);
    protected readonly transcriptMessagesUi = new MobileProjectsTranscriptMessagesUi(this as unknown as MobileProjectsTranscriptMessagesHost);
    protected readonly transcriptLiveUi = new MobileProjectsTranscriptLiveUi(this as unknown as MobileProjectsTranscriptLiveHost);
    protected readonly transcriptVerifyUi = new MobileProjectsTranscriptVerifyUi(this as unknown as MobileProjectsTranscriptVerifyHost);
    protected readonly tasksHubUi = new MobileProjectsTasksHubUi(this as unknown as MobileProjectsTasksHubHost);
    protected readonly hubCatalogUi = new MobileProjectsHubCatalogUi(this as unknown as MobileProjectsHubCatalogHost);
    protected readonly reposHubUi = new MobileProjectsReposHubUi(this as unknown as MobileProjectsReposHubHost);
    protected readonly inboxPrUi = new MobileProjectsInboxPrUi(this as unknown as MobileProjectsInboxPrHost);
    protected readonly cardMenuUi = new MobileProjectsCardMenuUi(this as unknown as MobileProjectsCardMenuHost);
    protected readonly projectRowsUi = new MobileProjectsProjectRowsUi(this as unknown as MobileProjectsProjectRowsHost);
    protected readonly hubRoutineEditorUi = new MobileProjectsHubRoutineEditorUi(this as unknown as MobileProjectsHubRoutineEditorHost);
    protected readonly hubRoutinesUi = new MobileProjectsHubRoutinesUi(this as unknown as MobileProjectsHubRoutinesHost);
    protected readonly hubTeamDataUi = new MobileProjectsHubTeamDataUi(this as unknown as MobileProjectsHubTeamDataHost);
    protected readonly conversationActionsUi = new MobileProjectsConversationActionsUi(this as unknown as MobileProjectsConversationActionsHost);
    protected readonly projectActionsUi = new MobileProjectsProjectActionsUi(this as unknown as MobileProjectsProjectActionsHost);
    protected readonly workHubInboxUi = new MobileProjectsWorkHubInboxUi(this as unknown as MobileProjectsWorkHubInboxHost);
    protected readonly theiaChatSessionUi = new MobileProjectsTheiaChatSessionUi(this as unknown as MobileProjectsTheiaChatSessionHost);
    protected readonly agentsHubInlineUi = new MobileProjectsAgentsHubInlineUi(this as unknown as MobileProjectsAgentsHubInlineHost);
    /** Last successful SSE message delta applied to the open transcript (ms). */
    protected transcriptLastSseDeltaAt: number | undefined;
    protected transcriptApprovalRefreshTimer: number | undefined;
    protected transcriptChatHost: HTMLElement | undefined;
    protected transcriptChatInputHost: HTMLElement | undefined;
    /** Execution-view tabs: strip + per-tab content hosts. */
    protected transcriptTabStrip: HTMLElement | undefined;
    protected transcriptPlanHost: HTMLElement | undefined;
    protected transcriptReviewHost: HTMLElement | undefined;
    protected transcriptReviewDiffHost: HTMLElement | undefined;
    protected transcriptReviewChecksHost: HTMLElement | undefined;
    protected transcriptChecksPanelOpen = false;
    protected transcriptHistoryPanelOpen = false;
    protected transcriptHistoryPanelHeightPx: number | undefined;
    protected transcriptHistoryLoading = false;
    protected transcriptHistoryCommits: QaapGitHistoryCommit[] = [];
    protected transcriptHistoryBranch: string | undefined;
    protected transcriptHistoryQuery = '';
    protected transcriptHistoryRoot: string | undefined;
    protected transcriptHistoryLoadGeneration = 0;
    protected transcriptPreviewHost: HTMLElement | undefined;
    protected transcriptEmbeddedPreview: EmbeddedAgentPreviewChrome | undefined;
    protected transcriptFilesHost: HTMLElement | undefined;
    protected transcriptTerminalHost: HTMLElement | undefined;
    protected transcriptTerminalToolbar: HTMLElement | undefined;
    protected transcriptTerminalSlider: HTMLElement | undefined;
    protected transcriptTerminalDots: HTMLElement | undefined;
    protected transcriptTerminalResizeObserver: ResizeObserver | undefined;
    /** One Files tree + Terminal per workspace cwd (project), reused across tasks. */
    protected readonly transcriptWorkspaceSurfaces = new TranscriptWorkspaceSurfacesCache();
    protected transcriptFilesAttachedKey: TranscriptWorkspaceSurfaceKey | undefined;
    protected readonly transcriptTerminalSlidesByWorkspace = new Map<TranscriptWorkspaceSurfaceKey, TranscriptTerminalSliderState>();
    protected transcriptPreviewRequestRunning = false;
    protected transcriptPreviewRequestPending = false;
    protected readonly transcriptPreviewRecoveryRequests = new Set<string>();
    /** Shared Changes · Preview · Files · Terminal tab per project (task surface + transcript sheet). */
    protected readonly executionSurfaceTabByProjectId = new Map<string, TranscriptTab>();
    protected projectDetailExpandedId: string | undefined;
    protected projectDetailTabStrip: HTMLElement | undefined;
    protected projectDetailSurfaceTargets: {
        readonly chatHost: HTMLElement;
        readonly planHost: HTMLElement;
        readonly reviewHost: HTMLElement;
        readonly previewHost: HTMLElement;
        readonly filesHost: HTMLElement;
        readonly terminalHost: HTMLElement;
    } | undefined;
    protected verifyRunning = false;
    protected verifyResults: VerifyCheckResult[] = [];
    protected verifyChecksCwd: string | undefined;
    protected verifyChecksLoading = false;
    /** Count of consecutive automatic verify→fix loops for the open conversation. */
    protected verifyAutoAttempts = 0;
    /** Last transcript status seen — drives auto-verify on streaming→idle. */
    protected transcriptLastStatus: QaapAgentConversationSummaryDTO['status'] | undefined;
    protected overlayUi: {
        parallel: MobileProjectsParallelUi;
        team: MobileProjectsTeamUi;
        teamHub: MobileProjectsTeamHubUi;
        home: MobileProjectsHomeUi;
    } | undefined;
    protected transcriptOpenSummaryId: string | undefined;
    protected transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    protected transcriptOpenProject: MobileProjectEntry | undefined;
    protected transcriptAutoApproveBusy = false;
    protected transcriptLastFingerprint: string | undefined;
    protected transcriptLastConv: QaapAgentConversationDTO | undefined;
    protected readonly transcriptTheiaSessionByConversationId = new Map<string, string>();
    /** Monotonic counter that disambiguates each AIChatInputWidget instance from the WidgetManager cache. */
    protected agentChatInputMountSeq = 0;
    /** Last-flashed task id — drives the highlight animation when a fresh task appears. */
    protected justAddedTaskId: string | undefined;
    /** cwd resolved after clone/prepare — keyed by project id when uri is not yet on the card. */
    protected readonly preparedCwdByProjectId = new Map<string, string>();
    protected inboxPullRequests: QaapGithubPullRequestSummary[] = [];
    protected inboxPullRequestsLoading = false;
    protected inboxPullRequestsLoaded = false;
    /** Server GitHub session for inbox PRs (undefined when no GitHub repos in the hub). */
    protected inboxGithubSignedIn: boolean | undefined;
    /** Bumps when the inbox tab is re-entered so stale PR fetches cannot repaint. */
    protected inboxLoadGeneration = 0;
    /** True until the first conversations prime resolves, so Tasks shows a skeleton instead of an empty flash. */
    protected tasksFirstLoadPending = true;
    /** Safety timer so a rejected initial prime can never strand the Tasks skeleton. */
    protected tasksFirstLoadFallback: number | undefined;
    protected inboxPullRequestsAbort: AbortController | undefined;
    protected workHubRoutines: QaapWorkHubRoutine[] = [];
    protected workHubRoutinesLoading = false;
    protected workHubRoutinesLoaded = false;
    protected workHubRoutinesDefaultAgent: string | undefined;
    protected routineSheet: HTMLElement | undefined;
    protected editingRoutineId: string | undefined;
    protected routinesRefreshTimer: number | undefined;
    protected routineInteractionLock = false;
    protected readonly chatServiceSessionSummariesByProjectId = new Map<string, QaapAgentConversationSummaryDTO[]>();
    protected executionTabOverflowMenu: HTMLElement | undefined;
    protected executionTabOverflowAnchor: HTMLElement | undefined;
    protected executionTabOverflowDispose: Disposable = Disposable.NULL;
    protected openRepoDialog: MobileOpenRepositoryDialog | undefined;
    protected dragDismissDispose: Disposable = Disposable.NULL;
    protected pullToRefreshDispose: Disposable = Disposable.NULL;
    protected lastTitleTap = 0;
    protected readonly homeMode: boolean;
    protected readonly activeTasks: MobileProjectsActiveTasks | undefined;
    protected readonly conversations: MobileProjectsConversations | undefined;
    protected readonly backgroundContext: QaapBackgroundContextProvider | undefined;
    protected readonly inboxStream: MobileWorkHubInboxStream | undefined;
    protected readonly conversationFlags: MobileProjectsConversationFlags | undefined;
    protected readonly createChatInputWidget: MobileProjectsPanelOptions['createChatInputWidget'];
    protected readonly createChatViewWidget: MobileProjectsPanelOptions['createChatViewWidget'];
    protected readonly createDiffReviewWidget: MobileProjectsPanelOptions['createDiffReviewWidget'];
    protected readonly pickContextVariable: MobileProjectsPanelOptions['pickContextVariable'];
    protected readonly formatContextChip: MobileProjectsPanelOptions['formatContextChip'];
    protected readonly resolveAttachmentPreview: MobileProjectsPanelOptions['resolveAttachmentPreview'];
    protected readonly getComposerVariables: MobileProjectsPanelOptions['getComposerVariables'];
    protected readonly chatService: ChatService | undefined;
    protected readonly chatAgentService: ChatAgentService | undefined;
    protected readonly messageService: MessageService | undefined;
    protected readonly resolveVerifyChecks: MobileProjectsPanelOptions['resolveVerifyChecks'];
    protected readonly openTranscriptFile: MobileProjectsPanelOptions['openTranscriptFile'];
    protected readonly createTranscriptFilesViewServices: MobileProjectsPanelOptions['createTranscriptFilesViewServices'];
    protected readonly createTranscriptTerminalViewServices: MobileProjectsPanelOptions['createTranscriptTerminalViewServices'];
    protected readonly previewSurfaceRegistry: MobileProjectsPanelOptions['previewSurfaceRegistry'];
    protected readonly previewInspectorDeps: MobileProjectsPanelOptions['previewInspectorDeps'];
    protected readonly previewClipboard: MobileProjectsPanelOptions['clipboard'];
    protected readonly readPreference: MobileProjectsPanelOptions['readPreference'];
    protected readonly quickInputService: QuickInputService | undefined;
    protected readonly openPreferencesSheet: MobileProjectsPanelOptions['openPreferencesSheet'];
    protected readonly openAiConfigurationSheet: MobileProjectsPanelOptions['openAiConfigurationSheet'];
    protected activeTasksDispose: Disposable = Disposable.NULL;
    protected conversationsDispose: Disposable = Disposable.NULL;
    protected inboxStreamDispose: Disposable = Disposable.NULL;
    protected chatServiceDispose: Disposable = Disposable.NULL;
    protected readonly chatSessionModelDisposables = new Map<string, Disposable>();
    protected readonly chatSessionProjectIds = new Map<string, string>();
    protected chatServiceRefreshHandle: number | undefined;
    protected stickyComposerContextUsageDispose: Disposable = Disposable.NULL;
    /** Open transcript sheet — only one at a time, dismissed on tap-outside or header back button. */
    protected transcriptSheet: HTMLElement | undefined;
    /** Agents tab: unified execution shell (tabs + surfaces) in-panel, no body overlay. */
    protected agentsHubShellActive = false;
    /** Agents tab: a real session is open in the shell (header back returns to idle shell). */
    protected agentsHubInlineActive = false;
    protected agentsHubInlineChatHost: HTMLElement | undefined;
    protected agentsHubInlineTranscriptRoot: HTMLElement | undefined;
    protected agentsHubInlineExecutionRoot: HTMLElement | undefined;
    protected agentsHubInlineTabStrip: HTMLElement | undefined;
    protected transcriptHeaderSubtitle: HTMLElement | undefined;
    protected transcriptSheetDispose: Disposable = Disposable.NULL;
    protected transcriptUserScrollPinDispose: Disposable = Disposable.NULL;
    protected readonly onDocumentPointerDown = (ev: PointerEvent): void => {
        this.cardMenuUi.handleDocumentPointerDown(ev);
    };

    protected readonly onAuthSessionChanged = (): void => {
        this.panelLifecycleUi.updateAccountAvatar();
        this.sessionsSidebar?.updateAccountAvatar();
        if (this.hubView === 'tasks') {
            this.resetInboxPullRequestState();
            void this.refreshInboxPullRequests(undefined, true);
        }
    };

    protected readonly onAccountClick = (): void => {
        toggleQaapAccountMenu(
            this.accountBtn,
            this.commands,
            buildQaapAccountMenuEntries(readQaapSignedIn()),
            {
                section: QAAP_WORK_HUB_GETTING_STARTED,
                onCatalogAction: action => { void this.runCatalogAction(action); },
            },
        );
    };

    constructor(
        protected readonly projectsService: MobileProjectsService,
        protected readonly commands: CommandRegistry,
        protected readonly delegate: MobileProjectsPanelDelegate,
        options: MobileProjectsPanelOptions = {},
    ) {
        this.homeMode = !!options.homeMode;
        this.activeTasks = options.activeTasks;
        this.conversations = options.conversations;
        this.backgroundContext = options.backgroundContext;
        this.inboxStream = options.inboxStream;
        this.conversationFlags = options.conversationFlags;
        this.createChatInputWidget = options.createChatInputWidget;
        this.createChatViewWidget = options.createChatViewWidget;
        this.createDiffReviewWidget = options.createDiffReviewWidget;
        this.pickContextVariable = options.pickContextVariable;
        this.formatContextChip = options.formatContextChip;
        this.resolveAttachmentPreview = options.resolveAttachmentPreview;
        this.getComposerVariables = options.getComposerVariables;
        this.chatService = options.chatService;
        this.chatAgentService = options.chatAgentService;
        this.messageService = options.messageService;
        this.resolveVerifyChecks = options.resolveVerifyChecks;
        this.openTranscriptFile = options.openTranscriptFile;
        this.createTranscriptFilesViewServices = options.createTranscriptFilesViewServices;
        this.createTranscriptTerminalViewServices = options.createTranscriptTerminalViewServices;
        this.previewSurfaceRegistry = options.previewSurfaceRegistry;
        this.previewInspectorDeps = options.previewInspectorDeps;
        this.previewClipboard = options.clipboard;
        this.readPreference = options.readPreference;
        this.quickInputService = options.quickInputService;
        this.openPreferencesSheet = options.openPreferencesSheet;
        this.openAiConfigurationSheet = options.openAiConfigurationSheet;
        this.root = document.createElement('div');
        this.root.className = this.homeMode ? 'theia-mobile-projects theia-mod-home' : 'theia-mobile-projects';
        if (!this.homeMode) {
            this.root.setAttribute('role', 'dialog');
            this.root.setAttribute('aria-modal', 'true');
        }
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const grabber = this.panelChromeUi.constructPanelShell();
        this.panelChromeUi.wirePanelInteractions(grabber, this.onAuthSessionChanged);
    }

    protected handleHeaderBackClick(): void {
        this.hubHeaderUi.handleHeaderBackClick();
    }

    protected onTitleTap(): void {
        this.hubHeaderUi.onTitleTap();
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
    }

    /** True when the panel is the workbench home (no active workspace), not a dismissable sheet. */
    isHomeMode(): boolean {
        return this.homeMode;
    }

    /** Agents hub inline execution shell (agentic chat) is mounted in this panel. */
    isAgentsHubShellActive(): boolean {
        return this.agentsHubShellActive;
    }

    getHubView(): MobileProjectsHubView {
        return this.hubView;
    }

    /** Apply the composer surface. The local Chat surface was removed, so this always resolves to Task. */
    preferComposerSurface(surface: QaapComposerSurface, projectCwd?: string): void {
        this.composerHeaderUi.preferComposerSurface(surface, projectCwd);
    }

    protected pinStickyComposerToQaiq(cwd: string | undefined): void {
        this.composerHeaderUi.pinStickyComposerToQaiq(cwd);
    }

    protected getOfferableCoderAgent(): ChatAgent | undefined {
        return this.stickyComposerAgentsUi.getOfferableCoderAgent();
    }

    /** Work Hub home: user drilled into a single repository (tasks list + sticky composer). */
    isProjectDetailView(): boolean {
        return this.homeMode && this.hubView === 'repos' && this.expandedId !== undefined;
    }

    /** Diff review opened from the active workspace (sheet), not the cross-project Work Hub tab. */
    isProjectDiffView(): boolean {
        return this.hubView === 'diff' && this.diffScopedToProject;
    }

    closeProjectDetail(): void {
        this.projectNavigationUi.closeProjectDetail();
    }

    protected resetProjectDetailSurfaces(): void {
        this.projectNavigationUi.resetProjectDetailSurfaces();
    }

    protected redirectHubView(view: MobileProjectsHubView): MobileProjectsHubView {
        return this.hubQueryUi.redirectHubView(view);
    }

    /** Work Hub landing: repos list, chat, tasks, or diff review (collapses any expanded repo row). */
    selectHubLandingView(
        view: MobileProjectsHubView,
        preferredDiffProjectId?: string,
        options?: { force?: boolean },
    ): void {
        this.hubLandingUi.selectHubLandingView(view, preferredDiffProjectId, options);
    }

    navigateHubTab(view: MobileProjectsHubView): void {
        this.hubLandingUi.navigateHubTab(view);
    }

    async openDiffView(preferredProjectId?: string): Promise<void> {
        await this.hubLandingUi.openDiffView(preferredProjectId);
    }

    async openProjectDiffView(preferredProjectId?: string): Promise<void> {
        await this.hubLandingUi.openProjectDiffView(preferredProjectId);
    }

    closeProjectDiffView(): void {
        this.hubLandingUi.closeProjectDiffView();
    }

    dispose(): void {
        this.panelLifecycleUi.dispose();
    }

    async show(options?: { preferredHubView?: MobileProjectsHubView }): Promise<void> {
        await this.panelLifecycleUi.show(options);
    }

    hide(): void {
        this.panelLifecycleUi.hide();
    }

    protected updateAccountAvatar(): void {
        this.panelLifecycleUi.updateAccountAvatar();
    }

    protected localizeActivityLabel(label: string): string {
        return this.projectRowsUi.localizeActivityLabel(label);
    }

    protected hasConversationDiffStats(summary?: QaapAgentConversationSummaryDTO): boolean {
        return this.projectRowsUi.hasConversationDiffStats(summary);
    }

    protected subscribeToActiveTasks(): void {
        this.panelLifecycleUi.subscribeToActiveTasks();
    }

    protected subscribeToInboxStream(): void {
        this.panelLifecycleUi.subscribeToInboxStream();
    }

    protected subscribeToChatServiceSessions(): void {
        this.panelLifecycleUi.subscribeToChatServiceSessions();
    }

    protected trackChatServiceSessionModels(): void {
        this.panelLifecycleUi.trackChatServiceSessionModels();
    }

    protected disposeChatSessionModelListeners(): void {
        this.panelLifecycleUi.disposeChatSessionModelListeners();
    }

    protected scheduleChatServiceRefresh(): void {
        this.panelLifecycleUi.scheduleChatServiceRefresh();
    }

    protected scheduleChatHubListRefreshAfterSummaries(): void {
        this.panelLifecycleUi.scheduleChatHubListRefreshAfterSummaries();
    }

    protected async applyActiveTasksRefresh(): Promise<void> {
        await this.panelLifecycleUi.applyActiveTasksRefresh();
    }

    protected renderHeader(): void {
        this.hubHeaderUi.renderHeader();
    }

    /** Agents hub: account lives in the sessions sidebar Settings control, not the header. */
    protected syncAgentsHubAccountChrome(): void {
        this.hubHeaderUi.syncAgentsHubAccountChrome();
    }

    protected renderSubtitle(): void {
        this.subtitleUi.renderSubtitle();
    }

    protected buildProjectBranchSubtitle(project: MobileProjectEntry): string {
        return this.subtitleUi.buildProjectBranchSubtitle(project);
    }

    protected projectDetailHeaderTitle(project: MobileProjectEntry | undefined): string {
        return this.hubHeaderUi.projectDetailHeaderTitle(project);
    }

    protected isProjectRunning(project: MobileProjectEntry): boolean {
        return this.conversationIndexUi.isProjectRunning(project);
    }

    protected countRunningTasks(project: MobileProjectEntry): number {
        return this.conversationIndexUi.countRunningTasks(project);
    }

    /** VPS agent conversations/tasks for one project (excludes local Theia chat). */
    protected vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        return this.conversationIndexUi.vpsTasksForProject(project);
    }

    /**
     * Local Theia chat sessions. The Chat surface was removed from the mobile shell, so these are
     * hidden from every list, counter, and recents row — only agentic VPS tasks are surfaced.
     */
    protected localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        return this.conversationIndexUi.localChatsForProject(project);
    }

    protected countDoneTasks(project: MobileProjectEntry): number {
        return this.conversationIndexUi.countDoneTasks(project);
    }

    protected countNeedsInputTasks(project: MobileProjectEntry): number {
        return this.conversationIndexUi.countNeedsInputTasks(project);
    }

    protected countFailedTasks(project: MobileProjectEntry): number {
        return this.conversationIndexUi.countFailedTasks(project);
    }

    protected countUnreadTasks(project: MobileProjectEntry): number {
        return this.conversationIndexUi.countUnreadTasks(project);
    }

    /**
     * A conversation is "unread" when the agent has produced new activity since the user last
     * opened it. Conversations the user has never opened only count as unread if their last
     * message is from the agent — otherwise the row would render as a permanent badge.
     */
    protected isConversationUnread(summary: QaapAgentConversationSummaryDTO): boolean {
        return this.conversationIndexUi.isConversationUnread(summary);
    }

    /** All persistent agent conversations the panel knows about for this project. */
    protected conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        return this.conversationIndexUi.conversationsForProject(project);
    }

    protected async refreshChatServiceSessionSummaries(): Promise<void> {
        await this.chatServiceSummariesUi.refreshChatServiceSessionSummaries();
    }

    protected projectForChatSession(sessionId: string, fallback: MobileProjectEntry): MobileProjectEntry {
        return this.chatServiceSummariesUi.projectForChatSession(sessionId, fallback);
    }

    protected rememberChatSessionProject(sessionId: string | undefined, project: MobileProjectEntry): void {
        this.chatServiceSummariesUi.rememberChatSessionProject(sessionId, project);
    }

    protected isChatSessionWorking(session: ChatSession): boolean {
        return this.chatServiceSummariesUi.isChatSessionWorking(session);
    }

    protected isChatSessionWaitingForInput(session: ChatSession): boolean {
        return this.chatServiceSummariesUi.isChatSessionWaitingForInput(session);
    }

    protected chatSessionPreview(session: ChatSession | undefined): string | undefined {
        return this.chatServiceSummariesUi.chatSessionPreview(session);
    }

    protected mergeConversationSummaries(
        first: QaapAgentConversationSummaryDTO[],
        second: QaapAgentConversationSummaryDTO[],
    ): QaapAgentConversationSummaryDTO[] {
        return this.conversationIndexUi.mergeConversationSummaries(first, second);
    }

    /**
     * Order conversations within a project card. Highest first: priority chats (and never paused),
     * then streaming chats, then idle chats, then paused chats sink to the bottom. Within each tier
     * the more recently updated one wins.
     */
    protected compareConversationOrder(
        a: QaapAgentConversationSummaryDTO,
        b: QaapAgentConversationSummaryDTO,
    ): number {
        return this.conversationIndexUi.compareConversationOrder(a, b);
    }

    /**
     * Position of a conversation in the fork tree:
     *   'none'   — no fork relationship
     *   'parent' — at least one other conversation was forked from this one
     *   'child'  — this conversation was forked from another
     *   'both'   — both of the above (forked in and out)
     */
    protected resolveConversationLineage(
        summary: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string>,
    ): 'none' | 'parent' | 'child' | 'both' {
        return this.conversationIndexUi.resolveConversationLineage(summary, parentIds);
    }

    /**
     * Effective priority/paused state for a conversation. VPS-backed conversations carry the
     * flags on the summary itself; Theia-chat summaries pick them up from the local override store.
     */
    protected resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): {
        priority: boolean;
        paused: boolean;
    } {
        return this.conversationIndexUi.resolveConversationFlags(summary);
    }

    protected preferConversationSummary(
        current: QaapAgentConversationSummaryDTO,
        next: QaapAgentConversationSummaryDTO,
    ): QaapAgentConversationSummaryDTO {
        return this.conversationIndexUi.preferConversationSummary(current, next);
    }

    protected chatServiceConversationId(sessionId: string): string {
        return this.chatServiceSummariesUi.chatServiceConversationId(sessionId);
    }

    /**
     * Legacy adapter — projects the conversation list as `MobileProjectTaskView[]` so existing
     * task-block markup (built before the conversation refactor) keeps working unchanged. New
     * code paths should use {@link conversationsForProject} directly.
     */
    protected summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView {
        return this.conversationIndexUi.summaryToTaskView(conversation);
    }

    protected tasksForProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        return this.conversationIndexUi.tasksForProject(project);
    }

    protected conversationTaskState(conversation: QaapAgentConversationSummaryDTO): string {
        return this.conversationIndexUi.conversationTaskState(conversation);
    }

    protected fallbackTasksFromProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        return this.conversationIndexUi.fallbackTasksFromProject(project);
    }

    protected async onNewClick(): Promise<void> {
        await this.repoLifecycleUi.onNewClick();
    }

    protected async onCloneClick(): Promise<void> {
        await this.repoLifecycleUi.onCloneClick();
    }

    protected async refreshProjects(): Promise<void> {
        await this.repoLifecycleUi.refreshProjects();
    }

    protected render(): void {
        this.hubRenderUi.render();
    }

    protected syncHubViewAvailability(): void {
        this.hubRenderUi.syncHubViewAvailability();
    }

    /** Projects included in the current hub list (inbox ignores Active/Pinned filters). */
    protected projectsForCurrentHubList(): MobileProjectEntry[] {
        return this.hubQueryUi.projectsForCurrentHubList();
    }

    protected static readonly REPO_FILTER_ORDER: readonly MobileProjectFilter[] = ['all', 'active', 'pinned'];

    protected renderFilters(): void {
        this.repoFiltersUi.renderFilters();
    }

    protected repoFilterLabel(id: MobileProjectFilter): string {
        return this.repoFiltersUi.repoFilterLabel(id);
    }

    protected isSearchChromeHidden(): boolean {
        return this.repoFiltersUi.isSearchChromeHidden();
    }

    protected syncSearchChrome(): void {
        this.repoFiltersUi.syncSearchChrome();
    }

    protected workHubSearchPlaceholder(): string {
        return this.repoFiltersUi.workHubSearchPlaceholder();
    }

    protected openWorkHubSearchQuickPick(): void {
        this.workHubSearchUi.openWorkHubSearchQuickPick();
    }

    protected closeWorkHubSearchQuickPick(): void {
        this.workHubSearchUi.closeWorkHubSearchQuickPick();
    }

    protected buildWorkHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildWorkHubSearchPickItems();
    }

    protected buildProjectDetailSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildProjectDetailSearchPickItems();
    }

    protected buildReposSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildReposSearchPickItems();
    }

    protected buildTasksHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildTasksHubSearchPickItems();
    }

    protected buildChatHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildChatHubSearchPickItems();
    }

    protected buildReviewSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildReviewSearchPickItems();
    }

    protected buildWorkflowSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildWorkflowSearchPickItems();
    }

    protected buildRoutineSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.workHubSearchUi.buildRoutineSearchPickItems();
    }

    protected conversationToSearchPickItem(
        project: MobileProjectEntry,
        conversation: QaapAgentConversationSummaryDTO,
    ): WorkHubSearchPickItem {
        return this.workHubSearchUi.conversationToSearchPickItem(project, conversation);
    }

    protected async activateWorkHubSearchTarget(target: WorkHubSearchTarget): Promise<void> {
        await this.workHubSearchUi.activateWorkHubSearchTarget(target);
    }

    /**
     * SSE conversation ticks call {@link renderList} to refresh sidebar dots, but must not
     * `replaceChildren()` the inline transcript shell — that disconnects the chat host mid-stream
     * and aborts live refresh until the user reopens the conversation.
     */

    protected renderList(): void {
        this.renderListUi.renderList();
    }

    /** FAB opens "new repository"; hide while a repo row is expanded (conversations + composer). */
    protected updateNewFabVisibility(): void {
        this.hubListChromeUi.updateNewFabVisibility();
    }

    /**
     * Landing hub list (no expanded project): show the global bottom nav. Hide it while a project
     * row is expanded so the user can focus on chats and the sticky composer.
     */
    protected syncLandingHubListChrome(): void {
        this.hubListChromeUi.syncLandingHubListChrome();
    }

    protected renderDiffHubView(): void {
        this.diffHubUi.renderDiffHubView();
    }

    protected renderDiffProjectTabs(): void {
        this.diffHubUi.renderDiffProjectTabs();
    }

    protected async refreshDiffHubView(): Promise<void> {
        await this.diffHubUi.refreshDiffHubView();
    }

    protected async scanSingleProjectWithChanges(preferredProjectId?: string): Promise<QaapDiffProjectTab | undefined> {
        return this.diffHubUi.scanSingleProjectWithChanges(preferredProjectId);
    }

    protected async scanProjectsWithChanges(): Promise<QaapDiffProjectTab[]> {
        return this.diffHubUi.scanProjectsWithChanges();
    }

    protected async mountDiffReviewWidget(): Promise<void> {
        await this.diffHubUi.mountDiffReviewWidget();
    }

    protected async applyDiffTabToWidget(tab: QaapDiffProjectTab): Promise<void> {
        await this.diffHubUi.applyDiffTabToWidget(tab);
    }

    protected detachDiffReviewWidget(): void {
        this.diffHubUi.detachDiffReviewWidget();
    }

    protected attachDiffReviewWidget(host: HTMLElement): void {
        this.diffHubUi.attachDiffReviewWidget(host);
    }

    protected detachDiffReviewWidgetFromHost(): void {
        this.diffHubUi.detachDiffReviewWidgetFromHost();
    }

    protected resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined {
        return this.composerHeaderUi.resolveStickyComposerProject(projects);
    }

    /** Sidebar drill-downs (Routines, overview, workflows) when Agents is the default shell. */
    protected isSidebarSecondaryHubView(): boolean {
        return this.hubQueryUi.isSidebarSecondaryHubView();
    }

    protected navigateBackFromSidebarSecondaryHub(): void {
        this.hubQueryUi.navigateBackFromSidebarSecondaryHub();
    }

    protected resolveSelectedProject(
        projects: MobileProjectEntry[] = this.projectsForCurrentHubList(),
    ): MobileProjectEntry | undefined {
        return this.projectNavigationUi.resolveSelectedProject(projects);
    }

    protected createProjectDetailView(project: MobileProjectEntry): HTMLElement {
        return this.projectDetailUi.createProjectDetailView(project);
    }

    /** Synthetic conversation scope for project-level Files/Terminal/Preview surfaces. */
    protected projectDetailSurfaceSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        return this.projectDetailUi.projectDetailSurfaceSummary(project);
    }

    protected detachTranscriptReviewWidget(): void {
        this.transcriptSurfacesUi.detachTranscriptReviewWidget();
    }

    protected disposeTranscriptEmbeddedPreview(): void {
        this.transcriptSurfacesUi.disposeTranscriptEmbeddedPreview();
    }

    protected detachTranscriptWorkspaceSurfacesFromSheet(): void {
        this.transcriptSurfacesUi.detachTranscriptWorkspaceSurfacesFromSheet();
    }

    protected disposeTranscriptTerminalSlides(workspaceKey?: TranscriptWorkspaceSurfaceKey): void {
        this.transcriptSurfacesUi.disposeTranscriptTerminalSlides(workspaceKey);
    }

    protected async syncTranscriptPreviewFromConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        await this.transcriptSurfacesUi.syncTranscriptPreviewFromConversation(project, summary, conv);
    }

    protected async refreshTranscriptPreviewProject(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): Promise<MobileProjectEntry> {
        return this.transcriptSurfacesUi.refreshTranscriptPreviewProject(project, summary);
    }

    protected resolveTranscriptPreviewUrl(
        project: MobileProjectEntry,
        conv: QaapAgentConversationDTO | undefined,
    ): string | undefined {
        return this.transcriptSurfacesUi.resolveTranscriptPreviewUrl(project, conv);
    }

    protected async requestTranscriptPreview(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptSurfacesUi.requestTranscriptPreview(project, summary);
    }

    onResumePreview(project: MobileProjectEntry): void | Promise<void> {
        return this.delegate.onResumePreview?.(project);
    }

    protected async onStickyComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        await this.stickyComposerContextUi.onStickyComposerAttach(_project, anchor);
    }

    protected createStickyComposerAttachHandlers(): MobileComposerAttachHandlers {
        return this.stickyComposerContextUi.createStickyComposerAttachHandlers();
    }

    protected createTranscriptComposerAttachHandlers(): MobileComposerAttachHandlers {
        return this.stickyComposerContextUi.createTranscriptComposerAttachHandlers();
    }

    protected hasPendingComposerAttachments(): boolean {
        return this.stickyComposerContextUi.hasPendingComposerAttachments();
    }

    protected notifyPendingComposerAttachments(): void {
        this.stickyComposerContextUi.notifyPendingComposerAttachments();
    }

    protected renderStickyComposer(): void {
        this.stickyComposerRenderUi.renderStickyComposer();
    }

    protected composerSurfaceSegmentOptions(): Array<{ id: QaapComposerSurface; label: string; iconClass: string }> {
        return this.composerHeaderUi.composerSurfaceSegmentOptions();
    }

    protected shouldShowHeaderComposerSurfacePicker(): boolean {
        return this.composerHeaderUi.shouldShowHeaderComposerSurfacePicker();
    }

    protected syncHeaderComposerSurfacePicker(): void {
        this.composerHeaderUi.syncHeaderComposerSurfacePicker();
    }

    protected onHeaderComposerSurfaceChange(surface: QaapComposerSurface): void {
        this.composerHeaderUi.onHeaderComposerSurfaceChange(surface);
    }

    protected updateStickyComposerFabLift(): void {
        this.composerHeaderUi.updateStickyComposerFabLift();
    }

    protected mountStickyComposerContextUsage(
        badge: HTMLElement,
        resolveTarget: () => {
            readonly summary?: QaapAgentConversationSummaryDTO;
            readonly chatModel?: ChatModel;
            readonly full?: QaapAgentConversationDTO;
        } | undefined,
    ): Disposable {
        return this.stickyComposerRenderUi.mountStickyComposerContextUsage(badge, resolveTarget);
    }

    protected resolveTranscriptContextUsageTarget(
        summary: QaapAgentConversationSummaryDTO,
    ): {
        readonly summary?: QaapAgentConversationSummaryDTO;
        readonly chatModel?: ChatModel;
        readonly full?: QaapAgentConversationDTO;
    } {
        return this.transcriptStickyComposerUi.resolveTranscriptContextUsageTarget(summary);
    }

    protected resolveProjectTheiaChatModel(project: MobileProjectEntry): ChatModel | undefined {
        return this.stickyComposerRenderUi.resolveProjectTheiaChatModel(project);
    }

    protected shouldShowComposerWorkspaceBar(_summary?: QaapAgentConversationSummaryDTO): boolean {
        return this.composerHeaderUi.shouldShowComposerWorkspaceBar(_summary);
    }

    protected resolveComposerWorkspaceBranch(project: MobileProjectEntry): string {
        return this.stickyComposerWorkspaceUi.resolveComposerWorkspaceBranch(project);
    }

    protected async refreshComposerWorkspaceBranch(project: MobileProjectEntry): Promise<string> {
        return this.stickyComposerWorkspaceUi.refreshComposerWorkspaceBranch(project);
    }

    protected resolveComposerWorkspaceBarView(project: MobileProjectEntry): StickyComposerWorkspaceBarView {
        return this.stickyComposerWorkspaceUi.resolveComposerWorkspaceBarView(project);
    }

    protected remountComposerWithWorkspaceBar(project: MobileProjectEntry): void {
        this.stickyComposerWorkspaceUi.remountComposerWithWorkspaceBar(project);
    }

    protected openComposerWorkspaceProjectSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.stickyComposerWorkspaceUi.openComposerWorkspaceProjectSheet(project, transcriptOverlay);
    }

    protected createComposerProjectSheetAction(options: {
        readonly iconClass: string;
        readonly label: string;
        readonly onSelect: () => void;
    }): HTMLButtonElement {
        return this.stickyComposerWorkspaceUi.createComposerProjectSheetAction(options);
    }

    protected async onCreateNewProjectFromSheet(): Promise<void> {
        await this.stickyComposerWorkspaceUi.onCreateNewProjectFromSheet();
    }

    protected openComposerWorkspaceBranchSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.stickyComposerWorkspaceUi.openComposerWorkspaceBranchSheet(project, transcriptOverlay);
    }

    protected async loadComposerWorkspaceBranchSheet(
        project: MobileProjectEntry,
        list: HTMLElement,
    ): Promise<void> {
        await this.stickyComposerWorkspaceUi.loadComposerWorkspaceBranchSheet(project, list);
    }

    protected async checkoutComposerWorkspaceBranch(
        project: MobileProjectEntry,
        branch: string,
    ): Promise<void> {
        await this.stickyComposerWorkspaceUi.checkoutComposerWorkspaceBranch(project, branch);
    }

    protected buildStickyComposerColumn(options: {
        project: MobileProjectEntry;
        surface?: QaapComposerSurface;
        agentLocked?: boolean;
        getContext: () => StickyComposerContextEntry[];
        clearContext: () => void;
        removeContextItem: (index: number) => void;
        formatContextChip: (item: StickyComposerContextEntry) => StickyComposerContextChipView;
        filesExpanded?: boolean;
        onFilesExpandedChange?: (expanded: boolean) => void;
        getDraft: () => string;
        setDraft: (value: string) => void;
        resolveAgentLabel: () => string;
        resolveAgentId: () => string;
        modes?: readonly ChatMode[];
        resolveModeLabel?: () => string;
        onOpenModeSheet?: () => void;
        approvalPolicyId?: QaapAgentApprovalPolicyId;
        onOpenApprovalPolicySheet?: () => void;
        canSubmit: boolean;
        isAgentWorking?: () => boolean;
        onStop?: () => void;
        stopLabel?: string;
        onAttach: (anchor: HTMLElement) => void;
        onOpenAgentSheet: () => void;
        onSubmit: (draft: string) => void;
        onSubmitBlocked?: () => void;
        afterInputChange?: () => void;
        sendLabel?: string;
        onSendControlMounted?: (refresh: () => void) => void;
        inputPlaceholder?: string;
        getMentionOptions?: () => readonly StickyComposerTokenOption[];
        getVariableOptions?: () => readonly StickyComposerTokenOption[];
        onContextUsageBadgeMounted?: (badge: HTMLElement) => void;
        showWorkspaceBar?: boolean;
        transcriptOverlay?: boolean;
    }): HTMLElement {
        return this.stickyComposerColumnUi.buildStickyComposerColumn(options);
    }

    protected formatComposerContextEntry(entry: StickyComposerContextEntry): StickyComposerContextChipView {
        return this.stickyComposerContextUi.formatComposerContextEntry(entry);
    }

    protected formatComposerContextChip(item: AIVariableResolutionRequest): StickyComposerContextChipView {
        return this.stickyComposerContextUi.formatComposerContextChip(item);
    }

    protected resolveComposerMentionOptions(
        backendAgents: readonly QaapAgentTaskAgentOption[],
        coderOnly = false,
    ): StickyComposerTokenOption[] {
        return this.stickyComposerContextUi.resolveComposerMentionOptions(backendAgents, coderOnly);
    }

    protected resolveComposerVariableOptions(): StickyComposerTokenOption[] {
        return this.stickyComposerContextUi.resolveComposerVariableOptions();
    }

    protected resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string {
        return this.stickyComposerAgentsUi.resolveStickyComposerPinnedAgentId(project);
    }

    protected resolveStickyComposerAgentLabel(project?: MobileProjectEntry): string {
        return this.stickyComposerAgentsUi.resolveStickyComposerAgentLabel(project);
    }

    protected resolveStickyComposerModelLabel(agentId: string, project?: MobileProjectEntry): string | undefined {
        return this.stickyComposerAgentsUi.resolveStickyComposerModelLabel(agentId, project);
    }

    protected reconcileStickyComposerPinnedAgent(
        current: string | undefined,
        agents: readonly QaapAgentTaskAgentOption[],
        defaultAgent: string | undefined,
        cwd: string | undefined,
    ): string {
        return this.stickyComposerAgentsUi.reconcileStickyComposerPinnedAgent(current, agents, defaultAgent, cwd);
    }

    protected filterSelectableComposerAgents(
        agents: readonly QaapAgentTaskAgentOption[],
    ): QaapAgentTaskAgentOption[] {
        return this.stickyComposerAgentsUi.filterSelectableComposerAgents(agents);
    }

    protected async refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void> {
        await this.stickyComposerAgentsUi.refreshStickyComposerAgents(project);
    }

    protected showComposerAgentPickerLoading(chrome: ComposerAgentPickerChrome): void {
        this.stickyComposerAgentsUi.showComposerAgentPickerLoading(chrome);
    }

    protected async ensureStickyComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        return this.stickyComposerAgentsUi.ensureStickyComposerAgentsLoaded(project);
    }

    protected openStickyComposerAgentSheet(project: MobileProjectEntry): void {
        this.stickyComposerSheetsUi.openStickyComposerAgentSheet(project);
    }

    protected openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void {
        this.stickyComposerSheetsUi.openStickyComposerModeSheet(project, modes);
    }

    protected openStickyComposerApprovalPolicySheet(project: MobileProjectEntry, agentLabel: string): void {
        this.stickyComposerSheetsUi.openStickyComposerApprovalPolicySheet(project, agentLabel);
    }

    protected openApprovalPolicySheet(options: {
        readonly agentLabel: string;
        readonly cwd: string | undefined;
        readonly selectedId: QaapAgentApprovalPolicyId;
        readonly toolRules: QaapAgentToolApprovalRules;
        /** Raise above the full-screen transcript overlay (z-index 2147483001). */
        readonly transcriptOverlay?: boolean;
        readonly onSelect: (policyId: QaapAgentApprovalPolicyId) => void;
        readonly onToolRulesChange?: (rules: QaapAgentToolApprovalRules) => void;
        readonly onClose: () => void;
        readonly assignSheet: (sheet: HTMLElement) => void;
    }): void {
        this.stickyComposerSheetsUi.openApprovalPolicySheet(options);
    }

    protected createModeSheetOption(
        label: string,
        modeId: string,
        selectedModeId: string | undefined,
        onSelect: (modeId: string) => void,
    ): HTMLElement {
        return this.stickyComposerSheetsUi.createModeSheetOption(label, modeId, selectedModeId, onSelect);
    }

    protected createAgentSheetOption(
        label: string,
        agentId: string,
        cwd: string | undefined,
        selectedAgentId: string | undefined,
        onSelect: (agentId: string) => void,
    ): HTMLElement {
        return this.stickyComposerSheetsUi.createAgentSheetOption(label, agentId, cwd, selectedAgentId, onSelect);
    }

    protected async resolveModelsForAgentPicker(agentId: string): Promise<QaapQaiqModelOption[]> {
        return this.stickyComposerSheetsUi.resolveModelsForAgentPicker(agentId);
    }

    protected createComposerAgentPickerChrome(options: {
        readonly sheetClassName: string;
        readonly closeTitle: string;
        readonly onClose: () => void;
    }): ComposerAgentPickerChrome {
        return this.stickyComposerSheetsUi.createComposerAgentPickerChrome(options);
    }

    protected async renderComposerAgentPicker(
        chrome: ComposerAgentPickerChrome,
        options: {
            readonly view: ComposerAgentPickerView;
            readonly modelPickerAgentId?: string;
            readonly cwd: string | undefined;
            readonly agents: readonly QaapAgentTaskAgentOption[];
            readonly selectedAgentId: string | undefined;
            readonly includeCoder: boolean;
            readonly onSelectAgent: (agentId: string, model?: QaapQaiqModelOption) => void;
        },
    ): Promise<void> {
        await this.stickyComposerSheetsUi.renderComposerAgentPicker(chrome, options);
    }

    protected appendAgentModelPickerList(
        list: HTMLElement,
        agentId: string,
        models: readonly QaapQaiqModelOption[],
        storedModel: ReturnType<typeof readStoredAgentModel>,
        onSelect: (model: QaapQaiqModelOption) => void,
    ): void {
        this.stickyComposerSheetsUi.appendAgentModelPickerList(list, agentId, models, storedModel, onSelect);
    }

    protected closeStickyComposerSheets(): void {
        this.stickyComposerSheetsUi.closeStickyComposerSheets();
    }

    closeTranscriptComposerSheets(): void {
        this.transcriptComposerUi.closeTranscriptComposerSheets();
    }

    protected applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[] {
        return this.hubQueryUi.applyFilter(projects, filter);
    }

    protected applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        return this.hubQueryUi.applySearch(projects);
    }

    protected projectMatchesSearch(project: MobileProjectEntry, query: string): boolean {
        return this.hubQueryUi.projectMatchesSearch(project, query);
    }

    protected conversationMatchesQuery(
        conversation: QaapAgentConversationSummaryDTO,
        query: string,
    ): boolean {
        return this.hubQueryUi.conversationMatchesQuery(conversation, query);
    }

    protected isReviewHubView(): boolean {
        return this.hubQueryUi.isReviewHubView();
    }

    protected isHomeHubView(): boolean {
        return this.hubQueryUi.isHomeHubView();
    }

    protected isTasksHubView(): boolean {
        return this.hubQueryUi.isTasksHubView();
    }

    protected refreshHomeHubData(forceRender: boolean): void {
        this.homeHubUi.refreshHomeHubData(forceRender);
    }

    protected buildHomeSnapshot(): WorkHubHomeSnapshot {
        return this.homeHubUi.buildHomeSnapshot();
    }

    protected resolveHomeFavoriteModelLabel(): string | undefined {
        return this.homeHubUi.resolveHomeFavoriteModelLabel();
    }

    protected buildHomeGreeting(): string {
        return this.homeHubUi.buildHomeGreeting();
    }

    protected formatHomeRelativeTime(updatedAt: number): string {
        return this.homeHubUi.formatHomeRelativeTime(updatedAt);
    }

    protected buildHomeWorkspaceActivity(project: MobileProjectEntry): string {
        return this.homeHubUi.buildHomeWorkspaceActivity(project);
    }

    protected getHomeWorkspaceStatus(project: MobileProjectEntry): 'idle' | 'running' | 'open' {
        return this.homeHubUi.getHomeWorkspaceStatus(project);
    }

    protected buildHomeSubtitle(snapshot: WorkHubHomeSnapshot): string {
        return this.homeHubUi.buildHomeSubtitle(snapshot);
    }

    protected resolveHomeAgentLabel(agentId: string): string {
        return this.homeHubUi.resolveHomeAgentLabel(agentId);
    }

    protected renderHomeHubView(): void {
        this.homeHubUi.renderHomeHubView();
    }

    protected resolveHomePinnedProject(): MobileProjectEntry | undefined {
        return this.homeHubUi.resolveHomePinnedProject();
    }

    protected onHomeNavigate(target: WorkHubHomeNavigateTarget): void {
        this.homeHubUi.onHomeNavigate(target);
    }

    protected async onHomeOpenProject(project: MobileProjectEntry): Promise<void> {
        await this.homeHubUi.onHomeOpenProject(project);
    }

    protected async onHomeOpenRecent(item: WorkHubHomeRecentItem): Promise<void> {
        await this.homeHubUi.onHomeOpenRecent(item);
    }

    protected onHomeOpenAttention(item: WorkHubHomeAttentionItem): void {
        this.homeHubUi.onHomeOpenAttention(item);
    }

    protected async onHomeQuickAction(action: WorkHubHomeQuickActionId): Promise<void> {
        await this.homeHubUi.onHomeQuickAction(action);
    }

    protected countTasksAttention(): { needsYou: number; running: number } {
        return this.tasksHubAttentionUi.countTasksAttention();
    }

    protected refreshTasksHubApprovals(forceRender = true): void {
        this.tasksHubAttentionUi.refreshTasksHubApprovals(forceRender);
    }

    protected getFilteredTeamHubState(): {
        members: WorkHubTeamMember[];
        filteredApprovals: WorkHubApprovalItem[];
    } {
        return this.tasksHubAttentionUi.getFilteredTeamHubState();
    }

    openWorkHubSessionsSidebar(): void {
        this.sessionsSidebarUi.openWorkHubSessionsSidebar();
    }

    toggleWorkHubSessionsSidebar(): void {
        this.sessionsSidebarUi.toggleWorkHubSessionsSidebar();
    }

    /** Carga proyectos + sesiones antes de pintar filas `createTaskItem` en el sidebar (mockup). */
    protected async prepareSessionsSidebarData(): Promise<void> {
        await this.sessionsSidebarUi.prepareSessionsSidebarData();
    }

    isWorkHubSessionsSidebarVisible(): boolean {
        return this.sessionsSidebarUi.isWorkHubSessionsSidebarVisible();
    }

    protected ensureWorkHubSessionsSidebar(): MobileWorkHubSessionsSidebar {
        return this.sessionsSidebarUi.ensureWorkHubSessionsSidebar();
    }

    protected resolveWorkHubSessionsSidebarProject(): MobileProjectEntry | undefined {
        return this.sessionsSidebarUi.resolveWorkHubSessionsSidebarProject();
    }

    protected renderWorkHubSessionsSidebarList(host: HTMLElement): void {
        this.sessionsSidebarUi.renderWorkHubSessionsSidebarList(host);
    }

    protected syncSessionsSidebarAnimatedListHeights(host: HTMLElement): void {
        this.sessionsSidebarUi.syncSessionsSidebarAnimatedListHeights(host);
    }

    protected isSessionsSidebarPinnedConversation(summary: QaapAgentConversationSummaryDTO): boolean {
        return this.sessionsSidebarUi.isSessionsSidebarPinnedConversation(summary);
    }

    protected collectSessionsSidebarPinnedGroups(
        projects: MobileProjectEntry[],
        query: string,
    ): Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }> {
        return this.sessionsSidebarUi.collectSessionsSidebarPinnedGroups(projects, query);
    }

    protected createSessionsSidebarPinnedSection(
        groups: Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }>,
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        return this.sessionsSidebarUi.createSessionsSidebarPinnedSection(groups, onActivate, bypassConversationLimit);
    }

    protected getSessionsSidebarConversationDisplayLimit(
        project: MobileProjectEntry,
        totalCount: number,
        bypassLimit: boolean,
    ): number {
        return this.sessionsSidebarUi.getSessionsSidebarConversationDisplayLimit(project, totalCount, bypassLimit);
    }

    protected resolveSessionsSidebarVisibleConversations(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        bypassLimit: boolean,
    ): { visible: QaapAgentConversationSummaryDTO[]; hiddenCount: number; showLess: boolean } {
        return this.sessionsSidebarUi.resolveSessionsSidebarVisibleConversations(project, conversations, bypassLimit);
    }

    protected appendSessionsSidebarConversationItems(
        listHost: HTMLElement,
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassLimit: boolean,
    ): void {
        this.sessionsSidebarUi.appendSessionsSidebarConversationItems(listHost, project, conversations, onActivate, bypassLimit);
    }

    protected createSessionsSidebarShowMoreControl(
        project: MobileProjectEntry,
        hiddenCount: number,
        totalCount: number,
    ): HTMLButtonElement {
        return this.sessionsSidebarUi.createSessionsSidebarShowMoreControl(project, hiddenCount, totalCount);
    }

    protected createSessionsSidebarShowLessControl(project: MobileProjectEntry): HTMLButtonElement {
        return this.sessionsSidebarUi.createSessionsSidebarShowLessControl(project);
    }

    protected createSessionsSidebarPinnedProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        return this.sessionsSidebarUi.createSessionsSidebarPinnedProjectGroup(project, conversations, onActivate, bypassConversationLimit);
    }

    /** Expand current workspace (+ running) by default; user toggles persist for the session. */
    protected seedSessionsSidebarAccordionDefaults(projects: MobileProjectEntry[]): void {
        this.sessionsSidebarUi.seedSessionsSidebarAccordionDefaults(projects);
    }

    protected createSessionsSidebarProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        return this.sessionsSidebarUi.createSessionsSidebarProjectGroup(project, conversations, onActivate, bypassConversationLimit);
    }

    protected createSessionsSidebarProjectRowHead(
        project: MobileProjectEntry,
        expanded: boolean,
        onToggleExpand: () => void,
    ): HTMLElement {
        return this.sessionsSidebarUi.createSessionsSidebarProjectRowHead(project, expanded, onToggleExpand);
    }

    protected createSessionsSidebarIdeOpenControl(project: MobileProjectEntry): HTMLButtonElement {
        return this.sessionsSidebarUi.createSessionsSidebarIdeOpenControl(project);
    }

    protected createSessionsSidebarIdeOpenBadge(): HTMLSpanElement {
        return this.sessionsSidebarUi.createSessionsSidebarIdeOpenBadge();
    }

    protected async onWorkHubSessionsSidebarNewChat(): Promise<void> {
        await this.sessionsSidebarUi.onWorkHubSessionsSidebarNewChat();
    }

    /** Mockup `newChat()`: misma vista vacía que Agents (idle), no una sesión paralela. */
    protected async openEmptyMobileChatSheet(project: MobileProjectEntry): Promise<void> {
        await this.sessionsSidebarUi.openEmptyMobileChatSheet(project);
    }

    protected async onWorkHubSessionsSidebarAutomations(): Promise<void> {
        await this.sessionsSidebarUi.onWorkHubSessionsSidebarAutomations();
    }

    protected onSessionsSidebarAccountClick(anchor: HTMLButtonElement): void {
        this.sessionsSidebarUi.onSessionsSidebarAccountClick(anchor);
    }

    protected async openSessionsSidebarSearch(): Promise<void> {
        await this.sessionsSidebarUi.openSessionsSidebarSearch();
    }

    protected notifyWorkspaceHubBottomBarRefresh(): void {
        this.repoLifecycleUi.notifyWorkspaceHubBottomBarRefresh();
    }

    protected async openProjectDetail(project: MobileProjectEntry): Promise<void> {
        await this.projectNavigationUi.openProjectDetail(project);
    }

    protected async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        await this.projectNavigationUi.toggleRowExpanded(project);
    }

    protected async closeCurrentWorkspace(): Promise<void> {
        await this.projectNavigationUi.closeCurrentWorkspace();
    }

    protected async openTaskInAgent(project: MobileProjectEntry, task?: MobileProjectTaskView): Promise<void> {
        await this.conversationOpenUi.openTaskInAgent(project, task);
    }

    protected async openConversationSummary(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.conversationOpenUi.openConversationSummary(project, summary);
    }

    protected async onTogglePin(project: MobileProjectEntry): Promise<void> {
        await this.repoLifecycleUi.onTogglePin(project);
    }

    protected async openAgentComposer(project: MobileProjectEntry, draft?: string): Promise<void> {
        await this.repoLifecycleUi.openAgentComposer(project, draft);
    }

    protected async ensureInlineComposerCwd(project: MobileProjectEntry): Promise<string | undefined> {
        return this.backgroundTaskUi.ensureInlineComposerCwd(project);
    }

    protected async submitBackgroundAgentTask(
        project: MobileProjectEntry,
        draft: string,
        options: {
            openConversation?: boolean;
            forceVps?: boolean;
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        } = {},
    ): Promise<void> {
        await this.backgroundTaskUi.submitBackgroundAgentTask(project, draft, options);
    }

    protected async createProjectChatSession(
        project: MobileProjectEntry,
        cwd: string,
        draft: string,
        options: {
            forceVps?: boolean;
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        return this.backgroundTaskUi.createProjectChatSession(project, cwd, draft, options);
    }

    protected shouldUseTheiaCoder(content: string, selectedAgentId?: string): boolean {
        return this.backgroundTaskUi.shouldUseTheiaCoder(content, selectedAgentId);
    }

    protected async loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot> {
        return this.backgroundTaskUi.loadBackendAgentSnapshot();
    }

    protected async selectBackendConversationAgent(
        cwd: string,
        prompt: string,
        selectedAgentId?: string,
        conversationAgentId?: string,
    ): Promise<string> {
        return this.backgroundTaskUi.selectBackendConversationAgent(cwd, prompt, selectedAgentId, conversationAgentId);
    }

    protected applyTaskStartedToProject(cwd: string, title: string, taskId: string): void {
        this.backgroundTaskUi.applyTaskStartedToProject(cwd, title, taskId);
    }

    protected ensureAgentChatSession(cwd?: string): ChatSession {
        return this.theiaChatSessionUi.ensureAgentChatSession(cwd);
    }

    protected activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']> {
        return this.conversationIndexUi.activeInfoForProject(project);
    }

    protected async cancelActiveTask(taskId: string): Promise<void> {
        await this.activeTaskActionsUi.cancelActiveTask(taskId);
    }

    protected async showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void> {
        await this.activeTaskActionsUi.showTaskLog(project, taskId);
    }

    async showOpenRepositoryDialog(): Promise<void> {
        await this.onNewClick();
    }

    async openProject(project: MobileProjectEntry): Promise<void> {
        await this.projectNavigationUi.openProject(project);
    }

    /**
     * Show the transcript of a conversation in a modal sheet docked inside the projects panel.
     * The agent is still running server-side, so this works even when no workspace is open and
     * even when the user is in a different project's workspace — that is the whole point of the
     * persistent-conversations model.
     */

    protected async submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: AIVariableResolutionRequest[];
            widget?: AIChatInputWidget;
        } = {},
    ): Promise<void> {
        return this.transcriptSubmitUi.submitTranscriptViaBackendConversation(project, summary, content, options);
    }

    protected collectAgentsHubRecentItems(
        projects: MobileProjectEntry[],
        limit?: number,
        scopeProject?: MobileProjectEntry,
    ): Array<{ project: MobileProjectEntry; summary: QaapAgentConversationSummaryDTO }> {
        return this.tasksHubUi.collectAgentsHubRecentItems(projects, limit, scopeProject);
    }

    protected shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean {
        return this.tasksHubUi.shouldEmbedAgentsHubRecentsInWorkspaceTranscript();
    }

    protected createAgentsHubQuickActionsBlock(): HTMLElement {
        return this.tasksHubUi.createAgentsHubQuickActionsBlock();
    }

    protected createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement {
        return this.tasksHubUi.createAgentsHubRecentsBlock(project);
    }

    protected updateTasksAttentionChrome(): void {
        this.tasksHubUi.updateTasksAttentionChrome();
    }

    protected appendTasksHubTeamSection(container: HTMLElement): boolean {
        return this.tasksHubUi.appendTasksHubTeamSection(container);
    }

    protected renderTasksHubView(projects: MobileProjectEntry[]): void {
        this.tasksHubUi.renderTasksHubView(projects);
    }

    protected markTasksFirstLoadComplete(render: boolean): void {
        this.tasksHubUi.markTasksFirstLoadComplete(render);
    }

    protected renderCatalogHubView(): void {
        this.hubCatalogUi.renderCatalogHubView();
    }

    protected async runCatalogAction(action: WorkHubCatalogAction): Promise<void> {
        return this.hubCatalogUi.runCatalogAction(action);
    }

    protected createEmptyState(): HTMLElement {
        return this.reposHubUi.createEmptyState();
    }

    protected createSectionLabel(text: string, withDot: boolean): HTMLElement {
        return this.reposHubUi.createSectionLabel(text, withDot);
    }

    protected resetInboxPullRequestState(): void {
        this.inboxPrUi.resetInboxPullRequestState();
    }

    protected mergeInboxPullRequests(polled: QaapGithubPullRequestSummary[]): QaapGithubPullRequestSummary[] {
        return this.inboxPrUi.mergeInboxPullRequests(polled);
    }

    protected async refreshInboxPullRequests(
        projects: MobileProjectEntry[] | undefined = undefined,
        force = false,
    ): Promise<void> {
        return this.inboxPrUi.refreshInboxPullRequests(
            projects ?? this.projectsForCurrentHubList(),
            force,
        );
    }

    protected buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement {
        return this.cardMenuUi.buildProjectOptionsMenu(project);
    }

    protected buildCardMenu(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        return this.cardMenuUi.buildCardMenu(project, activeInfo);
    }

    protected buildConversationMenu(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement {
        return this.cardMenuUi.buildConversationMenu(project, summary);
    }

    protected toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
        this.cardMenuUi.toggleCardMenu(card, menu, menuBtn);
    }

    protected closeCardMenu(): void {
        this.cardMenuUi.closeCardMenu();
    }

    protected createRow(project: MobileProjectEntry): HTMLElement {
        return this.projectRowsUi.createRow(project);
    }

    protected createTaskBlock(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        return this.projectRowsUi.createTaskBlock(project, activeInfo);
    }

    protected createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        summary?: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string> = new Set<string>(),
        options?: { onActivate?: () => void; compact?: boolean },
    ): HTMLElement {
        return this.projectRowsUi.createTaskItem(project, task, activeInfo, summary, parentIds, options);
    }

    protected detailComposerSurfaceForProject(project: MobileProjectEntry): QaapComposerSurface {
        return this.projectRowsUi.detailComposerSurfaceForProject(project);
    }

    protected createTaskLeadingGlyph(codiconClass: string): HTMLElement {
        return this.projectRowsUi.createTaskLeadingGlyph(codiconClass);
    }

    protected resolveConversationAgentLabel(summary?: QaapAgentConversationSummaryDTO): string {
        return this.projectRowsUi.resolveConversationAgentLabel(summary);
    }

    protected async refreshWorkHubRoutines(force = false): Promise<void> {
        return this.hubRoutineEditorUi.refreshWorkHubRoutines(force);
    }

    protected openRoutineEditor(routine?: QaapWorkHubRoutine): void {
        this.hubRoutineEditorUi.openRoutineEditor(routine);
    }

    protected closeRoutineEditor(): void {
        this.hubRoutineEditorUi.closeRoutineEditor();
    }

    protected renderRoutinesHubView(): void {
        this.hubRoutinesUi.renderRoutinesHubView();
    }

    protected sortRoutinesForDisplay(routines: readonly QaapWorkHubRoutine[]): QaapWorkHubRoutine[] {
        return this.hubRoutinesUi.sortRoutinesForDisplay(routines);
    }

    protected patchRoutineLocally(
        id: string,
        patch: Partial<Pick<QaapWorkHubRoutine, 'enabled' | 'lastRunState'>>,
    ): void {
        this.hubRoutinesUi.patchRoutineLocally(id, patch);
    }

    protected async toggleRoutineEnabled(routine: QaapWorkHubRoutine): Promise<void> {
        return this.hubRoutinesUi.toggleRoutineEnabled(routine);
    }

    protected async runRoutineNow(routine: QaapWorkHubRoutine): Promise<void> {
        return this.hubRoutinesUi.runRoutineNow(routine);
    }

    protected collectTeamMembersForHub(): WorkHubTeamMember[] {
        return this.hubTeamDataUi.collectTeamMembersForHub();
    }

    protected collectTeamApprovalItems(members: readonly WorkHubTeamMember[]): WorkHubApprovalItem[] {
        return this.hubTeamDataUi.collectTeamApprovalItems(members);
    }

    protected onTeamMemberClick(member: WorkHubTeamMember): void {
        this.hubTeamDataUi.onTeamMemberClick(member);
    }

    protected async onForkConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        return this.conversationActionsUi.onForkConversation(project, summary);
    }

    protected async onRenameConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        return this.conversationActionsUi.onRenameConversation(project, summary);
    }

    protected async onSetConversationPriority(
        summary: QaapAgentConversationSummaryDTO,
        priority: boolean,
    ): Promise<void> {
        return this.conversationActionsUi.onSetConversationPriority(summary, priority);
    }

    protected async onSetConversationPaused(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        paused: boolean,
    ): Promise<void> {
        return this.conversationActionsUi.onSetConversationPaused(project, summary, paused);
    }

    protected async toggleConversationAutoApproveById(conversationId: string): Promise<void> {
        return this.conversationActionsUi.toggleConversationAutoApproveById(conversationId);
    }

    protected async onSetConversationAutoApprove(
        summary: QaapAgentConversationSummaryDTO,
        autoApprove: boolean,
    ): Promise<void> {
        return this.conversationActionsUi.onSetConversationAutoApprove(summary, autoApprove);
    }

    protected async onCancelConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        return this.conversationActionsUi.onCancelConversation(project, summary);
    }

    protected async onRetryConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        return this.conversationActionsUi.onRetryConversation(project, summary);
    }

    protected async onDeleteConversation(summary: QaapAgentConversationSummaryDTO): Promise<void> {
        return this.conversationActionsUi.onDeleteConversation(summary);
    }

    protected async onRenameProject(project: MobileProjectEntry): Promise<void> {
        return this.projectActionsUi.onRenameProject(project);
    }

    protected async onDuplicateProject(project: MobileProjectEntry): Promise<void> {
        return this.projectActionsUi.onDuplicateProject(project);
    }

    protected async onClearProjectChats(project: MobileProjectEntry): Promise<void> {
        this.sessionsSidebar?.hideForMobileOverlay();
        return this.projectActionsUi.onClearProjectChats(project);
    }

    protected async onRemoveProject(project: MobileProjectEntry): Promise<void> {
        return this.projectActionsUi.onRemoveProject(project);
    }

    protected renderReviewHubView(projects: MobileProjectEntry[]): void {
        this.workHubInboxUi.renderReviewHubView(projects);
    }

    protected renderChatHubView(projects: MobileProjectEntry[]): void {
        this.workHubInboxUi.renderChatHubView(projects);
    }

    protected collectChatHubGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }> {
        return this.workHubInboxUi.collectChatHubGroups(projects);
    }

    protected collectTasksInboxGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        return this.workHubInboxUi.collectTasksInboxGroups(projects);
    }

    protected collectReviewGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        return this.workHubInboxUi.collectReviewGroups(projects);
    }

    protected compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number {
        return this.workHubInboxUi.compareChatInboxProjectOrder(a, b);
    }

    protected createInboxProjectGroup(
        project: MobileProjectEntry,
        items: MobileWorkHubInboxItem[],
    ): HTMLElement {
        return this.workHubInboxUi.createInboxProjectGroup(project, items);
    }

    protected createInboxGithubSignInHint(): HTMLElement {
        return this.workHubInboxUi.createInboxGithubSignInHint();
    }

    protected createReviewEmptyState(): HTMLElement {
        return this.workHubInboxUi.createReviewEmptyState();
    }

    protected createReviewLoadingState(): HTMLElement {
        return this.workHubInboxUi.createReviewLoadingState();
    }

    protected createChatEmptyState(): HTMLElement {
        return this.workHubInboxUi.createChatEmptyState();
    }

    protected formatTheiaChatRequestText(content: string, pinnedAgentId?: string): string {
        return this.theiaChatSessionUi.formatTheiaChatRequestText(content, pinnedAgentId);
    }

    protected async getOrRestoreProjectChatSession(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        return this.theiaChatSessionUi.getOrRestoreProjectChatSession(project, summary);
    }

    protected async forkTheiaConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        return this.theiaChatSessionUi.forkTheiaConversation(project, summary);
    }

    protected async getChatServiceConversation(summary: QaapAgentConversationSummaryDTO): Promise<QaapAgentConversationDTO | undefined> {
        return this.theiaChatSessionUi.getChatServiceConversation(summary);
    }

    protected async mountTranscriptChatInput(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
        submit: (content: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections, widget?: AIChatInputWidget) => Promise<void>,
    ): Promise<void> {
        return this.theiaChatSessionUi.mountTranscriptChatInput(project, summary, host, submit);
    }

    protected shouldUseAgentsHubLanding(): boolean {
        return this.agentsHubInlineUi.shouldUseAgentsHubLanding();
    }

    protected shouldPreserveAgentsHubInlineTranscriptShell(): boolean {
        return this.agentsHubInlineUi.shouldPreserveAgentsHubInlineTranscriptShell();
    }

    protected shouldSkipFullRenderListOnConversationTick(): boolean {
        return this.agentsHubInlineUi.shouldSkipFullRenderListOnConversationTick();
    }

    protected refreshWorkHubConversationChrome(): void {
        this.agentsHubInlineUi.refreshWorkHubConversationChrome();
    }

    protected resolveAgentsHubShellProject(): MobileProjectEntry | undefined {
        return this.agentsHubInlineUi.resolveAgentsHubShellProject();
    }

    protected resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        return this.agentsHubInlineUi.resolveAgentsHubShellSummary(project);
    }

    protected renderAgentsHubExecutionShell(): void {
        this.agentsHubInlineUi.renderAgentsHubExecutionShell();
    }

    protected renderAgentsHubIdleSubmitOptimistic(
        chatHost: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        agentId: string,
    ): void {
        this.agentsHubInlineUi.renderAgentsHubIdleSubmitOptimistic(chatHost, summary, draft, agentId);
    }

    protected teardownAgentsHubExecutionShell(): void {
        this.agentsHubInlineUi.teardownAgentsHubExecutionShell();
    }

    protected async openAgentsHubInlineTranscript(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.agentsHubInlineUi.openAgentsHubInlineTranscript(project, summary);
    }

    protected closeAgentsHubSession(): void {
        this.agentsHubInlineUi.closeAgentsHubSession();
    }

    findConversationSummaryById(id: string): QaapAgentConversationSummaryDTO | undefined {
        return this.conversations?.findSummaryById(id);
    }

    get conversationsOnDidChange(): TheiaEvent<void> {
        return this.conversations?.onDidChange ?? TheiaEvent.None;
    }

    protected syncTranscriptConversationSettledChrome(): void {
        this.transcriptLiveUi.syncTranscriptConversationSettledChrome();
    }

    protected maybeSyncTranscriptVisuallySettledChrome(conv: QaapAgentConversationDTO): void {
        this.transcriptLiveUi.maybeSyncTranscriptVisuallySettledChrome(conv);
    }

    protected isActiveTranscriptConversation(summaryId: string): boolean {
        return this.transcriptLiveUi.isActiveTranscriptConversation(summaryId);
    }

    protected resolveActiveTranscriptChatHost(): HTMLElement | undefined {
        return this.transcriptLiveUi.resolveActiveTranscriptChatHost();
    }

    protected async refreshOpenTranscriptConversation(
        options?: QaapTranscriptLiveRefreshOptions,
    ): Promise<void> {
        await this.transcriptLiveUi.refreshOpenTranscriptConversation(options);
    }

    protected isWatchingOpenTranscript(conversationId: string): boolean {
        return this.transcriptLiveUi.isWatchingOpenTranscript(conversationId);
    }

    protected isAutoVerifyEnabled(cwd: string | undefined): boolean {
        return this.transcriptVerifyUi.isAutoVerifyEnabled(cwd);
    }

    protected setAutoVerifyEnabled(cwd: string | undefined, on: boolean): void {
        this.transcriptVerifyUi.setAutoVerifyEnabled(cwd, on);
    }

    protected refreshTranscriptChecksViews(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        this.transcriptVerifyUi.refreshTranscriptChecksViews(project, summary);
    }

    protected renderChecksSection(
        host: HTMLElement | undefined,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        options: { readonly embedded?: boolean } = {},
    ): void {
        this.transcriptVerifyUi.renderChecksSection(host, project, summary, options);
    }

    protected handleTranscriptStatusForAutoVerify(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        status: QaapAgentConversationSummaryDTO['status'],
    ): void {
        this.transcriptVerifyUi.handleTranscriptStatusForAutoVerify(project, summary, status);
    }

    protected ensureOverlayUi(): {
        parallel: MobileProjectsParallelUi;
        team: MobileProjectsTeamUi;
        teamHub: MobileProjectsTeamHubUi;
        home: MobileProjectsHomeUi;
    } {
        return this.overlayFactoryUi.ensureOverlayUi();
    }

    protected attachTranscriptChatViewWidget(
        widget: MobileProjectChatViewWidget,
        chatHost: HTMLElement,
        session: ChatSession,
    ): boolean {
        return this.theiaChatSessionUi.attachTranscriptChatViewWidget(widget, chatHost, session);
    }

    protected chatAgentForBackendId(agentId: string | undefined): ChatAgent | undefined {
        return this.theiaChatSessionUi.chatAgentForBackendId(agentId);
    }

    protected resolvePinnedAgentForCwd(cwd: string | undefined): ChatAgent | undefined {
        return this.theiaChatSessionUi.resolvePinnedAgentForCwd(cwd);
    }

    protected renderTranscriptInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.transcriptLiveUi.renderTranscriptInlineApproval(host, conv);
    }

    protected dismissPanelIfSheet(): void {
        this.panelLifecycleUi.dismissPanelIfSheet();
    }
}
