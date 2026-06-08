// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';
import type { QuickPick } from '@theia/core/lib/common/quick-pick-service';
import { ConfirmDialog, QuickInputService, QuickPickItem, QuickPickSeparator, UnsafeWidgetUtilities } from '@theia/core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { AIVariable, AIVariableResolutionRequest, GenericCapabilitySelections } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent, ChatAgentLocation, ChatMode, ChatModel, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { MobileProjectChatViewWidget } from './mobile-project-ai-chat-input-widget';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import {
    MobileProjectEntry,
    MobileProjectFilter,
    MobileProjectsHubView,
    mobileProjectInitials,
} from './mobile-projects-types';
import { MobileProjectsActiveTasks, MobileProjectTaskView, cwdMatchesProject } from './mobile-projects-active-tasks';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsParallelUi } from './mobile-projects-parallel-ui';
import { MobileProjectsTeamUi } from './mobile-projects-team-ui';
import { MobileProjectsTeamHubUi, type WorkHubApprovalItem } from './mobile-projects-team-hub-ui';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import {
    collectAgentMembers,
    countRunningTeamMembers,
    filterTeamMembersForDisplay,
    type WorkHubTeamMember,
} from '../common/qaap-work-hub-team';
import { MobileProjectsHomeUi, type WorkHubHomeNavigateTarget, type WorkHubHomeQuickActionId } from './mobile-projects-home-ui';
import { MobileProjectsService } from './mobile-projects-service';
import {
    conversationTurnProgressRatio,
} from '../common/qaap-agent-conversation-list-metrics';
import {
    TranscriptFollowUpQueue,
    type TranscriptFollowUpEntry,
} from '../common/qaap-transcript-follow-up-queue';
import {
    resolveTranscriptEffectiveStatus,
} from '../common/qaap-transcript-turn-status';
import {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    QaapAgentMessageDTO,
    QaapAgentMessageSegmentDTO,
    cancelConversation,
    conversationToSummary,
    isConversationAutoApproveEnabled,
    createConversation,
    deleteConversation,
    forkConversation,
    renameConversation,
    retryConversation,
    updateConversation,
} from '../common/qaap-agent-conversation-client';
import {
    approveAgentRequest,
    fetchAgentApprovals,
    rejectAgentRequest,
    type QaapAgentApprovalRequestDTO,
} from '../common/qaap-agent-approval-client';
import {
    markMobileProjectReadmeForOpen,
    hasMobileProjectsLeftLanding,
    markMobileProjectsPanelDismiss,
    QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT,
    setMobileLandingHubListChrome,
    setMobileWorkHubComposerHeaderChrome,
} from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    extractBackendAgentMention,
    fetchAgentTaskListAll,
    isTheiaCoderAgent,
    isTheiaCoderMention,
    migrateLegacyBackendAgentId,
    agentSupportsModelPicker,
    agentUsesSettingsModelCatalog,
    fetchAgentModelsForAgent,
    filterQaapComposerAgents,
    filterUiSelectableVpsAgents,
    QAAP_PRIMARY_AGENT_ID,
    isSameAgentModel,
    readStoredAgent,
    readStoredAgentModel,
    resolveStoredAgentModelForSubmit,
    isStickyComposerAgentSelected,
    reconcileStickyComposerAgent,
    resolveBackendAgentForTurn,
    resolveExplicitAgentForSubmit,
    QAIQ_AGENT_ID,
    SHELL_AGENT_ID,
    THEIA_CODER_AGENT_ID,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
    type QaapQaiqModelOption,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import {
    applyBackendInteractionModeToPrompt,
    describeComposerInteractionMode,
    reconcileComposerModeId,
    resolveComposerModeLabel,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    agentSupportsApprovalPolicy,
    QAAP_AGENT_APPROVAL_POLICIES,
    reconcileAgentApprovalPolicyId,
    resolveComposerAutoApprove,
    resolveAgentApprovalPolicyOption,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    attachStickyComposerMentionUi,
    buildStickyComposerMentionOptions,
    buildStickyComposerVariableOptions,
    type StickyComposerTokenOption,
} from '../common/qaap-sticky-composer-mention';
import {
    createAgentPickerField,
    createAgentSheetOptionButton,
    createAgentTaskBadge,
    createApprovalPolicySheetOptionButton,
    createToolApprovalRuleToggle,
    createPickerSheetOptionButton,
    populateAgentToolbarButton,
    populateApprovalPolicyToolbarButton,
} from './qaap-agent-ui';
import {
    renderStickyComposerContextStrip,
    resolveStickyComposerContextChip,
    resolveStickyComposerContextEntry,
    type StickyComposerContextChipView,
} from './qaap-sticky-composer-context-ui';
import {
    composerContextRequests,
    createComposerContextEntry,
    disposeComposerContextEntries,
    hasPendingComposerContextEntries,
    revokeComposerContextPreview,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
import {
    createStickyComposerWorkspacePill,
    renderStickyComposerWorkspaceBar,
    type StickyComposerWorkspaceBarView,
} from './qaap-sticky-composer-workspace-bar';
import {
    bindContextUsageIndicator,
    createContextUsageIndicatorBadge,
    isContextUsageIndicatorEnabled,
    resolveContextUsageIndicatorState,
    resolveContextUsageWarningThreshold,
    resolveContextUsageWarningThresholdPercentage,
    resolveVpsContextUsageIndicatorState,
} from './qaap-chat-context-usage-indicator';
import { createFormFieldLabel, createSegmentedField, type QaapSegmentedFieldController } from './qaap-mobile-form-ui';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';
import { renderQaapAccountAvatarVisual } from './qaap-account-avatar-visual';
import {
    buildQaapAccountMenuEntries,
    dismissQaapAccountMenu,
    toggleQaapAccountMenu,
} from './qaap-workbench-account-menu';
import {
    fetchQaapAuthConfig,
    fetchQaapAuthSession,
    fetchQaapGithubPullRequests,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { clearQaapAuthSession, readQaapAuthUser, readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import {
    type EmbeddedAgentPreviewChrome,
} from '@theia/qaap-adapters/lib/browser/qaap-agent-preview-chrome';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import type { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import type { QaapPreviewInspectorDeps } from '@theia/qaap-adapters/lib/browser/qaap-preview-inline-inspector';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    type ExecutionSurfaceTabId,
} from '../common/qaap-execution-surface-tabs';
import { scrollElementTo } from '../common/qaap-prefers-reduced-motion';
import {
    buildConversationTranscriptFingerprint,
} from '../common/qaap-transcript-incremental-update';
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
import { MobileProjectsAgentsHubInlineUi, type MobileProjectsAgentsHubInlineHost } from './mobile-projects-agents-hub-inline-ui';
import { MobileProjectsTranscriptLiveUi, type MobileProjectsTranscriptLiveHost } from './mobile-projects-transcript-live-ui';
import { MobileProjectsTranscriptMessagesUi, type MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
import {
    type QaapTranscriptLiveRefreshOptions,
} from './qaap-transcript-live-controller';
import {
    filterVpsTaskSummaries,
    isLocalChatSummary,
    normalizeWorkHubViewId,
} from '../common/qaap-work-hub-surfaces';
import {
    QAAP_AGENTS_HUB_LANDING_ENABLED,
} from '../common/qaap-agents-hub-landing';
import { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import {
    buildWorkHubHomeGreeting,
    buildWorkHubHomeRecentItems,
    formatWorkHubRelativeTime,
    selectWorkHubHomePinnedProjectIds,
    type WorkHubHomeAttentionItem,
    type WorkHubHomeRecentItem,
    type WorkHubHomeRecentSource,
    type WorkHubHomeSnapshot,
} from '../common/qaap-work-hub-home';
import { buildWorkHubHomeUsageSummary } from '../common/qaap-work-hub-usage-summary';
import {
    readStoredComposerSurface,
    writeStoredComposerSurface,
    type QaapComposerSurface,
} from '../common/qaap-composer-surface';
import { resolveQaapAgentTaskVisualStatus } from '../common/qaap-agent-task-visual-status';
import {
    filterCatalogSections,
    QAAP_WORK_HUB_AI_CONFIGURATION_AGENTS_TAB,
    QAAP_WORK_HUB_AI_CONFIGURATION_COMMAND,
    QAAP_WORK_HUB_AI_FEATURES_COMMAND,
    QAAP_WORK_HUB_GETTING_STARTED,
    QAAP_WORK_HUB_WORKFLOWS,
    countCatalogItems,
    type WorkHubCatalogAction,
} from '../common/mobile-work-hub-catalog';
import {
    createWorkHubRoutine,
    deleteWorkHubRoutine,
    fetchWorkHubRoutines,
    updateWorkHubRoutine,
} from '../common/qaap-work-hub-routine-client';
import {
    filterRoutinesByQuery,
    routineScheduleLabel,
    type QaapWorkHubRoutine,
    type QaapWorkHubRoutineRunMode,
    type QaapWorkHubRoutineTrigger,
} from '../common/qaap-work-hub-routine';
import { QAAP_ROUTINE_CRON_PRESETS } from '../common/qaap-work-hub-cron';
import {
    githubRepoKeysForProjects,
    pullRequestKey,
    type MobileWorkHubInboxItem,
} from './mobile-work-hub-inbox';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitBranchesResponse,
    type QaapGitChangedFile,
    type QaapGitHistoryCommit,
} from '../common/qaap-git-review';
import {
    QaapDiffReviewWidget,
    type QaapDiffReviewRepositoryContext,
} from './qaap-diff-review-widget';
import type { TranscriptFilesViewServices } from './qaap-transcript-files-view';
import type { TranscriptTerminalSurface, TranscriptTerminalViewServices } from './qaap-transcript-terminal-view';
import {
    TranscriptWorkspaceSurfacesCache,
    type TranscriptWorkspaceSurfaceKey,
} from './qaap-transcript-workspace-surfaces-cache';
import {
    formatQaiqModelProviderLabel,
    groupQaiqModelsByProvider,
    listQaiqModelsFromPreferences,
} from '../common/qaap-qaiq-model-catalog';

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

type ComposerAgentPickerView = 'agents' | 'models';

interface ComposerAgentPickerChrome {
    readonly sheet: HTMLElement;
    readonly header: HTMLElement;
    readonly title: HTMLElement;
    readonly backBtn: HTMLButtonElement;
    readonly list: HTMLElement;
}

export class MobileProjectsPanel {

    /** Max conversation rows per repo card before "More" expands the list. */
    protected static readonly CONVERSATIONS_COLLAPSED_LIMIT = 6;

    /** Initial session rows per project in the sessions sidebar before "Mostrar más". */
    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT = 5;

    /** Extra session rows revealed each time the user taps "Mostrar más" in the sidebar. */
    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE = 15;

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
    protected static readonly INBOX_PR_FETCH_TIMEOUT_MS = 20_000;
    protected workHubRoutines: QaapWorkHubRoutine[] = [];
    protected workHubRoutinesLoading = false;
    protected workHubRoutinesLoaded = false;
    protected workHubRoutinesDefaultAgent: string | undefined;
    protected routineSheet: HTMLElement | undefined;
    protected editingRoutineId: string | undefined;
    protected routinesRefreshTimer: number | undefined;
    protected routineInteractionLock = false;
    protected readonly chatServiceSessionSummariesByProjectId = new Map<string, QaapAgentConversationSummaryDTO[]>();
    protected openMenu: HTMLElement | undefined;
    protected openMenuAnchor: HTMLElement | undefined;
    protected openMenuCard: HTMLElement | undefined;
    protected openMenuRepositionDispose: Disposable = Disposable.NULL;
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
        if (!this.openMenu) {
            return;
        }
        const target = ev.target;
        if (target instanceof Node && this.openMenu.contains(target)) {
            return;
        }
        this.closeCardMenu();
    };

    protected readonly onScrollWhileMenuOpen = (): void => {
        if (this.openMenu && this.openMenuAnchor) {
            this.positionCardMenu(this.openMenu, this.openMenuAnchor);
        }
    };

    protected readonly onWindowResizeWhileMenuOpen = (): void => {
        this.onScrollWhileMenuOpen();
    };

    protected readonly onAuthSessionChanged = (): void => {
        this.updateAccountAvatar();
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

        const grabber = createMobileSheetGrabber();

        const header = document.createElement('header');
        header.className = 'theia-mobile-projects-header';

        const headerMainRow = document.createElement('div');
        headerMainRow.className = 'theia-mobile-projects-header-main';

        this.titleBlock = document.createElement('div');
        this.titleBlock.className = 'theia-mobile-projects-title-block';
        this.titleRow = document.createElement('div');
        this.titleRow.className = 'theia-mobile-projects-title-row';
        this.headerBackBtn = document.createElement('button');
        this.headerBackBtn.type = 'button';
        this.headerBackBtn.className = 'theia-mobile-projects-header-back';
        this.headerBackBtn.hidden = true;
        this.headerBackBtn.setAttribute('aria-hidden', 'true');
        this.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
        this.headerBackBtn.setAttribute('aria-label', this.headerBackBtn.title);
        this.headerBackBtn.innerHTML = '<span class="codicon codicon-chevron-left" aria-hidden="true"></span>';
        this.headerBackBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            if (this.agentsHubInlineActive && this.shouldUseAgentsHubLanding()) {
                this.closeAgentsHubSession();
                return;
            }
            if (this.agentsHubInlineActive) {
                this.closeTranscriptSheet();
                return;
            }
            if (this.isSidebarSecondaryHubView()) {
                this.navigateBackFromSidebarSecondaryHub();
                return;
            }
            if (this.isProjectDiffView()) {
                this.closeProjectDiffView();
                return;
            }
            const project = this.resolveSelectedProject();
            if (project && this.navigateExecutionSurfaceBack(project)) {
                return;
            }
            this.closeProjectDetail();
        });
        this.sessionsMenuBtn = document.createElement('button');
        this.sessionsMenuBtn.type = 'button';
        this.sessionsMenuBtn.className = 'theia-mobile-projects-sessions-menu theia-mobile-projects-header-back';
        this.sessionsMenuBtn.hidden = true;
        this.sessionsMenuBtn.setAttribute('aria-hidden', 'true');
        this.sessionsMenuBtn.title = nls.localize('qaap/sessionsSidebar/open', 'Open session history');
        this.sessionsMenuBtn.setAttribute('aria-label', this.sessionsMenuBtn.title);
        this.sessionsMenuBtn.innerHTML = '<span class="codicon codicon-menu" aria-hidden="true"></span>';
        this.sessionsMenuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.openWorkHubSessionsSidebar();
        });
        this.titleEl = document.createElement('h1');
        this.titleEl.className = 'theia-mobile-projects-title';
        this.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.titleAttentionEl = document.createElement('span');
        this.titleAttentionEl.className = 'theia-mobile-projects-title-attention';
        this.titleAttentionEl.hidden = true;
        this.titleAttentionEl.setAttribute('aria-hidden', 'true');
        this.headerExecutionTabsHost = document.createElement('div');
        this.headerExecutionTabsHost.className = 'theia-mobile-projects-header-execution-tabs';
        this.headerExecutionTabsHost.hidden = true;
        this.subtitleEl = document.createElement('div');
        this.subtitleEl.className = this.homeMode ? 'theia-mobile-projects-subtitle' : 'theia-mobile-projects-meta';
        this.titleRow.append(this.sessionsMenuBtn, this.headerBackBtn, this.titleEl, this.titleAttentionEl);
        this.titleBlock.append(this.titleRow, this.subtitleEl);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-projects-header-actions';

        this.accountBtn = document.createElement('button');
        this.accountBtn.type = 'button';
        this.accountBtn.className = 'theia-workbench-nav-btn theia-workbench-account-btn';
        this.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
        this.accountBtn.setAttribute('aria-haspopup', 'menu');
        this.accountAvatar = document.createElement('span');
        this.accountAvatar.className = 'theia-workbench-account-avatar';
        this.accountAvatar.setAttribute('aria-hidden', 'true');
        this.accountBtn.appendChild(this.accountAvatar);
        this.accountBtn.addEventListener('click', this.onAccountClick);
        this.headerSurfacePickerHost = document.createElement('div');
        this.headerSurfacePickerHost.className = 'theia-mobile-projects-header-surface-picker';
        this.headerSurfacePickerHost.hidden = true;

        this.searchToggleBtn = document.createElement('button');
        this.searchToggleBtn.type = 'button';
        this.searchToggleBtn.className = 'theia-workbench-nav-btn theia-mobile-projects-search-toggle';
        this.searchToggleBtn.title = nls.localize('qaap/mobileProjects/searchToggle', 'Search');
        this.searchToggleBtn.setAttribute('aria-label', this.searchToggleBtn.title);
        this.searchToggleBtn.innerHTML = '<span class="codicon codicon-search" aria-hidden="true"></span>';
        this.searchToggleBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.openWorkHubSearchQuickPick();
        });

        actions.append(this.headerSurfacePickerHost, this.searchToggleBtn, this.accountBtn);
        headerMainRow.append(this.titleBlock, this.headerExecutionTabsHost, actions);
        header.append(headerMainRow);

        this.filtersHost = document.createElement('div');
        this.filtersHost.className = 'theia-mobile-projects-filters-host';
        this.filtersHost.hidden = true;

        this.scroll = document.createElement('div');
        this.scroll.className = 'theia-mobile-projects-scroll';

        this.diffProjectTabsHost = document.createElement('div');
        this.diffProjectTabsHost.className = 'theia-mobile-projects-diff-tabs';
        this.diffProjectTabsHost.hidden = true;
        this.diffWidgetHost = document.createElement('div');
        this.diffWidgetHost.className = 'theia-mobile-projects-diff-widget-host';
        this.diffWidgetHost.hidden = true;

        this.stickyComposerHost = document.createElement('div');
        this.stickyComposerHost.className = 'theia-mobile-projects-sticky-composer';
        this.stickyComposerHost.hidden = true;

        this.newFabBtn = document.createElement('button');
        this.newFabBtn.type = 'button';
        this.newFabBtn.className = 'theia-mobile-projects-fab';
        this.newFabBtn.title = nls.localize('qaap/mobileProjects/new', 'New');
        this.newFabBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/new', 'New'));
        this.newFabBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        this.newFabBtn.hidden = true;
        this.newFabBtn.addEventListener('click', () => { void this.onNewClick(); });

        this.root.append(
            grabber,
            header,
            this.filtersHost,
            this.scroll,
            this.stickyComposerHost,
            this.newFabBtn,
        );

        if (typeof ResizeObserver !== 'undefined') {
            this.stickyComposerFabLiftObserver = new ResizeObserver(() => {
                if (!this.stickyComposerHost.hidden) {
                    this.updateStickyComposerFabLift();
                }
            });
            this.stickyComposerFabLiftObserver.observe(this.stickyComposerHost);
        }

        this.titleBlock.addEventListener('click', () => this.onTitleTap());
        window.addEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.updateAccountAvatar();

        if (!this.homeMode) {
            this.dragDismissDispose = installMobileSheetDragDismiss({
                target: this.root,
                grip: grabber,
                onDismiss: () => {
                    this.hide();
                    this.delegate.onDismiss();
                },
            });
        }

        this.pullToRefreshDispose = installMobilePullToRefresh({
            scroller: this.scroll,
            host: this.root,
            onRefresh: async () => {
                if (this.hubView === 'review') {
                    await this.refreshInboxPullRequests(undefined, true);
                }
                await this.refreshProjects();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/refreshed', 'Work Hub refreshed'),
                    { kind: 'success', duration: 1400 }
                );
            },
        });
    }

    protected onTitleTap(): void {
        const now = Date.now();
        if (now - this.lastTitleTap < 320) {
            scrollElementTo(this.scroll, 0, 'smooth');
            this.lastTitleTap = 0;
        } else {
            this.lastTitleTap = now;
        }
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
        void surface;
        writeStoredComposerSurface(projectCwd, 'task');
        this.stickyComposerSurface = 'task';
        if (this.visible && this.hubView === 'repos') {
            this.renderStickyComposer();
        }
    }

    protected pinStickyComposerToQaiq(cwd: string | undefined): void {
        this.stickyComposerPinnedAgentId = QAAP_PRIMARY_AGENT_ID;
        writeStoredAgent(cwd, QAAP_PRIMARY_AGENT_ID);
    }

    /**
     * The local Theia Coder agent runs in the browser tab and stops when the mobile app is closed,
     * so it is not agentic. It is no longer offered or defaulted to in the mobile agent pickers —
     * only VPS-backed agents (QAIQ, Codex, …) are selectable. Returns `undefined` so every
     * offer/default site falls back to a real background agent.
     */
    protected getOfferableCoderAgent(): ChatAgent | undefined {
        return undefined;
    }

    /** Work Hub home: user drilled into a single repository (tasks list + sticky composer). */
    isProjectDetailView(): boolean {
        return this.homeMode && this.hubView === 'repos' && this.expandedId !== undefined;
    }

    /** Diff review opened from the active workspace (sheet), not the cross-project Work Hub tab. */
    isProjectDiffView(): boolean {
        return this.hubView === 'diff' && this.diffScopedToProject;
    }

    /** Leave the per-project tasks surface and return to the repository list. */
    closeProjectDetail(): void {
        if (!this.expandedId) {
            return;
        }
        const wasCurrent = this.projects.some(p => p.id === this.expandedId && p.isCurrent);
        this.expandedId = undefined;
        this.soloExpanded = false;
        if (wasCurrent) {
            this.suppressCurrentAutoExpand = true;
        }
        this.closeStickyComposerSheets();
        disposeComposerContextEntries(this.stickyComposerContext);
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        this.resetProjectDetailSurfaces();
        this.render();
        this.syncLandingHubListChrome();
        this.delegate.onProjectsChanged?.();
    }

    protected resetProjectDetailSurfaces(): void {
        this.closeExecutionTabOverflowMenu();
        this.projectDetailExpandedId = undefined;
        this.projectDetailTabStrip = undefined;
        this.projectDetailSurfaceTargets = undefined;
        this.headerExecutionTabsProjectId = undefined;
        this.headerExecutionTabsHost.hidden = true;
        this.headerExecutionTabsHost.replaceChildren();
    }


    protected readonly executionSurfaceTabsUi = new MobileProjectsExecutionSurfaceTabsUi(this as unknown as MobileProjectsExecutionSurfaceTabsHost);

    protected executionSurfaceTabForProject(project: MobileProjectEntry): TranscriptTab {
        return this.executionSurfaceTabsUi.executionSurfaceTabForProject(project);
    }

    protected setExecutionSurfaceTab(project: MobileProjectEntry, tab: TranscriptTab): void {
        this.executionSurfaceTabsUi.setExecutionSurfaceTab(project, tab);
    }

    protected syncExecutionSurfaceChrome(project: MobileProjectEntry): void {
        this.executionSurfaceTabsUi.syncExecutionSurfaceChrome(project);
    }

    protected mountTranscriptExecutionHeader(
        header: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        titleText: string,
    ): { back: HTMLButtonElement; tabStrip: HTMLElement } {
        return this.executionSurfaceTabsUi.mountTranscriptExecutionHeader(header, project, summary, titleText);
    }

    protected selectTranscriptTab(tab: TranscriptTab, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        this.executionSurfaceTabsUi.selectTranscriptTab(tab, project, summary);
    }

    protected activateExecutionSurfaceTab(
        tab: TranscriptTab,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        origin: 'transcript' | 'project-detail',
    ): void {
        this.executionSurfaceTabsUi.activateExecutionSurfaceTab(tab, project, summary, origin);
    }

    protected showOnlyExecutionSurfaceTab(tab: TranscriptTab): void {
        this.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab(tab);
    }

    protected syncHeaderExecutionTabStrip(): void {
        this.executionSurfaceTabsUi.syncHeaderExecutionTabStrip();
    }

    protected navigateExecutionSurfaceBack(project: MobileProjectEntry): boolean {
        return this.executionSurfaceTabsUi.navigateExecutionSurfaceBack(project);
    }

    protected closeExecutionTabOverflowMenu(): void {
        this.executionSurfaceTabsUi.closeExecutionTabOverflowMenu();
    }

    protected buildTranscriptTabStrip(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): HTMLElement {
        return this.executionSurfaceTabsUi.buildTranscriptTabStrip(project, summary);
    }

    protected mountTranscriptSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        this.executionSurfaceTabsUi.mountTranscriptSurfaceTab(project, summary, tab);
    }

    protected refreshExecutionSurfaceTabStripState(strip: HTMLElement, activeTab: TranscriptTab): void {
        this.executionSurfaceTabsUi.refreshExecutionSurfaceTabStripState(strip, activeTab);
    }

    appendTranscriptHeaderActions(header: HTMLElement, title: HTMLElement): HTMLButtonElement {
        return this.ensureOverlayUi().parallel.appendTranscriptHeaderActions(header, title);
    }

    /**
     * Shared execution header for VPS and Theia-chat transcript sheets: back · title/subtitle · tabs.
     */


    protected readonly transcriptSheetUi = new MobileProjectsTranscriptSheetUi(this as unknown as MobileProjectsTranscriptSheetHost);

    onEnterActiveTranscript(): void {
        this.delegate.onEnterActiveTranscript?.();
    }

    onExitActiveTranscript(): void {
        this.delegate.onExitActiveTranscript?.();
    }

    closeParallelSheet(): void {
        this.ensureOverlayUi().parallel.closeSheet();
    }

    protected createTranscriptSheetSurfaceHosts(): {
        planHost: HTMLElement;
        reviewHost: HTMLElement;
        previewHost: HTMLElement;
        filesHost: HTMLElement;
        terminalHost: HTMLElement;
    } {
        return this.transcriptSheetUi.createTranscriptSheetSurfaceHosts();
    }

    protected async openTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptSheetUi.openTranscriptSheet(project, summary);
    }

    protected bindTranscriptSheetDismiss(back: HTMLButtonElement, backdrop: HTMLElement): void {
        this.transcriptSheetUi.bindTranscriptSheetDismiss(back, backdrop);
    }

    protected summaryToTranscriptPlaceholder(summary: QaapAgentConversationSummaryDTO): QaapAgentConversationDTO {
        return this.transcriptSheetUi.summaryToTranscriptPlaceholder(summary);
    }

    protected closeTranscriptSheet(): void {
        this.transcriptSheetUi.closeTranscriptSheet();
    }


    protected resolveExecutionSurfaceProject(): MobileProjectEntry | undefined {
        const projectId = this.projectDetailExpandedId ?? this.expandedId;
        if (!projectId) {
            return undefined;
        }
        return this.projects.find(p => p.id === projectId)
            ?? this.projectsForCurrentHubList().find(p => p.id === projectId);
    }

    protected activeExecutionTab(project?: MobileProjectEntry): TranscriptTab {
        const resolved = project ?? this.resolveExecutionSurfaceProject();
        return resolved ? this.executionSurfaceTabForProject(resolved) : 'messages';
    }

    protected redirectHubView(view: MobileProjectsHubView): MobileProjectsHubView {
        return normalizeWorkHubViewId(view) as MobileProjectsHubView;
    }

    /** Work Hub landing: repos list, chat, tasks, or diff review (collapses any expanded repo row). */
    selectHubLandingView(
        view: MobileProjectsHubView,
        preferredDiffProjectId?: string,
        options?: { force?: boolean },
    ): void {
        this.closeTranscriptSheet();
        if (view === 'chat' || view === 'tasks') {
            // Chat surface removed — both legacy entry points land on the agentic Task surface.
            this.tasksHubSurface = 'task';
        }
        if (view === 'tasks') {
            this.agentsHubLegacyInbox = false;
        }
        view = this.redirectHubView(view);
        const force = options?.force === true;
        if (!force && this.hubView === view && view === 'home') {
            this.refreshHomeHubData(true);
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'repos' && this.expandedId === undefined) {
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'diff' && !preferredDiffProjectId) {
            void this.refreshDiffHubView();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'chat') {
            this.scheduleChatHubListRefreshAfterSummaries();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'tasks') {
            this.conversations?.start();
            this.activeTasks?.start();
            this.refreshTasksHubApprovals(false);
            this.render();
            this.syncLandingHubListChrome();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'review') {
            this.conversations?.start();
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, true);
            this.render();
            this.syncLandingHubListChrome();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'workflows') {
            this.render();
            this.syncLandingHubListChrome();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        if (!force && this.hubView === view && view === 'routines') {
            void this.refreshWorkHubRoutines(true);
            this.syncLandingHubListChrome();
            this.delegate.onHubLandingViewChanged?.();
            return;
        }
        this.hubView = view;
        if (view !== 'home') {
            this.projectsService.setHubView(view);
        }
        this.expandedId = undefined;
        this.soloExpanded = false;
        if (view === 'home') {
            this.refreshHomeHubData(true);
        }
        if (view === 'routines') {
            void this.refreshWorkHubRoutines(true);
        }
        if (view === 'chat') {
            this.scheduleChatHubListRefreshAfterSummaries();
        }
        if (view === 'review') {
            this.inboxLoadGeneration++;
            this.inboxPullRequestsLoaded = false;
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            this.conversations?.start();
            void this.refreshInboxPullRequests(undefined, true);
        }
        if (view === 'tasks') {
            this.activeTasks?.start();
            this.conversations?.start();
            this.refreshTasksHubApprovals(true);
        }
        if (view === 'diff') {
            this.diffPendingPreferredProjectId = preferredDiffProjectId;
        } else {
            this.diffScopedToProject = false;
            this.diffReturnProjectId = undefined;
        }
        this.render();
        this.syncLandingHubListChrome();
        this.scroll.scrollTop = 0;
        this.delegate.onHubLandingViewChanged?.();
        if (view === 'diff') {
            void this.refreshDiffHubView();
        } else {
            this.detachDiffReviewWidget();
        }
    }

    /** Bottom-bar hub tabs: switch landing view without reloading from persisted hub state. */
    navigateHubTab(view: MobileProjectsHubView): void {
        if (view === 'tasks') {
            this.agentsHubLegacyInbox = false;
            this.tasksHubSurface = 'task';
        }
        this.selectHubLandingView(view, undefined, { force: true });
    }

    /** Open the cross-project diff surface inside Work Hub (commands, notifications, deep links). */
    async openDiffView(preferredProjectId?: string): Promise<void> {
        if (!this.visible) {
            await this.show();
        }
        this.diffScopedToProject = false;
        this.diffReturnProjectId = undefined;
        this.selectHubLandingView('diff', preferredProjectId);
    }

    /** Open working-changes review for the active (or preferred) project inside the projects sheet. */
    async openProjectDiffView(preferredProjectId?: string): Promise<void> {
        if (!this.visible) {
            await this.show();
        }
        const projectId = preferredProjectId
            ?? this.projects.find(p => p.isCurrent)?.id;
        this.diffScopedToProject = true;
        this.diffReturnProjectId = projectId;
        this.selectHubLandingView('diff', projectId);
    }

    /** Leave scoped diff and return to the expanded project task list (or collapse the sheet list). */
    closeProjectDiffView(): void {
        if (!this.isProjectDiffView()) {
            return;
        }
        this.diffScopedToProject = false;
        this.hubView = 'repos';
        this.projectsService.setHubView('repos');
        this.diffPendingPreferredProjectId = undefined;
        this.diffProjectTabs = [];
        this.diffActiveProjectId = undefined;
        if (this.diffReturnProjectId) {
            this.expandedId = this.diffReturnProjectId;
            this.soloExpanded = true;
        }
        this.diffReturnProjectId = undefined;
        this.detachDiffReviewWidget();
        this.render();
        this.syncLandingHubListChrome();
        this.delegate.onProjectsChanged?.();
    }

    protected updateAccountAvatar(): void {
        renderQaapAccountAvatarVisual(this.accountAvatar, { titleTarget: this.accountBtn });
    }

    dispose(): void {
        dismissQaapAccountMenu();
        window.clearTimeout(this.routinesRefreshTimer);
        window.clearTimeout(this.tasksFirstLoadFallback);
        this.closeRoutineEditor();
        window.removeEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.accountBtn.removeEventListener('click', this.onAccountClick);
        this.closeCardMenu();
        this.closeStickyComposerSheets();
        this.closeTranscriptComposerSheets();
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.inboxStreamDispose.dispose();
        this.inboxStreamDispose = Disposable.NULL;
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.closeTranscriptSheet();
        if (this.sessionsSidebar) {
            this.sessionsSidebar.hide();
            this.sessionsSidebar.node.remove();
            this.sessionsSidebar = undefined;
        }
        this.disposeTranscriptTerminalSlides();
        this.transcriptWorkspaceSurfaces.disposeAll();
        this.stickyComposerFabLiftObserver?.disconnect();
        this.stickyComposerFabLiftObserver = undefined;
        this.detachDiffReviewWidget();
        setMobileLandingHubListChrome(false);
        setMobileWorkHubComposerHeaderChrome(false);
    }

    async show(options?: { preferredHubView?: MobileProjectsHubView }): Promise<void> {
        this.projects = await this.projectsService.loadProjects();
        await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
        await this.refreshChatServiceSessionSummaries();
        this.filter = this.projectsService.getFilter();
        // Chat surface removed — the hub always opens on the agentic Task surface.
        this.tasksHubSurface = 'task';
        if (options?.preferredHubView !== undefined) {
            this.hubView = this.redirectHubView(options.preferredHubView);
            this.projectsService.setHubView(this.hubView);
        } else if (!this.visible) {
            const storedHubView = this.projectsService.getHubView();
            if (this.homeMode && !hasMobileProjectsLeftLanding()) {
                // Agents empty-chat is the default shell; overview (`home`) opens from sidebar Settings.
                this.hubView = storedHubView === 'home' ? 'tasks' : this.redirectHubView(storedHubView);
                this.projectsService.setHubView(this.hubView);
            } else {
                this.hubView = this.redirectHubView(storedHubView);
            }
        }
        this.render();
        if (this.hubView === 'diff') {
            void this.refreshDiffHubView();
        }
        if (this.hubView === 'tasks') {
            this.conversations?.start();
            this.activeTasks?.start();
            this.refreshTasksHubApprovals(false);
        }
        if (this.hubView === 'review') {
            this.conversations?.start();
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, true);
        }
        if (this.hubView === 'home') {
            this.refreshHomeHubData(false);
        }
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.updateAccountAvatar();
        this.subscribeToActiveTasks();
        this.syncLandingHubListChrome();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.closeCardMenu();
        dismissQaapAccountMenu();
        this.closeWorkHubSearchQuickPick();
        this.openRepoDialog?.hide();
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.inboxStreamDispose.dispose();
        this.inboxStreamDispose = Disposable.NULL;
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.closeTranscriptSheet();
        this.visible = false;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.classList.remove('theia-mod-visible');
        this.syncLandingHubListChrome();
        setMobileWorkHubComposerHeaderChrome(false);
    }

    /**
     * Re-render the list when a VPS task starts or finishes in any project. We reload from the
     * service (cheap — it's an in-memory overlay) rather than mutating state in place, so
     * heuristics and SSE-derived status stay consistent through a single code path.
     */
    protected subscribeToActiveTasks(): void {
        this.activeTasksDispose.dispose();
        this.conversationsDispose.dispose();
        this.chatServiceDispose.dispose();
        if (this.activeTasks) {
            this.activeTasksDispose = this.activeTasks.onDidChange(() => {
                if (this.visible && this.transcriptSheet && this.transcriptChatHost && this.transcriptLastConv) {
                    this.ensureOverlayUi().team.renderTeamSection(this.transcriptChatHost, this.transcriptLastConv);
                }
                if (this.visible && this.isTasksHubView()) {
                    this.renderList();
                } else if (this.visible && !this.transcriptSheet) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
        if (this.conversations) {
            this.conversations.start();
            if (this.tasksFirstLoadPending && this.tasksFirstLoadFallback === undefined) {
                this.tasksFirstLoadFallback = window.setTimeout(() => this.markTasksFirstLoadComplete(true), 5000);
            }
            const conversationUpdates = new DisposableCollection(
                this.conversations.onDidChange(() => {
                    this.markTasksFirstLoadComplete(false);
                    if (this.visible && this.isTasksHubView()) {
                        if (this.shouldSkipFullRenderListOnConversationTick()) {
                            this.refreshWorkHubConversationChrome();
                            this.ensureTranscriptConversationRefresh();
                            return;
                        }
                        this.renderList();
                        if (this.agentsHubInlineActive && this.transcriptOpenSummaryId) {
                            this.ensureTranscriptConversationRefresh();
                        }
                    } else if (this.visible && !this.transcriptSheet) {
                        void this.applyActiveTasksRefresh();
                    }
                }),
                this.conversations.onDidReceiveMessage(payload => {
                    this.handleTranscriptSseMessage(payload);
                }),
                this.conversations.onDidReceiveParallelRun(payload => {
                    this.ensureOverlayUi().parallel.applyParallelRunStats(payload.runId, payload.variants);
                }),
            );
            this.conversationsDispose = conversationUpdates;
        }
        this.subscribeToChatServiceSessions();
        this.subscribeToInboxStream();
    }

    protected subscribeToInboxStream(): void {
        this.inboxStreamDispose.dispose();
        if (!this.inboxStream) {
            this.inboxStreamDispose = Disposable.NULL;
            return;
        }
        this.inboxStreamDispose = this.inboxStream.onDidChange(() => {
            if (!this.visible || this.hubView !== 'review' || this.transcriptSheet) {
                return;
            }
            this.inboxPullRequests = this.mergeInboxPullRequests(this.inboxPullRequests);
            this.inboxPullRequestsLoaded = true;
            this.renderList();
        });
    }

    protected mergeInboxPullRequests(polled: QaapGithubPullRequestSummary[]): QaapGithubPullRequestSummary[] {
        const live = this.inboxStream?.getLivePullRequests() ?? [];
        const merged = new Map<string, QaapGithubPullRequestSummary>();
        for (const pullRequest of polled) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        for (const pullRequest of live) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        return [...merged.values()].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        );
    }

    protected subscribeToChatServiceSessions(): void {
        if (!this.chatService) {
            this.chatServiceDispose = Disposable.NULL;
            return;
        }
        const disposables = new DisposableCollection();
        disposables.push(this.chatService.onSessionEvent(() => {
            this.trackChatServiceSessionModels();
            this.scheduleChatServiceRefresh();
        }));
        this.chatServiceDispose = disposables;
        this.trackChatServiceSessionModels();
    }

    protected trackChatServiceSessionModels(): void {
        if (!this.chatService) {
            return;
        }
        const liveIds = new Set(this.chatService.getSessions().map(session => session.id));
        for (const [sessionId, disposable] of [...this.chatSessionModelDisposables]) {
            if (!liveIds.has(sessionId)) {
                disposable.dispose();
                this.chatSessionModelDisposables.delete(sessionId);
                this.chatSessionProjectIds.delete(sessionId);
            }
        }
        for (const session of this.chatService.getSessions()) {
            if (this.chatSessionModelDisposables.has(session.id)) {
                continue;
            }
            this.chatSessionModelDisposables.set(session.id, session.model.onDidChange(() => {
                this.scheduleChatServiceRefresh();
            }));
        }
    }

    protected disposeChatSessionModelListeners(): void {
        if (this.chatServiceRefreshHandle !== undefined) {
            window.clearTimeout(this.chatServiceRefreshHandle);
            this.chatServiceRefreshHandle = undefined;
        }
        for (const disposable of this.chatSessionModelDisposables.values()) {
            disposable.dispose();
        }
        this.chatSessionModelDisposables.clear();
    }

    protected scheduleChatServiceRefresh(): void {
        if (this.transcriptSheet || !this.visible || this.chatServiceRefreshHandle !== undefined) {
            return;
        }
        this.chatServiceRefreshHandle = window.setTimeout(() => {
            this.chatServiceRefreshHandle = undefined;
            void this.applyActiveTasksRefresh();
        }, 120);
    }

    /** Refresh chat session summaries once, then repaint the hub list (never from inside renderList). */
    protected scheduleChatHubListRefreshAfterSummaries(): void {
        void this.refreshChatServiceSessionSummaries().then(() => {
            if (this.hubView === 'chat' && this.visible) {
                this.renderList();
                this.renderSubtitle();
            }
        });
    }

    protected async applyActiveTasksRefresh(): Promise<void> {
        if (this.transcriptSheet) {
            return;
        }
        try {
            this.projects = await this.projectsService.loadProjects();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            await this.refreshChatServiceSessionSummaries();
            this.renderSubtitle();
            this.renderFilters();
            // While the user is interacting with the expanded agent composer, do NOT rebuild the
            // list — renderList() disposes and remounts the AIChatInputWidget, which would wipe
            // their draft and break the in-place chrome. Only refresh ambient chrome (subtitle,
            // filter counts). The card visuals catch up the next time the user collapses/expands.
            this.renderList();
            this.renderStickyComposer();
        } catch {
            /* a transient load failure must not break the live view */
        }
    }

    protected renderHeader(): void {
        const inProjectDetail = this.isProjectDetailView();
        const inProjectDiff = this.isProjectDiffView();
        const showSessionsMenu = this.homeMode
            && this.hubView === 'tasks'
            && this.shouldUseAgentsHubLanding()
            && !inProjectDetail
            && !inProjectDiff;
        this.sessionsMenuBtn.hidden = !showSessionsMenu;
        this.sessionsMenuBtn.setAttribute('aria-hidden', showSessionsMenu ? 'false' : 'true');
        const showHeaderBack = inProjectDetail
            || inProjectDiff
            || this.isSidebarSecondaryHubView()
            || (this.agentsHubInlineActive && !this.shouldUseAgentsHubLanding());
        this.headerBackBtn.hidden = !showHeaderBack;
        this.headerBackBtn.setAttribute('aria-hidden', showHeaderBack ? 'false' : 'true');
        this.titleBlock.classList.toggle('theia-mod-with-back', showHeaderBack);
        if (this.isSidebarSecondaryHubView()) {
            this.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToAgents', 'Back to agents');
            this.headerBackBtn.setAttribute('aria-label', this.headerBackBtn.title);
        } else if (inProjectDiff) {
            this.headerBackBtn.title = nls.localize('qaap/diff/backToProject', 'Back to project');
            this.headerBackBtn.setAttribute('aria-label', this.headerBackBtn.title);
        } else {
            this.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
            this.headerBackBtn.setAttribute('aria-label', this.headerBackBtn.title);
        }

        if (this.hubView === 'diff') {
            this.titleEl.textContent = nls.localize('qaap/diff/reviewLabel', 'Working changes');
            return;
        }
        if (this.hubView === 'chat') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/chatTitle', 'Chat');
            return;
        }
        if (this.hubView === 'tasks') {
            if (this.agentsHubInlineActive && this.transcriptOpenProject && this.transcriptOpenSummary) {
                this.titleEl.textContent = this.resolveTranscriptHeaderTitle(
                    this.transcriptOpenProject,
                    this.transcriptOpenSummary,
                );
            } else {
                this.titleEl.textContent = this.shouldUseAgentsHubLanding()
                    ? nls.localize('qaap/mobileBottomBar/hubAgents', 'Agents')
                    : nls.localize('qaap/mobileProjects/tasksHubTitle', 'Tasks');
            }
            this.updateTasksAttentionChrome();
            return;
        }
        if (this.hubView === 'review') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/reviewHubTitle', 'Review');
            this.titleAttentionEl.hidden = true;
            this.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        if (this.hubView === 'workflows') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/workflowsTitle', 'Workflows');
            return;
        }
        if (this.hubView === 'routines') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/routinesTitle', 'Routines');
            return;
        }
        if (this.homeMode && this.hubView === 'home') {
            this.titleEl.textContent = this.buildHomeGreeting();
            this.titleAttentionEl.hidden = true;
            this.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        this.titleAttentionEl.hidden = true;
        if (inProjectDetail) {
            this.titleEl.textContent = this.projectDetailHeaderTitle(this.resolveSelectedProject());
            return;
        }
        if (this.homeMode && this.hubView === 'repos') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/projectsTitle', 'Projects');
            return;
        }
        if (this.homeMode) {
            const appName = FrontendApplicationConfigProvider.get().applicationName?.trim();
            this.titleEl.textContent = appName || nls.localize('qaap/mobileProjects/title', 'Work Hub');
            return;
        }
        this.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.syncAgentsHubAccountChrome();
    }

    /** Agents hub: account lives in the sessions sidebar Settings control, not the header. */
    protected syncAgentsHubAccountChrome(): void {
        const hideAccount = this.homeMode && (
            (this.hubView === 'tasks' && this.shouldUseAgentsHubLanding())
            || this.isSidebarSecondaryHubView()
        );
        this.accountBtn.hidden = hideAccount;
        this.accountBtn.style.display = hideAccount ? 'none' : '';
        this.accountBtn.setAttribute('aria-hidden', hideAccount ? 'true' : 'false');
        if (hideAccount) {
            dismissQaapAccountMenu();
        }
    }

    protected renderSubtitle(): void {
        if (this.hubView === 'diff') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            if (this.diffScopedToProject) {
                const tab = this.diffProjectTabs[0];
                if (!tab || tab.fileCount === 0) {
                    this.subtitleEl.textContent = this.diffScanning
                        ? nls.localize('qaap/diff/scanningProjects', 'Scanning projects for changes…')
                        : nls.localize('qaap/diff/noChanges', 'No changes to review.');
                } else if (tab.fileCount === 1) {
                    this.subtitleEl.textContent = nls.localize(
                        'qaap/diff/oneFileInProject',
                        '1 file · {0}',
                        tab.label,
                    );
                } else {
                    this.subtitleEl.textContent = nls.localize(
                        'qaap/diff/nFilesInProject',
                        '{0} files · {1}',
                        String(tab.fileCount),
                        tab.label,
                    );
                }
                return;
            }
            const count = this.diffProjectTabs.length;
            this.subtitleEl.textContent = count === 1
                ? nls.localize('qaap/diff/oneProjectWithChanges', '1 project with changes')
                : nls.localize('qaap/diff/nProjectsWithChanges', '{0} projects with changes', String(count));
            return;
        }
        if (this.homeMode && this.hubView === 'home') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle q-fs-meta';
            this.subtitleEl.textContent = this.buildHomeSubtitle(this.buildHomeSnapshot());
            this.subtitleEl.hidden = false;
            return;
        }
        if (this.homeMode && this.hubView === 'workflows') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const filtered = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.query);
            const count = countCatalogItems(filtered);
            this.subtitleEl.textContent = nls.localize(
                'qaap/mobileProjects/workflowsSubtitle',
                '{0} agent workflows for the Qaap mobile workbench',
                String(count),
            );
            return;
        }
        if (this.homeMode && this.hubView === 'routines') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const visible = filterRoutinesByQuery(this.workHubRoutines, this.query);
            const running = visible.filter(r => r.lastRunState === 'running').length;
            if (this.workHubRoutinesLoading && !this.workHubRoutinesLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
            } else if (running > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/routinesSubtitleRunning',
                    '{0} routines · {1} running on the VPS',
                    String(visible.length),
                    String(running),
                );
            } else {
                this.subtitleEl.textContent = visible.length > 0
                    ? nls.localize(
                        'qaap/mobileProjects/routinesSubtitle',
                        '{0} on your VPS',
                        String(visible.length),
                    )
                    : '';
            }
            return;
        }
        if (this.homeMode && this.hubView === 'tasks') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            if (this.agentsHubInlineActive && this.transcriptOpenProject) {
                this.renderActiveChatHeaderSubtitle(
                    this.subtitleEl,
                    this.transcriptOpenProject,
                    this.transcriptOpenSummary,
                );
                return;
            }
            if (this.shouldUseAgentsHubLanding()) {
                const branchProject = this.transcriptOpenProject ?? this.resolveHomePinnedProject();
                if (branchProject) {
                    this.subtitleEl.hidden = true;
                    this.subtitleEl.textContent = '';
                    return;
                }
            }
            if (this.tasksHubSurface === 'chat') {
                const chatCount = this.projects.reduce(
                    (sum, project) => sum + this.localChatsForProject(project).length,
                    0,
                );
                this.subtitleEl.textContent = chatCount > 0
                    ? nls.localize(
                        'qaap/mobileProjects/chatSubtitleCount',
                        '{0} local chat sessions · saved on this device',
                        String(chatCount),
                    )
                    : nls.localize(
                        'qaap/mobileProjects/chatSubtitleEmpty',
                        'Local chat sessions saved on this device',
                    );
                return;
            }
            const attention = this.countTasksAttention();
            const streamingCount = this.projects.reduce(
                (sum, project) => sum + this.vpsTasksForProject(project).filter(c => c.status === 'streaming').length,
                0,
            );
            if (attention.needsYou > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitleNeedsYou',
                    '{0} need your attention · {1} agents active on the VPS',
                    String(attention.needsYou),
                    String(Math.max(attention.running, streamingCount)),
                );
            } else if (attention.running > 0 || streamingCount > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitleRunning',
                    '{0} agents working on the VPS',
                    String(Math.max(attention.running, streamingCount)),
                );
            } else {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/tasksSubtitle',
                    'VPS agent work — keeps running when you close the app',
                );
            }
            return;
        }
        if (this.homeMode && this.hubView === 'review') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const prCount = this.inboxPullRequests.length;
            const repoCount = githubRepoKeysForProjects(this.projects).length;
            if (this.inboxPullRequestsLoading && !this.inboxPullRequestsLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/reviewLoading', 'Loading pull requests…');
            } else if (this.inboxPullRequestsLoading && this.inboxPullRequestsLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/reviewRefreshing', 'Refreshing pull requests…');
            } else if (repoCount === 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleNoRepos',
                    'Link a GitHub repository to see open pull requests',
                );
            } else if (this.inboxGithubSignedIn === false) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleSignIn',
                    'Sign in with GitHub to load pull requests',
                );
            } else if (prCount > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitleCount',
                    '{0} open pull requests · swipe to review',
                    String(prCount),
                );
            } else {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/reviewSubtitle',
                    'Open pull requests across your linked repositories',
                );
            }
            return;
        }
        if (this.homeMode && this.hubView === 'chat') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const chatCount = this.projects.reduce(
                (sum, project) => sum + this.localChatsForProject(project).length,
                0,
            );
            this.subtitleEl.textContent = chatCount > 0
                ? nls.localize(
                    'qaap/mobileProjects/chatSubtitleCount',
                    '{0} local chat sessions · saved on this device',
                    String(chatCount),
                )
                : nls.localize(
                    'qaap/mobileProjects/chatSubtitle',
                    'Interactive workspace chat — persists when you close the app',
                );
            return;
        }
        if (this.isProjectDetailView()) {
            const project = this.resolveSelectedProject();
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            this.subtitleEl.hidden = false;
            this.subtitleEl.textContent = project ? this.buildProjectBranchSubtitle(project) : '';
            return;
        }
        if (this.homeMode) {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            this.subtitleEl.textContent = nls.localize(
                'qaap/mobileProjects/projectsSubtitle',
                '{0} repositories · search, pin, and open a workspace',
                String(this.projects.length),
            );
            return;
        }
        this.subtitleEl.className = 'theia-mobile-projects-meta';
        const repoCount = this.projects.length;
        const openCount = this.projects.filter(p => p.isCurrent).length;
        const runningCount = this.projects.filter(p => this.isProjectRunning(p)).length;

        this.subtitleEl.replaceChildren();
        const reposChip = document.createElement('span');
        reposChip.className = 'theia-mobile-projects-meta-chip';
        reposChip.textContent = nls.localize(
            'qaap/mobileProjects/metaRepos', '{0} repos', String(repoCount)
        );
        this.subtitleEl.append(reposChip);

        if (openCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-open';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaOpen', '{0} open', String(openCount)
            )));
            this.subtitleEl.append(chip);
        }

        if (runningCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-running';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot theia-mod-pulse';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaRunning', '{0} running', String(runningCount)
            )));
            this.subtitleEl.append(chip);
        }
    }

    protected buildProjectBranchSubtitle(project: MobileProjectEntry): string {
        const parts: string[] = [];
        if (project.branch) {
            parts.push(project.branch);
        }
        if (project.lastActive && project.lastActive !== '—') {
            parts.push(project.lastActive);
        }
        return parts.join(' · ');
    }

    protected projectDetailHeaderTitle(project: MobileProjectEntry | undefined): string {
        if (!project) {
            return nls.localize('qaap/mobileProjects/tasksTitle', 'Tasks');
        }
        return project.name;
    }


    protected isProjectRunning(project: MobileProjectEntry): boolean {
        return this.countRunningTasks(project) > 0;
    }

    protected countRunningTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'streaming').length;
    }

    /** VPS agent conversations/tasks for one project (excludes local Theia chat). */
    protected vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        return filterVpsTaskSummaries(this.conversationsForProject(project));
    }

    /**
     * Local Theia chat sessions. The Chat surface was removed from the mobile shell, so these are
     * hidden from every list, counter, and recents row — only agentic VPS tasks are surfaced.
     */
    protected localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        void project;
        return [];
    }

    protected countDoneTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'idle' && c.messageCount > 0).length;
    }

    protected countNeedsInputTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => {
            const session = c.sessionId ? this.chatService?.getSession(c.sessionId) : undefined;
            return !!session && this.isChatSessionWaitingForInput(session);
        }).length;
    }

    protected countFailedTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'failed').length;
    }

    protected countUnreadTasks(project: MobileProjectEntry): number {
        if (!this.conversationFlags) {
            return 0;
        }
        return this.vpsTasksForProject(project).filter(c => this.isConversationUnread(c)).length;
    }

    /**
     * A conversation is "unread" when the agent has produced new activity since the user last
     * opened it. Conversations the user has never opened only count as unread if their last
     * message is from the agent — otherwise the row would render as a permanent badge.
     */
    protected isConversationUnread(summary: QaapAgentConversationSummaryDTO): boolean {
        if (!this.conversationFlags) {
            return false;
        }
        if (summary.lastMessageRole !== 'agent' || !summary.messageCount) {
            return false;
        }
        const lastSeen = this.conversationFlags.getLastSeen(summary.id);
        return summary.updatedAt > lastSeen;
    }

    /** All persistent agent conversations the panel knows about for this project. */
    protected conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        const directChatSessions = this.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
        if (!this.conversations) {
            return directChatSessions;
        }
        const cwd = this.preparedCwdByProjectId.get(project.id)
            ?? this.projectsService.getProjectCwd(project);
        let list = cwd ? this.conversations.getConversationsForCwd(cwd) : [];
        if (list.length === 0) {
            list = this.conversations.findConversationsForProject(project);
        }
        // Parallel-run variants live in a tmpdir worktree but belong to this repo (parallelBaseCwd).
        const variants = cwd ? this.conversations.getVariantsForBaseCwd(cwd) : [];
        return this.mergeConversationSummaries(directChatSessions, [...list, ...variants]);
    }

    protected async refreshChatServiceSessionSummaries(): Promise<void> {
        this.chatServiceSessionSummariesByProjectId.clear();
        if (!this.chatService) {
            return;
        }
        this.trackChatServiceSessionModels();
        let persisted: ChatSessionMetadata[] = [];
        try {
            persisted = Object.values(await this.chatService.getPersistedSessions());
        } catch {
            persisted = [];
        }
        const activeSessions = new Map(this.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => [session.id, session]));
        const active = this.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => ({
                sessionId: session.id,
                title: session.title ?? nls.localize('qaap/mobileProjects/untitledTask', 'Untitled task'),
                saveDate: session.lastInteraction?.getTime?.() ?? Date.now(),
                location: session.model.location,
            } satisfies ChatSessionMetadata));
        const byId = new Map<string, ChatSessionMetadata>();
        for (const session of [...persisted, ...active]) {
            byId.set(session.sessionId, session);
        }
        const sessions = [...byId.values()].sort((a, b) => b.saveDate - a.saveDate);
        if (sessions.length === 0) {
            return;
        }
        const currentName = this.projectsService.getCurrentWorkspaceName()?.toLowerCase();
        const currentCwd = this.projectsService.getCurrentWorkspaceCwd();
        const targetProject = this.projects.find(project =>
            project.isCurrent
            || this.projectsService.projectMatchesCurrentWorkspace(project)
            || (!!currentName && project.name.toLowerCase() === currentName)
            || (!!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.name.toLowerCase()}`))
            || (!!project.github && !!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.github.owner.toLowerCase()}/${project.github.name.toLowerCase()}`))
        ) ?? this.projects.find(project => project.id === this.expandedId);
        if (!targetProject) {
            return;
        }
        const cwd = this.projectsService.getProjectCwd(targetProject) ?? currentCwd ?? targetProject.name;
        for (const session of sessions) {
            const project = this.projectForChatSession(session.sessionId, targetProject);
            if (activeSessions.has(session.sessionId) && !this.chatSessionProjectIds.has(session.sessionId)) {
                this.rememberChatSessionProject(session.sessionId, project);
            }
            const projectCwd = this.projectsService.getProjectCwd(project) ?? cwd;
            const modelSession = activeSessions.get(session.sessionId);
            const summary: QaapAgentConversationSummaryDTO = {
                id: this.chatServiceConversationId(session.sessionId),
                source: 'theia-chat',
                cwd: projectCwd,
                workspacePath: projectCwd,
                sessionId: session.sessionId,
                agentId: modelSession?.pinnedAgent?.id ?? 'chat',
                title: modelSession?.title ?? session.title,
                status: modelSession && this.isChatSessionWorking(modelSession) ? 'streaming' : 'idle',
                createdAt: session.saveDate,
                updatedAt: modelSession?.lastInteraction?.getTime?.() ?? session.saveDate,
                messageCount: modelSession?.model.getRequests().length ?? 1,
                lastMessagePreview: this.chatSessionPreview(modelSession) ??
                    nls.localize('qaap/mobileProjects/workspaceChatPreview', 'Workspace chat'),
                lastMessageRole: 'user',
            };
            const existing = this.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
            existing.push(summary);
            this.chatServiceSessionSummariesByProjectId.set(project.id, existing);
        }
    }

    protected projectForChatSession(sessionId: string, fallback: MobileProjectEntry): MobileProjectEntry {
        const mappedId = this.chatSessionProjectIds.get(sessionId);
        if (mappedId) {
            return this.projects.find(project => project.id === mappedId) ?? fallback;
        }
        return fallback;
    }

    protected rememberChatSessionProject(sessionId: string | undefined, project: MobileProjectEntry): void {
        if (sessionId) {
            this.chatSessionProjectIds.set(sessionId, project.id);
        }
    }

    protected isChatSessionWorking(session: ChatSession): boolean {
        return session.model.getRequests().some(request =>
            !request.response.isComplete && !request.response.isCanceled
        );
    }

    protected isChatSessionWaitingForInput(session: ChatSession): boolean {
        return session.model.getRequests().some(request => request.response.isWaitingForInput);
    }

    protected chatSessionPreview(session: ChatSession | undefined): string | undefined {
        const request = session?.model.getRequests().at(-1);
        return request?.request.displayText?.trim() || request?.request.text?.trim();
    }

    protected mergeConversationSummaries(
        first: QaapAgentConversationSummaryDTO[],
        second: QaapAgentConversationSummaryDTO[],
    ): QaapAgentConversationSummaryDTO[] {
        const byId = new Map<string, QaapAgentConversationSummaryDTO>();
        const bySessionId = new Map<string, string>();
        for (const item of [...first, ...second]) {
            if (item.sessionId) {
                const existingId = bySessionId.get(item.sessionId);
                if (existingId) {
                    const existing = byId.get(existingId);
                    if (existing) {
                        byId.set(existingId, this.preferConversationSummary(existing, item));
                    }
                    continue;
                }
                bySessionId.set(item.sessionId, item.id);
            }
            byId.set(item.id, item);
        }
        return [...byId.values()].sort((a, b) => this.compareConversationOrder(a, b));
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
        const fa = this.resolveConversationFlags(a);
        const fb = this.resolveConversationFlags(b);
        const aPriority = fa.priority && !fa.paused ? 1 : 0;
        const bPriority = fb.priority && !fb.paused ? 1 : 0;
        if (aPriority !== bPriority) {
            return bPriority - aPriority;
        }
        const aPaused = fa.paused ? 1 : 0;
        const bPaused = fb.paused ? 1 : 0;
        if (aPaused !== bPaused) {
            return aPaused - bPaused;
        }
        const aStreaming = a.status === 'streaming' ? 1 : 0;
        const bStreaming = b.status === 'streaming' ? 1 : 0;
        if (aStreaming !== bStreaming) {
            return bStreaming - aStreaming;
        }
        return b.updatedAt - a.updatedAt;
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
        const isChild = !!summary.forkedFromId;
        const isParent = parentIds.has(summary.id);
        if (isParent && isChild) {
            return 'both';
        }
        if (isParent) {
            return 'parent';
        }
        if (isChild) {
            return 'child';
        }
        return 'none';
    }

    /** Fixed 18px slot for task-row leading codicons (status + fork lineage). */
    protected createTaskLeadingGlyph(codiconClass: string): HTMLElement {
        const glyph = document.createElement('span');
        glyph.className = `theia-mobile-projects-task-leading-glyph codicon ${codiconClass}`;
        glyph.setAttribute('aria-hidden', 'true');
        return glyph;
    }

    /**
     * Effective priority/paused state for a conversation. VPS-backed conversations carry the
     * flags on the summary itself; Theia-chat summaries pick them up from the local override store.
     */
    protected resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean } {
        if (summary.source === 'theia-chat' && this.conversationFlags) {
            const overrides = this.conversationFlags.get(summary.id);
            return {
                priority: !!(summary.priority || overrides.priority),
                paused: !!(summary.paused || overrides.paused),
            };
        }
        return { priority: !!summary.priority, paused: !!summary.paused };
    }

    protected preferConversationSummary(
        current: QaapAgentConversationSummaryDTO,
        next: QaapAgentConversationSummaryDTO,
    ): QaapAgentConversationSummaryDTO {
        if (current.status !== 'streaming' && next.status === 'streaming') {
            return { ...next, id: current.id };
        }
        if (current.id.startsWith('theia-chat-service:')) {
            return {
                ...current,
                title: current.title || next.title,
                messageCount: Math.max(current.messageCount, next.messageCount),
                updatedAt: Math.max(current.updatedAt, next.updatedAt),
                lastMessagePreview: current.lastMessagePreview ?? next.lastMessagePreview,
            };
        }
        return next.updatedAt > current.updatedAt ? next : current;
    }

    protected chatServiceConversationId(sessionId: string): string {
        return `theia-chat-service:${encodeURIComponent(sessionId)}`;
    }

    /**
     * Legacy adapter — projects the conversation list as `MobileProjectTaskView[]` so existing
     * task-block markup (built before the conversation refactor) keeps working unchanged. New
     * code paths should use {@link conversationsForProject} directly.
     */
    protected summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView {
        return {
            id: conversation.id,
            title: conversation.title,
            command: conversation.lastMessagePreview ?? '',
            cwd: conversation.cwd,
            state: this.conversationTaskState(conversation),
            createdAt: conversation.createdAt,
            finishedAt: conversation.status !== 'streaming' ? conversation.updatedAt : undefined,
        };
    }

    protected tasksForProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return this.fallbackTasksFromProject(project);
        }
        return conversations.map(c => this.summaryToTaskView(c));
    }

    protected conversationTaskState(conversation: QaapAgentConversationSummaryDTO): string {
        const session = conversation.sessionId ? this.chatService?.getSession(conversation.sessionId) : undefined;
        if (session && this.isChatSessionWaitingForInput(session)) {
            return 'needs-input';
        }
        if (conversation.status === 'streaming' || (session && this.isChatSessionWorking(session))) {
            return 'running';
        }
        if (conversation.status === 'failed') {
            return 'failed';
        }
        return 'completed';
    }

    protected fallbackTasksFromProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const activeInfo = this.activeInfoForProject(project);
        if (!activeInfo?.taskId && project.status !== 'working') {
            return [];
        }
        const title = activeInfo?.title
            ?? (project.status === 'working' && project.task && project.task !== '—' ? project.task : undefined);
        if (!title) {
            return [];
        }
        const cwd = this.preparedCwdByProjectId.get(project.id)
            ?? this.projectsService.getProjectCwd(project)
            ?? '';
        const isRunning = project.status === 'working' || !!activeInfo?.taskId;
        return [{
            id: activeInfo?.taskId ?? `fallback-${project.id}`,
            title: title ?? nls.localize('qaap/mobileProjects/taskRunning', 'Background task'),
            command: title ?? '',
            cwd,
            state: isRunning ? 'running' : 'completed',
            createdAt: Date.now(),
        }];
    }

    protected async onNewClick(): Promise<void> {
        if (this.hubView === 'routines') {
            this.openRoutineEditor();
            return;
        }
        if (!this.openRepoDialog) {
            this.openRepoDialog = new MobileOpenRepositoryDialog(this.projectsService, {
                onProjectsChanged: nextProjects => {
                    this.projects = nextProjects;
                    this.hubView = 'repos';
                    this.projectsService.setHubView('repos');
                    this.render();
                    this.delegate.onProjectsChanged?.();
                },
                onWorkspaceOpened: () => this.delegate.onWorkspaceOpened?.(),
            });
            this.root.append(this.openRepoDialog.node);
        }
        await this.openRepoDialog.show();
    }

    protected async onCloneClick(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            const nextProjects = await this.projectsService.cloneGithubProject();
            if (!nextProjects) {
                return;
            }
            this.projects = nextProjects;
            this.render();
            this.delegate.onProjectsChanged?.();
            this.delegate.onWorkspaceOpened?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected async refreshProjects(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            this.projects = await this.projectsService.loadProjects();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            await this.refreshChatServiceSessionSummaries();
            this.render();
            this.delegate.onProjectsChanged?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected render(): void {
        this.root.classList.toggle('theia-mod-hub-home', this.hubView === 'home');
        this.root.classList.toggle('theia-mod-hub-diff', this.hubView === 'diff');
        this.root.classList.toggle('theia-mod-hub-project-diff', this.isProjectDiffView());
        this.root.classList.toggle('theia-mod-hub-inbox', this.hubView === 'tasks');
        this.root.classList.toggle('theia-mod-hub-tasks', this.hubView === 'tasks');
        this.root.classList.toggle('theia-mod-hub-review', this.hubView === 'review');
        this.root.classList.toggle('theia-mod-hub-chat', this.hubView === 'chat');
        this.root.classList.toggle('theia-mod-hub-workflows', this.hubView === 'workflows');
        this.root.classList.toggle('theia-mod-hub-routines', this.hubView === 'routines');
        this.root.classList.toggle('theia-mod-hub-repos', this.hubView === 'repos');
        this.root.classList.toggle('theia-mod-agents-hub-landing', this.shouldUseAgentsHubLanding());
        this.root.classList.toggle('theia-mod-project-detail', this.isProjectDetailView());
        const detailProject = this.resolveSelectedProject();
        const detailTab = detailProject ? this.executionSurfaceTabForProject(detailProject) : 'messages';
        this.root.classList.toggle(
            'theia-mod-project-surface-chat',
            this.isProjectDetailView() && detailTab === 'messages',
        );
        this.root.classList.toggle(
            'theia-mod-project-surface-tools',
            this.isProjectDetailView() && detailTab !== 'messages',
        );
        this.renderHeader();
        this.renderSubtitle();
        this.syncHeaderComposerSurfacePicker();
        this.syncHeaderExecutionTabStrip();
        if (this.transcriptSheet && this.transcriptOpenProject) {
            this.syncExecutionSurfaceChrome(this.transcriptOpenProject);
        }
        this.syncHubViewAvailability();
        this.renderFilters();
        this.renderList();
        if (this.sessionsSidebar?.isVisible()) {
            this.sessionsSidebar.refreshList();
        }
    }

    protected syncHubViewAvailability(): void {
        // Inbox is PRs + optional agent threads; keep the tab even when the VPS conversation service is absent.
    }

    /** Projects included in the current hub list (inbox ignores Active/Pinned filters). */
    protected projectsForCurrentHubList(): MobileProjectEntry[] {
        const base = (this.hubView === 'tasks' || this.hubView === 'chat' || this.hubView === 'review')
            ? this.projects
            : this.applyFilter(this.projects, this.filter);
        return this.applySearch(base);
    }

    protected static readonly REPO_FILTER_ORDER: readonly MobileProjectFilter[] = ['all', 'active', 'pinned'];

    protected renderFilters(): void {
        this.syncSearchChrome();
        const showRepoFilters = this.hubView === 'repos' && !this.isProjectDetailView();
        this.filtersHost.hidden = !showRepoFilters;
        this.filtersHost.replaceChildren();
        if (!showRepoFilters) {
            return;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-filters';
        row.setAttribute('role', 'tablist');
        row.setAttribute('aria-label', nls.localize('qaap/mobileProjects/filterRowLabel', 'Filter repositories'));
        for (const id of MobileProjectsPanel.REPO_FILTER_ORDER) {
            const spec = { id, label: this.repoFilterLabel(id) };
            const isActive = this.filter === spec.id;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-filter-tab';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-filter-tab-label';
            label.textContent = spec.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-filter-tab-count';
            count.textContent = String(this.applyFilter(this.projects, spec.id).length);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                if (this.filter === spec.id) {
                    return;
                }
                this.filter = spec.id;
                this.projectsService.setFilter(spec.id);
                this.renderFilters();
                this.renderList();
                this.renderStickyComposer();
            });
            row.append(btn);
        }
        this.filtersHost.append(row);
    }

    protected repoFilterLabel(id: MobileProjectFilter): string {
        switch (id) {
            case 'active':
                return nls.localize('qaap/mobileProjects/filterActive', 'Active');
            case 'pinned':
                return nls.localize('qaap/mobileProjects/filterPinned', 'Pinned');
            default:
                return nls.localize('qaap/mobileProjects/filterAll', 'All');
        }
    }

    protected isSearchChromeHidden(): boolean {
        return this.hubView === 'diff'
            || this.hubView === 'home'
            || this.hubView === 'tasks'
            || this.hubView === 'review'
            || this.hubView === 'chat'
            || this.isProjectDetailView();
    }

    protected syncSearchChrome(): void {
        const hideSearch = this.isSearchChromeHidden();
        const open = !!this.workHubSearchQuickPick;
        this.searchToggleBtn.hidden = hideSearch;
        this.searchToggleBtn.classList.toggle('theia-mod-active', open);
        this.searchToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (hideSearch && open) {
            this.closeWorkHubSearchQuickPick();
        }
    }

    protected workHubSearchPlaceholder(): string {
        if (this.hubView === 'chat') {
            return nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions');
        }
        if (this.hubView === 'tasks') {
            return this.tasksHubSurface === 'chat'
                ? nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions')
                : nls.localize('qaap/mobileProjects/searchTasksPlaceholder', 'Search tasks and agents');
        }
        if (this.hubView === 'review') {
            return nls.localize('qaap/mobileProjects/searchReviewPlaceholder', 'Search pull requests');
        }
        if (this.hubView === 'workflows') {
            return nls.localize('qaap/mobileProjects/searchWorkflowsPlaceholder', 'Search workflows and guides');
        }
        if (this.hubView === 'routines') {
            return nls.localize('qaap/mobileProjects/searchRoutinesPlaceholder', 'Search routines and automations');
        }
        if (this.isProjectDetailView()) {
            const project = this.resolveSelectedProject();
            const surface = project ? this.detailComposerSurfaceForProject(project) : 'task';
            return surface === 'chat'
                ? nls.localize('qaap/mobileProjects/searchChatPlaceholder', 'Search local chat sessions')
                : nls.localize('qaap/mobileProjects/searchTasksPlaceholder', 'Search tasks and agents');
        }
        return nls.localize('qaap/mobileProjects/searchPlaceholder', 'Search repositories and tasks');
    }

    protected openWorkHubSearchQuickPick(): void {
        if (!this.quickInputService || this.isSearchChromeHidden()) {
            return;
        }
        if (this.workHubSearchQuickPick) {
            this.workHubSearchQuickPick.show();
            return;
        }
        const quickPick = this.quickInputService.createQuickPick<WorkHubSearchPickItem>();
        this.workHubSearchQuickPick = quickPick;
        quickPick.placeholder = this.workHubSearchPlaceholder();
        quickPick.canSelectMany = false;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        quickPick.items = this.buildWorkHubSearchPickItems();
        this.workHubSearchQuickPickDispose = new DisposableCollection(
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected?.target) {
                    void this.activateWorkHubSearchTarget(selected.target);
                }
                quickPick.hide();
            }),
            quickPick.onDidHide(() => {
                this.workHubSearchQuickPick = undefined;
                this.workHubSearchQuickPickDispose.dispose();
                this.workHubSearchQuickPickDispose = Disposable.NULL;
                this.syncSearchChrome();
            }),
        );
        quickPick.show();
        this.syncSearchChrome();
    }

    protected closeWorkHubSearchQuickPick(): void {
        this.workHubSearchQuickPick?.hide();
    }

    protected buildWorkHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        if (this.isProjectDetailView()) {
            return this.buildProjectDetailSearchPickItems();
        }
        switch (this.hubView) {
            case 'repos':
                return this.buildReposSearchPickItems();
            case 'tasks':
                return this.buildTasksHubSearchPickItems();
            case 'chat':
                return this.buildChatHubSearchPickItems();
            case 'review':
                return this.buildReviewSearchPickItems();
            case 'workflows':
                return this.buildWorkflowSearchPickItems();
            case 'routines':
                return this.buildRoutineSearchPickItems();
            default:
                return [];
        }
    }

    protected buildProjectDetailSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const project = this.resolveSelectedProject();
        if (!project) {
            return [];
        }
        const surface = this.detailComposerSurfaceForProject(project);
        const conversations = surface === 'chat'
            ? this.localChatsForProject(project)
            : this.vpsTasksForProject(project);
        return conversations.map(c => this.conversationToSearchPickItem(project, c));
    }

    protected buildReposSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        const projects = this.applyFilter(this.projects, this.filter);
        for (const project of projects) {
            items.push({
                label: project.name,
                description: project.branch,
                detail: project.task || project.github?.fullName,
                iconClasses: ['codicon', 'codicon-repo'],
                target: { kind: 'project', projectId: project.id },
            });
            for (const conversation of this.conversationsForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    protected buildTasksHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        if (this.tasksHubSurface === 'chat') {
            return this.buildChatHubSearchPickItems();
        }
        for (const project of this.projects) {
            for (const conversation of this.vpsTasksForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    protected buildChatHubSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const project of this.projects) {
            for (const conversation of this.localChatsForProject(project)) {
                items.push(this.conversationToSearchPickItem(project, conversation));
            }
        }
        return items;
    }

    protected buildReviewSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const pullRequest of this.inboxPullRequests) {
            items.push({
                label: pullRequest.title,
                description: `${pullRequest.owner}/${pullRequest.repo}`,
                detail: pullRequest.author ? `@${pullRequest.author}` : undefined,
                iconClasses: ['codicon', 'codicon-git-pull-request'],
                target: { kind: 'pullRequest', pullRequest },
            });
        }
        return items;
    }

    protected buildWorkflowSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        const items: Array<WorkHubSearchPickItem | QuickPickSeparator> = [];
        for (const section of QAAP_WORK_HUB_WORKFLOWS) {
            items.push({ type: 'separator', label: section.title });
            for (const item of section.items) {
                items.push({
                    label: item.title,
                    description: item.subtitle,
                    detail: item.meta,
                    iconClasses: ['codicon', item.iconClass],
                    target: { kind: 'catalog', action: item.action },
                });
            }
        }
        return items;
    }

    protected buildRoutineSearchPickItems(): Array<WorkHubSearchPickItem | QuickPickSeparator> {
        return this.sortRoutinesForDisplay(this.workHubRoutines).map(routine => ({
            label: routine.title,
            description: routineScheduleLabel(routine),
            detail: routine.prompt?.trim() || undefined,
            iconClasses: ['codicon', 'codicon-sync'],
            target: { kind: 'routine', routineId: routine.id },
        }));
    }

    protected conversationToSearchPickItem(
        project: MobileProjectEntry,
        conversation: QaapAgentConversationSummaryDTO,
    ): WorkHubSearchPickItem {
        return {
            label: conversation.title?.trim() || conversation.agentId,
            description: project.name,
            detail: conversation.lastMessagePreview?.trim() || conversation.agentId,
            iconClasses: ['codicon', 'codicon-comment-discussion'],
            target: {
                kind: 'conversation',
                projectId: project.id,
                conversationId: conversation.id,
            },
        };
    }

    protected async activateWorkHubSearchTarget(target: WorkHubSearchTarget): Promise<void> {
        switch (target.kind) {
            case 'project': {
                const project = this.projects.find(entry => entry.id === target.projectId);
                if (project) {
                    await this.openProjectDetail(project);
                }
                return;
            }
            case 'conversation': {
                const project = this.projects.find(entry => entry.id === target.projectId);
                if (!project) {
                    return;
                }
                const summary = this.conversationsForProject(project).find(entry => entry.id === target.conversationId);
                if (!summary) {
                    return;
                }
                if (this.expandedId !== project.id) {
                    await this.openProjectDetail(project);
                }
                await this.openTranscriptSheet(project, summary);
                return;
            }
            case 'pullRequest':
                this.delegate.onOpenPullRequest?.(target.pullRequest);
                return;
            case 'catalog':
                await this.runCatalogAction(target.action);
                return;
            case 'routine': {
                if (this.hubView !== 'routines') {
                    this.selectHubLandingView('routines');
                }
                const routine = this.workHubRoutines.find(entry => entry.id === target.routineId);
                if (routine) {
                    this.openRoutineEditor(routine);
                }
                return;
            }
        }
    }

    /**
     * SSE conversation ticks call {@link renderList} to refresh sidebar dots, but must not
     * `replaceChildren()` the inline transcript shell — that disconnects the chat host mid-stream
     * and aborts live refresh until the user reopens the conversation.
     */


    protected renderList(): void {
        if ((this.hubView !== 'tasks' || !this.shouldUseAgentsHubLanding()) && this.agentsHubShellActive) {
            this.teardownAgentsHubExecutionShell();
        }
        this.closeCardMenu();
        this.projectDetailSurfaceTargets = undefined;
        this.projectDetailTabStrip = undefined;
        if (!this.shouldPreserveAgentsHubInlineTranscriptShell()) {
            this.scroll.replaceChildren();
        }
        try {
            if (this.hubView === 'diff') {
                this.renderDiffHubView();
                return;
            }
            this.diffProjectTabsHost.hidden = true;
            this.diffWidgetHost.hidden = true;

            const filtered = this.projectsForCurrentHubList();

            if (this.hubView === 'home') {
                this.renderHomeHubView();
                return;
            }
            if (this.hubView === 'chat') {
                this.renderChatHubView(filtered);
                return;
            }
            if (this.hubView === 'tasks') {
                this.renderTasksHubView(filtered);
                return;
            }
            if (this.hubView === 'review') {
                this.renderReviewHubView(filtered);
                return;
            }
            if (this.hubView === 'workflows') {
                this.renderCatalogHubView();
                return;
            }
            if (this.hubView === 'routines') {
                this.renderRoutinesHubView();
                return;
            }

            if (filtered.length === 0) {
                this.scroll.append(this.createEmptyState());
                return;
            }

            if (this.homeMode && this.expandedId !== undefined) {
                const selected = filtered.find(p => p.id === this.expandedId)
                    ?? this.projects.find(p => p.id === this.expandedId);
                if (selected) {
                    this.scroll.append(this.createProjectDetailView(selected));
                    return;
                }
                this.expandedId = undefined;
                this.soloExpanded = false;
            }

            if (!this.homeMode && this.expandedId === undefined && !this.suppressCurrentAutoExpand) {
                const current = filtered.find(p => p.isCurrent);
                if (current) {
                    this.expandedId = current.id;
                    this.soloExpanded = true;
                }
            }

            let visible = filtered;
            if (!this.homeMode && this.soloExpanded && this.expandedId !== undefined) {
                visible = filtered.filter(p => p.id === this.expandedId);
                if (visible.length === 0) {
                    visible = filtered;
                    this.soloExpanded = false;
                }
            }

            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-rows';
            for (const p of visible) {
                list.append(this.createRow(p));
            }
            this.scroll.append(list);
        } finally {
            this.updateNewFabVisibility();
            this.syncLandingHubListChrome();
            if (this.homeMode) {
                this.renderStickyComposer();
            }
        }
    }

    /** FAB opens "new repository"; hide while a repo row is expanded (conversations + composer). */
    protected updateNewFabVisibility(): void {
        const repoExpanded = this.hubView === 'repos' && this.expandedId !== undefined;
        this.root.classList.toggle('theia-mod-repo-expanded', repoExpanded);
        const showRepoFab = this.hubView === 'repos' && !repoExpanded;
        const showRoutineFab = this.hubView === 'routines';
        const showFab = showRepoFab || showRoutineFab;
        this.newFabBtn.hidden = !showFab;
        this.newFabBtn.setAttribute('aria-hidden', showFab ? 'false' : 'true');
        this.newFabBtn.title = showRoutineFab
            ? nls.localize('qaap/mobileProjects/newRoutine', 'New routine')
            : nls.localize('qaap/mobileProjects/newRepository', 'Add repository');
        this.newFabBtn.setAttribute('aria-label', this.newFabBtn.title);
    }

    /**
     * Landing hub list (no expanded project): show the global bottom nav. Hide it while a project
     * row is expanded so the user can focus on chats and the sticky composer.
     */
    protected syncLandingHubListChrome(): void {
        if (!this.homeMode || this.shouldUseAgentsHubLanding()) {
            this.root.classList.remove('theia-mod-hub-list-chrome');
            setMobileLandingHubListChrome(false);
            return;
        }
        const hubList = this.visible && this.expandedId === undefined;
        this.root.classList.toggle('theia-mod-hub-list-chrome', hubList);
        setMobileLandingHubListChrome(hubList);
    }

    protected renderDiffHubView(): void {
        this.newFabBtn.hidden = true;
        this.stickyComposerHost.hidden = true;
        this.root.classList.remove('theia-mod-sticky-composer');
        this.scroll.append(this.diffProjectTabsHost, this.diffWidgetHost);
        this.diffProjectTabsHost.hidden = false;
        this.diffWidgetHost.hidden = false;
        this.renderDiffProjectTabs();
        if (this.diffScanning) {
            this.detachDiffReviewWidget();
            const loading = document.createElement('div');
            loading.className = 'theia-mobile-projects-diff-loading';
            loading.textContent = nls.localize('qaap/diff/scanningProjects', 'Scanning projects for changes…');
            this.diffWidgetHost.replaceChildren(loading);
            return;
        }
        if (this.diffProjectTabs.length === 0) {
            this.detachDiffReviewWidget();
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-projects-diff-empty';
            empty.innerHTML = `<i class="codicon codicon-check-all" aria-hidden="true"></i>`
                + `<p>${nls.localize('qaap/diff/noChangesAnyProject', 'No pending changes across your projects.')}</p>`
                + `<span>${nls.localize('qaap/diff/noChangesHint', 'Edits made by you or an agent will show up here.')}</span>`;
            this.diffWidgetHost.replaceChildren(empty);
            return;
        }
        void this.mountDiffReviewWidget();
    }

    protected renderDiffProjectTabs(): void {
        this.diffProjectTabsHost.replaceChildren();
        if (this.diffScopedToProject || this.diffProjectTabs.length <= 1) {
            this.diffProjectTabsHost.hidden = true;
            return;
        }
        this.diffProjectTabsHost.hidden = false;
        const bar = document.createElement('div');
        bar.className = 'theia-mobile-projects-diff-tabs-bar';
        bar.setAttribute('role', 'tablist');
        for (const tab of this.diffProjectTabs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-diff-tab';
            btn.setAttribute('role', 'tab');
            const active = tab.projectId === this.diffActiveProjectId;
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-diff-tab-label';
            label.textContent = tab.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-diff-tab-count';
            count.textContent = String(tab.fileCount);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                if (this.diffActiveProjectId !== tab.projectId) {
                    this.diffActiveProjectId = tab.projectId;
                    this.renderDiffProjectTabs();
                    void this.applyDiffTabToWidget(tab);
                }
            });
            bar.append(btn);
        }
        this.diffProjectTabsHost.append(bar);
    }

    protected async refreshDiffHubView(): Promise<void> {
        if (!this.createDiffReviewWidget) {
            return;
        }
        this.diffScanning = true;
        this.renderDiffHubView();
        try {
            const preferred = this.diffPendingPreferredProjectId;
            this.diffPendingPreferredProjectId = undefined;
            if (this.diffScopedToProject) {
                const tab = await this.scanSingleProjectWithChanges(preferred);
                this.diffProjectTabs = tab ? [tab] : [];
            } else {
                this.diffProjectTabs = await this.scanProjectsWithChanges();
            }
            const pick = (preferred && this.diffProjectTabs.some(t => t.projectId === preferred))
                ? preferred
                : this.diffProjectTabs.find(t => t.isActiveWorkspace)?.projectId
                ?? this.diffProjectTabs[0]?.projectId;
            this.diffActiveProjectId = pick;
        } finally {
            this.diffScanning = false;
            this.renderHeader();
            this.renderSubtitle();
            this.renderDiffHubView();
        }
    }

    protected async scanSingleProjectWithChanges(preferredProjectId?: string): Promise<QaapDiffProjectTab | undefined> {
        const projects = this.projects.length > 0 ? this.projects : await this.projectsService.loadProjects();
        const project = (preferredProjectId
            ? projects.find(p => p.id === preferredProjectId)
            : undefined)
            ?? projects.find(p => p.isCurrent)
            ?? projects[0];
        if (!project) {
            return undefined;
        }
        const cwd = this.projectsService.getProjectCwd(project);
        if (!cwd) {
            return undefined;
        }
        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        try {
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                return undefined;
            }
            const body = await response.json() as { files?: QaapGitChangedFile[] };
            const files = body.files ?? [];
            return {
                projectId: project.id,
                label: project.name,
                rootUri,
                rootFsPath: cwd,
                isActiveWorkspace: project.isCurrent,
                fileCount: files.length,
            };
        } catch {
            return undefined;
        }
    }

    protected async scanProjectsWithChanges(): Promise<QaapDiffProjectTab[]> {
        const tabs: QaapDiffProjectTab[] = [];
        const projects = this.projects.length > 0 ? this.projects : await this.projectsService.loadProjects();
        await Promise.all(projects.map(async project => {
            const cwd = this.projectsService.getProjectCwd(project);
            if (!cwd) {
                return;
            }
            const rootUri = project.uri?.toString() ?? `file://${cwd}`;
            try {
                const response = await fetch(
                    `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                    { credentials: 'include' },
                );
                if (!response.ok) {
                    return;
                }
                const body = await response.json() as { files?: QaapGitChangedFile[] };
                const files = body.files ?? [];
                if (files.length === 0) {
                    return;
                }
                tabs.push({
                    projectId: project.id,
                    label: project.name,
                    rootUri,
                    rootFsPath: cwd,
                    isActiveWorkspace: project.isCurrent,
                    fileCount: files.length,
                });
            } catch {
                /* skip unreachable repos */
            }
        }));
        tabs.sort((a, b) => {
            if (a.isActiveWorkspace !== b.isActiveWorkspace) {
                return a.isActiveWorkspace ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });
        return tabs;
    }

    protected async mountDiffReviewWidget(): Promise<void> {
        if (!this.createDiffReviewWidget) {
            return;
        }
        const tab = this.diffProjectTabs.find(t => t.projectId === this.diffActiveProjectId)
            ?? this.diffProjectTabs[0];
        if (!tab) {
            return;
        }
        this.diffActiveProjectId = tab.projectId;
        if (!this.diffReviewWidget) {
            this.diffReviewWidget = await this.createDiffReviewWidget();
            this.diffReviewWidget.node.classList.add('theia-mobile-projects-diff-embed');
        }
        this.diffReviewWidget.enableWorkHubEmbed();
        this.diffReviewWidget.setTranscriptAgentFeedbackHandler(undefined);
        this.diffReviewWidget.setReviewStatsChangeHandler(undefined);
        this.attachDiffReviewWidget(this.diffWidgetHost);
        await this.applyDiffTabToWidget(tab);
    }

    protected async applyDiffTabToWidget(tab: QaapDiffProjectTab): Promise<void> {
        if (!this.diffReviewWidget) {
            return;
        }
        const context: QaapDiffReviewRepositoryContext = {
            rootUri: tab.rootUri,
            rootFsPath: tab.rootFsPath,
            isActiveWorkspace: tab.isActiveWorkspace,
        };
        this.diffReviewWidget.setRepositoryContext(context);
    }

    protected detachDiffReviewWidget(): void {
        this.detachDiffReviewWidgetFromHost();
    }

    protected attachDiffReviewWidget(host: HTMLElement): void {
        const widget = this.diffReviewWidget;
        if (!widget || !host.isConnected) {
            return;
        }
        if (!widget.isAttached) {
            UnsafeWidgetUtilities.attach(widget, host);
        } else if (widget.node.parentElement !== host) {
            host.appendChild(widget.node);
        }
    }

    protected detachDiffReviewWidgetFromHost(): void {
        const widget = this.diffReviewWidget;
        if (!widget?.isAttached) {
            widget?.node.remove();
            return;
        }
        if (widget.node.parentElement) {
            UnsafeWidgetUtilities.detach(widget);
        }
    }

    protected resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined {
        if (this.shouldUseAgentsHubLanding()) {
            return this.resolveHomePinnedProject();
        }
        return this.resolveSelectedProject(projects);
    }


    /** Sidebar drill-downs (Routines, overview, workflows) when Agents is the default shell. */
    protected isSidebarSecondaryHubView(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.homeMode
            && (this.hubView === 'routines' || this.hubView === 'home' || this.hubView === 'workflows');
    }

    protected navigateBackFromSidebarSecondaryHub(): void {
        this.closeRoutineEditor();
        this.selectHubLandingView('tasks');
    }


    protected resolveSelectedProject(
        projects: MobileProjectEntry[] = this.projectsForCurrentHubList(),
    ): MobileProjectEntry | undefined {
        if (this.expandedId === undefined) {
            return undefined;
        }
        return projects.find(p => p.id === this.expandedId)
            ?? this.projects.find(p => p.id === this.expandedId);
    }

    protected createProjectDetailView(project: MobileProjectEntry): HTMLElement {
        if (this.projectDetailExpandedId !== project.id) {
            this.projectDetailExpandedId = project.id;
        }

        const activeTab = this.executionSurfaceTabForProject(project);
        const detail = document.createElement('div');
        detail.className = 'theia-mobile-projects-detail theia-mod-surfaces';
        detail.style.setProperty('--qaap-mobile-project-accent', project.color);

        const summary = this.projectDetailSurfaceSummary(project);

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-detail-surfaces-body';

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-project-detail-panel theia-mobile-project-detail-chat';
        const activeInfo = this.activeInfoForProject(project);
        chatHost.append(this.createTaskBlock(project, activeInfo));
        chatHost.hidden = activeTab !== 'messages';

        const planHost = document.createElement('div');
        planHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-plan';
        planHost.hidden = activeTab !== 'plan';

        const reviewHost = document.createElement('div');
        reviewHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-review';
        reviewHost.hidden = activeTab !== 'review';

        const previewHost = document.createElement('div');
        previewHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-preview';
        previewHost.hidden = activeTab !== 'preview';

        const filesHost = document.createElement('div');
        filesHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-files-host';
        filesHost.hidden = activeTab !== 'files';

        const terminalHost = document.createElement('div');
        terminalHost.className = 'theia-mobile-project-detail-panel theia-mobile-transcript-terminal-host';
        terminalHost.hidden = activeTab !== 'terminal';

        body.append(chatHost, planHost, reviewHost, previewHost, filesHost, terminalHost);
        detail.append(body);

        this.projectDetailSurfaceTargets = {
            chatHost,
            planHost,
            reviewHost,
            previewHost,
            filesHost,
            terminalHost,
        };
        this.mountProjectDetailSurfaceTab(project, summary, activeTab);
        return detail;
    }

    /** Synthetic conversation scope for project-level Files/Terminal/Preview surfaces. */
    protected projectDetailSurfaceSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        const cwd = this.projectsService.getProjectCwd(project)
            ?? this.preparedCwdByProjectId.get(project.id)
            ?? '';
        return {
            id: `__project__:${project.id}`,
            source: 'theia-chat',
            cwd,
            agentId: '',
            title: project.name,
            status: 'idle',
            createdAt: 0,
            updatedAt: 0,
            messageCount: 0,
        };
    }

    protected selectProjectDetailTab(tab: TranscriptTab, project: MobileProjectEntry): void {
        if (this.agentsHubShellActive) {
            this.selectTranscriptTab(tab, project, this.resolveAgentsHubShellSummary(project));
            return;
        }
        this.activateExecutionSurfaceTab(tab, project, this.projectDetailSurfaceSummary(project), 'project-detail');
    }


    /**
     * Single tab switch: hide every execution surface, show only the chosen one, then mount its content.
     */

    /**
     * Header back: leave Plan/Files/etc. for Chat before closing the project or transcript sheet.
     */


    protected readonly transcriptSurfacesUi = new MobileProjectsTranscriptSurfacesUi(this as unknown as MobileProjectsTranscriptSurfacesHost);

    protected mountProjectDetailSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        this.transcriptSurfacesUi.mountProjectDetailSurfaceTab(project, summary, tab);
    }

    protected renderPlanTab(host: HTMLElement | undefined, conv: QaapAgentConversationDTO | undefined): void {
        this.transcriptSurfacesUi.renderPlanTab(host, conv);
    }

    protected updateTranscriptHeader(
        project: MobileProjectEntry,
        summary = this.transcriptOpenSummary,
    ): void {
        this.transcriptSurfacesUi.updateTranscriptHeader(project, summary);
    }

    protected async mountTranscriptReviewWidget(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptSurfacesUi.mountTranscriptReviewWidget(project, summary);
    }

    protected detachTranscriptReviewWidget(): void {
        this.transcriptSurfacesUi.detachTranscriptReviewWidget();
    }

    protected disposeTranscriptEmbeddedPreview(): void {
        this.transcriptSurfacesUi.disposeTranscriptEmbeddedPreview();
    }

    protected renderPreviewTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        this.transcriptSurfacesUi.renderPreviewTab(project, summary);
    }

    protected ensureTranscriptFilesTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        this.transcriptSurfacesUi.ensureTranscriptFilesTab(project, summary);
    }

    protected async ensureTranscriptTerminalTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptSurfacesUi.ensureTranscriptTerminalTab(project, summary);
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
        if (!this.pickContextVariable) {
            return;
        }
        const variables = await this.pickContextVariable(anchor, this.createStickyComposerAttachHandlers());
        if (variables.length === 0) {
            return;
        }
        for (const request of variables) {
            this.stickyComposerContext.push(createComposerContextEntry(request));
        }
        this.renderStickyComposer();
    }

    protected createStickyComposerAttachHandlers(): MobileComposerAttachHandlers {
        return {
            appendOptimistic: entry => {
                this.stickyComposerContext.push(entry);
                this.renderStickyComposer();
            },
            finalizeOptimistic: (id, request) => {
                const entry = this.stickyComposerContext.find(item => item.id === id);
                if (!entry) {
                    return;
                }
                revokeComposerContextPreview(entry);
                entry.request = request;
                entry.pending = false;
                entry.localPreviewSrc = undefined;
                entry.displayName = undefined;
                this.renderStickyComposer();
            },
            removeOptimistic: id => {
                const index = this.stickyComposerContext.findIndex(item => item.id === id);
                if (index < 0) {
                    return;
                }
                revokeComposerContextPreview(this.stickyComposerContext[index]);
                this.stickyComposerContext.splice(index, 1);
                this.renderStickyComposer();
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/stickyComposerAttachDeviceFailed',
                        'Could not attach files from this device.',
                    ),
                    { kind: 'warning', duration: 2800 },
                );
            },
        };
    }

    protected createTranscriptComposerAttachHandlers(): MobileComposerAttachHandlers {
        return {
            appendOptimistic: entry => {
                this.transcriptComposerContext.push(entry);
                this.remountTranscriptStickyComposer();
            },
            finalizeOptimistic: (id, request) => {
                const entry = this.transcriptComposerContext.find(item => item.id === id);
                if (!entry) {
                    return;
                }
                revokeComposerContextPreview(entry);
                entry.request = request;
                entry.pending = false;
                entry.localPreviewSrc = undefined;
                entry.displayName = undefined;
                this.remountTranscriptStickyComposer();
            },
            removeOptimistic: id => {
                const index = this.transcriptComposerContext.findIndex(item => item.id === id);
                if (index < 0) {
                    return;
                }
                revokeComposerContextPreview(this.transcriptComposerContext[index]);
                this.transcriptComposerContext.splice(index, 1);
                this.remountTranscriptStickyComposer();
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/stickyComposerAttachDeviceFailed',
                        'Could not attach files from this device.',
                    ),
                    { kind: 'warning', duration: 2800 },
                );
            },
        };
    }

    protected hasPendingComposerAttachments(): boolean {
        return hasPendingComposerContextEntries(this.stickyComposerContext)
            || hasPendingComposerContextEntries(this.transcriptComposerContext);
    }

    protected notifyPendingComposerAttachments(): void {
        MobileSnackbar.show(
            nls.localize(
                'qaap/mobileProjects/stickyComposerAttachmentsPending',
                'Wait for attachments to finish preparing before sending.',
            ),
            { kind: 'warning', duration: 2600 },
        );
    }

    protected renderStickyComposer(): void {
        this.stickyComposerContextUsageDispose.dispose();
        const filtered = this.applySearch(this.applyFilter(this.projects, this.filter));
        const project = this.resolveStickyComposerProject(filtered);
        if (this.agentsHubShellActive) {
            const shellProject = this.resolveAgentsHubShellProject();
            const shellSummary = shellProject ? this.resolveAgentsHubShellSummary(shellProject) : undefined;
            const chatHost = this.agentsHubInlineChatHost ?? this.transcriptChatHost;
            const showMessagesComposer = shellProject
                ? this.executionSurfaceTabForProject(shellProject) === 'messages'
                : false;
            const showComposer = !!(shellProject && shellSummary && chatHost?.isConnected && showMessagesComposer);
            this.stickyComposerHost.hidden = !showComposer;
            this.root.classList.toggle('theia-mod-sticky-composer', showComposer);
            if (showComposer) {
                const mountKey = `${shellProject!.id}|${shellSummary!.id}`;
                const composerStable = this.transcriptComposerMountKey === mountKey
                    && this.transcriptComposerHost === this.stickyComposerHost
                    && this.stickyComposerHost.childElementCount > 0;
                if (!composerStable) {
                    this.stickyComposerHost.replaceChildren();
                    if (this.transcriptComposerBackendAgents.length === 0) {
                        void this.refreshTranscriptComposerAgents(shellProject!);
                    }
                    this.mountTranscriptStickyComposer(this.stickyComposerHost, shellProject!, shellSummary!, chatHost!);
                } else {
                    this.transcriptComposerSendRefresh?.();
                }
            } else {
                this.transcriptComposerMountKey = undefined;
                this.stickyComposerHost.replaceChildren();
            }
            this.syncHeaderComposerSurfacePicker();
            this.updateNewFabVisibility();
            window.requestAnimationFrame(() => this.updateStickyComposerFabLift());
            return;
        }
        this.transcriptComposerMountKey = undefined;
        this.stickyComposerHost.replaceChildren();
        const showReposComposer = this.homeMode && !!this.conversations && !!project && this.hubView === 'repos';
        const showSurface = showReposComposer;
        const showComposer = showSurface
            && (!this.isProjectDetailView() || (project && this.executionSurfaceTabForProject(project) === 'messages'));
        this.stickyComposerHost.hidden = !showComposer;
        this.root.classList.toggle('theia-mod-sticky-composer', showComposer);
        if (!showSurface || !project) {
            this.closeStickyComposerSheets();
            return;
        }

        void this.refreshStickyComposerAgents(project);

        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        this.stickyComposerSurface = 'task';
        const isChatSurface = false;
        const canRunTask = !!project && (!!cwd || !!project.github);
        const canRunChat = !!this.chatService && !!project;
        const canSubmit = isChatSurface ? canRunChat : canRunTask;
        const pinnedId = this.resolveStickyComposerPinnedAgentId(project);
        const modes = resolveStickyComposerModes(pinnedId, this.chatAgentService);
        this.stickyComposerModeId = reconcileComposerModeId(
            this.stickyComposerModeId,
            modes,
            cwd,
        );
        const showApprovalPolicy = agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.stickyComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.stickyComposerApprovalPolicyId,
                cwd,
            );
            this.stickyComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                this.stickyComposerApprovalPolicyId,
                cwd,
                this.stickyComposerToolApprovalRules,
            );
        } else {
            this.stickyComposerApprovalPolicyId = undefined;
            this.stickyComposerToolApprovalRules = undefined;
        }

        const column = this.buildStickyComposerColumn({
            project,
            surface: this.stickyComposerSurface,
            agentLocked: isChatSurface,
            getContext: () => this.stickyComposerContext,
            clearContext: () => {
                disposeComposerContextEntries(this.stickyComposerContext);
                this.stickyComposerContext = [];
                this.renderStickyComposer();
            },
            removeContextItem: index => {
                revokeComposerContextPreview(this.stickyComposerContext[index]);
                this.stickyComposerContext.splice(index, 1);
                this.renderStickyComposer();
            },
            formatContextChip: item => this.formatComposerContextEntry(item),
            filesExpanded: this.stickyComposerFilesExpanded,
            onFilesExpandedChange: expanded => { this.stickyComposerFilesExpanded = expanded; },
            getDraft: () => this.stickyComposerDraft,
            setDraft: value => { this.stickyComposerDraft = value; },
            resolveAgentLabel: () => this.resolveStickyComposerAgentLabel(project),
            resolveAgentId: () => this.resolveStickyComposerPinnedAgentId(project),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.stickyComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? () => { this.openStickyComposerModeSheet(project, modes); }
                : undefined,
            approvalPolicyId: showApprovalPolicy ? this.stickyComposerApprovalPolicyId : undefined,
            onOpenApprovalPolicySheet: showApprovalPolicy
                ? () => {
                    this.openStickyComposerApprovalPolicySheet(
                        project,
                        this.resolveStickyComposerAgentLabel(project),
                    );
                }
                : undefined,
            canSubmit,
            onAttach: anchor => { void this.onStickyComposerAttach(project, anchor); },
            onOpenAgentSheet: isChatSurface ? () => { /* Chat is Coder-only */ } : () => { this.openStickyComposerAgentSheet(project); },
            onSubmit: draft => {
                if (this.hasPendingComposerAttachments()) {
                    this.notifyPendingComposerAttachments();
                    return;
                }
                const resolvedPinnedId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : this.resolveStickyComposerPinnedAgentId(project);
                const selectedAgentId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : resolveExplicitAgentForSubmit(draft, {
                        pinnedChatAgentId: resolvedPinnedId,
                    }) ?? resolvedPinnedId;
                const variables = composerContextRequests(this.stickyComposerContext);
                const modeId = this.stickyComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.stickyComposerApprovalPolicyId,
                    cwd,
                );
                disposeComposerContextEntries(this.stickyComposerContext);
                this.stickyComposerContext = [];
                const submitOptions = {
                    openConversation: isChatSurface,
                    selectedAgentId,
                    modeId,
                    variables: variables.length > 0 ? variables : undefined,
                    autoApprove,
                };
                const done = this.submitBackgroundAgentTask(project, draft, {
                    ...submitOptions,
                    openConversation: false,
                    forceVps: true,
                    approvalPolicyId: showApprovalPolicy
                        ? reconcileAgentApprovalPolicyId(this.stickyComposerApprovalPolicyId, cwd)
                        : undefined,
                });
                void done.finally(() => this.renderStickyComposer());
            },
            onSubmitBlocked: () => {
                if (this.hasPendingComposerAttachments()) {
                    this.notifyPendingComposerAttachments();
                    return;
                }
                if (isChatSurface && !this.chatService) {
                    MobileSnackbar.show(
                        nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'),
                        { duration: 2400 },
                    );
                    return;
                }
                MobileSnackbar.show(
                    isChatSurface
                        ? nls.localize('qaap/mobileProjects/stickyComposerNoChat', 'Open this project in the workspace to start a local chat.')
                        : nls.localize('qaap/mobileProjects/stickyComposerNoProject', 'Add or open a repository first.'),
                    { duration: 2400 },
                );
            },
            afterInputChange: () => { /* sticky draft persisted in setDraft */ },
            getMentionOptions: () => this.resolveComposerMentionOptions(this.stickyComposerBackendAgents, isChatSurface),
            getVariableOptions: this.getComposerVariables
                ? () => this.resolveComposerVariableOptions()
                : undefined,
            inputPlaceholder: isChatSurface
                ? nls.localize('qaap/mobileProjects/stickyComposerNewChat', 'Message the workspace agent…')
                : nls.localize('qaap/mobileProjects/stickyComposerNewTask', 'Delegate a task…'),
            sendLabel: isChatSurface
                ? nls.localize('qaap/mobileProjects/chatSend', 'Send')
                : nls.localize('qaap/mobileProjects/taskCreate', 'Create'),
            onContextUsageBadgeMounted: badge => {
                this.stickyComposerContextUsageDispose = this.mountStickyComposerContextUsage(
                    badge,
                    () => isChatSurface
                        ? (() => {
                            const chatModel = this.resolveProjectTheiaChatModel(project);
                            return chatModel ? { chatModel } : undefined;
                        })()
                        : undefined,
                );
            },
            showWorkspaceBar: this.shouldShowComposerWorkspaceBar(),
        });
        const modeHint = describeComposerInteractionMode(this.stickyComposerModeId);
        if (modeHint) {
            const modeBanner = document.createElement('div');
            modeBanner.className = 'theia-mobile-sticky-composer-mode-banner';
            modeBanner.textContent = modeHint;
            this.stickyComposerHost.append(modeBanner);
        }
        this.stickyComposerHost.append(column);
        this.syncHeaderComposerSurfacePicker();
        this.updateNewFabVisibility();
        window.requestAnimationFrame(() => this.updateStickyComposerFabLift());
    }

    protected composerSurfaceSegmentOptions(): Array<{ id: QaapComposerSurface; label: string; iconClass: string }> {
        return [
            {
                id: 'chat',
                label: nls.localize('qaap/composerSurface/chat', 'Chat'),
                iconClass: 'codicon-comment-discussion',
            },
            {
                id: 'task',
                label: nls.localize('qaap/composerSurface/task', 'Task'),
                iconClass: 'codicon-server-process',
            },
        ];
    }

    protected shouldShowHeaderComposerSurfacePicker(): boolean {
        // The local Chat surface was removed; only the agentic Task surface remains, so the
        // Chat/Task segmented picker is never shown.
        return false;
    }

    protected syncHeaderComposerSurfacePicker(): void {
        const show = this.shouldShowHeaderComposerSurfacePicker();
        const hideAccount = show || this.isProjectDetailView();
        setMobileWorkHubComposerHeaderChrome(show);
        if (!hideAccount) {
            this.syncAgentsHubAccountChrome();
        } else {
            this.accountBtn.hidden = true;
            this.accountBtn.style.display = 'none';
            this.accountBtn.setAttribute('aria-hidden', 'true');
            dismissQaapAccountMenu();
        }
        this.headerSurfacePickerHost.hidden = !show;
        if (!show) {
            this.headerSurfacePickerHost.replaceChildren();
            this.headerSurfacePicker = undefined;
            return;
        }
        const sticky = this.isProjectDetailView();
        const value = sticky ? this.stickyComposerSurface : this.tasksHubSurface;
        if (!this.headerSurfacePicker) {
            const field = createSegmentedField<QaapComposerSurface>({
                segments: this.composerSurfaceSegmentOptions(),
                value,
                iconOnly: true,
                onChange: surface => { this.onHeaderComposerSurfaceChange(surface); },
            });
            field.root.classList.add('theia-mod-header-surface');
            this.headerSurfacePicker = field;
            this.headerSurfacePickerHost.append(field.root);
        } else {
            this.headerSurfacePicker.setValue(value);
        }
    }

    protected onHeaderComposerSurfaceChange(surface: QaapComposerSurface): void {
        if (this.isProjectDetailView()) {
            const filtered = this.applySearch(this.applyFilter(this.projects, this.filter));
            const project = this.resolveStickyComposerProject(filtered);
            const cwd = project
                ? (this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id))
                : undefined;
            this.stickyComposerSurface = surface;
            writeStoredComposerSurface(cwd, surface);
            if (surface === 'chat') {
                this.pinStickyComposerToQaiq(cwd);
            }
            this.renderStickyComposer();
            this.renderList();
            return;
        }
        if (this.isTasksHubView()) {
            this.tasksHubSurface = surface;
            writeStoredComposerSurface(undefined, surface);
            this.renderList();
            this.renderSubtitle();
            this.syncHeaderComposerSurfacePicker();
        }
    }

    protected updateStickyComposerFabLift(): void {
        const composerVisible = this.root.classList.contains('theia-mod-sticky-composer')
            && !this.stickyComposerHost.hidden
            && this.stickyComposerHost.offsetHeight > 0;
        if (composerVisible) {
            const lift = this.stickyComposerHost.offsetHeight;
            this.stickyComposerFabLiftPx = lift;
            this.root.style.setProperty('--theia-mobile-projects-fab-lift', `${lift}px`);
            return;
        }
        this.stickyComposerFabLiftPx = 0;
        this.root.style.setProperty('--theia-mobile-projects-fab-lift', '0px');
    }

    protected mountStickyComposerContextUsage(
        badge: HTMLElement,
        resolveTarget: () => {
            readonly summary?: QaapAgentConversationSummaryDTO;
            readonly chatModel?: ChatModel;
            readonly full?: QaapAgentConversationDTO;
        } | undefined,
    ): Disposable {
        const enabled = isContextUsageIndicatorEnabled(this.readPreference);
        const thresholdPercent = resolveContextUsageWarningThresholdPercentage(this.readPreference);
        const theiaThreshold = resolveContextUsageWarningThreshold(this.readPreference);
        return bindContextUsageIndicator(
            badge,
            () => {
                const target = resolveTarget();
                if (target?.chatModel) {
                    return resolveContextUsageIndicatorState(target.chatModel, {
                        enabled,
                        threshold: theiaThreshold,
                        showWhenEmpty: true,
                    });
                }
                return resolveVpsContextUsageIndicatorState(target?.summary, {
                    enabled,
                    threshold: theiaThreshold,
                    showWhenEmpty: true,
                    thresholdPercentBasis: thresholdPercent,
                }, target?.full);
            },
            onRefresh => {
                const disposables = new DisposableCollection();
                if (this.conversations) {
                    disposables.push(this.conversations.onDidChange(onRefresh));
                }
                const model = resolveTarget()?.chatModel;
                if (model) {
                    disposables.push(model.onDidChange(onRefresh));
                }
                return disposables;
            },
        );
    }

    protected resolveTranscriptContextUsageTarget(
        summary: QaapAgentConversationSummaryDTO,
    ): {
        readonly summary?: QaapAgentConversationSummaryDTO;
        readonly chatModel?: ChatModel;
        readonly full?: QaapAgentConversationDTO;
    } {
        if (summary.source === 'theia-chat') {
            const chatModel = this.resolveTranscriptTheiaChatModel(summary);
            return chatModel ? { chatModel } : {};
        }
        const cwd = summary.cwd;
        const live = this.conversations?.getConversationsForCwd(cwd).find(c => c.id === summary.id) ?? summary;
        if (this.transcriptLastConv?.id === summary.id) {
            const effectiveStatus = resolveTranscriptEffectiveStatus(this.transcriptLastConv);
            return {
                summary: { ...live, status: effectiveStatus },
                full: this.transcriptLastConv,
            };
        }
        return { summary: live };
    }

    protected resolveTranscriptTheiaChatModel(summary: QaapAgentConversationSummaryDTO): ChatModel | undefined {
        if (summary.source !== 'theia-chat' || !summary.sessionId || !this.chatService) {
            return undefined;
        }
        return this.chatService.getSession(summary.sessionId)?.model;
    }

    protected resolveProjectTheiaChatModel(project: MobileProjectEntry): ChatModel | undefined {
        if (!this.chatService) {
            return undefined;
        }
        const summaries = this.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
        for (let i = summaries.length - 1; i >= 0; i--) {
            const sessionId = summaries[i].sessionId;
            if (!sessionId) {
                continue;
            }
            const model = this.chatService.getSession(sessionId)?.model;
            if (model) {
                return model;
            }
        }
        return undefined;
    }

    protected shouldShowComposerWorkspaceBar(_summary?: QaapAgentConversationSummaryDTO): boolean {
        return true;
    }

    protected resolveComposerWorkspaceBranch(project: MobileProjectEntry): string {
        return this.composerWorkspaceBranchByProjectId.get(project.id)
            ?? project.branch
            ?? this.projectsService.getCurrentWorkspaceBranch()
            ?? 'main';
    }

    protected async refreshComposerWorkspaceBranch(project: MobileProjectEntry): Promise<string> {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            return this.resolveComposerWorkspaceBranch(project);
        }
        try {
            const params = new URLSearchParams({ root: cwd });
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/changes?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                return this.resolveComposerWorkspaceBranch(project);
            }
            const payload = await response.json() as { branch?: string };
            if (payload.branch) {
                this.composerWorkspaceBranchByProjectId.set(project.id, payload.branch);
                return payload.branch;
            }
        } catch {
            /* optional */
        }
        return this.resolveComposerWorkspaceBranch(project);
    }

    protected resolveComposerWorkspaceBarView(project: MobileProjectEntry): StickyComposerWorkspaceBarView {
        return {
            projectName: project.name,
            branchName: this.resolveComposerWorkspaceBranch(project),
        };
    }

    protected remountComposerWithWorkspaceBar(project: MobileProjectEntry): void {
        if (this.transcriptComposerHost?.isConnected && this.transcriptComposerProject && this.transcriptComposerSummary) {
            this.remountTranscriptStickyComposer();
            return;
        }
        this.renderStickyComposer();
        void this.refreshComposerWorkspaceBranch(project).then(() => {
            if (this.transcriptComposerHost?.isConnected) {
                this.remountTranscriptStickyComposer();
            } else {
                this.renderStickyComposer();
            }
        });
    }

    protected openComposerWorkspaceProjectSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.closeStickyComposerSheets();
        this.closeTranscriptComposerSheets();
        const sheet = document.createElement('div');
        sheet.className = transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-workspace theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-workspace';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/composerWorkspace/projectSheetTitle', 'Project');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        const label = document.createElement('div');
        label.className = 'theia-mobile-sticky-composer-sheet-section-label';
        label.textContent = nls.localize('qaap/composerWorkspace/projectSheetSection', 'Repository');
        list.append(label);

        for (const entry of this.projects) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-sticky-composer-sheet-option';
            if (entry.id === project.id) {
                btn.classList.add('theia-mod-selected');
            }
            const content = document.createElement('span');
            content.className = 'theia-mobile-sticky-composer-sheet-option-content';
            const name = document.createElement('span');
            name.className = 'theia-mobile-sticky-composer-sheet-option-label';
            name.textContent = entry.name;
            content.append(name);
            if (entry.id === project.id) {
                const check = document.createElement('span');
                check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
                check.setAttribute('aria-hidden', 'true');
                content.append(check);
            }
            btn.append(content);
            btn.addEventListener('click', () => {
                this.closeStickyComposerSheets();
                if (entry.id === project.id) {
                    return;
                }
                this.agentsHubSelectedProjectId = entry.id;
                void this.projectsService.prepareProjectCwd(entry).then(cwd => {
                    if (cwd) {
                        this.preparedCwdByProjectId.set(entry.id, cwd);
                    }
                    if (this.agentsHubShellActive) {
                        this.renderAgentsHubExecutionShell();
                        return;
                    }
                    if (entry.isCurrent) {
                        this.remountComposerWithWorkspaceBar(entry);
                        return;
                    }
                    void this.openProject(entry);
                });
            });
            list.append(btn);
        }

        const actionsLabel = document.createElement('div');
        actionsLabel.className = 'theia-mobile-sticky-composer-sheet-section-label';
        actionsLabel.textContent = nls.localize('qaap/composerWorkspace/projectSheetActions', 'Add');
        list.append(actionsLabel);
        list.append(this.createComposerProjectSheetAction({
            iconClass: 'codicon-repo-clone',
            label: nls.localize('qaap/mobileProjects/newRepository', 'Add repository'),
            onSelect: () => {
                this.closeStickyComposerSheets();
                void this.onNewClick();
            },
        }));
        list.append(this.createComposerProjectSheetAction({
            iconClass: 'codicon-add',
            label: nls.localize('qaap/mobileOpenRepo/startNewProject', 'Start new project'),
            onSelect: () => {
                this.closeStickyComposerSheets();
                void this.onCreateNewProjectFromSheet();
            },
        }));

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerWorkspaceSheet = sheet;
    }

    protected createComposerProjectSheetAction(options: {
        readonly iconClass: string;
        readonly label: string;
        readonly onSelect: () => void;
    }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-sticky-composer-sheet-option theia-mod-action';
        const content = document.createElement('span');
        content.className = 'theia-mobile-sticky-composer-sheet-option-content';
        const icon = document.createElement('span');
        icon.className = `codicon ${options.iconClass} theia-mobile-sticky-composer-sheet-option-icon`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-sticky-composer-sheet-option-label';
        label.textContent = options.label;
        content.append(icon, label);
        btn.append(content);
        btn.addEventListener('click', () => options.onSelect());
        return btn;
    }

    protected async onCreateNewProjectFromSheet(): Promise<void> {
        const nextProjects = await this.projectsService.createGithubProject();
        if (!nextProjects) {
            return;
        }
        this.projects = nextProjects;
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected openComposerWorkspaceBranchSheet(project: MobileProjectEntry, transcriptOverlay = false): void {
        this.closeStickyComposerSheets();
        this.closeTranscriptComposerSheets();
        const sheet = document.createElement('div');
        sheet.className = transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-workspace theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-workspace';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/composerWorkspace/branchSheetTitle', 'Branch');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        const loading = document.createElement('p');
        loading.className = 'theia-mobile-sticky-composer-sheet-loading';
        loading.textContent = nls.localize('qaap/composerWorkspace/branchLoading', 'Loading branches…');
        list.append(loading);

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerWorkspaceSheet = sheet;

        void this.loadComposerWorkspaceBranchSheet(project, list);
    }

    protected async loadComposerWorkspaceBranchSheet(
        project: MobileProjectEntry,
        list: HTMLElement,
    ): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            list.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-sticky-composer-sheet-loading';
            empty.textContent = nls.localize(
                'qaap/composerWorkspace/branchUnavailable',
                'Open this project in the workspace to switch branches.',
            );
            list.append(empty);
            return;
        }
        try {
            const params = new URLSearchParams({ root: cwd });
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/branches?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as QaapGitBranchesResponse;
            if (this.stickyComposerWorkspaceSheet === undefined || !list.isConnected) {
                return;
            }
            const current = payload.current ?? this.resolveComposerWorkspaceBranch(project);
            list.replaceChildren();
            if (payload.branches.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'theia-mobile-sticky-composer-sheet-loading';
                empty.textContent = nls.localize('qaap/composerWorkspace/branchEmpty', 'No local branches found.');
                list.append(empty);
                return;
            }
            for (const branch of payload.branches) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'theia-mobile-sticky-composer-sheet-option';
                if (branch === current) {
                    btn.classList.add('theia-mod-selected');
                }
                const content = document.createElement('span');
                content.className = 'theia-mobile-sticky-composer-sheet-option-content';
                const label = document.createElement('span');
                label.className = 'theia-mobile-sticky-composer-sheet-option-label';
                label.textContent = branch;
                content.append(label);
                if (branch === current) {
                    const check = document.createElement('span');
                    check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
                    check.setAttribute('aria-hidden', 'true');
                    content.append(check);
                }
                btn.append(content);
                btn.addEventListener('click', () => {
                    void this.checkoutComposerWorkspaceBranch(project, branch);
                });
                list.append(btn);
            }
        } catch (error) {
            list.replaceChildren();
            const failed = document.createElement('p');
            failed.className = 'theia-mobile-sticky-composer-sheet-loading';
            failed.textContent = error instanceof Error ? error.message : String(error);
            list.append(failed);
        }
    }

    protected async checkoutComposerWorkspaceBranch(
        project: MobileProjectEntry,
        branch: string,
    ): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            return;
        }
        try {
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root: cwd, branch }),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as { branch?: string };
            if (payload.branch) {
                this.composerWorkspaceBranchByProjectId.set(project.id, payload.branch);
            }
            this.closeStickyComposerSheets();
            this.remountComposerWithWorkspaceBar(project);
            MobileSnackbar.show(
                nls.localize('qaap/composerWorkspace/branchSwitched', 'Switched to {0}', payload.branch ?? branch),
                { kind: 'success', duration: 1600 },
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            MobileSnackbar.show(
                nls.localize('qaap/composerWorkspace/branchSwitchFailed', 'Could not switch branch: {0}', detail),
                { kind: 'warning', duration: 2600 },
            );
        }
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
        const column = document.createElement('div');
        column.className = 'theia-mobile-projects-sticky-composer-column';
        const contextItems = options.getContext();
        if (contextItems.length > 0) {
            column.classList.add('theia-mod-has-context');
        }

        if (options.surface) {
            column.classList.add(`theia-mod-surface-${options.surface}`);
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-projects-sticky-composer-toolbar';

        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-sticky-composer-inner';

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.className = 'theia-mobile-projects-sticky-composer-attach';
        const attachLabel = nls.localize('theia/ai/chat-ui/attachToContext', 'Attach elements to context');
        attachBtn.title = attachLabel;
        attachBtn.setAttribute('aria-label', attachLabel);
        attachBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        attachBtn.setAttribute('aria-haspopup', 'menu');
        attachBtn.setAttribute('aria-expanded', 'false');
        if (contextItems.length > 0) {
            attachBtn.classList.add('theia-mod-has-context');
        }
        attachBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onAttach(attachBtn);
        });

        const controlsLeftItems: HTMLElement[] = [attachBtn];
        if (options.approvalPolicyId && options.onOpenApprovalPolicySheet) {
            const approvalPolicy = resolveAgentApprovalPolicyOption(options.approvalPolicyId);
            const approvalBtn = document.createElement('button');
            approvalBtn.type = 'button';
            approvalBtn.className = 'theia-mobile-projects-sticky-composer-approval-policy';
            approvalBtn.title = nls.localize(
                'qaap/mobileProjects/stickyComposerApprovalPolicy',
                'Approval policy: {0}',
                approvalPolicy.label,
            );
            approvalBtn.setAttribute('aria-label', approvalBtn.title);
            approvalBtn.setAttribute('aria-haspopup', 'dialog');
            populateApprovalPolicyToolbarButton(approvalBtn, approvalPolicy);
            approvalBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                options.onOpenApprovalPolicySheet!();
            });
            controlsLeftItems.push(approvalBtn);
        }

        const agentBtn = document.createElement('button');
        agentBtn.type = 'button';
        agentBtn.className = 'theia-mobile-projects-sticky-composer-agent';
        const agentLabel = options.resolveAgentLabel();
        const agentId = options.resolveAgentId();
        const modelLabel = this.resolveStickyComposerModelLabel(agentId, options.project);
        agentBtn.title = modelLabel
            ? nls.localize('qaap/mobileProjects/stickyComposerAgentWithModel', 'Agent: {0}, model: {1}', agentLabel, modelLabel)
            : nls.localize('qaap/mobileProjects/stickyComposerAgent', 'Agent: {0}', agentLabel);
        agentBtn.setAttribute('aria-label', agentBtn.title);
        populateAgentToolbarButton(agentBtn, {
            agentId,
            label: agentLabel,
            modelLabel,
        });
        if (options.agentLocked) {
            agentBtn.classList.add('theia-mod-locked');
            agentBtn.disabled = true;
        } else {
            agentBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                options.onOpenAgentSheet();
            });
        }

        const toolbarItems: HTMLElement[] = [agentBtn];
        const modes = options.modes ?? [];
        let modeBtn: HTMLButtonElement | undefined;
        if (modes.length > 1 && options.onOpenModeSheet && options.resolveModeLabel) {
            modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'theia-mobile-projects-sticky-composer-mode';
            const modeLabel = options.resolveModeLabel();
            modeBtn.title = nls.localize('qaap/mobileProjects/stickyComposerMode', 'Mode: {0}', modeLabel);
            modeBtn.setAttribute('aria-label', modeBtn.title);
            modeBtn.innerHTML = `<span class="theia-mobile-projects-sticky-composer-mode-label">${modeLabel}</span>`
                + '<span class="codicon codicon-chevron-down" aria-hidden="true"></span>';
            modeBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                options.onOpenModeSheet!();
            });
        }

        let branchWorkspaceBar: HTMLElement | undefined;
        if (options.showWorkspaceBar) {
            wrap.classList.add('theia-mod-workspace-bar-below');
            const workspaceView = this.resolveComposerWorkspaceBarView(options.project);
            const projectPill = createStickyComposerWorkspacePill({
                iconClass: 'codicon-folder',
                label: workspaceView.projectName,
                ariaLabel: nls.localize('qaap/composerWorkspace/projectAria', 'Project: {0}', workspaceView.projectName),
                onClick: () => {
                    this.openComposerWorkspaceProjectSheet(options.project, options.transcriptOverlay === true);
                },
            });
            toolbarItems.unshift(projectPill);
            toolbar.classList.add('theia-mod-has-workspace-pill');
            branchWorkspaceBar = renderStickyComposerWorkspaceBar({
                view: workspaceView,
                includeProject: false,
                onOpenProject: () => {
                    this.openComposerWorkspaceProjectSheet(options.project, options.transcriptOverlay === true);
                },
                onOpenBranch: () => {
                    this.openComposerWorkspaceBranchSheet(options.project, options.transcriptOverlay === true);
                },
            });
        }

        toolbar.append(...toolbarItems);
        const usageBadge = createContextUsageIndicatorBadge();
        usageBadge.classList.add('theia-mobile-projects-sticky-composer-context-usage');
        toolbar.append(usageBadge);
        options.onContextUsageBadgeMounted?.(usageBadge);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'theia-mobile-projects-sticky-composer-input-wrap';

        const input = document.createElement('textarea');
        input.className = 'theia-mobile-projects-sticky-composer-input';
        input.rows = 1;
        const placeholderAgent = options.resolveAgentLabel();
        input.placeholder = options.inputPlaceholder ?? nls.localize(
            'qaap/mobileProjects/stickyComposerPlaceholder',
            'Message {0} on {1}',
            placeholderAgent,
            options.project.name,
        );
        input.value = options.getDraft();
        input.disabled = !options.canSubmit;

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'theia-mobile-projects-sticky-composer-send';
        sendBtn.disabled = true;
        const sendLabel = options.sendLabel ?? nls.localize('qaap/mobileProjects/inlineStart', 'Start');
        sendBtn.title = sendLabel;
        sendBtn.setAttribute('aria-label', sendLabel);
        sendBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';

        const updateSend = (): void => {
            const has = input.value.trim().length > 0;
            const working = options.isAgentWorking?.() ?? false;
            const showStop = working && !has;
            const sendLabel = options.sendLabel ?? nls.localize('qaap/mobileProjects/inlineStart', 'Start');
            const stopLabel = options.stopLabel ?? nls.localize('qaap/mobileProjects/cancelTaskRun', 'Cancel run');
            sendBtn.classList.toggle('theia-mod-stop', showStop);
            sendBtn.classList.toggle('theia-mod-ready', !showStop && has && options.canSubmit);
            if (showStop) {
                sendBtn.disabled = false;
                sendBtn.title = stopLabel;
                sendBtn.setAttribute('aria-label', stopLabel);
                sendBtn.innerHTML = '<span class="codicon codicon-debug-stop" aria-hidden="true"></span>';
            } else {
                sendBtn.disabled = !has || !options.canSubmit;
                sendBtn.title = sendLabel;
                sendBtn.setAttribute('aria-label', sendLabel);
                sendBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';
            }
        };
        input.addEventListener('input', () => {
            options.setDraft(input.value);
            options.afterInputChange?.();
            updateSend();
        });
        updateSend();
        options.onSendControlMounted?.(updateSend);

        if (options.getMentionOptions) {
            attachStickyComposerMentionUi({
                inputWrap,
                input,
                getMentionOptions: options.getMentionOptions,
                getVariableOptions: options.getVariableOptions,
                onDraftChange: value => {
                    options.setDraft(value);
                    updateSend();
                },
                afterInputChange: options.afterInputChange,
                mentionButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerMention', 'Mention agent (@)'),
                variableButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerVariable', 'Insert variable (#)'),
            });
        }

        const submit = (): void => {
            const draft = input.value.trim();
            if (!draft || !options.canSubmit) {
                options.onSubmitBlocked?.();
                return;
            }
            input.value = '';
            options.setDraft('');
            updateSend();
            options.onSubmit(draft);
        };
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.defaultPrevented) {
                ev.preventDefault();
                submit();
            }
        });
        sendBtn.addEventListener('click', ev => {
            ev.preventDefault();
            const has = input.value.trim().length > 0;
            const working = options.isAgentWorking?.() ?? false;
            if (working && !has) {
                options.onStop?.();
                return;
            }
            submit();
        });

        const inputActions = document.createElement('div');
        inputActions.className = 'theia-mobile-projects-sticky-composer-input-actions';
        inputActions.append(sendBtn);

        const inputBody = document.createElement('div');
        inputBody.className = 'theia-mobile-projects-sticky-composer-input-body';

        const controlsRow = document.createElement('div');
        controlsRow.className = 'theia-mobile-projects-sticky-composer-controls-row';

        const controlsLeft = document.createElement('div');
        controlsLeft.className = 'theia-mobile-projects-sticky-composer-controls-left';

        const controlsRight = document.createElement('div');
        controlsRight.className = 'theia-mobile-projects-sticky-composer-controls-right';

        inputWrap.classList.add('theia-mod-codex');
        inputBody.append(input);
        controlsLeft.append(attachBtn);
        if (modeBtn) {
            controlsLeft.append(modeBtn);
        }
        for (const item of controlsLeftItems.slice(1)) {
            controlsLeft.append(item);
        }
        controlsRight.append(inputActions);
        controlsRow.append(controlsLeft, controlsRight);
        inputWrap.append(inputBody, controlsRow);

        const card = document.createElement('div');
        card.className = 'theia-mobile-projects-sticky-composer-card theia-mod-codex';
        if (contextItems.length > 0) {
            card.classList.add('theia-mod-has-context');
            card.append(renderStickyComposerContextStrip({
                items: contextItems,
                formatChip: options.formatContextChip,
                onRemoveItem: index => { options.removeContextItem(index); },
                onClearAll: () => { options.clearContext(); },
                filesExpanded: options.filesExpanded,
                onFilesExpandedChange: options.onFilesExpandedChange,
                resolveAttachmentPreview: this.resolveAttachmentPreview,
            }));
        }
        toolbar.classList.add('qaap-codex-context-tray');
        card.append(inputWrap, toolbar);
        wrap.append(card);
        if (branchWorkspaceBar) {
            wrap.append(branchWorkspaceBar);
            void this.refreshComposerWorkspaceBranch(options.project).then(branch => {
                const label = branchWorkspaceBar!.querySelector('.theia-mobile-projects-sticky-composer-workspace-pill-label.theia-mod-mono');
                if (label) {
                    label.textContent = branch;
                }
            });
        }
        column.append(wrap);
        return column;
    }

    protected formatComposerContextEntry(entry: StickyComposerContextEntry): StickyComposerContextChipView {
        const fromProvider = this.formatContextChip?.(entry.request);
        const base = fromProvider ?? resolveStickyComposerContextEntry(entry);
        return base;
    }

    protected formatComposerContextChip(item: AIVariableResolutionRequest): StickyComposerContextChipView {
        return this.formatContextChip?.(item) ?? resolveStickyComposerContextChip(item);
    }

    protected resolveComposerMentionOptions(
        backendAgents: readonly QaapAgentTaskAgentOption[],
        coderOnly = false,
    ): StickyComposerTokenOption[] {
        const coder = this.getOfferableCoderAgent();
        return buildStickyComposerMentionOptions(
            coderOnly ? [] : backendAgents,
            coder ? { name: coder.name } : undefined,
        );
    }

    protected resolveComposerVariableOptions(): StickyComposerTokenOption[] {
        return buildStickyComposerVariableOptions(this.getComposerVariables?.() ?? []);
    }

    protected resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const pinned = this.stickyComposerPinnedAgentId ?? readStoredAgent(cwd);
        if (pinned && pinned !== 'task') {
            return pinned;
        }
        return this.stickyComposerBackendAgents[0]?.id ?? QAAP_PRIMARY_AGENT_ID;
    }

    protected resolveStickyComposerAgentLabel(project?: MobileProjectEntry): string {
        const pinned = this.stickyComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.stickyComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        return this.resolveConversationAgentLabel(undefined);
    }

    protected resolveStickyComposerModelLabel(agentId: string, project?: MobileProjectEntry): string | undefined {
        if (!agentSupportsModelPicker(agentId)) {
            return undefined;
        }
        const cwd = project
            ? (this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id))
            : undefined;
        return readStoredAgentModel(cwd, agentId)?.modelId;
    }

    protected reconcileStickyComposerPinnedAgent(
        current: string | undefined,
        agents: readonly QaapAgentTaskAgentOption[],
        defaultAgent: string | undefined,
        cwd: string | undefined,
    ): string {
        return reconcileStickyComposerAgent(
            current,
            agents,
            defaultAgent,
            cwd,
            !!this.getOfferableCoderAgent(),
        );
    }

    protected filterSelectableComposerAgents(
        agents: readonly QaapAgentTaskAgentOption[],
    ): QaapAgentTaskAgentOption[] {
        return filterQaapComposerAgents(agents);
    }

    protected async refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.loadBackendAgentSnapshot();
            const filteredAgents = this.filterSelectableComposerAgents(snapshot.agents);
            this.stickyComposerBackendAgents = filteredAgents;
            this.stickyComposerQaiqModels = snapshot.qaiqModels;
            const resolved = this.reconcileStickyComposerPinnedAgent(
                this.stickyComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            if (this.stickyComposerPinnedAgentId !== resolved) {
                this.stickyComposerPinnedAgentId = resolved;
                this.renderStickyComposer();
            }
        } catch {
            this.stickyComposerBackendAgents = this.filterSelectableComposerAgents(this.activeTasks?.getAgents() ?? []);
            this.stickyComposerQaiqModels = [];
        }
    }

    protected showComposerAgentPickerLoading(chrome: ComposerAgentPickerChrome): void {
        chrome.list.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'theia-mobile-sticky-composer-sheet-loading';
        loading.textContent = nls.localize('qaap/mobileProjects/stickyComposerLoadingAgents', 'Loading agents…');
        chrome.list.append(loading);
    }

    protected async ensureStickyComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        if (this.stickyComposerBackendAgents.length === 0) {
            await this.refreshStickyComposerAgents(project);
        }
        return this.filterSelectableComposerAgents(this.stickyComposerBackendAgents);
    }

    protected async ensureTranscriptComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]> {
        return this.transcriptComposerUi.ensureTranscriptComposerAgentsLoaded(project);
    }

    protected openStickyComposerAgentSheet(project: MobileProjectEntry): void {
        if (this.stickyComposerSurface === 'chat') {
            return;
        }
        this.closeStickyComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const chrome = this.createComposerAgentPickerChrome({
            sheetClassName: 'theia-mobile-sticky-composer-sheet theia-mod-agent',
            closeTitle: nls.localize('qaap/mobileAgentComposer/close', 'Close'),
            onClose: () => this.closeStickyComposerSheets(),
        });
        document.body.append(chrome.sheet);
        this.stickyComposerAgentSheet = chrome.sheet;
        this.showComposerAgentPickerLoading(chrome);
        void this.ensureStickyComposerAgentsLoaded(project).then(agents => {
            if (this.stickyComposerAgentSheet !== chrome.sheet) {
                return;
            }
            void this.renderComposerAgentPicker(chrome, {
                view: 'agents',
                cwd,
                agents,
                selectedAgentId: this.stickyComposerPinnedAgentId,
                includeCoder: true,
                onSelectAgent: (agentId, model) => {
                    this.stickyComposerPinnedAgentId = agentId;
                    if (cwd) {
                        writeStoredAgent(cwd, agentId);
                        if (model) {
                            writeStoredAgentModel(cwd, agentId, model);
                        }
                    }
                    const modes = resolveStickyComposerModes(agentId, this.chatAgentService);
                    this.stickyComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.stickyComposerModeId) {
                        writeStoredComposerMode(cwd, this.stickyComposerModeId);
                    }
                    this.closeStickyComposerSheets();
                    this.renderStickyComposer();
                },
            });
        });
    }

    protected openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void {
        this.closeStickyComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-mode';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.createModeSheetOption(
                mode.name,
                mode.id,
                this.stickyComposerModeId,
                id => {
                    this.stickyComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    this.closeStickyComposerSheets();
                    this.renderStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerModeSheet = sheet;
    }

    protected openStickyComposerApprovalPolicySheet(project: MobileProjectEntry, agentLabel: string): void {
        this.closeStickyComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        this.openApprovalPolicySheet({
            agentLabel,
            cwd,
            selectedId: reconcileAgentApprovalPolicyId(this.stickyComposerApprovalPolicyId, cwd),
            toolRules: reconcileAgentToolApprovalRules(
                reconcileAgentApprovalPolicyId(this.stickyComposerApprovalPolicyId, cwd),
                cwd,
                this.stickyComposerToolApprovalRules,
            ),
            onSelect: policyId => {
                this.stickyComposerApprovalPolicyId = policyId;
                this.stickyComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                    policyId,
                    cwd,
                    this.stickyComposerToolApprovalRules,
                );
                if (cwd) {
                    writeStoredAgentApprovalPolicy(cwd, policyId);
                    writeStoredAgentToolApprovalRules(cwd, this.stickyComposerToolApprovalRules);
                }
                this.closeStickyComposerSheets();
                this.renderStickyComposer();
            },
            onToolRulesChange: rules => {
                this.stickyComposerToolApprovalRules = rules;
                if (cwd) {
                    writeStoredAgentToolApprovalRules(cwd, rules);
                }
            },
            onClose: () => this.closeStickyComposerSheets(),
            assignSheet: sheet => { this.stickyComposerApprovalSheet = sheet; },
        });
    }

    protected openTranscriptComposerApprovalPolicySheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        agentLabel: string,
    ): void {
        this.transcriptComposerUi.openTranscriptComposerApprovalPolicySheet(project, summary, agentLabel);
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
        const sheet = document.createElement('div');
        sheet.className = options.transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-approval-policy theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-approval-policy';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => options.onClose());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';

        const title = document.createElement('h2');
        title.textContent = nls.localize(
            'qaap/mobileProjects/approvalPolicySheetTitle',
            'How should {0} actions be approved?',
            options.agentLabel,
        );

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => options.onClose());

        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list theia-qaap-approval-policy-sheet-list';
        let selectedId = options.selectedId;
        let toolRules = { ...options.toolRules };
        const toolRulesSection = document.createElement('div');
        toolRulesSection.className = 'theia-mobile-sticky-composer-sheet-list theia-qaap-tool-approval-rules-list';
        const renderToolRules = (): void => {
            toolRulesSection.replaceChildren();
            if (selectedId !== 'approve-for-me' || !options.onToolRulesChange) {
                toolRulesSection.hidden = true;
                return;
            }
            toolRulesSection.hidden = false;
            const heading = document.createElement('div');
            heading.className = 'theia-qaap-tool-approval-rules-heading';
            heading.textContent = nls.localize(
                'qaap/mobileProjects/approvalToolRulesHeading',
                'Also auto-approve',
            );
            toolRulesSection.append(
                heading,
                createToolApprovalRuleToggle({
                    label: nls.localize('qaap/mobileProjects/approvalToolShell', 'Terminal commands'),
                    description: nls.localize(
                        'qaap/mobileProjects/approvalToolShellHint',
                        'Shell, git, package installs, and other command execution.',
                    ),
                    checked: toolRules.shell === true,
                    onChange: checked => {
                        toolRules = { ...toolRules, shell: checked };
                        options.onToolRulesChange?.(toolRules);
                    },
                }),
                createToolApprovalRuleToggle({
                    label: nls.localize('qaap/mobileProjects/approvalToolNetwork', 'Network access'),
                    description: nls.localize(
                        'qaap/mobileProjects/approvalToolNetworkHint',
                        'Web fetch, external APIs, and other off-machine access.',
                    ),
                    checked: toolRules.network === true,
                    onChange: checked => {
                        toolRules = { ...toolRules, network: checked };
                        options.onToolRulesChange?.(toolRules);
                    },
                }),
            );
        };
        const policyButtons: HTMLButtonElement[] = [];
        for (const policy of QAAP_AGENT_APPROVAL_POLICIES) {
            const button = createApprovalPolicySheetOptionButton({
                policy,
                selected: policy.id === selectedId,
                onSelect: () => {
                    selectedId = policy.id;
                    toolRules = reconcileAgentToolApprovalRules(selectedId, options.cwd, toolRules);
                    for (const entry of policyButtons) {
                        entry.classList.remove('theia-mod-selected');
                    }
                    button.classList.add('theia-mod-selected');
                    renderToolRules();
                    options.onSelect(selectedId);
                    if (selectedId === 'approve-for-me') {
                        options.onToolRulesChange?.(toolRules);
                    }
                },
            });
            policyButtons.push(button);
            list.append(button);
        }
        renderToolRules();

        panel.append(header, list, toolRulesSection);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        options.assignSheet(sheet);
    }

    protected createModeSheetOption(
        label: string,
        modeId: string,
        selectedModeId: string | undefined,
        onSelect: (modeId: string) => void,
    ): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-sticky-composer-sheet-option';
        if (selectedModeId === modeId) {
            btn.classList.add('theia-mod-selected');
        }
        btn.textContent = label;
        btn.addEventListener('click', () => {
            onSelect(modeId);
        });
        return btn;
    }

    protected createAgentSheetOption(
        label: string,
        agentId: string,
        cwd: string | undefined,
        selectedAgentId: string | undefined,
        onSelect: (agentId: string) => void,
    ): HTMLElement {
        return createAgentSheetOptionButton({
            agentId,
            label,
            selected: isStickyComposerAgentSelected(agentId, selectedAgentId, cwd),
            onSelect: () => onSelect(agentId),
        });
    }

    protected async resolveModelsForAgentPicker(agentId: string): Promise<QaapQaiqModelOption[]> {
        if (agentUsesSettingsModelCatalog(agentId)) {
            return this.readPreference
                ? listQaiqModelsFromPreferences(this.readPreference)
                : [];
        }
        try {
            return await fetchAgentModelsForAgent(agentId);
        } catch {
            return [];
        }
    }

    protected createComposerAgentPickerChrome(options: {
        readonly sheetClassName: string;
        readonly closeTitle: string;
        readonly onClose: () => void;
    }): ComposerAgentPickerChrome {
        const sheet = document.createElement('div');
        sheet.className = options.sheetClassName;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', options.onClose);

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'theia-mobile-sticky-composer-sheet-back codicon codicon-arrow-left';
        backBtn.hidden = true;
        backBtn.title = nls.localize('qaap/mobileProjects/backToAgents', 'Back to agents');
        backBtn.setAttribute('aria-label', backBtn.title);

        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = options.closeTitle;
        close.setAttribute('aria-label', options.closeTitle);
        close.addEventListener('click', options.onClose);

        header.append(backBtn, title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';

        panel.append(header, list);
        sheet.append(backdrop, panel);

        return { sheet, header, title, backBtn, list };
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
        chrome.list.replaceChildren();
        if (options.view === 'models' && options.modelPickerAgentId) {
            const modelAgentId = options.modelPickerAgentId;
            const pickerModels = await this.resolveModelsForAgentPicker(modelAgentId);
            const storedModel = readStoredAgentModel(options.cwd, modelAgentId);
            chrome.header.classList.add('theia-mod-drilldown');
            chrome.backBtn.hidden = false;
            chrome.title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickModel', 'Choose model');
            chrome.backBtn.onclick = () => {
                void this.renderComposerAgentPicker(chrome, { ...options, view: 'agents', modelPickerAgentId: undefined });
            };
            this.appendAgentModelPickerList(chrome.list, modelAgentId, pickerModels, storedModel, model => {
                options.onSelectAgent(modelAgentId, model);
            });
            return;
        }

        chrome.header.classList.remove('theia-mod-drilldown');
        chrome.backBtn.hidden = true;
        chrome.backBtn.onclick = null;
        chrome.title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');

        const appendAgent = (agentId: string, label: string): void => {
            const hasModels = agentSupportsModelPicker(agentId);
            const agentSelected = isStickyComposerAgentSelected(agentId, options.selectedAgentId, options.cwd);
            const storedModel = readStoredAgentModel(options.cwd, agentId);
            let displayLabel = label;
            if (storedModel?.modelId && agentSelected) {
                displayLabel = `${label} · ${storedModel.modelId}`;
            }
            chrome.list.append(createAgentSheetOptionButton({
                agentId,
                label: displayLabel,
                selected: agentSelected,
                submenuChevron: hasModels ? 'forward' : undefined,
                onSelect: async () => {
                    const models = await this.resolveModelsForAgentPicker(agentId);
                    if (models.length > 0) {
                        void this.renderComposerAgentPicker(chrome, {
                            ...options,
                            view: 'models',
                            modelPickerAgentId: agentId,
                        });
                        return;
                    }
                    options.onSelectAgent(agentId);
                },
            }));
        };

        if (options.includeCoder) {
            const coder = this.getOfferableCoderAgent();
            if (coder) {
                appendAgent(THEIA_CODER_AGENT_ID, coder.name);
            }
        }
        for (const agent of options.agents) {
            appendAgent(agent.id, agent.label);
        }
        if (chrome.list.childElementCount === 0) {
            const hint = document.createElement('p');
            hint.className = 'theia-qaap-agent-sheet-empty-models';
            hint.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerNoAgents',
                'No agents are available. Check your workspace server connection or AI configuration.',
            );
            chrome.list.append(hint);
        }
    }

    protected appendAgentModelPickerList(
        list: HTMLElement,
        agentId: string,
        models: readonly QaapQaiqModelOption[],
        storedModel: ReturnType<typeof readStoredAgentModel>,
        onSelect: (model: QaapQaiqModelOption) => void,
    ): void {
        if (models.length === 0) {
            const hint = document.createElement('p');
            hint.className = 'theia-qaap-agent-sheet-empty-models';
            hint.textContent = agentUsesSettingsModelCatalog(agentId)
                ? nls.localize(
                    'qaap/mobileProjects/stickyComposerNoQaiqModels',
                    'Add an API key in Settings → AI Features to choose a model.',
                )
                : nls.localize(
                    'qaap/mobileProjects/stickyComposerNoAgentModels',
                    'No models are available for this agent on the workspace.',
                );
            list.append(hint);
            return;
        }
        for (const [vendor, providerModels] of groupQaiqModelsByProvider(models)) {
            const section = document.createElement('div');
            section.className = 'theia-qaap-agent-sheet-provider';
            const label = document.createElement('div');
            label.className = 'theia-qaap-agent-sheet-provider-label';
            label.textContent = formatQaiqModelProviderLabel(vendor);
            section.append(label);
            for (const model of providerModels) {
                section.append(createPickerSheetOptionButton({
                    label: model.label || model.modelId,
                    selected: isSameAgentModel(storedModel, model),
                    onSelect: () => onSelect(model),
                }));
            }
            list.append(section);
        }
    }

    protected closeStickyComposerSheets(): void {
        if (this.stickyComposerAgentSheet) {
            this.stickyComposerAgentSheet.remove();
            this.stickyComposerAgentSheet = undefined;
        }
        if (this.stickyComposerModeSheet) {
            this.stickyComposerModeSheet.remove();
            this.stickyComposerModeSheet = undefined;
        }
        if (this.stickyComposerApprovalSheet) {
            this.stickyComposerApprovalSheet.remove();
            this.stickyComposerApprovalSheet = undefined;
        }
        if (this.stickyComposerWorkspaceSheet) {
            this.stickyComposerWorkspaceSheet.remove();
            this.stickyComposerWorkspaceSheet = undefined;
        }
    }

    protected applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[] {
        if (filter === 'pinned') {
            return projects.filter(p => p.pinned);
        }
        if (filter === 'active') {
            return projects.filter(p => p.isCurrent || this.isProjectRunning(p));
        }
        return projects;
    }

    protected applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        if (!this.query) {
            return projects;
        }
        return projects.filter(project => this.projectMatchesSearch(project, this.query));
    }

    protected projectMatchesSearch(project: MobileProjectEntry, query: string): boolean {
        if (project.name.toLowerCase().includes(query)
            || project.branch.toLowerCase().includes(query)
            || project.task.toLowerCase().includes(query)
            || project.github?.fullName.toLowerCase().includes(query)) {
            return true;
        }
        return this.conversationsForProject(project).some(c => this.conversationMatchesQuery(c, query));
    }

    protected conversationMatchesQuery(
        conversation: QaapAgentConversationSummaryDTO,
        query: string,
    ): boolean {
        if (conversation.title.toLowerCase().includes(query)) {
            return true;
        }
        if (conversation.agentId.toLowerCase().includes(query)) {
            return true;
        }
        const preview = conversation.lastMessagePreview?.toLowerCase();
        return !!preview && preview.includes(query);
    }

    protected isReviewHubView(): boolean {
        return this.hubView === 'review';
    }

    protected isHomeHubView(): boolean {
        return this.hubView === 'home';
    }

    protected isTasksHubView(): boolean {
        return this.hubView === 'tasks';
    }

    protected refreshHomeHubData(forceRender: boolean): void {
        this.conversations?.start();
        this.activeTasks?.start();
        this.refreshTasksHubApprovals(forceRender);
        if (!this.inboxPullRequestsLoaded && !this.inboxPullRequestsLoading) {
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, false);
        } else if (forceRender) {
            this.renderList();
        }
    }

    protected buildHomeSnapshot(): WorkHubHomeSnapshot {
        const members = this.collectTeamMembersForHub();
        const approvals = this.collectTeamApprovalItems(members);
        const { needsYou, running } = this.countTasksAttention();
        const attentionItems: WorkHubHomeAttentionItem[] = approvals.slice(0, 3).map(item => ({
            id: item.approvalId ?? item.member.id,
            kind: 'approval' as const,
            title: this.resolveHomeAgentLabel(item.member.agentId),
            subtitle: item.summary ?? item.member.title,
            meta: item.member.projectName,
        }));
        if (this.inboxPullRequests.length > 0 && attentionItems.length < 4) {
            attentionItems.push({
                id: 'open-pull-requests',
                kind: 'pull-request',
                title: nls.localize('qaap/workHubHome/openPullRequestsTitle', 'Open pull requests'),
                subtitle: nls.localize(
                    'qaap/workHubHome/openPullRequestsSubtitle',
                    'Finish agent handoffs waiting on GitHub',
                ),
                meta: this.inboxPullRequests.length === 1
                    ? nls.localize('qaap/workHubHome/openPullRequestsMetaOne', '1 PR')
                    : nls.localize(
                        'qaap/workHubHome/openPullRequestsMetaMany',
                        '{0} PRs',
                        String(this.inboxPullRequests.length),
                    ),
            });
        }
        const recentSources: WorkHubHomeRecentSource[] = [];
        for (const project of this.projects) {
            for (const summary of [...this.localChatsForProject(project), ...this.vpsTasksForProject(project)]) {
                recentSources.push({
                    id: summary.id,
                    projectId: project.id,
                    projectName: project.name,
                    title: summary.title?.trim()
                        || nls.localize('qaap/mobileProjects/untitledChat', 'Untitled chat'),
                    subtitle: isLocalChatSummary(summary)
                        ? nls.localize('qaap/workHubHome/recentChat', 'Local chat')
                        : nls.localize('qaap/workHubHome/recentTask', 'VPS task'),
                    surface: isLocalChatSummary(summary) ? 'chat' : 'task',
                    updatedAt: summary.updatedAt,
                });
            }
        }
        const usageEvents = [];
        for (const project of this.projects) {
            for (const summary of this.conversationsForProject(project)) {
                usageEvents.push({
                    createdAt: summary.createdAt,
                    updatedAt: summary.updatedAt,
                    messageCount: summary.messageCount,
                });
            }
        }
        return {
            stats: {
                projectCount: this.projects.length,
                runningTasks: running,
                needsYou,
                openPullRequests: this.inboxPullRequests.length,
                localChatCount: this.projects.reduce(
                    (sum, project) => sum + this.localChatsForProject(project).length,
                    0,
                ),
            },
            usageSummary: buildWorkHubHomeUsageSummary(usageEvents, {
                favoriteModelLabel: this.resolveHomeFavoriteModelLabel(),
            }),
            attentionItems,
            recentItems: buildWorkHubHomeRecentItems(recentSources, 5),
            pinnedProjectIds: selectWorkHubHomePinnedProjectIds(this.projects, 4),
        };
    }

    protected resolveHomeFavoriteModelLabel(): string | undefined {
        const name = this.chatAgentService?.getDefaultAgent()?.name?.trim();
        return name || undefined;
    }

    protected buildHomeGreeting(): string {
        const user = readQaapAuthUser();
        const name = user?.name?.trim() || user?.login?.trim();
        return buildWorkHubHomeGreeting(name);
    }

    protected formatHomeRelativeTime(updatedAt: number): string {
        return formatWorkHubRelativeTime(updatedAt, Date.now(), {
            justNow: nls.localize('qaap/mobileProjects/inboxJustNow', 'just now'),
            minutesAgo: count => nls.localize('qaap/mobileProjects/inboxMinutesAgo', '{0}m ago', count),
            hoursAgo: count => nls.localize('qaap/mobileProjects/inboxHoursAgo', '{0}h ago', count),
            daysAgo: count => nls.localize('qaap/mobileProjects/inboxDaysAgo', '{0}d ago', count),
        });
    }

    protected buildHomeWorkspaceActivity(project: MobileProjectEntry): string {
        const cwd = this.projectsService.getProjectCwd(project);
        const activeCount = cwd
            ? (this.activeTasks?.getForCwd(cwd)?.activeCount ?? 0)
            : this.activeTasks?.findTasksForProject(project).filter(task => task.state === 'running').length ?? 0;
        const tasks = this.vpsTasksForProject(project).length;
        if (activeCount > 0 && tasks > 0) {
            return activeCount === 1
                ? nls.localize(
                    'qaap/workHubHome/workspaceActiveOneTaskMany',
                    '1 agent active · {0} tasks',
                    String(tasks),
                )
                : nls.localize(
                    'qaap/workHubHome/workspaceActiveManyTaskMany',
                    '{0} agents active · {1} tasks',
                    String(activeCount),
                    String(tasks),
                );
        }
        if (activeCount > 0) {
            return activeCount === 1
                ? nls.localize('qaap/workHubHome/workspaceActiveOne', '1 agent active')
                : nls.localize(
                    'qaap/workHubHome/workspaceActiveMany',
                    '{0} agents active',
                    String(activeCount),
                );
        }
        if (tasks > 0) {
            return tasks === 1
                ? nls.localize('qaap/workHubHome/workspaceTaskOne', '1 task')
                : nls.localize(
                    'qaap/workHubHome/workspaceTaskMany',
                    '{0} tasks',
                    String(tasks),
                );
        }
        return project.branch || nls.localize('qaap/workHubHome/workspaceIdle', 'Ready to work');
    }

    protected getHomeWorkspaceStatus(project: MobileProjectEntry): 'idle' | 'running' | 'open' {
        if (project.isCurrent) {
            return 'open';
        }
        const cwd = this.projectsService.getProjectCwd(project);
        const activeCount = cwd
            ? (this.activeTasks?.getForCwd(cwd)?.activeCount ?? 0)
            : this.activeTasks?.findTasksForProject(project).filter(task => task.state === 'running').length ?? 0;
        return activeCount > 0 ? 'running' : 'idle';
    }

    protected buildHomeSubtitle(snapshot: WorkHubHomeSnapshot): string {
        const { stats } = snapshot;
        if (stats.needsYou > 0) {
            return stats.needsYou === 1
                ? nls.localize('qaap/workHubHome/subtitleNeedsYouOne', '1 item needs your attention')
                : nls.localize(
                    'qaap/workHubHome/subtitleNeedsYouMany',
                    '{0} items need your attention',
                    String(stats.needsYou),
                );
        }
        if (stats.runningTasks > 0) {
            return stats.runningTasks === 1
                ? nls.localize('qaap/workHubHome/subtitleRunningOne', '1 agent moving work toward PR')
                : nls.localize(
                    'qaap/workHubHome/subtitleRunningMany',
                    '{0} agents moving work toward PR',
                    String(stats.runningTasks),
                );
        }
        if (stats.openPullRequests > 0) {
            return stats.openPullRequests === 1
                ? nls.localize('qaap/workHubHome/subtitlePullRequestsOne', '1 pull request ready to review')
                : nls.localize(
                    'qaap/workHubHome/subtitlePullRequestsMany',
                    '{0} pull requests ready to review',
                    String(stats.openPullRequests),
                );
        }
        if (stats.projectCount === 0) {
            return nls.localize('qaap/workHubHome/subtitleNoProjects', 'Add a GitHub repository to start agent work');
        }
        return nls.localize('qaap/workHubHome/subtitleAllClear', 'Ready to capture the next task');
    }

    protected resolveHomeAgentLabel(agentId: string): string {
        const fromList = this.activeTasks?.getAgents().find(agent => agent.id === agentId)?.label;
        if (fromList) {
            return fromList.startsWith('@') ? fromList : `@${fromList}`;
        }
        return agentId.startsWith('@') ? agentId : `@${agentId}`;
    }

    protected renderHomeHubView(): void {
        const snapshot = this.buildHomeSnapshot();
        const host = document.createElement('div');
        host.className = 'theia-mobile-work-hub-home-host';
        this.ensureOverlayUi().home.renderDashboard(host, snapshot);
        this.scroll.append(host);
        this.renderSubtitle();
    }

    protected resolveHomePinnedProject(): MobileProjectEntry | undefined {
        return this.projects.find(project => project.isCurrent)
            ?? this.projects.find(project => project.pinned)
            ?? this.projects[0];
    }

    protected onHomeNavigate(target: WorkHubHomeNavigateTarget): void {
        this.navigateHubTab(target);
    }

    protected async onHomeOpenProject(project: MobileProjectEntry): Promise<void> {
        await this.openProjectDetail(project);
    }

    protected async onHomeOpenRecent(item: WorkHubHomeRecentItem): Promise<void> {
        const project = this.projects.find(entry => entry.id === item.projectId);
        if (!project) {
            return;
        }
        const summary = this.conversationsForProject(project).find(entry => entry.id === item.id);
        if (!summary) {
            return;
        }
        await this.openTranscriptSheet(project, summary);
    }

    protected onHomeOpenAttention(item: WorkHubHomeAttentionItem): void {
        if (item.kind === 'pull-request') {
            this.selectHubLandingView('review');
            return;
        }
        this.selectHubLandingView('tasks');
    }

    protected async onHomeQuickAction(action: WorkHubHomeQuickActionId): Promise<void> {
        switch (action) {
            case 'all-projects':
                this.selectHubLandingView('repos');
                return;
            case 'open-review':
                this.selectHubLandingView('review');
                return;
            case 'new-chat': {
                const project = this.resolveHomePinnedProject();
                if (!project) {
                    this.selectHubLandingView('repos');
                    return;
                }
                this.preferComposerSurface('chat', this.projectsService.getProjectCwd(project));
                await this.openProjectDetail(project);
                return;
            }
            case 'delegate-task': {
                const project = this.resolveHomePinnedProject();
                if (!project) {
                    this.selectHubLandingView('repos');
                    return;
                }
                this.preferComposerSurface('task', this.projectsService.getProjectCwd(project));
                await this.openProjectDetail(project);
                return;
            }
        }
    }

    protected countTasksAttention(): { needsYou: number; running: number } {
        const members = this.collectTeamMembersForHub();
        const approvals = this.collectTeamApprovalItems(members);
        return {
            needsYou: approvals.length,
            running: countRunningTeamMembers(members),
        };
    }

    protected refreshTasksHubApprovals(forceRender = true): void {
        const generation = ++this.agentApprovalsFetchGeneration;
        void fetchAgentApprovals().then(approvals => {
            if (generation !== this.agentApprovalsFetchGeneration || !this.visible
                || (!this.isTasksHubView() && !this.isHomeHubView())) {
                return;
            }
            this.cachedAgentApprovals = approvals;
            if (forceRender) {
                this.renderList();
            } else if (this.isHomeHubView()) {
                this.renderList();
            } else {
                this.updateTasksAttentionChrome();
                this.renderSubtitle();
            }
        }).catch(() => {
            if (generation !== this.agentApprovalsFetchGeneration || !this.visible
                || (!this.isTasksHubView() && !this.isHomeHubView())) {
                return;
            }
            this.cachedAgentApprovals = [];
            if (forceRender) {
                this.renderList();
            } else if (this.isHomeHubView()) {
                this.renderList();
            } else {
                this.updateTasksAttentionChrome();
                this.renderSubtitle();
            }
        });
    }

    protected getFilteredTeamHubState(): {
        members: WorkHubTeamMember[];
        filteredApprovals: WorkHubApprovalItem[];
    } {
        const all = this.collectTeamMembersForHub();
        const approvals = this.collectTeamApprovalItems(all);
        const approvalIds = new Set(approvals.map(item => item.member.id));
        const members = filterTeamMembersForDisplay(
            all.filter(member => !approvalIds.has(member.id)),
            this.query,
        );
        const filteredApprovals = approvals.filter(item => {
            if (!this.query.trim()) {
                return true;
            }
            const q = this.query.trim().toLowerCase();
            return item.member.title.toLowerCase().includes(q)
                || item.member.projectName.toLowerCase().includes(q)
                || item.member.agentId.toLowerCase().includes(q)
                || (item.summary?.toLowerCase().includes(q) ?? false);
        });
        return { members, filteredApprovals };
    }

    openWorkHubSessionsSidebar(): void {
        const sidebar = this.ensureWorkHubSessionsSidebar();
        if (!sidebar.isVisible()) {
            sidebar.show();
        }
        void this.prepareSessionsSidebarData().then(() => {
            sidebar.refreshList();
        });
    }

    toggleWorkHubSessionsSidebar(): void {
        const sidebar = this.ensureWorkHubSessionsSidebar();
        if (sidebar.isVisible()) {
            sidebar.hide();
            return;
        }
        sidebar.show();
        void this.prepareSessionsSidebarData().then(() => {
            sidebar.refreshList();
        });
    }

    /** Carga proyectos + sesiones antes de pintar filas `createTaskItem` en el sidebar (mockup). */
    protected async prepareSessionsSidebarData(): Promise<void> {
        this.activeTasks?.start();
        this.conversations?.start();
        try {
            this.projects = await this.projectsService.loadProjects();
        } catch {
            /* keep in-memory list */
        }
        await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
        await this.refreshChatServiceSessionSummaries();
    }

    isWorkHubSessionsSidebarVisible(): boolean {
        return this.sessionsSidebar?.isVisible() === true;
    }

    protected ensureWorkHubSessionsSidebar(): MobileWorkHubSessionsSidebar {
        if (!this.sessionsSidebar) {
            this.sessionsSidebar = new MobileWorkHubSessionsSidebar({
                renderSessionList: host => this.renderWorkHubSessionsSidebarList(host),
                onNewChat: () => { void this.onWorkHubSessionsSidebarNewChat(); },
                onClose: () => {
                    this.closeCardMenu();
                },
                storageScope: () => this.projectsService.getCurrentWorkspaceCwd(),
                onAccountMenu: anchor => { this.onSessionsSidebarAccountClick(anchor); },
                onSearch: () => { void this.openSessionsSidebarSearch(); },
                onExtensions: () => { void this.commands.executeCommand('workbench.view.extensions'); },
                onAutomations: () => { void this.onWorkHubSessionsSidebarAutomations(); },
            });
            document.body.append(this.sessionsSidebar.node);
        }
        return this.sessionsSidebar;
    }

    protected resolveWorkHubSessionsSidebarProject(): MobileProjectEntry | undefined {
        return this.projects.find(p => p.isCurrent)
            ?? this.resolveHomePinnedProject();
    }

    protected renderWorkHubSessionsSidebarList(host: HTMLElement): void {
        const projects = [...this.projects].sort((a, b) => this.compareChatInboxProjectOrder(a, b));
        const query = this.query.trim().toLowerCase();
        if (projects.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-sessions-sidebar-empty';
            empty.textContent = query
                ? nls.localize('qaap/sessionsSidebar/noSearchResults', 'No sessions match your search.')
                : nls.localize('qaap/sessionsSidebar/noSessions', 'No agent sessions yet. Start one from Agents.');
            host.append(empty);
            return;
        }
        const onActivate = (): void => {
            this.sessionsSidebar?.hideForMobileOverlay();
        };
        this.seedSessionsSidebarAccordionDefaults(projects);
        const pinnedGroups = this.collectSessionsSidebarPinnedGroups(projects, query);
        const bypassConversationLimit = query.length > 0;
        if (pinnedGroups.length > 0) {
            host.append(this.createSessionsSidebarPinnedSection(pinnedGroups, onActivate, bypassConversationLimit));
        }
        const sectionHead = document.createElement('div');
        sectionHead.className = 'theia-mobile-tasks-inbox-section-head theia-mod-sessions-sidebar-projects-head';
        const sectionLabel = document.createElement('span');
        sectionLabel.className = 'theia-mobile-tasks-inbox-section-label';
        sectionLabel.textContent = nls.localize('qaap/sessionsSidebar/projectsSection', 'Projects');
        sectionHead.append(sectionLabel);
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-sessions-sidebar-projects-list';
        let visibleCount = 0;
        for (const project of projects) {
            let conversations = [...this.conversationsForProject(project)]
                .filter(summary => !this.isSessionsSidebarPinnedConversation(summary))
                .sort((a, b) => this.compareConversationOrder(a, b));
            if (query) {
                conversations = conversations.filter(c => this.conversationMatchesQuery(c, query));
                if (conversations.length === 0) {
                    continue;
                }
            } else if (conversations.length === 0) {
                continue;
            }
            list.append(this.createSessionsSidebarProjectGroup(project, conversations, onActivate, bypassConversationLimit));
            visibleCount++;
        }
        if (visibleCount === 0 && pinnedGroups.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-sessions-sidebar-empty';
            empty.textContent = nls.localize(
                'qaap/sessionsSidebar/noSearchResults',
                'No sessions match your search.',
            );
            host.append(empty);
            return;
        }
        if (visibleCount > 0) {
            host.append(sectionHead, list);
        }
        this.syncSessionsSidebarAnimatedListHeights(host);
    }

    protected syncSessionsSidebarAnimatedListHeights(host: HTMLElement): void {
        window.requestAnimationFrame(() => {
            const lists = host.querySelectorAll<HTMLElement>(
                '.theia-mobile-work-hub-sessions-sidebar-project-group .theia-mobile-projects-chats-list, '
                + '.theia-mobile-work-hub-sessions-sidebar-project-group .theia-mobile-work-hub-sessions-sidebar-projects-list',
            );
            for (const list of lists) {
                list.style.setProperty('--qaap-sessions-sidebar-list-height', `${list.scrollHeight}px`);
            }
        });
    }

    protected isSessionsSidebarPinnedConversation(summary: QaapAgentConversationSummaryDTO): boolean {
        const flags = this.resolveConversationFlags(summary);
        return flags.priority && !flags.paused;
    }

    protected collectSessionsSidebarPinnedGroups(
        projects: MobileProjectEntry[],
        query: string,
    ): Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }> {
        const groups: Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }> = [];
        for (const project of projects) {
            let conversations = this.conversationsForProject(project)
                .filter(summary => this.isSessionsSidebarPinnedConversation(summary))
                .sort((a, b) => this.compareConversationOrder(a, b));
            if (query) {
                conversations = conversations.filter(c => this.conversationMatchesQuery(c, query));
            }
            if (conversations.length > 0) {
                groups.push({ project, conversations });
            }
        }
        return groups;
    }

    protected createSessionsSidebarPinnedSection(
        groups: Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }>,
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-section';
        const head = document.createElement('div');
        head.className = 'theia-mobile-tasks-inbox-section-head theia-mod-sessions-sidebar-pinned-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-tasks-inbox-section-label';
        label.textContent = nls.localize('qaap/sessionsSidebar/pinnedSection', 'Anclados');
        head.append(label);
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-list';
        for (const { project, conversations } of groups) {
            list.append(this.createSessionsSidebarPinnedProjectGroup(project, conversations, onActivate, bypassConversationLimit));
        }
        section.append(head, list);
        return section;
    }

    protected getSessionsSidebarConversationDisplayLimit(
        project: MobileProjectEntry,
        totalCount: number,
        bypassLimit: boolean,
    ): number {
        if (bypassLimit || totalCount === 0) {
            return totalCount;
        }
        const stored = this.sessionsSidebarVisibleConversationCountByProjectId.get(project.id);
        const limit = stored ?? MobileProjectsPanel.SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
        return Math.min(limit, totalCount);
    }

    protected resolveSessionsSidebarVisibleConversations(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        bypassLimit: boolean,
    ): { visible: QaapAgentConversationSummaryDTO[]; hiddenCount: number; showLess: boolean } {
        const all = [...conversations];
        if (bypassLimit) {
            return { visible: all, hiddenCount: 0, showLess: false };
        }
        const defaultLimit = MobileProjectsPanel.SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
        const displayLimit = this.getSessionsSidebarConversationDisplayLimit(project, all.length, bypassLimit);
        if (all.length <= defaultLimit && !this.sessionsSidebarVisibleConversationCountByProjectId.has(project.id)) {
            return { visible: all, hiddenCount: 0, showLess: false };
        }
        const visible = all.slice(0, displayLimit);
        const openId = this.transcriptOpenSummaryId;
        if (openId && displayLimit > 0) {
            const openIndex = all.findIndex(c => c.id === openId);
            if (openIndex >= displayLimit) {
                visible[displayLimit - 1] = all[openIndex]!;
            }
        }
        const hiddenCount = Math.max(0, all.length - displayLimit);
        const showLess = displayLimit > defaultLimit && hiddenCount === 0;
        return { visible, hiddenCount, showLess };
    }

    protected appendSessionsSidebarConversationItems(
        listHost: HTMLElement,
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassLimit: boolean,
    ): void {
        const { visible, hiddenCount, showLess } = this.resolveSessionsSidebarVisibleConversations(project, conversations, bypassLimit);
        if (visible.length === 0) {
            return;
        }
        const activeInfo = this.activeInfoForProject(project);
        const parentIds = new Set<string>();
        for (const summary of conversations) {
            if (summary.forkedFromId) {
                parentIds.add(summary.forkedFromId);
            }
        }
        for (const summary of visible) {
            const task = this.summaryToTaskView(summary);
            listHost.append(this.createTaskItem(project, task, activeInfo, summary, parentIds, { onActivate, compact: true }));
        }
        if (bypassLimit) {
            return;
        }
        const totalCount = conversations.length;
        if (hiddenCount > 0) {
            listHost.append(this.createSessionsSidebarShowMoreControl(project, hiddenCount, totalCount));
        } else if (showLess) {
            listHost.append(this.createSessionsSidebarShowLessControl(project));
        }
    }

    protected createSessionsSidebarShowMoreControl(
        project: MobileProjectEntry,
        hiddenCount: number,
        totalCount: number,
    ): HTMLButtonElement {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'theia-mobile-work-hub-sessions-sidebar-show-more';
        moreBtn.textContent = nls.localize('qaap/sessionsSidebar/showMore', 'Mostrar más');
        const pageSize = MobileProjectsPanel.SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE;
        moreBtn.title = nls.localize(
            'qaap/sessionsSidebar/showMoreHint',
            'Show {0} more sessions',
            String(Math.min(pageSize, hiddenCount)),
        );
        moreBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            const current = this.sessionsSidebarVisibleConversationCountByProjectId.get(project.id)
                ?? MobileProjectsPanel.SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
            this.sessionsSidebarVisibleConversationCountByProjectId.set(
                project.id,
                Math.min(current + pageSize, totalCount),
            );
            this.sessionsSidebar?.refreshList();
        });
        return moreBtn;
    }

    protected createSessionsSidebarShowLessControl(project: MobileProjectEntry): HTMLButtonElement {
        const lessBtn = document.createElement('button');
        lessBtn.type = 'button';
        lessBtn.className = 'theia-mobile-work-hub-sessions-sidebar-show-more theia-mod-show-less';
        lessBtn.textContent = nls.localize('qaap/sessionsSidebar/showLess', 'Mostrar menos');
        lessBtn.title = nls.localize(
            'qaap/sessionsSidebar/showLessHint',
            'Show only the first {0} sessions',
            String(MobileProjectsPanel.SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT),
        );
        lessBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.sessionsSidebarVisibleConversationCountByProjectId.delete(project.id);
            this.sessionsSidebar?.refreshList();
        });
        return lessBtn;
    }

    protected createSessionsSidebarPinnedProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const group = document.createElement('div');
        group.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project';
        const projectHead = document.createElement('div');
        projectHead.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project-head';
        const folder = document.createElement('span');
        folder.className = 'codicon codicon-folder theia-mobile-work-hub-sessions-sidebar-pinned-project-icon';
        folder.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project-name';
        name.textContent = project.name;
        projectHead.append(folder, name);
        const taskList = document.createElement('div');
        taskList.className = 'theia-mobile-projects-chats-list theia-mod-sessions-sidebar-pinned-tasks';
        this.appendSessionsSidebarConversationItems(taskList, project, conversations, onActivate, bypassConversationLimit);
        group.append(projectHead, taskList);
        return group;
    }

    /** Expand current workspace (+ running) by default; user toggles persist for the session. */
    protected seedSessionsSidebarAccordionDefaults(projects: MobileProjectEntry[]): void {
        if (this.sessionsSidebarAccordionDefaultsApplied) {
            return;
        }
        this.sessionsSidebarAccordionDefaultsApplied = true;
        for (const project of projects) {
            if (project.isCurrent || this.countRunningTasks(project) > 0) {
                this.sessionsSidebarExpandedProjectIds.add(project.id);
            }
        }
        if (projects.length > 0 && this.sessionsSidebarExpandedProjectIds.size === 0) {
            this.sessionsSidebarExpandedProjectIds.add(projects[0].id);
        }
    }

    protected createSessionsSidebarProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const expanded = this.sessionsSidebarExpandedProjectIds.has(project.id);
        const section = document.createElement('section');
        section.className = 'theia-mobile-work-hub-sessions-sidebar-project-group';
        if (!expanded) {
            section.classList.add('theia-mod-collapsed');
        }
        const toggleExpand = (): void => {
            const willExpand = section.classList.contains('theia-mod-collapsed');
            section.classList.toggle('theia-mod-collapsed');
            head.setAttribute('aria-expanded', String(willExpand));
            if (willExpand) {
                this.sessionsSidebarExpandedProjectIds.add(project.id);
            } else {
                this.sessionsSidebarExpandedProjectIds.delete(project.id);
            }
        };
        const head = this.createSessionsSidebarProjectRowHead(project, expanded, toggleExpand);
        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        this.appendSessionsSidebarConversationItems(list, project, conversations, onActivate, bypassConversationLimit);
        section.append(head, list);
        return section;
    }

    protected createSessionsSidebarProjectRowHead(
        project: MobileProjectEntry,
        expanded: boolean,
        onToggleExpand: () => void,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-work-hub-sessions-sidebar-project-row-wrap';
        if (project.isCurrent) {
            row.classList.add('theia-mod-current');
        }
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'theia-mobile-work-hub-sessions-sidebar-project-row';
        head.setAttribute('aria-expanded', String(expanded));
        const chevron = document.createElement('span');
        chevron.className = 'codicon codicon-chevron-right theia-mobile-work-hub-sessions-sidebar-project-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-work-hub-sessions-sidebar-project-dot';
        dot.style.background = project.color;
        dot.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'theia-mobile-work-hub-sessions-sidebar-project-name';
        name.textContent = project.name;
        head.append(chevron, dot, name);
        head.addEventListener('click', ev => {
            ev.stopPropagation();
            onToggleExpand();
        });
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-work-hub-sessions-sidebar-project-actions';
        if (project.isCurrent) {
            actions.append(this.createSessionsSidebarIdeOpenBadge());
        }
        actions.append(this.createSessionsSidebarIdeOpenControl(project));
        const menu = this.buildProjectOptionsMenu(project);
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-row-menu';
        menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/cardMenu', 'Project options'));
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        const menuIcon = document.createElement('span');
        menuIcon.className = 'codicon codicon-kebab-vertical';
        menuIcon.setAttribute('aria-hidden', 'true');
        menuBtn.append(menuIcon);
        menuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.toggleCardMenu(row, menu, menuBtn);
        });
        row.append(head, actions, menuBtn, menu);
        return row;
    }

    protected createSessionsSidebarIdeOpenControl(project: MobileProjectEntry): HTMLButtonElement {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'theia-mobile-projects-row-meta-open theia-mobile-work-hub-sessions-sidebar-project-open';
        const openLabel = nls.localize('qaap/mobileProjects/openInIde', 'Open in IDE');
        openBtn.setAttribute('aria-label', openLabel);
        openBtn.title = openLabel;
        const openIcon = document.createElement('span');
        openIcon.className = 'codicon codicon-link-external';
        openIcon.setAttribute('aria-hidden', 'true');
        openBtn.append(openIcon);
        openBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.sessionsSidebar?.hide();
            void this.delegate.onProjectOpenInIde?.(project);
        });
        openBtn.addEventListener('keydown', ev => ev.stopPropagation());
        return openBtn;
    }

    protected createSessionsSidebarIdeOpenBadge(): HTMLSpanElement {
        const badge = document.createElement('span');
        badge.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge';
        const label = document.createElement('span');
        label.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge-label';
        label.textContent = nls.localize('qaap/mobileProjects/ideOpen', 'IDE open');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge-close';
        close.setAttribute('aria-label', nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace'));
        close.title = close.getAttribute('aria-label') ?? '';
        close.textContent = '×';
        close.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.closeCurrentWorkspace();
        });
        close.addEventListener('keydown', ev => ev.stopPropagation());
        badge.append(label, close);
        return badge;
    }

    protected async onWorkHubSessionsSidebarNewChat(): Promise<void> {
        const project = this.resolveWorkHubSessionsSidebarProject();
        if (!project) {
            return;
        }
        await this.openEmptyMobileChatSheet(project);
    }

    /** Mockup `newChat()`: misma vista vacía que Agents (idle), no una sesión paralela. */
    protected async openEmptyMobileChatSheet(project: MobileProjectEntry): Promise<void> {
        this.sessionsSidebar?.hide();
        if (this.shouldUseAgentsHubLanding() && !this.isProjectDetailView()) {
            if (this.transcriptSheet) {
                this.closeTranscriptSheet();
            }
            if (this.agentsHubInlineActive) {
                this.closeAgentsHubSession();
            }
            this.setExecutionSurfaceTab(project, 'messages');
            if (this.visible) {
                this.renderHeader();
                this.renderSubtitle();
            }
            this.renderStickyComposer();
            return;
        }
        const cwd = this.projectsService.getProjectCwd(project);
        const agentId = (cwd ? readStoredAgent(cwd) : undefined)
            ?? this.activeTasks?.getDefaultAgent()
            ?? SHELL_AGENT_ID;
        const summary: QaapAgentConversationSummaryDTO = {
            id: `pending-new-chat-${project.id}-${Date.now()}`,
            cwd: cwd ?? '',
            workspacePath: cwd,
            agentId,
            title: nls.localize('qaap/mobileProjects/newChatTitle', 'New chat'),
            status: 'idle',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
        };
        await this.openTranscriptSheet(project, summary);
    }

    protected isPendingNewChatSummary(summary: QaapAgentConversationSummaryDTO): boolean {
        return summary.id.startsWith('pending-new-chat-');
    }

    protected resolveTranscriptHeaderTitle(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        const title = summary.title?.trim();
        if (!title || title === project.name) {
            return project.name;
        }
        return nls.localize('qaap/mobileProjects/chatHeaderProjectTitle', '{0} · {1}', project.name, title);
    }

    protected async onWorkHubSessionsSidebarAutomations(): Promise<void> {
        this.sessionsSidebar?.hide();
        await this.delegate.onShowRoutinesHub?.();
    }

    protected onSessionsSidebarAccountClick(anchor: HTMLButtonElement): void {
        toggleQaapAccountMenu(
            anchor,
            this.commands,
            buildQaapAccountMenuEntries(readQaapSignedIn()),
            {
                section: QAAP_WORK_HUB_GETTING_STARTED,
                onCatalogAction: action => { void this.runCatalogAction(action); },
            },
            {
                placement: 'above',
                anchorGap: 2,
                onMenuAction: () => { this.sessionsSidebar?.hide(); },
            },
        );
    }

    protected async openSessionsSidebarSearch(): Promise<void> {
        if (!this.quickInputService) {
            return;
        }
        const project = this.resolveWorkHubSessionsSidebarProject();
        if (!project) {
            return;
        }
        const conversations = [...this.conversationsForProject(project)]
            .sort((a, b) => b.updatedAt - a.updatedAt);
        type SessionPickItem = QuickPickItem & { summary: QaapAgentConversationSummaryDTO };
        const quickPick = this.quickInputService.createQuickPick<SessionPickItem>();
        quickPick.placeholder = nls.localize('qaap/sessionsSidebar/searchPlaceholder', 'Search sessions');
        quickPick.items = conversations.map(summary => ({
            label: summary.title?.trim() || nls.localize('qaap/mobileProjects/untitledChat', 'Untitled chat'),
            description: summary.agentId,
            summary,
        }));
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected?.summary) {
                this.sessionsSidebar?.hide();
                void this.openConversationSummary(project, selected.summary);
            }
            quickPick.hide();
        });
        quickPick.show();
    }

    protected notifyWorkspaceHubBottomBarRefresh(): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT));
        }
    }

    protected collectTeamMembersForHub(): WorkHubTeamMember[] {
        const conversations: Array<{
            projectId: string;
            projectName: string;
            cwd: string;
            id: string;
            agentId: string;
            title: string;
            status: QaapAgentConversationSummaryDTO['status'];
            paused?: boolean;
            activityLabel?: string;
            turnProgressCurrent?: number;
            turnProgressTotal?: number;
            linesAdded?: number;
            linesRemoved?: number;
            createdAt: number;
            updatedAt: number;
        }> = [];
        for (const project of this.projects) {
            for (const summary of this.conversationsForProject(project)) {
                if (summary.source === 'theia-chat') {
                    continue;
                }
                conversations.push({
                    projectId: project.id,
                    projectName: project.name,
                    cwd: summary.cwd,
                    id: summary.id,
                    agentId: summary.agentId,
                    title: summary.title,
                    status: summary.status,
                    paused: summary.paused,
                    activityLabel: summary.activityLabel,
                    turnProgressCurrent: summary.turnProgressCurrent,
                    turnProgressTotal: summary.turnProgressTotal,
                    linesAdded: summary.linesAdded,
                    linesRemoved: summary.linesRemoved,
                    createdAt: summary.createdAt,
                    updatedAt: summary.updatedAt,
                });
            }
        }
        return collectAgentMembers({
            tasks: this.activeTasks?.getAllTasks() ?? [],
            conversations,
        }).map(member => ({
            ...member,
            projectId: member.projectId ?? this.resolveProjectIdForTeamMember(member),
        }));
    }

    protected collectTeamApprovalItems(members: readonly WorkHubTeamMember[]): WorkHubApprovalItem[] {
        const memberByConversationId = new Map<string, WorkHubTeamMember>();
        for (const member of members) {
            if (member.conversationId) {
                memberByConversationId.set(member.conversationId, member);
            }
        }
        const items: WorkHubApprovalItem[] = [];
        const seenConversationIds = new Set<string>();
        for (const approval of this.cachedAgentApprovals) {
            const member = memberByConversationId.get(approval.conversationId)
                ?? this.buildApprovalMemberFromRequest(approval, members);
            if (!member) {
                continue;
            }
            seenConversationIds.add(approval.conversationId);
            items.push({
                member,
                approvalId: approval.id,
                summary: approval.summary,
                detail: approval.detail,
            });
        }
        for (const member of members) {
            if (!member.conversationId || member.kind !== 'conversation' || seenConversationIds.has(member.conversationId)) {
                continue;
            }
            const project = this.resolveProjectForTeamMember(member);
            const summary = project
                ? this.conversationsForProject(project).find(c => c.id === member.conversationId)
                : undefined;
            if (!summary || summary.source === 'theia-chat' || isConversationAutoApproveEnabled(summary)) {
                continue;
            }
            if (summary.status !== 'streaming' && summary.status !== 'idle') {
                continue;
            }
            items.push({
                member,
                hint: summary.status === 'streaming'
                    ? nls.localize(
                        'qaap/mobileProjects/teamApprovalHintStreaming',
                        'Manual tool approval — enable YOLO or approve on the VPS.',
                    )
                    : nls.localize(
                        'qaap/mobileProjects/teamApprovalHintIdle',
                        'Manual tool approval is on for this task.',
                    ),
            });
        }
        return items.sort((a, b) => b.member.updatedAt - a.member.updatedAt);
    }

    protected buildApprovalMemberFromRequest(
        approval: QaapAgentApprovalRequestDTO,
        members: readonly WorkHubTeamMember[],
    ): WorkHubTeamMember | undefined {
        const existing = members.find(member => member.conversationId === approval.conversationId);
        if (existing) {
            return existing;
        }
        const project = this.projects.find(p => {
            const cwd = this.projectsService.getProjectCwd(p);
            return cwd === approval.cwd;
        });
        return {
            id: `approval:${approval.conversationId}`,
            cwd: approval.cwd,
            agentId: approval.agentId,
            title: approval.conversationTitle,
            projectName: project?.name ?? approval.cwd.split('/').filter(Boolean).pop() ?? approval.cwd,
            projectId: project?.id,
            state: 'streaming',
            kind: 'conversation',
            conversationId: approval.conversationId,
            childCount: 0,
            createdAt: approval.createdAt,
            updatedAt: approval.createdAt,
        };
    }

    protected resolveProjectIdForTeamMember(member: WorkHubTeamMember): string | undefined {
        for (const project of this.projects) {
            const cwd = this.projectsService.getProjectCwd(project);
            if (cwd === member.cwd || cwdMatchesProject(member.cwd, project)) {
                return project.id;
            }
        }
        return undefined;
    }

    protected resolveProjectForTeamMember(member: WorkHubTeamMember): MobileProjectEntry | undefined {
        if (member.projectId) {
            return this.projects.find(p => p.id === member.projectId);
        }
        return this.projects.find(p => {
            const cwd = this.projectsService.getProjectCwd(p);
            return cwd === member.cwd || cwdMatchesProject(member.cwd, p);
        });
    }

    protected onTeamMemberClick(member: WorkHubTeamMember): void {
        if (member.conversationId) {
            const project = this.resolveProjectForTeamMember(member);
            const summary = project
                ? this.conversationsForProject(project).find(c => c.id === member.conversationId)
                : undefined;
            if (project && summary) {
                void this.openTranscriptSheet(project, summary);
                return;
            }
        }
        if (member.taskId) {
            const project = this.resolveProjectForTeamMember(member);
            if (project) {
                void this.showTaskLog(project, member.taskId);
                return;
            }
        }
        const project = this.resolveProjectForTeamMember(member);
        if (project) {
            this.hubView = 'repos';
            this.projectsService.setHubView('repos');
            void this.openProjectDetail(project);
        }
    }

    protected async refreshWorkHubRoutines(force = false): Promise<void> {
        if (this.workHubRoutinesLoading && !force) {
            return;
        }
        this.workHubRoutinesLoading = true;
        try {
            const response = await fetchWorkHubRoutines();
            this.workHubRoutines = response.routines;
            this.workHubRoutinesDefaultAgent = response.defaultAgent;
            this.workHubRoutinesLoaded = true;
        } catch {
            if (!this.workHubRoutinesLoaded) {
                this.workHubRoutines = [];
            }
        } finally {
            this.workHubRoutinesLoading = false;
            if (this.visible && this.hubView === 'routines') {
                this.renderList();
            }
        }
    }

    protected resolveDefaultRoutineCwd(): string {
        const current = this.projects.find(p => p.isCurrent);
        const cwd = current ? this.projectsService.getProjectCwd(current) : undefined;
        if (cwd) {
            return cwd;
        }
        const withUri = this.projects.find(p => p.uri);
        if (withUri?.uri) {
            return withUri.uri.path.toString();
        }
        return '';
    }

    protected openRoutineEditor(routine?: QaapWorkHubRoutine): void {
        this.closeRoutineEditor();
        this.editingRoutineId = routine?.id;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-routine-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-routine-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeRoutineEditor());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-routine-sheet-panel q-sheet';
        panel.addEventListener('click', ev => ev.stopPropagation());
        panel.addEventListener('pointerdown', ev => ev.stopPropagation());

        const handle = document.createElement('div');
        handle.className = 'theia-mobile-routine-sheet-handle';
        handle.setAttribute('aria-hidden', 'true');

        const header = document.createElement('header');
        header.className = 'theia-mobile-routine-sheet-header';
        const heading = document.createElement('h2');
        heading.textContent = routine
            ? nls.localize('qaap/mobileProjects/routineEdit', 'Edit routine')
            : nls.localize('qaap/mobileProjects/routineNew', 'New routine');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-routine-sheet-close q-icon-button codicon codicon-close';
        close.addEventListener('click', () => this.closeRoutineEditor());
        header.append(heading, close);

        const form = document.createElement('div');
        form.className = 'theia-mobile-routine-sheet-form';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'theia-mobile-routine-field';
        titleInput.placeholder = nls.localize('qaap/mobileProjects/routineTitlePlaceholder', 'Title');
        titleInput.value = routine?.title ?? '';

        const promptInput = document.createElement('textarea');
        promptInput.className = 'theia-mobile-routine-field theia-mod-textarea';
        promptInput.placeholder = nls.localize('qaap/mobileProjects/routinePromptPlaceholder', 'What should the VPS agent do?');
        promptInput.value = routine?.prompt ?? '';

        const cwdInput = document.createElement('input');
        cwdInput.type = 'text';
        cwdInput.className = 'theia-mobile-routine-field';
        cwdInput.placeholder = nls.localize('qaap/mobileProjects/routineCwdPlaceholder', 'Working directory (absolute path)');
        cwdInput.value = routine?.cwd ?? this.resolveDefaultRoutineCwd();

        const agentPicker = createAgentPickerField({
            label: nls.localize('qaap/mobileProjects/routineAgent', 'Agent'),
            agents: [],
            selectedId: routine?.agent ?? this.workHubRoutinesDefaultAgent ?? QAIQ_AGENT_ID,
        });
        void fetchAgentTaskListAll().then(snapshot => {
            agentPicker.setAgents(filterUiSelectableVpsAgents(snapshot.agents).filter(a => a.available));
            const selected = routine?.agent ?? this.workHubRoutinesDefaultAgent ?? QAIQ_AGENT_ID;
            agentPicker.setSelectedId(selected);
        }).catch(() => {
            agentPicker.setAgents([{ id: QAIQ_AGENT_ID, label: 'QAIQ' }]);
            agentPicker.setSelectedId(QAIQ_AGENT_ID);
        });

        const syncScheduleFields = (): void => {
            const trigger = triggerField.getValue();
            const isInterval = trigger === 'interval';
            const isCron = trigger === 'cron';
            intervalInput.hidden = !isInterval;
            for (const el of [cronPresetSelect, cronCustomInput, timezoneInput, oneShotLabel]) {
                (el as HTMLElement).hidden = !isCron;
            }
        };
        const triggerField = createSegmentedField<QaapWorkHubRoutineTrigger>({
            label: nls.localize('qaap/mobileProjects/routineTrigger', 'Schedule'),
            segments: [
                { id: 'manual', label: nls.localize('qaap/mobileProjects/routineTriggerManualShort', 'Manual') },
                { id: 'interval', label: nls.localize('qaap/mobileProjects/routineTriggerIntervalShort', 'Interval') },
                { id: 'cron', label: nls.localize('qaap/mobileProjects/routineTriggerCronShort', 'Cron') },
            ],
            value: routine?.trigger ?? 'manual',
            onChange: () => syncScheduleFields(),
        });

        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.min = '1';
        intervalInput.max = '168';
        intervalInput.className = 'theia-mobile-routine-field theia-mod-interval-field';
        intervalInput.placeholder = nls.localize('qaap/mobileProjects/routineIntervalHours', 'Interval (hours)');
        intervalInput.value = String(routine?.intervalHours ?? 24);

        const cronPresetSelect = document.createElement('select');
        cronPresetSelect.className = 'theia-mobile-routine-field theia-mod-cron-field';
        for (const preset of QAAP_ROUTINE_CRON_PRESETS) {
            const option = document.createElement('option');
            option.value = preset.expression;
            option.textContent = preset.label;
            cronPresetSelect.append(option);
        }
        const initialCron = routine?.cronExpression ?? QAAP_ROUTINE_CRON_PRESETS[0].expression;
        cronPresetSelect.value = QAAP_ROUTINE_CRON_PRESETS.some(p => p.expression === initialCron)
            ? initialCron
            : QAAP_ROUTINE_CRON_PRESETS[0].expression;

        const cronCustomInput = document.createElement('input');
        cronCustomInput.type = 'text';
        cronCustomInput.className = 'theia-mobile-routine-field theia-mod-cron-field';
        cronCustomInput.placeholder = nls.localize('qaap/mobileProjects/routineCronExpression', 'Cron expression (min hour dom month dow)');
        cronCustomInput.value = initialCron;

        const timezoneInput = document.createElement('input');
        timezoneInput.type = 'text';
        timezoneInput.className = 'theia-mobile-routine-field theia-mod-cron-field';
        timezoneInput.placeholder = nls.localize('qaap/mobileProjects/routineTimezone', 'Timezone (IANA, e.g. Europe/Madrid)');
        timezoneInput.value = routine?.timezone
            ?? Intl.DateTimeFormat().resolvedOptions().timeZone
            ?? 'UTC';

        const runModeField = createSegmentedField<QaapWorkHubRoutineRunMode>({
            label: nls.localize('qaap/mobileProjects/routineRunMode', 'Session'),
            segments: [
                { id: 'fresh', label: nls.localize('qaap/mobileProjects/routineRunModeFreshShort', 'Fresh') },
                { id: 'continue', label: nls.localize('qaap/mobileProjects/routineRunModeContinueShort', 'Continue') },
            ],
            value: routine?.runMode ?? 'fresh',
        });

        const oneShotLabel = document.createElement('label');
        oneShotLabel.className = 'theia-mobile-routine-enabled theia-mod-cron-field';
        const oneShotInput = document.createElement('input');
        oneShotInput.type = 'checkbox';
        oneShotInput.checked = routine?.oneShot ?? false;
        oneShotLabel.append(oneShotInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineOneShot', 'Run once then disable'),
        ));

        cronPresetSelect.addEventListener('change', () => {
            cronCustomInput.value = cronPresetSelect.value;
        });
        syncScheduleFields();

        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'theia-mobile-routine-enabled';
        const enabledInput = document.createElement('input');
        enabledInput.type = 'checkbox';
        enabledInput.checked = routine?.enabled ?? false;
        enabledLabel.append(enabledInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineEnabled', 'Enabled'),
        ));

        const autoApproveLabel = document.createElement('label');
        autoApproveLabel.className = 'theia-mobile-routine-enabled';
        const autoApproveInput = document.createElement('input');
        autoApproveInput.type = 'checkbox';
        autoApproveInput.checked = routine?.autoApprove !== false;
        autoApproveLabel.append(autoApproveInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineAutoApprove', 'Auto-approve tools (YOLO)'),
        ));
        const autoApproveHint = document.createElement('p');
        autoApproveHint.className = 'theia-mobile-routine-field-hint';
        autoApproveHint.textContent = nls.localize(
            'qaap/mobileProjects/routineAutoApproveHint',
            'Keep on for scheduled runs. Turn off only if you will watch the VPS and approve tool calls manually.',
        );

        form.append(
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routineTitle', 'Title')),
            titleInput,
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routinePrompt', 'Prompt')),
            promptInput,
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routineCwd', 'Working directory')),
            cwdInput,
            agentPicker.root,
            triggerField.root,
            intervalInput,
            cronPresetSelect,
            cronCustomInput,
            timezoneInput,
            runModeField.root,
            oneShotLabel,
            enabledLabel,
            autoApproveLabel,
            autoApproveHint,
        );

        const footer = document.createElement('footer');
        footer.className = 'theia-mobile-routine-sheet-footer';
        if (routine) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'theia-mobile-routine-btn theia-mod-danger';
            deleteBtn.textContent = nls.localize('qaap/mobileProjects/routineDelete', 'Delete');
            deleteBtn.addEventListener('click', () => { void this.deleteRoutine(routine.id); });
            footer.append(deleteBtn);
        }
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'theia-mobile-routine-btn theia-mod-primary q-button-primary';
        saveBtn.textContent = nls.localize('qaap/mobileProjects/routineSave', 'Save');
        saveBtn.addEventListener('click', () => {
            const trigger = triggerField.getValue();
            void this.saveRoutineFromEditor({
                id: routine?.id,
                title: titleInput.value,
                prompt: promptInput.value,
                cwd: cwdInput.value,
                agent: agentPicker.getSelectedId(),
                trigger,
                intervalHours: Number(intervalInput.value),
                cronExpression: cronCustomInput.value.trim() || cronPresetSelect.value,
                timezone: timezoneInput.value.trim(),
                oneShot: oneShotInput.checked,
                runMode: runModeField.getValue(),
                enabled: enabledInput.checked,
                autoApprove: autoApproveInput.checked,
            });
        });
        footer.append(saveBtn);

        panel.append(handle, header, form, footer);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.routineSheet = sheet;
    }

    protected closeRoutineEditor(): void {
        this.routineSheet?.remove();
        this.routineSheet = undefined;
        this.editingRoutineId = undefined;
    }

    protected async saveRoutineFromEditor(fields: {
        id?: string;
        title: string;
        prompt: string;
        cwd: string;
        agent: string;
        trigger: QaapWorkHubRoutineTrigger;
        intervalHours: number;
        cronExpression: string;
        timezone: string;
        oneShot: boolean;
        runMode: QaapWorkHubRoutineRunMode;
        enabled: boolean;
        autoApprove: boolean;
    }): Promise<void> {
        try {
            const payload = {
                title: fields.title,
                prompt: fields.prompt,
                cwd: fields.cwd,
                agent: fields.agent,
                trigger: fields.trigger,
                intervalHours: fields.intervalHours,
                ...(fields.trigger === 'cron' ? {
                    cronExpression: fields.cronExpression,
                    timezone: fields.timezone,
                    oneShot: fields.oneShot,
                } : {}),
                runMode: fields.runMode,
                enabled: fields.enabled,
                autoApprove: fields.autoApprove,
            };
            if (fields.id) {
                await updateWorkHubRoutine(fields.id, payload);
            } else {
                await createWorkHubRoutine(payload);
            }
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineSaved', 'Routine saved'),
                { kind: 'success', duration: 1400 },
            );
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected async deleteRoutine(id: string): Promise<void> {
        try {
            await deleteWorkHubRoutine(id);
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected async runCatalogAction(action: WorkHubCatalogAction): Promise<void> {
        switch (action.type) {
            case 'command':
                if (action.commandId === QAAP_WORK_HUB_AI_FEATURES_COMMAND && this.openPreferencesSheet) {
                    await this.openPreferencesSheet('ai-features');
                    return;
                }
                if (action.commandId === QAAP_WORK_HUB_AI_CONFIGURATION_COMMAND && this.openAiConfigurationSheet) {
                    await this.openAiConfigurationSheet(QAAP_WORK_HUB_AI_CONFIGURATION_AGENTS_TAB);
                    return;
                }
                if (this.commands.getCommand(action.commandId)) {
                    await this.commands.executeCommand(action.commandId);
                }
                return;
            case 'hub-view':
                this.selectHubLandingView(action.view);
                return;
            case 'replay-tutorial':
                await this.commands.executeCommand(MobileOnboardingTutorialContribution.REPLAY_COMMAND.id);
                return;
            default:
                return;
        }
    }

    protected resetInboxPullRequestState(): void {
        this.inboxPullRequestsAbort?.abort();
        this.inboxPullRequestsAbort = undefined;
        this.inboxPullRequests = [];
        this.inboxPullRequestsLoaded = false;
        this.inboxPullRequestsLoading = false;
        this.inboxGithubSignedIn = undefined;
    }

    protected finishInboxPullRequestLoad(generation: number): void {
        if (generation !== this.inboxLoadGeneration) {
            this.inboxPullRequestsLoading = false;
            return;
        }
        this.inboxPullRequestsLoaded = true;
        this.inboxPullRequestsLoading = false;
        if (this.visible && (this.hubView === 'review' || this.hubView === 'home')) {
            this.renderList();
        }
    }

    protected async refreshInboxPullRequests(
        projects: MobileProjectEntry[] = this.projectsForCurrentHubList(),
        force = false,
    ): Promise<void> {
        if (this.inboxPullRequestsLoading && !force) {
            return;
        }
        const generation = this.inboxLoadGeneration;
        this.inboxPullRequestsAbort?.abort();
        const abort = new AbortController();
        this.inboxPullRequestsAbort = abort;
        const timeout = window.setTimeout(() => abort.abort(), MobileProjectsPanel.INBOX_PR_FETCH_TIMEOUT_MS);
        this.inboxPullRequestsLoading = true;
        const repoKeys = githubRepoKeysForProjects(projects);
        try {
            const config = await fetchQaapAuthConfig().catch(() => ({ skipAuth: false, githubOAuth: false }));
            if (config.skipAuth) {
                this.inboxPullRequests = [];
                this.inboxGithubSignedIn = undefined;
                return;
            }
            if (repoKeys.length === 0) {
                this.inboxPullRequests = [];
                this.inboxGithubSignedIn = undefined;
                return;
            }
            const auth = await fetchQaapAuthSession();
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (!auth.signedIn) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.inboxGithubSignedIn = false;
                this.inboxPullRequests = [];
                return;
            }
            this.inboxGithubSignedIn = true;
            const response = await fetchQaapGithubPullRequests(repoKeys);
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (response.signedIn === false) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.inboxGithubSignedIn = false;
                this.inboxPullRequests = [];
                return;
            }
            this.inboxGithubSignedIn = true;
            this.inboxPullRequests = this.mergeInboxPullRequests(response.pullRequests);
        } catch {
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            this.inboxPullRequests = [];
        } finally {
            window.clearTimeout(timeout);
            if (this.inboxPullRequestsAbort === abort) {
                this.inboxPullRequestsAbort = undefined;
            }
            this.finishInboxPullRequestLoad(generation);
        }
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-repo';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResults', 'No matching repositories')
            : nls.localize('qaap/mobileProjects/noRepositories', 'No repositories yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResultsBody', 'Try another name, branch, or owner.')
            : nls.localize('qaap/mobileProjects/noRepositoriesBody', 'Create or clone a GitHub repository to start working.');
        empty.append(icon, title, body);
        return empty;
    }

    protected createSectionLabel(text: string, withDot: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-section';
        if (withDot) {
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-section-dot';
            row.append(dot);
        }
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-section-label';
        label.textContent = text;
        row.append(label);
        return row;
    }

    protected createRow(project: MobileProjectEntry): HTMLElement {
        const card = document.createElement('div');
        card.className = 'theia-mobile-projects-card';
        card.style.setProperty('--qaap-mobile-project-accent', project.color);
        if (project.isCurrent) {
            card.classList.add('theia-mod-current');
        }
        const isExpanded = !this.homeMode && this.expandedId === project.id;
        if (isExpanded) {
            card.classList.add('theia-mod-expanded');
        }

        const running = this.countRunningTasks(project) > 0;
        const needsInput = this.countNeedsInputTasks(project) > 0;
        const failed = this.countFailedTasks(project) > 0;
        const unreadCount = this.countUnreadTasks(project);
        const doneCount = this.countDoneTasks(project);
        const activeInfo = this.activeInfoForProject(project);

        // Collapsed header (always visible) — clicking toggles the expansion.
        const header = document.createElement('div');
        header.className = 'theia-mobile-projects-row-head';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

        // Status glyph follows a priority ladder so the most actionable state wins:
        //   needs-input > failed > running > unread > current workspace > done > idle
        // The colored dot + animation pair signals intent at a glance from the project list.
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-projects-row-glyph';
        if (project.isCurrent) {
            glyph.classList.add('theia-mod-workspace');
        }
        if (needsInput) {
            glyph.classList.add('theia-mod-needs-input');
            glyph.title = nls.localize('qaap/mobileProjects/glyphNeedsInput', 'Waiting for your input');
        } else if (failed) {
            glyph.classList.add('theia-mod-failed');
            glyph.title = nls.localize('qaap/mobileProjects/glyphFailed', 'A task failed — review and retry');
        } else if (running) {
            glyph.classList.add('theia-mod-running');
            glyph.title = nls.localize('qaap/mobileProjects/glyphRunning', 'Agent is active');
        } else if (unreadCount > 0) {
            glyph.classList.add('theia-mod-unread');
            glyph.title = unreadCount === 1
                ? nls.localize('qaap/mobileProjects/glyphUnreadOne', 'New agent reply since you last opened this project')
                : nls.localize('qaap/mobileProjects/glyphUnreadMany', '{0} tasks with new agent replies', String(unreadCount));
        } else if (doneCount > 0) {
            glyph.classList.add('theia-mod-done');
        }

        const leading = this.homeMode ? this.createHomeRowAvatar(project) : glyph;
        if (this.homeMode) {
            for (const cls of glyph.classList) {
                if (cls !== 'theia-mobile-projects-row-glyph') {
                    leading.classList.add(cls);
                }
            }
            if (glyph.title) {
                leading.title = glyph.title;
            }
        }
        header.append(leading);

        const main = document.createElement('div');
        main.className = 'theia-mobile-projects-row-main';

        const nameRow = document.createElement('div');
        nameRow.className = 'theia-mobile-projects-row-name-row';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-projects-row-chevron';
        chevron.textContent = '›';
        chevron.setAttribute('aria-hidden', 'true');
        nameRow.append(chevron);
        const nameGroup = document.createElement('span');
        nameGroup.className = 'theia-mobile-projects-row-name-group';
        const name = document.createElement('span');
        name.className = 'theia-mobile-projects-row-name';
        name.textContent = project.name;
        nameGroup.append(name);
        if (project.pinned) {
            const pin = document.createElement('span');
            pin.className = 'codicon codicon-pin theia-mobile-projects-row-pin';
            pin.setAttribute('aria-hidden', 'true');
            nameGroup.append(pin);
        }
        nameRow.append(nameGroup);
        if (this.homeMode) {
            const homeStatus = this.createHomeRowStatus(project, {
                unreadCount,
                running,
                runningCount: this.countRunningTasks(project),
                needsInput,
                failed,
                failedCount: this.countFailedTasks(project),
                needsInputCount: this.countNeedsInputTasks(project),
            });
            if (isExpanded && homeStatus) {
                homeStatus.classList.add('theia-mobile-projects-row-status-inline');
                nameRow.append(homeStatus);
            }
            const open = this.createWorkspaceOpenControl(project);
            open.classList.add('theia-mobile-projects-row-name-open');
            nameRow.append(open);
            main.append(nameRow);
            if (homeStatus && !isExpanded) {
                const subRow = document.createElement('div');
                subRow.className = 'theia-mobile-projects-row-sub';
                homeStatus.classList.add('theia-mobile-projects-row-status-inline');
                subRow.append(homeStatus);
                main.append(subRow);
            }
        } else {
            main.append(nameRow);
        }

        const metaRow = document.createElement('div');
        metaRow.className = 'theia-mobile-projects-row-meta';
        const branchSpan = document.createElement('span');
        branchSpan.textContent = project.branch;
        metaRow.append(branchSpan);
        if (project.lastActive && project.lastActive !== '—') {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const time = document.createElement('span');
            time.textContent = project.lastActive;
            metaRow.append(sep, time);
        }
        if (running) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const run = document.createElement('span');
            run.className = 'theia-mobile-projects-row-meta-running';
            const runningCount = this.countRunningTasks(project);
            run.textContent = runningCount === 1
                ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(runningCount));
            metaRow.append(sep, run);
        } else if (doneCount > 0) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const cluster = document.createElement('span');
            cluster.className = 'theia-mobile-projects-row-meta-cluster';
            if (doneCount > 0) {
                const done = document.createElement('span');
                done.className = 'theia-mobile-projects-row-meta-done';
                done.textContent = doneCount === 1
                    ? nls.localize('qaap/mobileProjects/rowTask', '1 task')
                    : nls.localize('qaap/mobileProjects/rowTasksMany', '{0} tasks', String(doneCount));
                cluster.append(done);
            }
            metaRow.append(sep, cluster);
        }
        // Explicit "open in workspace" icon button on the meta row for non-home list layout.
        // Home mode always places it on the name row (collapsed and expanded).
        if (!this.homeMode) {
            metaRow.append(this.createWorkspaceOpenControl(project));
        }
        if (!this.homeMode || isExpanded) {
            main.append(metaRow);
        }
        header.append(main);

        const menu = this.buildProjectOptionsMenu(project);
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-row-menu';
        menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/cardMenu', 'Project options'));
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        const menuIcon = document.createElement('span');
        menuIcon.className = 'codicon codicon-kebab-vertical';
        menuIcon.setAttribute('aria-hidden', 'true');
        menuBtn.append(menuIcon);
        menuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.toggleCardMenu(card, menu, menuBtn);
        });
        menuBtn.addEventListener('keydown', ev => ev.stopPropagation());
        header.append(menuBtn);

        const onRowActivate = (): void => {
            if (this.homeMode) {
                void this.openProjectDetail(project);
                return;
            }
            void this.toggleRowExpanded(project);
        };
        header.addEventListener('click', ev => {
            ev.stopPropagation();
            onRowActivate();
        });
        header.addEventListener('keydown', ev => {
            if (ev.key !== 'Enter' && ev.key !== ' ') {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            onRowActivate();
        });
        header.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            onRowActivate();
        });
        card.append(header);

        if (!isExpanded) {
            return card;
        }

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-row-body';

        const workspaceBlock = this.createWorkspaceBlock(project);
        if (workspaceBlock) {
            body.append(workspaceBlock);
        }
        body.append(this.createTaskBlock(project, activeInfo));

        card.append(body, menu);
        return card;
    }

    protected async openProjectDetail(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        if (this.hubView !== 'repos') {
            this.hubView = 'repos';
            this.projectsService.setHubView('repos');
        }
        if (this.expandedId === project.id) {
            return;
        }
        this.expandedId = project.id;
        this.soloExpanded = true;
        this.closeStickyComposerSheets();
        disposeComposerContextEntries(this.stickyComposerContext);
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        await this.refreshChatServiceSessionSummaries();
        this.render();
        this.syncLandingHubListChrome();
        this.delegate.onProjectsChanged?.();
    }

    protected async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const wasExpanded = this.expandedId === project.id;
        this.expandedId = wasExpanded ? undefined : project.id;
        this.suppressCurrentAutoExpand = wasExpanded && project.isCurrent;
        // Hide the other rows while the user has a project expanded so the chat list isn't lost in
        // noise; when the user collapses it again the full list returns.
        this.soloExpanded = this.expandedId !== undefined;
        this.closeStickyComposerSheets();
        disposeComposerContextEntries(this.stickyComposerContext);
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        if (wasExpanded) {
            this.stickyComposerDraft = '';
        }
        await this.refreshChatServiceSessionSummaries();
        this.renderList();
    }

    protected createHomeRowAvatar(project: MobileProjectEntry): HTMLSpanElement {
        const avatar = document.createElement('span');
        avatar.className = 'theia-mobile-projects-row-avatar';
        avatar.textContent = mobileProjectInitials(project.name);
        avatar.style.setProperty('--qaap-mobile-project-accent', project.color);
        return avatar;
    }

    protected createHomeRowStatus(
        project: MobileProjectEntry,
        state: {
            unreadCount: number;
            running: boolean;
            runningCount: number;
            needsInput: boolean;
            needsInputCount: number;
            failed: boolean;
            failedCount: number;
        },
    ): HTMLElement | undefined {
        const line = document.createElement('div');
        line.className = 'theia-mobile-projects-row-status';
        if (state.unreadCount > 0) {
            line.classList.add('theia-mod-new');
            line.textContent = state.unreadCount === 1
                ? nls.localize('qaap/mobileProjects/rowNewOne', '1 new')
                : nls.localize('qaap/mobileProjects/rowNewMany', '{0} new', String(state.unreadCount));
            return line;
        }
        if (state.needsInput) {
            line.classList.add('theia-mod-needs-input');
            line.textContent = state.needsInputCount === 1
                ? nls.localize('qaap/mobileProjects/rowNeedsInputOne', 'Needs your input')
                : nls.localize('qaap/mobileProjects/rowNeedsInputMany', '{0} need your input', String(state.needsInputCount));
            return line;
        }
        if (state.failed) {
            line.classList.add('theia-mod-failed');
            line.textContent = state.failedCount === 1
                ? nls.localize('qaap/mobileProjects/rowFailedOne', '1 failed')
                : nls.localize('qaap/mobileProjects/rowFailedMany', '{0} failed', String(state.failedCount));
            return line;
        }
        if (state.running) {
            line.classList.add('theia-mod-running');
            line.textContent = state.runningCount === 1
                ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(state.runningCount));
            return line;
        }
        return undefined;
    }

    protected createWorkspaceOpenControl(project: MobileProjectEntry): HTMLButtonElement {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'theia-mobile-projects-row-meta-open';
        const openLabel = nls.localize('qaap/mobileProjects/workspaceOpenIn', 'Open in workspace');
        openBtn.setAttribute('aria-label', openLabel);
        openBtn.title = openLabel;
        const openIcon = document.createElement('span');
        openIcon.className = 'codicon codicon-link-external';
        openIcon.setAttribute('aria-hidden', 'true');
        openBtn.append(openIcon);
        openBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.delegate.onProjectOpen(project);
        });
        openBtn.addEventListener('keydown', ev => ev.stopPropagation());
        return openBtn;
    }

    protected async closeCurrentWorkspace(): Promise<void> {
        const commandId = WorkspaceCommands.CLOSE.id;
        if (!this.commands.getCommand(commandId) || !this.commands.isEnabled(commandId)) {
            return;
        }
        try {
            await this.commands.executeCommand(commandId);
            this.disposeTranscriptTerminalSlides();
            this.transcriptWorkspaceSurfaces.disposeAll();
            await this.refreshProjects();
        } catch (error) {
            console.error('[qaap-mobile-projects] close workspace failed:', error);
        }
    }

    protected createWorkspaceBlock(project: MobileProjectEntry): HTMLElement | undefined {
        if (project.isCurrent) {
            return undefined;
        }
        // For non-current projects the "Open in workspace" affordance is rendered as a compact
        // icon button on the meta row (see createRow) so it doesn't take a full line in the body.
        return undefined;
    }

    protected createTaskBlock(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const block = document.createElement('div');
        block.className = 'theia-mobile-projects-tasks-block';
        const surface = this.detailComposerSurfaceForProject(project);
        const isChatSurface = surface === 'chat';
        const allConversations = isChatSurface
            ? this.localChatsForProject(project)
            : this.vpsTasksForProject(project);
        const head = document.createElement('div');
        head.className = 'theia-mobile-projects-tasks-head';
        const headLabel = document.createElement('span');
        headLabel.textContent = isChatSurface
            ? nls.localize('qaap/mobileProjects/chatsHeading', 'Chats')
            : nls.localize('qaap/mobileProjects/tasksHeading', 'Tasks');
        head.append(headLabel);

        if (allConversations.length > 0) {
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-tasks-count';
            count.textContent = String(allConversations.length);
            head.append(count);
        }
        block.append(head);

        if (allConversations.length === 0) {
            if (isChatSurface) {
                const empty = document.createElement('div');
                empty.className = 'theia-mobile-projects-tasks-empty';
                empty.textContent = nls.localize(
                    'qaap/mobileProjects/chatsEmpty', 'No local chats yet. Start one below.'
                );
                block.append(empty);
                return block;
            }
            const fallbackTasks = this.fallbackTasksFromProject(project);
            if (fallbackTasks.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'theia-mobile-projects-tasks-empty';
                empty.textContent = nls.localize(
                    'qaap/mobileProjects/tasksEmpty', 'No tasks yet. Create one below.'
                );
                block.append(empty);
                return block;
            }
            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-tasks-list';
            for (const task of fallbackTasks) {
                list.append(this.createTaskItem(project, task, activeInfo));
            }
            block.append(list);
            return block;
        }

        const showAll = this.expandedConversationProjectIds.has(project.id);
        const limit = MobileProjectsPanel.CONVERSATIONS_COLLAPSED_LIMIT;
        const visibleConversations = showAll
            ? allConversations
            : allConversations.slice(0, limit);
        const hiddenCount = allConversations.length - visibleConversations.length;
        const tasks = visibleConversations.map(c => this.summaryToTaskView(c));

        // Pre-compute the set of conversation ids that have at least one descendant fork, so each
        // row can decide which lineage glyph to render (parent / child / both / standalone).
        const parentIds = new Set<string>();
        for (const c of allConversations) {
            if (c.forkedFromId) {
                parentIds.add(c.forkedFromId);
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-tasks-list';
        for (const group of this.groupConversationTasks(tasks)) {
            const section = document.createElement('section');
            section.className = `theia-mobile-projects-conversation-group theia-mod-${group.id}`;
            const groupHead = document.createElement('div');
            groupHead.className = 'theia-mobile-projects-conversation-group-head';
            const groupLabel = document.createElement('span');
            groupLabel.className = 'theia-mobile-projects-conversation-group-label';
            groupLabel.textContent = group.label;
            const groupCount = document.createElement('span');
            groupCount.className = 'theia-mobile-projects-conversation-group-count';
            groupCount.textContent = String(group.tasks.length);
            groupHead.append(groupLabel, groupCount);
            section.append(groupHead);
            for (const task of group.tasks) {
                const summary = visibleConversations.find(c => c.id === task.id);
                section.append(this.createTaskItem(project, task, activeInfo, summary, parentIds));
            }
            list.append(section);
        }
        block.append(list);

        if (hiddenCount > 0) {
            const moreRow = document.createElement('div');
            moreRow.className = 'theia-mobile-projects-tasks-more-row';
            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'theia-mobile-projects-tasks-more-btn';
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-ellipsis';
            icon.setAttribute('aria-hidden', 'true');
            moreBtn.append(
                icon,
                document.createTextNode(
                    isChatSurface
                        ? nls.localize('qaap/mobileProjects/chatsMore', 'More chats ({0})', String(hiddenCount))
                        : nls.localize('qaap/mobileProjects/tasksMore', 'More tasks ({0})', String(hiddenCount)),
                ),
            );
            moreBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.expandedConversationProjectIds.add(project.id);
                this.renderList();
            });
            moreRow.append(moreBtn);
            block.append(moreRow);
        }

        return block;
    }

    protected detailComposerSurfaceForProject(project: MobileProjectEntry): QaapComposerSurface {
        if (!this.homeMode || this.hubView !== 'repos' || this.expandedId !== project.id) {
            return 'task';
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        return readStoredComposerSurface(cwd) ?? this.stickyComposerSurface ?? 'task';
    }

    protected groupConversationTasks(tasks: MobileProjectTaskView[]): Array<{
        id: 'working' | 'needs-you' | 'recent' | 'done';
        label: string;
        tasks: MobileProjectTaskView[];
    }> {
        type ConversationGroup = {
            id: 'working' | 'needs-you' | 'recent' | 'done';
            label: string;
            tasks: MobileProjectTaskView[];
        };
        const groups = {
            working: [] as MobileProjectTaskView[],
            needsYou: [] as MobileProjectTaskView[],
            recent: [] as MobileProjectTaskView[],
            done: [] as MobileProjectTaskView[],
        };
        const recentWindowMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        for (const task of tasks) {
            if (task.state === 'running') {
                groups.working.push(task);
            } else if (task.state === 'needs-input' || task.state === 'failed' || task.state === 'interrupted') {
                groups.needsYou.push(task);
            } else if (now - (task.finishedAt ?? task.createdAt) <= recentWindowMs) {
                groups.recent.push(task);
            } else {
                groups.done.push(task);
            }
        }
        const ordered: ConversationGroup[] = [
            {
                id: 'working',
                label: nls.localize('qaap/mobileProjects/taskGroupWorking', 'Working'),
                tasks: groups.working,
            },
            {
                id: 'needs-you',
                label: nls.localize('qaap/mobileProjects/taskGroupNeedsYou', 'Needs you'),
                tasks: groups.needsYou,
            },
            {
                id: 'recent',
                label: nls.localize('qaap/mobileProjects/taskGroupRecent', 'Recent'),
                tasks: groups.recent,
            },
            {
                id: 'done',
                label: nls.localize('qaap/mobileProjects/taskGroupDone', 'Done'),
                tasks: groups.done,
            },
        ];
        return ordered.filter(group => group.tasks.length > 0);
    }

    protected createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        _activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        summary?: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string> = new Set<string>(),
        options?: { onActivate?: () => void; compact?: boolean },
    ): HTMLElement {
        const compact = options?.compact === true;
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-row';
        if (compact) {
            row.classList.add('theia-mod-sidebar-compact');
        }
        if (summary && this.transcriptOpenSummaryId === summary.id) {
            row.classList.add('theia-mod-current');
        }

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item';
        const isUnread = summary ? this.isConversationUnread(summary) : false;
        const visualStatus = resolveQaapAgentTaskVisualStatus(task, summary, isUnread);
        const isRunning = visualStatus.id === 'running';
        const needsInput = visualStatus.id === 'needs-you';
        const isDone = visualStatus.id === 'verified' || visualStatus.id === 'pr-ready';
        const isFailed = visualStatus.id === 'failed';
        const stateColor = visualStatus.color;
        if (this.justAddedTaskId === task.id) {
            item.classList.add('theia-mod-flash');
        }
        if (isDone) {
            item.classList.add('theia-mod-done');
        }
        if (needsInput) {
            item.classList.add('theia-mod-needs-input');
        }

        const lineage = summary ? this.resolveConversationLineage(summary, parentIds) : 'none';
        const taskDot = document.createElement('span');
        const showLineageGlyph = lineage !== 'none' && !isFailed && !isRunning && !needsInput;
        if (showLineageGlyph) {
            // Fork lineage: one glyph size for all roles; color + tooltip carry parent/child/both.
            taskDot.className = `theia-mobile-projects-task-lineage theia-mod-${lineage}`;
            taskDot.append(this.createTaskLeadingGlyph('codicon-repo-forked'));
            taskDot.setAttribute('aria-hidden', 'true');
            const lineageLabel = lineage === 'parent'
                ? nls.localize('qaap/mobileProjects/lineageParent', 'Forked into other tasks')
                : lineage === 'child'
                    ? nls.localize('qaap/mobileProjects/lineageChild', 'Forked from another task')
                    : nls.localize('qaap/mobileProjects/lineageBoth', 'Forked from another task and into others');
            taskDot.title = lineageLabel;
        } else if (visualStatus.id === 'verified') {
            taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
            taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
        } else if (visualStatus.id === 'pr-ready') {
            taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
            taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
        } else if (isFailed) {
            taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
            taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
        } else if (isRunning) {
            this.renderConversationTurnProgress(taskDot, summary);
        } else if (needsInput) {
            taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
            taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
        } else {
            taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
            taskDot.style.background = stateColor;
        }

        const taskBody = document.createElement('div');
        taskBody.className = 'theia-mobile-projects-task-body';

        const taskTitleRow = document.createElement('div');
        taskTitleRow.className = 'theia-mobile-projects-task-title-row';
        const taskTitle = document.createElement('span');
        taskTitle.className = 'theia-mobile-projects-task-title';
        taskTitle.textContent = task.title;
        const taskSince = document.createElement('span');
        taskSince.className = 'theia-mobile-projects-task-since';
        taskSince.textContent = this.formatTaskSince(task, summary);
        if (!compact && isRunning && summary?.turnProgressTotal && summary.turnProgressCurrent !== undefined) {
            const progressCount = document.createElement('span');
            progressCount.className = 'theia-mobile-projects-task-progress-count';
            progressCount.textContent = `${summary.turnProgressCurrent}/${summary.turnProgressTotal}`;
            const progressLabel = nls.localize(
                'qaap/mobileProjects/taskProgressSteps',
                '{0} of {1} steps',
                String(summary.turnProgressCurrent),
                String(summary.turnProgressTotal),
            );
            progressCount.setAttribute('aria-label', progressLabel);
            progressCount.title = progressLabel;
            taskTitleRow.append(taskTitle, progressCount, taskSince);
        } else {
            taskTitleRow.append(taskTitle, taskSince);
        }
        taskBody.append(taskTitleRow);

        if (!compact) {
            const footRow = document.createElement('div');
            footRow.className = 'theia-mobile-projects-task-foot';
            const agentLabel = this.resolveConversationAgentLabel(summary);
            const agentId = summary?.agentId?.trim()
                || this.activeTasks?.getDefaultAgent()
                || SHELL_AGENT_ID;
            const agentChip = createAgentTaskBadge({
                agentId,
                label: agentLabel,
            });
            footRow.append(agentChip);
            if (summary?.linkedPullRequest?.number) {
                const prChip = document.createElement('span');
                prChip.className = 'theia-mobile-projects-task-agent theia-mod-linked-pr';
                prChip.textContent = nls.localize(
                    'qaap/mobileProjects/inboxLinkedPrShort',
                    '#{0}',
                    String(summary.linkedPullRequest.number),
                );
                footRow.append(prChip);
            }
            this.appendConversationFootMetrics(footRow, summary, isRunning);

            if (summary && summary.messageCount > 0 && !this.hasConversationDiffStats(summary)) {
                this.appendTaskFootSeparator(footRow);
                const msgCount = document.createElement('span');
                msgCount.className = 'theia-mobile-projects-task-message-count';
                msgCount.textContent = String(summary.messageCount);
                const msgLabel = summary.messageCount === 1
                    ? nls.localize('qaap/mobileProjects/taskMessageOne', '1 message')
                    : nls.localize('qaap/mobileProjects/taskMessageMany', '{0} messages', String(summary.messageCount));
                msgCount.setAttribute('aria-label', msgLabel);
                msgCount.title = msgLabel;
                footRow.append(msgCount);
            }
            taskBody.append(footRow);
            const activityRow = this.createConversationActivityRow(project, summary, {
                isRunning,
                needsInput,
                isDone,
            });
            if (activityRow) {
                taskBody.append(activityRow);
            }
        }

        item.append(taskDot, taskBody);
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            options?.onActivate?.();
            void this.openTaskInAgent(project, task);
        });
        row.append(item);

        if (summary && isUnread && !needsInput) {
            const unread = document.createElement('span');
            unread.className = 'theia-mobile-projects-task-unread';
            const unreadLabel = nls.localize('qaap/mobileProjects/unreadBadge', 'New agent reply');
            unread.setAttribute('aria-label', unreadLabel);
            unread.title = unreadLabel;
            row.append(unread);
        }

        if (summary) {
            const flags = this.resolveConversationFlags(summary);
            if (flags.priority && !flags.paused) {
                row.classList.add('theia-mod-priority');
                if (!compact) {
                    const star = document.createElement('span');
                    star.className = 'codicon codicon-star-full theia-mobile-projects-conversation-priority-badge';
                    star.setAttribute('aria-label', nls.localize('qaap/mobileProjects/priorityBadge', 'High priority'));
                    star.title = star.getAttribute('aria-label')!;
                    taskTitleRow.insertBefore(star, taskTitleRow.firstChild);
                }
            }
            if (flags.paused) {
                row.classList.add('theia-mod-paused');
                if (!compact) {
                    const pause = document.createElement('span');
                    pause.className = 'codicon codicon-debug-pause theia-mobile-projects-conversation-pause-badge';
                    pause.setAttribute('aria-label', nls.localize('qaap/mobileProjects/pausedBadge', 'Paused'));
                    pause.title = pause.getAttribute('aria-label')!;
                    taskTitleRow.insertBefore(pause, taskTitleRow.firstChild);
                }
            }
            if (summary.source !== 'theia-chat' && !isConversationAutoApproveEnabled(summary)) {
                row.classList.add('theia-mod-manual-approval');
                if (!compact) {
                    const shield = document.createElement('span');
                    shield.className = 'codicon codicon-shield theia-mobile-projects-conversation-manual-badge';
                    const manualLabel = nls.localize('qaap/mobileProjects/manualApprovalBadge', 'Manual tool approval');
                    shield.setAttribute('aria-label', manualLabel);
                    shield.title = manualLabel;
                    taskTitleRow.insertBefore(shield, taskTitleRow.firstChild);
                }
            }
            if (isFailed && summary.source !== 'theia-chat') {
                const retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-retry-btn';
                const retryLabel = nls.localize('qaap/mobileProjects/retryTask', 'Retry task');
                retryBtn.setAttribute('aria-label', retryLabel);
                retryBtn.title = retryLabel;
                const retryIcon = document.createElement('span');
                retryIcon.className = 'codicon codicon-debug-restart';
                retryIcon.setAttribute('aria-hidden', 'true');
                retryBtn.append(retryIcon);
                retryBtn.addEventListener('click', ev => {
                    ev.stopPropagation();
                    void this.onRetryConversation(project, summary);
                });
                row.append(retryBtn);
            }

            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-menu-btn';
            menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/taskMenu', 'Task options'));
            menuBtn.setAttribute('aria-haspopup', 'menu');
            menuBtn.setAttribute('aria-expanded', 'false');
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-kebab-vertical';
            icon.setAttribute('aria-hidden', 'true');
            menuBtn.append(icon);
            const menu = this.buildConversationMenu(project, summary);
            menuBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.toggleCardMenu(row, menu, menuBtn);
            });
            row.append(menuBtn, menu);
        }

        return row;
    }

    protected createConversationActivityRow(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO | undefined,
        state: {
            readonly isRunning: boolean;
            readonly needsInput: boolean;
            readonly isDone: boolean;
        },
    ): HTMLElement | undefined {
        if (!summary) {
            return undefined;
        }
        const chips: HTMLElement[] = [];
        if (state.needsInput) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-comment-discussion',
                label: nls.localize('qaap/mobileProjects/activityNeedsUser', 'Waiting for you'),
                variant: 'needs-you',
            }));
        } else if (state.isRunning) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-sync',
                label: summary.activityLabel?.trim()
                    || nls.localize('qaap/mobileProjects/activityAgentWorking', 'Agent working'),
                variant: 'working',
            }));
        } else if (state.isDone || this.hasConversationDiffStats(summary)) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-check',
                label: this.hasConversationDiffStats(summary)
                    ? nls.localize('qaap/mobileProjects/activityChangesReady', 'Changes ready')
                    : nls.localize('qaap/mobileProjects/activityDone', 'Done'),
                variant: 'ready',
            }));
        }

        if (summary.linkedPullRequest?.number) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-git-pull-request',
                label: nls.localize('qaap/mobileProjects/activityPullRequest', 'PR #{0}', String(summary.linkedPullRequest.number)),
                variant: 'surface',
            }));
        }

        if (project.previewUrl) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-open-preview',
                label: nls.localize('qaap/mobileProjects/activityPreviewReady', 'Preview ready'),
                variant: 'surface',
            }));
        }

        if (summary.source !== 'theia-chat' || state.isRunning) {
            chips.push(this.createConversationActivityChip({
                iconClass: 'codicon-terminal',
                label: nls.localize('qaap/mobileProjects/activityTerminalAvailable', 'Terminal'),
                variant: 'surface',
            }));
        }

        if (chips.length === 0) {
            return undefined;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-activity-row';
        row.append(...chips.slice(0, 4));
        return row;
    }

    protected createConversationActivityChip(options: {
        readonly iconClass: string;
        readonly label: string;
        readonly variant: 'working' | 'needs-you' | 'ready' | 'surface';
    }): HTMLElement {
        const chip = document.createElement('span');
        chip.className = `theia-mobile-projects-task-activity-chip theia-mod-${options.variant}`;
        chip.title = options.label;
        const icon = document.createElement('span');
        icon.className = `codicon ${options.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-task-activity-chip-label';
        label.textContent = options.label;
        chip.append(icon, label);
        return chip;
    }

    protected renderConversationTurnProgress(
        host: HTMLElement,
        summary?: QaapAgentConversationSummaryDTO,
    ): void {
        const hasSteps = summary?.turnProgressTotal !== undefined
            && summary.turnProgressCurrent !== undefined
            && summary.turnProgressTotal > 0;
        host.className = 'theia-mobile-projects-task-progress';
        if (!hasSteps) {
            host.classList.add('theia-mod-indeterminate');
            host.setAttribute('aria-label', nls.localize('qaap/mobileProjects/taskProgressWorking', 'Agent working'));
            return;
        }
        const current = summary!.turnProgressCurrent!;
        const total = summary!.turnProgressTotal!;
        const ratio = conversationTurnProgressRatio(current, total);
        host.style.setProperty('--theia-mobile-projects-progress', String(ratio));
        host.setAttribute('aria-label', nls.localize(
            'qaap/mobileProjects/taskProgressSteps',
            '{0} of {1} steps',
            String(current),
            String(total),
        ));
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 22 22');
        svg.setAttribute('aria-hidden', 'true');
        const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        track.setAttribute('class', 'theia-mobile-projects-task-progress-track');
        track.setAttribute('cx', '11');
        track.setAttribute('cy', '11');
        track.setAttribute('r', '9');
        const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        fill.setAttribute('class', 'theia-mobile-projects-task-progress-fill');
        fill.setAttribute('cx', '11');
        fill.setAttribute('cy', '11');
        fill.setAttribute('r', '9');
        const circumference = 2 * Math.PI * 9;
        fill.style.strokeDasharray = `${circumference}`;
        fill.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
        svg.append(track, fill);
        host.append(svg);
    }

    protected formatTaskSince(task: MobileProjectTaskView, summary?: QaapAgentConversationSummaryDTO): string {
        const anchor = task.state === 'running'
            ? (summary?.updatedAt ?? task.createdAt)
            : (task.finishedAt ?? summary?.updatedAt ?? task.createdAt);
        if (!anchor) {
            return '';
        }
        const diff = Math.max(0, Date.now() - anchor);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (task.state === 'running' && diff < 45 * 1000) {
            return nls.localize('qaap/mobileProjects/taskSinceNow', 'just now');
        }
        if (diff < hour) {
            return nls.localize('qaap/mobileProjects/taskSinceMinutes', '{0} min', String(Math.max(1, Math.round(diff / minute))));
        }
        if (diff < day) {
            return nls.localize('qaap/mobileProjects/taskSinceHours', '{0} h', String(Math.round(diff / hour)));
        }
        return nls.localize('qaap/mobileProjects/taskSinceDays', '{0} d', String(Math.round(diff / day)));
    }

    protected appendTaskFootSeparator(footRow: HTMLElement): void {
        const sep = document.createElement('span');
        sep.className = 'theia-mobile-projects-task-foot-sep';
        sep.textContent = '·';
        footRow.append(sep);
    }

    protected appendConversationFootMetrics(
        footRow: HTMLElement,
        summary: QaapAgentConversationSummaryDTO | undefined,
        isRunning: boolean,
    ): void {
        if (!summary) {
            return;
        }
        if (isRunning && summary.activityLabel) {
            this.appendTaskFootSeparator(footRow);
            const activity = document.createElement('span');
            activity.className = 'theia-mobile-projects-task-activity';
            activity.textContent = this.localizeActivityLabel(summary.activityLabel);
            footRow.append(activity);
        }
        if (this.hasConversationDiffStats(summary)) {
            this.appendConversationDiffFoot(footRow, summary);
        }
        const ranLabel = this.formatConversationRunDuration(summary, isRunning);
        if (ranLabel) {
            this.appendTaskFootSeparator(footRow);
            const ran = document.createElement('span');
            ran.className = 'theia-mobile-projects-task-ran';
            ran.textContent = ranLabel;
            footRow.append(ran);
        }
    }

    protected localizeActivityLabel(label: string): string {
        switch (label) {
            case 'Searching':
                return nls.localize('qaap/mobileProjects/activitySearching', 'Searching');
            case 'Thinking':
                return nls.localize('qaap/mobileProjects/activityThinking', 'Thinking');
            case 'Reading files':
                return nls.localize('qaap/mobileProjects/activityReading', 'Reading files');
            case 'Running command':
                return nls.localize('qaap/mobileProjects/activityRunningCommand', 'Running command');
            case 'Editing':
                return nls.localize('qaap/mobileProjects/activityEditing', 'Editing');
            case 'Working':
                return nls.localize('qaap/mobileProjects/taskPreviewWorking', 'Working…');
            default:
                return label;
        }
    }

    protected hasConversationDiffStats(summary?: QaapAgentConversationSummaryDTO): boolean {
        if (!summary) {
            return false;
        }
        return (summary.linesAdded ?? 0) > 0 || (summary.linesRemoved ?? 0) > 0;
    }

    protected appendConversationDiffFoot(footRow: HTMLElement, summary: QaapAgentConversationSummaryDTO): void {
        const added = summary.linesAdded ?? 0;
        const removed = summary.linesRemoved ?? 0;
        this.appendTaskFootSeparator(footRow);
        const diff = document.createElement('span');
        diff.className = 'theia-mobile-projects-task-diff';
        const addedSpan = document.createElement('span');
        addedSpan.className = 'theia-mobile-projects-task-diff-added';
        addedSpan.textContent = `+${added}`;
        const removedSpan = document.createElement('span');
        removedSpan.className = 'theia-mobile-projects-task-diff-removed';
        removedSpan.textContent = `−${removed}`;
        diff.append(addedSpan, removedSpan);
        footRow.append(diff);
    }

    protected formatConversationRunDuration(
        summary: QaapAgentConversationSummaryDTO,
        isRunning: boolean,
    ): string | undefined {
        let durationMs: number | undefined;
        if (isRunning && summary.turnStartedAt) {
            durationMs = Math.max(0, Date.now() - summary.turnStartedAt);
        } else if (summary.lastTurnDurationMs) {
            durationMs = summary.lastTurnDurationMs;
        }
        if (durationMs === undefined || durationMs < 1000) {
            return undefined;
        }
        return this.formatDurationShort(durationMs);
    }

    protected formatDurationShort(durationMs: number): string {
        const minute = 60_000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (durationMs < minute) {
            return nls.localize(
                'qaap/mobileProjects/durationSeconds',
                '{0}s',
                String(Math.max(1, Math.round(durationMs / 1000))),
            );
        }
        if (durationMs < hour) {
            return nls.localize(
                'qaap/mobileProjects/durationMinutes',
                '{0}m',
                String(Math.max(1, Math.round(durationMs / minute))),
            );
        }
        if (durationMs < day) {
            return nls.localize(
                'qaap/mobileProjects/durationHours',
                '{0}h',
                String(Math.round(durationMs / hour)),
            );
        }
        return nls.localize(
            'qaap/mobileProjects/durationDays',
            '{0}d',
            String(Math.round(durationMs / day)),
        );
    }

    protected resolveConversationAgentLabel(summary?: QaapAgentConversationSummaryDTO): string {
        const agentId = summary?.agentId?.trim()
            || this.activeTasks?.getDefaultAgent()
            || SHELL_AGENT_ID;
        const fromList = this.activeTasks?.getAgents().find(a => a.id === agentId)?.label;
        if (fromList) {
            return fromList;
        }
        if (agentId === 'chat') {
            return nls.localize('qaap/mobileProjects/agentChat', 'Chat');
        }
        return agentId.startsWith('@') ? agentId : `@${agentId}`;
    }

    /**
     * Tap on a task in the landing: dismiss the dashboard and ask the hub to bring up the Agent on
     * this task. The hub action handles the cross-workspace case: if the task lives in a different
     * project it persists a pending action, switches the workspace (page reload), and replays it
     * once the new session boots.
     */
    protected async openTaskInAgent(project: MobileProjectEntry, task?: MobileProjectTaskView): Promise<void> {
        // Task ids now correspond to conversation ids — tap opens the transcript sheet in-place so
        // the user can read/continue the conversation without switching workspaces.
        if (task && this.conversations) {
            const summary = this.conversationsForProject(project).find(c => c.id === task.id);
            if (summary) {
                await this.openConversationSummary(project, summary);
                return;
            }
        }
        const entry = task ? { ...project, task: task.title } : project;
        this.hide();
        this.delegate.onDismiss();
        await this.delegate.onOpenAgentOnTask?.(entry);
    }

    protected async openConversationSummary(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        this.setExecutionSurfaceTab(project, 'messages');
        // Opening a chat clears its unread badge — record the high-water mark before navigating so
        // the project glyph drops the "new replies" treatment on the next render.
        this.conversationFlags?.markRead(summary.id, summary.updatedAt);
        await this.openTranscriptSheet(project, summary);
    }

    protected buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            iconClass: project.pinned ? 'codicon-pinned' : 'codicon-pin',
            onSelect: () => { void this.onTogglePin(project); },
        });

        if (project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace'),
                iconClass: 'codicon-close',
                onSelect: () => { void this.closeCurrentWorkspace(); },
            });
        }

        const canRemove = this.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'Remove is only for custom or recent projects')
                : !canRemove
                    ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                    : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        const conversations = this.conversationsForProject(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/clearAllTasks', 'Clear all tasks'),
            iconClass: 'codicon-clear-all',
            danger: true,
            disabled: conversations.length === 0,
            title: conversations.length === 0
                ? nls.localize('qaap/mobileProjects/clearAllTasksDisabled', 'No tasks to clear')
                : undefined,
            onSelect: () => { void this.onClearProjectChats(project); },
        });

        return menu;
    }

    protected buildCardMenu(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const canRunTask = !!this.projectsService.getProjectCwd(project) || !!project.github;

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runTask', 'Run background task'),
            disabled: !canRunTask,
            onSelect: () => { void this.openAgentComposer(project); },
        });
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/viewActiveLog', 'View active log'),
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.showTaskLog(project, activeInfo.taskId);
                }
            },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/cancelActiveTask', 'Cancel active task'),
            danger: true,
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.cancelActiveTask(activeInfo.taskId);
                }
            },
        });

        if (project.previewUrl || project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/openPreview', 'Open preview'),
                disabled: !this.delegate.onResumePreview,
                onSelect: () => {
                    this.closeCardMenu();
                    void this.delegate.onResumePreview?.(project);
                },
            });
        }

        const taskSeparator = document.createElement('div');
        taskSeparator.className = 'theia-mobile-projects-card-menu-separator';
        taskSeparator.setAttribute('role', 'separator');
        menu.append(taskSeparator);

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            onSelect: () => { void this.onTogglePin(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/rename', 'Rename'),
            onSelect: () => { void this.onRenameProject(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/duplicate', 'Duplicate'),
            onSelect: () => { void this.onDuplicateProject(project); },
        });

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        const canRemove = this.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'GitHub repositories stay visible in Projects')
                : !canRemove
                    ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                    : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        // The kebab button itself is built by the caller (createRow) — buildCardMenu only owns the menu.
        return menu;
    }

    protected buildConversationMenu(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu theia-mobile-projects-conversation-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        if (summary.status === 'failed' && summary.source !== 'theia-chat') {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/retryTask', 'Retry task'),
                iconClass: 'codicon-debug-restart',
                onSelect: () => { void this.onRetryConversation(project, summary); },
            });
            const retrySep = document.createElement('div');
            retrySep.className = 'theia-mobile-projects-card-menu-separator';
            retrySep.setAttribute('role', 'separator');
            menu.append(retrySep);
        }

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/openChat', 'Open chat'),
            iconClass: 'codicon-comment-discussion',
            onSelect: () => {
                void this.openConversationSummary(project, summary);
            },
        });

        const isTheiaChat = summary.source === 'theia-chat';
        const canFork = isTheiaChat
            ? !!summary.sessionId && !!this.chatService && !!this.conversations
            : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/forkTask', 'Fork task'),
            iconClass: 'codicon-git-branch',
            disabled: !canFork,
            title: canFork
                ? nls.localize('qaap/mobileProjects/forkTaskTitle', 'Duplicate this task to try another strategy.')
                : nls.localize('qaap/mobileProjects/forkTaskUnavailable', 'Only saved workspace tasks can be forked here.'),
            onSelect: () => { void this.onForkConversation(project, summary); },
        });

        const canRunVariants = !isTheiaChat && !summary.parallelRunId;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runVariants', 'Run variants'),
            iconClass: 'codicon-layers',
            disabled: !canRunVariants,
            title: canRunVariants
                ? nls.localize(
                    'qaap/mobileProjects/runVariantsTitle',
                    'Run the same prompt on multiple agents in parallel.',
                )
                : isTheiaChat
                    ? nls.localize(
                        'qaap/mobileProjects/runVariantsUnavailable',
                        'Parallel variants are only available for VPS agent tasks.',
                    )
                    : nls.localize(
                        'qaap/mobileProjects/runVariantsFromParentOnly',
                        'Start parallel variants from the parent task, not from a variant run.',
                    ),
            onSelect: () => {
                this.closeCardMenu();
                this.ensureOverlayUi().parallel.openParallelRunsSheet(project, summary);
            },
        });

        const canRename = isTheiaChat ? !!summary.sessionId && !!this.chatService : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/renameTask', 'Rename task'),
            iconClass: 'codicon-edit',
            disabled: !canRename,
            title: canRename
                ? nls.localize('qaap/mobileProjects/renameTaskTitle', 'Change this task name.')
                : nls.localize('qaap/mobileProjects/renameTaskUnavailable', 'This task cannot be renamed.'),
            onSelect: () => { void this.onRenameConversation(project, summary); },
        });

        const flags = this.resolveConversationFlags(summary);
        const canFlag = isTheiaChat ? !!this.conversationFlags : true;
        this.appendCardMenuItem(menu, {
            label: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriority', 'Remove high priority')
                : nls.localize('qaap/mobileProjects/markPriority', 'Mark as high priority'),
            iconClass: flags.priority ? 'codicon-star-full' : 'codicon-star-empty',
            disabled: !canFlag,
            title: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriorityTitle', 'Stop pinning this task at the top.')
                : nls.localize('qaap/mobileProjects/markPriorityTitle', 'Pin this task at the top of the project list.'),
            onSelect: () => { void this.onSetConversationPriority(summary, !flags.priority); },
        });
        this.appendCardMenuItem(menu, {
            label: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeTask', 'Resume task')
                : nls.localize('qaap/mobileProjects/pauseTask', 'Pause task'),
            iconClass: flags.paused ? 'codicon-debug-start' : 'codicon-debug-pause',
            disabled: !canFlag,
            title: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeTaskTitle', 'Move this task back to the active list.')
                : nls.localize(
                    'qaap/mobileProjects/pauseTaskTitle',
                    'Stop any active turn and push this task to the bottom of the list.'
                ),
            onSelect: () => { void this.onSetConversationPaused(project, summary, !flags.paused); },
        });

        if (summary.status === 'streaming') {
            const separator = document.createElement('div');
            separator.className = 'theia-mobile-projects-card-menu-separator';
            separator.setAttribute('role', 'separator');
            menu.append(separator);

            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/cancelTaskRun', 'Cancel run'),
                iconClass: 'codicon-debug-stop',
                danger: true,
                onSelect: () => { void this.onCancelConversation(project, summary); },
            });
        }

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/deleteTask', 'Delete task'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: summary.source === 'theia-chat' && !summary.sessionId,
            onSelect: () => { void this.onDeleteConversation(summary); },
        });

        return menu;
    }

    protected createFootButton(
        label: string,
        iconClass: string,
        modifier: 'theia-mod-primary' | 'theia-mod-secondary' | 'theia-mod-accent',
        onClick: () => void,
        disabled = false,
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `theia-mobile-projects-foot-btn ${modifier}`;
        btn.disabled = disabled;
        const icon = document.createElement('span');
        icon.className = `codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-projects-foot-btn-label';
        text.textContent = label;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.append(icon, text);
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            onClick();
        });
        return btn;
    }

    protected createQuickActions(project: MobileProjectEntry): HTMLElement | undefined {
        const showPreview = !!project.previewUrl || project.isCurrent;
        const showAgent = !!project.task?.trim() && project.task !== '—';
        if (!showPreview && !showAgent) {
            return undefined;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-quick';
        row.addEventListener('click', ev => ev.stopPropagation());

        if (showPreview && this.delegate.onResumePreview) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn';
            btn.innerHTML = '<span class="codicon codicon-preview" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/resumePreview', 'Resume preview');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onResumePreview?.(project);
            });
            row.append(btn);
        }
        if (showAgent && this.delegate.onOpenAgentOnTask) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn theia-mod-secondary';
            btn.innerHTML = '<span class="codicon codicon-comment-discussion" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/openAgent', 'Open agent');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onOpenAgentOnTask?.(project);
            });
            row.append(btn);
        }
        return row.childElementCount > 0 ? row : undefined;
    }

    /** Menus mount on `document.body` while the sessions sidebar is open (hub panel is visibility-hidden). */
    protected getCardMenuPortal(): HTMLElement {
        return this.sessionsSidebar?.isVisible() ? document.body : this.root;
    }

    protected getCardMenuScrollElement(): HTMLElement {
        if (this.sessionsSidebar?.isVisible()) {
            return this.sessionsSidebar.getScrollElement();
        }
        return this.scroll;
    }

    protected toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
        if (this.openMenu === menu) {
            this.closeCardMenu();
            return;
        }
        this.closeCardMenu();
        this.openMenu = menu;
        this.openMenuAnchor = menuBtn;
        this.openMenuCard = card;
        menu.hidden = false;
        menu.classList.add('theia-mod-open', 'theia-mod-floating');
        this.getCardMenuPortal().appendChild(menu);
        menuBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('theia-mod-menu-open');
        window.requestAnimationFrame(() => {
            if (this.openMenu === menu) {
                this.positionCardMenu(menu, menuBtn);
            }
        });
        const scrollEl = this.getCardMenuScrollElement();
        scrollEl.addEventListener('scroll', this.onScrollWhileMenuOpen, { passive: true });
        window.addEventListener('resize', this.onWindowResizeWhileMenuOpen);
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.create(() => {
            scrollEl.removeEventListener('scroll', this.onScrollWhileMenuOpen);
            window.removeEventListener('resize', this.onWindowResizeWhileMenuOpen);
        });
    }

    protected closeCardMenu(): void {
        if (!this.openMenu) {
            return;
        }
        const menu = this.openMenu;
        const card = this.openMenuCard ?? menu.closest('.theia-mobile-projects-card');
        const menuBtn = this.openMenuAnchor ?? card?.querySelector('.theia-mobile-projects-card-menu-btn');
        menu.hidden = true;
        menu.classList.remove('theia-mod-open', 'theia-mod-floating');
        this.clearCardMenuPosition(menu);
        if (card && card.contains(menu) === false) {
            card.appendChild(menu);
        }
        card?.classList.remove('theia-mod-menu-open');
        if (menuBtn instanceof HTMLButtonElement) {
            menuBtn.setAttribute('aria-expanded', 'false');
        }
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.NULL;
        this.openMenu = undefined;
        this.openMenuAnchor = undefined;
        this.openMenuCard = undefined;
    }

    /** Fixed layer above the projects panel so overflow on the scroll area does not clip options. */
    protected positionCardMenu(menu: HTMLElement, anchor: HTMLElement): void {
        const margin = 8;
        const gap = 4;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth, 168);
        const menuHeight = menu.offsetHeight;
        let top = anchorRect.bottom + gap;
        const maxBottom = window.innerHeight - margin;
        if (top + menuHeight > maxBottom) {
            const aboveTop = anchorRect.top - gap - menuHeight;
            top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
        }
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    protected clearCardMenuPosition(menu: HTMLElement): void {
        menu.style.top = '';
        menu.style.left = '';
        menu.style.right = '';
        menu.style.bottom = '';
        menu.style.position = '';
        menu.style.zIndex = '';
    }

    protected appendCardMenuItem(
        menu: HTMLElement,
        options: {
            label: string;
            iconClass?: string;
            disabled?: boolean;
            danger?: boolean;
            title?: string;
            onSelect: () => void;
        }
    ): void {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-card-menu-item';
        if (options.danger) {
            item.classList.add('theia-mod-danger');
        }
        item.setAttribute('role', 'menuitem');
        if (options.iconClass) {
            const icon = document.createElement('span');
            icon.className = `codicon ${options.iconClass}`;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = options.label;
            item.append(icon, label);
        } else {
            item.textContent = options.label;
        }
        item.disabled = !!options.disabled;
        if (options.title) {
            item.title = options.title;
        }
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!item.disabled) {
                options.onSelect();
            }
        });
        menu.append(item);
    }

    protected async onTogglePin(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        this.projectsService.togglePin(project);
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onRenameProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const renamed = await this.projectsService.renameProject(project);
        if (!renamed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onDuplicateProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const duplicated = await this.projectsService.duplicateProject(project);
        if (!duplicated) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onForkConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            const full = await forkConversation(summary.id);
            const forked = conversationToSummary(full);
            this.conversations?.recordSnapshot(forked);
            this.renderList();
            await this.openTranscriptSheet(project, forked);
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/forkTaskFailed',
                'Could not fork task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onRenameConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        if (summary.source === 'theia-chat' && (!summary.sessionId || !this.chatService)) {
            return;
        }
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/renameTaskDialog', 'Rename task'),
            initialValue: summary.title,
            placeholder: nls.localize('qaap/mobileProjects/renameTaskPlaceholder', 'Task name'),
            validate: (value, mode) => {
                if (mode !== 'preview' && !value.trim()) {
                    return nls.localize('qaap/mobileProjects/renameTaskRequired', 'Enter a task name');
                }
                return true;
            },
        });
        const value = await dialog.open();
        const title = value?.trim();
        if (!title || title === summary.title) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                await this.getOrRestoreProjectChatSession(project, summary);
                await this.chatService!.renameSession(summary.sessionId!, title);
                await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            } else {
                const full = await renameConversation(summary.id, title);
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/renameTaskFailed',
                'Could not rename task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onSetConversationPriority(
        summary: QaapAgentConversationSummaryDTO,
        priority: boolean,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                if (!this.conversationFlags) {
                    return;
                }
                this.conversationFlags.set(summary.id, { priority });
                this.conversations?.recordSnapshot({ ...summary, priority: priority || undefined });
            } else {
                const full = await updateConversation(summary.id, { priority });
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
            if (this.sessionsSidebar?.isVisible()) {
                this.sessionsSidebar.refreshList();
            }
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/priorityFailed',
                'Could not update task priority: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onSetConversationPaused(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        paused: boolean,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (paused && summary.status === 'streaming') {
                // Stopping the active turn mirrors what the server does for qaap-agent chats; for
                // Theia chats we use the same path as the existing "Cancel run" menu item.
                await this.onCancelConversation(project, summary);
            }
            if (summary.source === 'theia-chat') {
                if (!this.conversationFlags) {
                    return;
                }
                this.conversationFlags.set(summary.id, { paused });
                this.conversations?.recordSnapshot({ ...summary, paused: paused || undefined });
            } else {
                const full = await updateConversation(summary.id, { paused });
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/pauseFailed',
                'Could not change task pause state: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async toggleConversationAutoApproveById(conversationId: string): Promise<void> {
        const summary = this.conversations?.findSummaryById(conversationId);
        if (!summary || summary.source === 'theia-chat') {
            return;
        }
        await this.onSetConversationAutoApprove(summary, !isConversationAutoApproveEnabled(summary));
    }

    protected async onSetConversationAutoApprove(
        summary: QaapAgentConversationSummaryDTO,
        autoApprove: boolean,
    ): Promise<void> {
        if (this.transcriptAutoApproveBusy) {
            return;
        }
        this.closeCardMenu();
        this.transcriptAutoApproveBusy = true;
        try {
            const full = await updateConversation(summary.id, { autoApprove });
            const next = conversationToSummary(full);
            this.conversations?.recordSnapshot(next);
            this.renderList();
            MobileSnackbar.show(
                autoApprove
                    ? nls.localize('qaap/mobileProjects/taskAutoApproveEnabled', 'Auto-approve enabled for this task')
                    : nls.localize('qaap/mobileProjects/taskAutoApproveDisabled', 'Auto-approve disabled — tool calls may wait for approval'),
                { kind: 'success', duration: 2200 },
            );
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/taskAutoApproveFailed',
                'Could not update auto-approve: {0}',
                error instanceof Error ? error.message : String(error),
            ));
        } finally {
            this.transcriptAutoApproveBusy = false;
        }
    }

    protected async onCancelConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                const session = await this.getOrRestoreProjectChatSession(project, summary);
                const request = [...(session?.model.getRequests() ?? [])]
                    .reverse()
                    .find(candidate => ChatRequestModel.isInProgress(candidate));
                if (session && request) {
                    await this.chatService?.cancelRequest(session.id, request.id);
                }
            } else {
                await cancelConversation(summary.id);
            }
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/cancelTaskFailed',
                'Could not cancel run: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onRetryConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            const retried = await retryConversation(summary.id);
            this.conversations?.recordSnapshot(conversationToSummary(retried));
            const retriedTurn = [...retried.messages].reverse().find(message => message.role === 'user');
            this.applyTaskStartedToProject(retried.cwd, retriedTurn?.content ?? retried.title, retried.id);
            if (this.isWatchingOpenTranscript(summary.id)) {
                this.scheduleTranscriptConversationRefresh(project, summary, this.resolveActiveTranscriptChatHost()!);
            }
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/taskRetried', 'Task restarted'),
                { kind: 'success', duration: 1400 }
            );
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/retryTaskFailed',
                'Could not retry: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onDeleteConversation(summary: QaapAgentConversationSummaryDTO): Promise<void> {
        this.closeCardMenu();
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/deleteTask', 'Delete task'),
            msg: nls.localize('qaap/mobileProjects/deleteTaskConfirm', 'Delete this task? This cannot be undone.'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                if (!summary.sessionId || !this.chatService) {
                    return;
                }
                await this.chatService.deleteSession(summary.sessionId);
                this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            } else {
                await deleteConversation(summary.id);
                this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
            }
            this.closeTranscriptSheet();
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/deleteTaskFailed',
                'Could not delete task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onClearProjectChats(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return;
        }
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/clearAllTasks', 'Clear all tasks'),
            msg: nls.localize(
                'qaap/mobileProjects/clearAllTasksConfirm',
                'Clear all tasks for this project? This cannot be undone.'
            ),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            for (const summary of conversations) {
                if (summary.source === 'theia-chat') {
                    if (summary.sessionId && this.chatService) {
                        await this.chatService.deleteSession(summary.sessionId);
                        this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                    }
                } else {
                    await deleteConversation(summary.id);
                    this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                }
            }
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            this.closeTranscriptSheet();
            await this.refreshChatServiceSessionSummaries();
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/clearAllTasksFailed',
                'Could not clear tasks: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onRemoveProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const removed = await this.projectsService.removeProject(project);
        if (!removed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async openAgentComposer(project: MobileProjectEntry, draft?: string): Promise<void> {
        this.closeCardMenu();
        const cwd = this.projectsService.getProjectCwd(project);
        this.preferComposerSurface('task', cwd);
        this.stickyComposerDraft = draft ?? this.stickyComposerDraft;
        if (this.homeMode) {
            await this.openProjectDetail(project);
        } else {
            this.expandedId = project.id;
            this.soloExpanded = true;
            this.renderList();
        }
        window.setTimeout(() => {
            const input = this.stickyComposerHost.querySelector<HTMLInputElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            input?.focus();
        }, 80);
    }

    protected async ensureInlineComposerCwd(project: MobileProjectEntry): Promise<string | undefined> {
        let cwd = this.projectsService.getProjectCwd(project);
        if (!cwd && project.github) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/preparingRepo', 'Preparing {0}…', project.name),
                { kind: 'loading' }
            );
            cwd = await this.projectsService.prepareProjectCwd(project);
            MobileSnackbar.dismiss();
        }
        if (!cwd) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/runTaskNoCwd', 'Open or clone this project before running a background task.'),
                { duration: 2800 }
            );
            return undefined;
        }
        this.preparedCwdByProjectId.set(project.id, cwd);
        return cwd;
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
        const cwd = await this.ensureInlineComposerCwd(project);
        if (!cwd) {
            return;
        }
        try {
            const summary = await this.createProjectChatSession(project, cwd, draft, options);
            if (options.openConversation ?? true) {
                await this.openTranscriptSheet(project, summary);
            }
            this.applyTaskStartedToProject(cwd, draft, summary.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/taskStarted', 'Task started'),
                { kind: 'success', duration: 1400 }
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/taskStartFailed',
                'Could not start task: {0}',
                detail
            ));
        }
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
        const agent = await this.selectBackendConversationAgent(cwd, draft, options.selectedAgentId ?? QAAP_PRIMARY_AGENT_ID);
        const message = applyBackendInteractionModeToPrompt(draft, options.modeId);
        const agentModel = resolveStoredAgentModelForSubmit(agent, cwd);
        const approvalPolicyId = options.approvalPolicyId
            ?? reconcileAgentApprovalPolicyId(undefined, cwd);
        const contextPreamble = await this.backgroundContext?.resolve({
            text: draft,
            variables: options.variables,
        });
        const conversation = await createConversation({
            cwd,
            agent,
            title: draft,
            message,
            interactionModeId: options.modeId,
            approvalPolicyId,
            ...(contextPreamble ? { contextPreamble } : {}),
            ...(agentModel ? { agentModel, qaiqModel: agentModel } : {}),
            ...(options.autoApprove === false
                ? { autoApprove: false }
                : options.autoApprove === true
                    ? { autoApprove: true }
                    : {}),
        });
        const summary = conversationToSummary(conversation);
        this.conversations?.recordSnapshot(summary);
        return summary;
    }

    protected shouldUseTheiaCoder(content: string, selectedAgentId?: string): boolean {
        if (extractBackendAgentMention(content)) {
            return false;
        }
        return isTheiaCoderAgent(selectedAgentId) || isTheiaCoderMention(content);
    }

    protected async loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot> {
        try {
            return await fetchAgentTaskListAll();
        } catch {
            return this.activeTasks
                ? { agents: this.activeTasks.getAgents(), defaultAgent: this.activeTasks.getDefaultAgent(), agentConfigured: true, qaiqModels: [] }
                : { agents: [], defaultAgent: undefined, agentConfigured: false, qaiqModels: [] };
        }
    }

    protected async selectBackendConversationAgent(
        cwd: string,
        prompt: string,
        selectedAgentId?: string,
        conversationAgentId?: string,
    ): Promise<string> {
        const snapshot = await this.loadBackendAgentSnapshot();
        const resolved = resolveBackendAgentForTurn(prompt, snapshot.agents, {
            explicitAgentId: selectedAgentId,
            storedAgentId: readStoredAgent(cwd),
            defaultAgentId: snapshot.defaultAgent,
            conversationAgentId,
        });
        writeStoredAgent(cwd, resolved);
        return resolved;
    }

    protected chatServiceSessionToSummary(
        session: ChatSession,
        project: MobileProjectEntry,
        cwd: string,
        fallbackTitle: string,
        fallbackStatus?: QaapAgentConversationSummaryDTO['status'],
    ): QaapAgentConversationSummaryDTO {
        const now = session.lastInteraction?.getTime?.() ?? Date.now();
        return {
            id: this.chatServiceConversationId(session.id),
            source: 'theia-chat',
            cwd,
            workspacePath: cwd,
            sessionId: session.id,
            agentId: session.pinnedAgent?.id ?? 'chat',
            title: session.title ?? fallbackTitle,
            status: fallbackStatus ?? (this.isChatSessionWorking(session) ? 'streaming' : 'idle'),
            createdAt: now,
            updatedAt: now,
            messageCount: Math.max(1, session.model.getRequests().length),
            lastMessagePreview: this.chatSessionPreview(session) ?? fallbackTitle,
            lastMessageRole: 'user',
        };
    }

    protected upsertProjectChatServiceSummary(projectId: string, summary: QaapAgentConversationSummaryDTO): void {
        const list = [...(this.chatServiceSessionSummariesByProjectId.get(projectId) ?? [])];
        const index = list.findIndex(item => item.id === summary.id || (!!item.sessionId && item.sessionId === summary.sessionId));
        if (index >= 0) {
            list[index] = summary;
        } else {
            list.unshift(summary);
        }
        this.chatServiceSessionSummariesByProjectId.set(projectId, list);
    }

    protected applyTaskStartedToProject(cwd: string, title: string, taskId: string): void {
        this.projects = this.projects.map(project => {
            const projectCwd = this.preparedCwdByProjectId.get(project.id)
                ?? this.projectsService.getProjectCwd(project);
            if (projectCwd !== cwd && !this.activeTasks?.findTasksForProject(project).some(task => task.id === taskId)) {
                return project;
            }
            this.preparedCwdByProjectId.set(project.id, cwd);
            return {
                ...project,
                status: 'working' as const,
                task: title,
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
                progress: Math.max(project.progress, 0.04),
            };
        });
        this.justAddedTaskId = taskId;
        const preserveAgentsShell = this.agentsHubShellActive && this.shouldUseAgentsHubLanding();
        if (preserveAgentsShell) {
            this.renderSubtitle();
            this.delegate.onProjectsChanged?.();
            this.sessionsSidebar?.refreshList();
        } else {
            this.renderList();
            this.renderSubtitle();
            this.delegate.onProjectsChanged?.();
        }
        window.setTimeout(() => {
            if (this.justAddedTaskId === taskId) {
                this.justAddedTaskId = undefined;
                if (preserveAgentsShell) {
                    this.sessionsSidebar?.refreshList();
                } else {
                    this.renderList();
                }
            }
        }, 1400);
    }

    protected ensureAgentChatSession(cwd?: string): ChatSession {
        if (this.agentChatInputSession) {
            const pinned = this.resolvePinnedAgentForCwd(cwd);
            if (pinned) {
                this.agentChatInputSession.pinnedAgent = pinned;
            }
            return this.agentChatInputSession;
        }
        const pinned = this.resolvePinnedAgentForCwd(cwd);
        const session = this.chatService!.createSession(ChatAgentLocation.Panel, { focus: false }, pinned);
        this.agentChatInputSession = session;
        return session;
    }

    protected activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']> {
        const cwd = this.projectsService.getProjectCwd(project);
        return cwd && this.activeTasks ? this.activeTasks.getForCwd(cwd) : undefined;
    }

    protected async cancelActiveTask(taskId: string): Promise<void> {
        this.closeCardMenu();
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}/cancel`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                this.activeTasks?.recordTaskEnded(await response.json());
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/taskCancelled', 'Task cancelled'),
                    { duration: 1400 }
                );
            }
        } finally {
            this.projects = await this.projectsService.loadProjects();
            this.render();
            this.delegate.onProjectsChanged?.();
        }
    }

    protected async showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void> {
        this.closeCardMenu();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/activeLogTitle', '{0} log', project.name);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeLog', 'Close');
        close.setAttribute('aria-label', close.title);
        const pre = document.createElement('pre');
        pre.className = 'theia-mobile-agent-log-output';
        pre.textContent = nls.localize('qaap/mobileProjects/loadingLog', 'Loading...');
        const dispose = (): void => root.remove();
        close.addEventListener('click', dispose);
        backdrop.addEventListener('click', dispose);
        header.append(title, close);
        sheet.append(header, pre);
        root.append(backdrop, sheet);
        this.root.append(root);
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}`, { credentials: 'include' });
            if (response.ok) {
                const detail = await response.json() as { log?: string };
                pre.textContent = detail.log || nls.localize('qaap/mobileProjects/noLogOutput', '(no output yet)');
            } else {
                pre.textContent = response.statusText;
            }
        } catch (error) {
            pre.textContent = error instanceof Error ? error.message : String(error);
        }
    }

    protected createAgentStack(agents: MobileProjectEntry['agents']): HTMLElement {
        const stack = document.createElement('span');
        stack.className = 'theia-mobile-projects-agents';
        agents.forEach((agent, i) => {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-agent';
            chip.style.background = agent.color;
            chip.style.marginLeft = i > 0 ? '-4px' : '0';
            chip.textContent = agent.role[0]?.toUpperCase() ?? '?';
            stack.append(chip);
        });
        return stack;
    }

    async showOpenRepositoryDialog(): Promise<void> {
        await this.onNewClick();
    }

    async openProject(project: MobileProjectEntry): Promise<void> {
        if (project.isCurrent) {
            // Active workspace: dismiss the landing/sheet entirely so the user transitions into the
            // workspace view. Even in home/landing mode the user is explicitly opting in here.
            this.hide();
            this.delegate.onDismiss();
            await this.delegate.onCurrentProjectActivated?.(project);
            return;
        }
        // Persist before any async clone/open so a reload always skips the landing dashboard.
        markMobileProjectsPanelDismiss();
        let openedViaReload = false;
        try {
            if (project.github || project.uri) {
                openedViaReload = true;
                await this.projectsService.openInCurrentWindowAsync(project);
            } else {
                const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
                if (this.commands.getCommand(openFolder)) {
                    markMobileProjectReadmeForOpen();
                    await this.commands.executeCommand(openFolder);
                }
            }
        } finally {
            if (openedViaReload) {
                // Home landing stays up during clone; sessionStorage + reload dismiss it.
                return;
            }
            this.dismissPanelIfSheet();
            if (this.homeMode) {
                this.delegate.onWorkspaceOpened?.();
            }
        }
    }

    /**
     * Show the transcript of a conversation in a modal sheet docked inside the projects panel.
     * The agent is still running server-side, so this works even when no workspace is open and
     * even when the user is in a different project's workspace — that is the whole point of the
     * persistent-conversations model.
     */







    protected readonly transcriptHeaderUi = new MobileProjectsTranscriptHeaderUi(this as unknown as MobileProjectsTranscriptHeaderHost);

    protected createExecutionHeaderSubtitle(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): HTMLDivElement {
        return this.transcriptHeaderUi.createExecutionHeaderSubtitle(project, summary);
    }

    protected renderActiveChatHeaderSubtitle(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): void {
        this.transcriptHeaderUi.renderActiveChatHeaderSubtitle(host, project, summary);
    }

    protected refreshTranscriptExecutionChrome(): void {
        this.transcriptHeaderUi.refreshTranscriptExecutionChrome();
    }

    protected resolveActiveChatEffectiveStatus(
        summary?: QaapAgentConversationSummaryDTO,
    ): QaapAgentConversationSummaryDTO['status'] | undefined {
        return this.transcriptHeaderUi.resolveActiveChatEffectiveStatus(summary);
    }

    protected readonly transcriptSubmitUi = new MobileProjectsTranscriptSubmitUi(this as unknown as MobileProjectsTranscriptSubmitHost);

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

    protected readonly tasksHubUi = new MobileProjectsTasksHubUi(this as unknown as MobileProjectsTasksHubHost);

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

    protected readonly hubCatalogUi = new MobileProjectsHubCatalogUi(this as unknown as MobileProjectsHubCatalogHost);

    protected renderCatalogHubView(): void {
        this.hubCatalogUi.renderCatalogHubView();
    }

    protected readonly hubRoutinesUi = new MobileProjectsHubRoutinesUi(this as unknown as MobileProjectsHubRoutinesHost);

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

    protected readonly workHubInboxUi = new MobileProjectsWorkHubInboxUi(this as unknown as MobileProjectsWorkHubInboxHost);

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

    protected readonly theiaChatSessionUi = new MobileProjectsTheiaChatSessionUi(this as unknown as MobileProjectsTheiaChatSessionHost);

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

    protected readonly agentsHubInlineUi = new MobileProjectsAgentsHubInlineUi(this as unknown as MobileProjectsAgentsHubInlineHost);

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

    protected readonly transcriptLiveUi = new MobileProjectsTranscriptLiveUi(this as unknown as MobileProjectsTranscriptLiveHost);

    findConversationSummaryById(id: string): QaapAgentConversationSummaryDTO | undefined {
        return this.conversations?.findSummaryById(id);
    }

    get conversationsOnDidChange(): TheiaEvent<void> {
        return this.conversations?.onDidChange ?? TheiaEvent.None;
    }

    protected handleTranscriptSseMessage(event: {
        readonly conversationId: string;
        readonly message: QaapAgentMessageDTO;
    }): void {
        this.transcriptLiveUi.handleTranscriptSseMessage(event);
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

    protected stopTranscriptLiveWatch(): void {
        this.transcriptLiveUi.stopTranscriptLiveWatch();
    }

    protected ensureTranscriptConversationRefresh(): void {
        this.transcriptLiveUi.ensureTranscriptConversationRefresh();
    }

    protected scheduleTranscriptConversationRefresh(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        this.transcriptLiveUi.scheduleTranscriptConversationRefresh(project, summary, chatHost);
    }

    protected async refreshOpenTranscriptConversation(
        options?: QaapTranscriptLiveRefreshOptions,
    ): Promise<void> {
        await this.transcriptLiveUi.refreshOpenTranscriptConversation(options);
    }

    protected isWatchingOpenTranscript(conversationId: string): boolean {
        return this.transcriptLiveUi.isWatchingOpenTranscript(conversationId);
    }

    protected readonly transcriptVerifyUi = new MobileProjectsTranscriptVerifyUi(this as unknown as MobileProjectsTranscriptVerifyHost);

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
        if (this.overlayUi) {
            return this.overlayUi;
        }
        const parallel = new MobileProjectsParallelUi({
            getAgents: () => this.activeTasks?.getAgents() ?? [],
            onRunsChanged: () => {
                if (this.visible) {
                    void this.applyActiveTasksRefresh();
                }
            },
            onOpenSessionsSidebar: () => this.openWorkHubSessionsSidebar(),
            buildVariantTaskRow: (project, summary, activeInfo, parentIds) => {
                const task = this.summaryToTaskView(summary);
                return this.createTaskItem(project, task, activeInfo, summary, parentIds);
            },
        });
        const team = new MobileProjectsTeamUi({
            getChildTasks: parentId => this.activeTasks?.getChildTasksForParent(parentId) ?? [],
            onSubtaskClick: taskId => {
                const project = this.transcriptComposerProject ?? this.resolveSelectedProject();
                if (project) {
                    void this.showTaskLog(project, taskId);
                }
            },
        });
        const teamHub = new MobileProjectsTeamHubUi({
            resolveAgentLabel: agentId => {
                const fromList = this.activeTasks?.getAgents().find(a => a.id === agentId)?.label;
                if (fromList) {
                    return fromList.startsWith('@') ? fromList : `@${fromList}`;
                }
                return agentId.startsWith('@') ? agentId : `@${agentId}`;
            },
            onMemberClick: member => this.onTeamMemberClick(member),
            onOpenWorkflows: () => this.selectHubLandingView('workflows'),
            onEnableAutoApprove: member => {
                if (!member.conversationId) {
                    return;
                }
                void this.toggleConversationAutoApproveById(member.conversationId);
            },
            onApproveRequest: (approvalId, _member) => {
                void approveAgentRequest(approvalId).then(result => {
                    if (!result.ok) {
                        this.messageService?.error(result.error ?? nls.localize(
                            'qaap/mobileProjects/teamApprovalApproveFailed',
                            'Could not approve this action.',
                        ));
                        return;
                    }
                    this.renderList();
                }).catch(error => {
                    this.messageService?.error(error instanceof Error ? error.message : String(error));
                });
            },
            onRejectRequest: (approvalId, _member) => {
                void rejectAgentRequest(approvalId).then(result => {
                    if (!result.ok) {
                        this.messageService?.error(result.error ?? nls.localize(
                            'qaap/mobileProjects/teamApprovalRejectFailed',
                            'Could not reject this action.',
                        ));
                        return;
                    }
                    this.renderList();
                }).catch(error => {
                    this.messageService?.error(error instanceof Error ? error.message : String(error));
                });
            },
        });
        this.overlayUi = {
            parallel,
            team,
            teamHub,
            home: new MobileProjectsHomeUi({
                getWorkspaceActivity: project => this.buildHomeWorkspaceActivity(project),
                getWorkspaceStatus: project => this.getHomeWorkspaceStatus(project),
                formatRelativeTime: updatedAt => this.formatHomeRelativeTime(updatedAt),
                onNavigate: target => this.onHomeNavigate(target),
                onOpenProject: project => { void this.onHomeOpenProject(project); },
                onOpenRecent: item => { void this.onHomeOpenRecent(item); },
                onOpenAttention: item => this.onHomeOpenAttention(item),
                onQuickAction: action => { void this.onHomeQuickAction(action); },
            }),
        };
        return this.overlayUi;
    }



    protected enqueueTranscriptFollowUp(
        conversationId: string,
        entry: TranscriptFollowUpEntry,
    ): boolean {
        return this.transcriptStickyComposerUi.enqueueTranscriptFollowUp(conversationId, entry);
    }

    protected appendTranscriptFollowUpQueueBanner(shell: HTMLElement, conversationId: string): void {
        this.transcriptStickyComposerUi.appendTranscriptFollowUpQueueBanner(shell, conversationId);
    }

    protected isTranscriptFollowUpReady(summary: QaapAgentConversationSummaryDTO): boolean {
        return this.transcriptStickyComposerUi.isTranscriptFollowUpReady(summary);
    }

    protected async flushTranscriptFollowUpQueue(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptStickyComposerUi.flushTranscriptFollowUpQueue(project, summary);
    }

    protected isTranscriptStickyComposerAgentWorking(): boolean {
        return this.transcriptStickyComposerUi.isTranscriptStickyComposerAgentWorking();
    }

    protected applyTranscriptComposerPrefsFromConversation(
        conv: QaapAgentConversationDTO,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        this.transcriptStickyComposerUi.applyTranscriptComposerPrefsFromConversation(conv, project, summary);
    }

    protected async hydrateTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<boolean> {
        return this.transcriptStickyComposerUi.hydrateTranscriptComposerPrefs(project, summary);
    }

    protected schedulePersistTranscriptComposerDraft(conversationId: string | undefined): void {
        this.transcriptStickyComposerUi.schedulePersistTranscriptComposerDraft(conversationId);
    }

    protected schedulePersistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        this.transcriptStickyComposerUi.schedulePersistTranscriptComposerPrefs(project, summary);
    }

    protected async persistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        await this.transcriptStickyComposerUi.persistTranscriptComposerPrefs(project, summary);
    }

    protected mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        this.transcriptStickyComposerUi.mountTranscriptStickyComposer(host, project, summary, chatHost);
    }

    protected remountTranscriptStickyComposer(): void {
        this.transcriptStickyComposerUi.remountTranscriptStickyComposer();
    }

    protected resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        return this.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
    }

    protected resolveTranscriptComposerAgentLabel(): string {
        return this.transcriptComposerUi.resolveTranscriptComposerAgentLabel();
    }

    protected async refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void> {
        await this.transcriptComposerUi.refreshTranscriptComposerAgents(project);
    }

    protected openTranscriptComposerAgentSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        this.transcriptComposerUi.openTranscriptComposerAgentSheet(project, summary);
    }

    protected openTranscriptComposerModeSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        modes: readonly ChatMode[],
    ): void {
        this.transcriptComposerUi.openTranscriptComposerModeSheet(project, summary, modes);
    }

    protected closeTranscriptComposerSheets(): void {
        this.transcriptComposerUi.closeTranscriptComposerSheets();
    }

    protected async onTranscriptComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.pickContextVariable) {
            return;
        }
        const variables = await this.pickContextVariable(anchor, this.createTranscriptComposerAttachHandlers());
        if (variables.length === 0) {
            return;
        }
        for (const request of variables) {
            this.transcriptComposerContext.push(createComposerContextEntry(request));
        }
        this.remountTranscriptStickyComposer();
    }

    protected attachTranscriptChatViewWidget(
        widget: MobileProjectChatViewWidget,
        chatHost: HTMLElement,
        session: ChatSession,
    ): boolean {
        if (session.model.getRequests().length === 0) {
            return false;
        }
        chatHost.classList.add('theia-mobile-agent-transcript-real-chat');
        chatHost.replaceChildren();
        widget.bindTranscriptSession(session);
        if (widget.node.parentElement && widget.node.parentElement !== chatHost) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, chatHost);
        }
        widget.show();
        widget.update();
        widget.activate();
        return true;
    }

    /** Lightweight placeholder until GET /agent-conversations/:id returns the full thread. */

    /**
     * Scrollable message list inside {@link openTranscriptSheet}'s real-chat host. Keeps
     * `theia-mobile-agent-transcript-real-chat` on the outer host so flex layout does not collapse.
     */
    protected resolveTranscriptMessageHost(host: HTMLElement): HTMLElement {
        if (!host.classList.contains('theia-mobile-agent-transcript-real-chat')) {
            host.className = 'theia-mobile-agent-transcript';
            return host;
        }
        const existing = host.querySelector(':scope > .theia-mobile-agent-transcript');
        if (existing instanceof HTMLElement) {
            return existing;
        }
        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-transcript';
        host.replaceChildren(list);
        return list;
    }

    /** Map a backend / storage agent id to a Theia {@link ChatAgent} for pinning in chat inputs. */
    protected chatAgentForBackendId(agentId: string | undefined): ChatAgent | undefined {
        const normalized = migrateLegacyBackendAgentId(agentId?.trim());
        if (!normalized || !this.chatAgentService) {
            return undefined;
        }
        if (isTheiaCoderAgent(normalized)) {
            return this.chatAgentService.getAgent(THEIA_CODER_AGENT_ID);
        }
        return this.chatAgentService.getAgent(normalized);
    }

    protected resolvePinnedAgentForCwd(cwd: string | undefined): ChatAgent | undefined {
        const stored = readStoredAgent(cwd);
        return this.chatAgentForBackendId(stored)
            ?? this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
    }

    protected readonly transcriptMessagesUi = new MobileProjectsTranscriptMessagesUi(this as unknown as MobileProjectsTranscriptMessagesHost);

    protected resolveTranscriptAgentSegments(
        conv: QaapAgentConversationDTO,
        msg: QaapAgentMessageDTO,
    ): QaapAgentMessageSegmentDTO[] | undefined {
        return this.transcriptMessagesUi.resolveTranscriptAgentSegments(conv, msg);
    }

    protected renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.transcriptMessagesUi.renderTranscriptMessages(host, conv);
    }

    protected renderTranscriptInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.transcriptLiveUi.renderTranscriptInlineApproval(host, conv);
    }

    protected focusTranscriptComposerInput(): void {
        this.transcriptMessagesUi.focusTranscriptComposerInput();
    }

    protected resolveTranscriptActivityItems(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> {
        return this.transcriptMessagesUi.resolveTranscriptActivityItems(segments, includeThinkingSteps);
    }

    protected cleanTranscriptDisplayText(content: string | undefined | null): string {
        return this.transcriptMessagesUi.cleanTranscriptDisplayText(content);
    }

    protected normalizeTranscriptPreviewLink(href: string): string | undefined {
        const trimmed = href.trim();
        if (!trimmed) {
            return undefined;
        }
        if (/^\/qaap-dev\/\d{2,5}(?:\/.*)?$/i.test(trimmed)) {
            return window.location.origin + trimmed;
        }
        if (/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):\d{2,5}(?:\/.*)?$/i.test(trimmed)) {
            return normalizePreviewUrlForSameOrigin(trimmed);
        }
        try {
            const parsed = new URL(trimmed, window.location.origin);
            if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/qaap-dev/')) {
                return normalizePreviewUrlForSameOrigin(parsed.toString());
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    protected async openTranscriptPreviewUrlFromLink(href: string): Promise<boolean> {
        const previewUrl = this.normalizeTranscriptPreviewLink(href);
        const summary = this.transcriptComposerSummary ?? this.transcriptOpenSummary;
        const project = this.transcriptOpenProject;
        if (!previewUrl || !summary || !project) {
            return false;
        }

        this.transcriptPreviewRequestPending = false;
        this.transcriptPreviewRequestRunning = false;
        const latestProject = { ...project, previewUrl };
        this.transcriptOpenProject = latestProject;
        this.projects = this.projects.map(candidate => candidate.id === latestProject.id
            ? { ...candidate, previewUrl }
            : candidate);
        await this.projectsService.recordProjectPreviewUrl(latestProject, previewUrl).catch(() => undefined);

        this.selectTranscriptTab('preview', latestProject, summary);
        MobileSnackbar.show(nls.localize('qaap/mobileProjects/previewLinkOpened', 'Preview opened'), { kind: 'success', duration: 1400 });
        return true;
    }

    protected conversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
        return buildConversationTranscriptFingerprint(conv);
    }

    /** Close the open Agents session but keep the in-panel execution shell (tabs + surfaces). */



    /** Sheet overlay only — home dashboard stays visible until the workspace reloads. */
    protected dismissPanelIfSheet(): void {
        if (this.homeMode) {
            return;
        }
        this.hide();
        this.delegate.onDismiss();
    }
}
