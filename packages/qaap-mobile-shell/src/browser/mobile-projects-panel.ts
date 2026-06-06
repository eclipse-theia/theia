// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { generateUuid } from '@theia/core/lib/common/uuid';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';
import * as DOMPurify from '@theia/core/shared/dompurify';
import type { QuickPick } from '@theia/core/lib/common/quick-pick-service';
import { ConfirmDialog, QuickInputService, QuickPickItem, QuickPickSeparator, UnsafeWidgetUtilities } from '@theia/core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { AIVariable, AIVariableResolutionRequest, GenericCapabilitySelections } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent, ChatAgentLocation, ChatMode, ChatModel, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata, MutableChatModel } from '@theia/ai-chat';
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
    formatReadToolDetailFromArgs,
    formatToolActivityLabel,
    parseDiffStatsFromText,
} from '../common/qaap-agent-conversation-list-metrics';
import {
    excerptTranscriptThought,
    hasTranscriptActivityStats,
    hasTranscriptActivityTimeline,
    isTranscriptThoughtExcerptTruncated,
    resolveTranscriptActivityStats,
    resolveTranscriptThinkingContent,
    shouldOpenTranscriptToolDetails,
    shouldRenderTranscriptToolSegmentInline,
    type QaapTranscriptActivityStats,
} from '../common/qaap-agent-transcript-segments';
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
    getConversation,
    postConversationMessage,
    renameConversation,
    retryConversation,
    rewindConversationToMessage,
    updateConversation,
} from '../common/qaap-agent-conversation-client';
import { normalizeAgentMessageContentForDisplay } from '../common/qaap-agent-message-content';
import {
    isTranscriptErrorOutput,
    isTranscriptTerminalOutputText,
} from '../common/qaap-transcript-content-display';
import { parseOpencodeLog } from '../common/qaap-opencode-stream';
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
    setMobileActiveTranscriptChrome,
    setMobileLandingHubListChrome,
    setMobileWorkHubComposerHeaderChrome,
} from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    createAgentTask,
    fetchAgentTaskDetail,
    isAgentTaskFinished,
    extractBackendAgentMention,
    fetchAgentTaskListAll,
    isTheiaCoderAgent,
    isTheiaCoderMention,
    migrateLegacyBackendAgentId,
    normalizeBackendAgentId,
    agentSupportsModelPicker,
    agentUsesSettingsModelCatalog,
    fetchAgentModelsForAgent,
    filterUiSelectableVpsAgents,
    isSameAgentModel,
    readStoredAgent,
    readStoredAgentModel,
    resolveStoredAgentModelForSubmit,
    isOpencodeAgent,
    isStickyComposerAgentSelected,
    reconcileStickyComposerAgent,
    resolveBackendAgentForTurn,
    resolveExplicitAgentForSubmit,
    QAIQ_AGENT_ID,
    stripNonCoderAgentMention,
    SHELL_AGENT_ID,
    THEIA_CODER_AGENT_ID,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
    type QaapQaiqModelOption,
    type QaapAgentTaskDetailDTO,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import {
    applyBackendInteractionModeToPrompt,
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
    createPickerSheetOptionButton,
    populateAgentToolbarButton,
    populateApprovalPolicyToolbarButton,
} from './qaap-agent-ui';
import {
    renderStickyComposerContextStrip,
    resolveStickyComposerContextChip,
    type StickyComposerContextChipView,
} from './qaap-sticky-composer-context-ui';
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
import { bindCatalogCardTapFeedback } from './qaap-catalog-card-tap-feedback';
import { applyExecutionSurfaceHeaderChrome } from './qaap-execution-surface-header-chrome';
import {
    fetchQaapAuthConfig,
    fetchQaapAuthSession,
    fetchQaapGithubPullRequests,
    startGithubOAuth,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { clearQaapAuthSession, readQaapAuthUser, readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import {
    mountEmbeddedAgentPreviewChrome,
    type EmbeddedAgentPreviewChrome,
} from '@theia/qaap-adapters/lib/browser/qaap-agent-preview-chrome';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import type { QaapPreviewSurfaceRegistry } from '@theia/qaap-adapters/lib/browser/qaap-preview-surface-registry';
import type { QaapPreviewInspectorDeps } from '@theia/qaap-adapters/lib/browser/qaap-preview-inline-inspector';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    recordExecutionSurfaceTabUse,
    type ExecutionSurfaceTabId,
} from '../common/qaap-execution-surface-tabs';
import { scrollElementTo, scrollElementToEnd } from '../common/qaap-prefers-reduced-motion';
import { attachTranscriptUserScrollPin } from './qaap-transcript-user-scroll-pin';
import {
    appendExecutionSurfaceTabIcon,
    createExecutionSurfaceIconElement,
    QAAP_SCM_CHANGES_ICON_CLASS,
} from '../common/qaap-scm-changes-icon';
import {
    filterVpsTaskSummaries,
    isLocalChatSummary,
    normalizeWorkHubViewId,
} from '../common/qaap-work-hub-surfaces';
import {
    buildAgentsHubIdleConversationSummary,
    isAgentsHubIdleConversationSummary,
    QAAP_AGENTS_HUB_LANDING_ENABLED,
    QAAP_AGENTS_HUB_QUICK_ACTIONS,
    QAAP_AGENTS_HUB_RECENT_LIMIT,
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
    type WorkHubCatalogItem,
    type WorkHubCatalogSection,
} from '../common/mobile-work-hub-catalog';
import {
    createWorkHubRoutine,
    deleteWorkHubRoutine,
    fetchWorkHubRoutines,
    runWorkHubRoutineNow,
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
    buildReviewHubPullRequestItems,
    buildWorkHubInboxItems,
    githubRepoKeysForProjects,
    pullRequestKey,
    pullRequestMatchesQuery,
    type MobileWorkHubInboxItem,
} from './mobile-work-hub-inbox';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitBranchesResponse,
    type QaapGitChangedFile,
    type QaapGitHistoryCommit,
    type QaapGitHistoryResponse,
} from '../common/qaap-git-review';
import {
    QaapDiffReviewWidget,
    type QaapDiffReviewRepositoryContext,
} from './qaap-diff-review-widget';
import { probeQaapDevPreviewPort, toDevPreviewUrl } from './qaap-dev-preview-client';
import {
    createTranscriptCodeView,
    resolveTranscriptCodeLanguage,
} from './qaap-transcript-code-view';
import {
    mountTranscriptFilesView,
    type TranscriptFilesViewServices,
} from './qaap-transcript-files-view';
import {
    createTranscriptTerminalStagingHost,
    createTranscriptTerminalSurface,
    scheduleTranscriptTerminalResize,
    type TranscriptTerminalSurface,
    type TranscriptTerminalViewServices,
} from './qaap-transcript-terminal-view';
import {
    normalizeTranscriptWorkspaceKey,
    TranscriptWorkspaceSurfacesCache,
    type TranscriptWorkspaceSurfaceKey,
} from './qaap-transcript-workspace-surfaces-cache';
import { resolveTranscriptWorkspaceCwd } from '../common/qaap-transcript-workspace-cwd';
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
    pickContextVariable?: (anchor: HTMLElement) => Promise<AIVariableResolutionRequest | undefined>;
    /** Labels/icons for attached context chips (Agent chat label provider). */
    formatContextChip?: (item: AIVariableResolutionRequest) => StickyComposerContextChipView;
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

interface RestorableTheiaChatData {
    readonly title?: string;
    readonly pinnedAgentId?: string;
    readonly saveDate?: number;
    readonly model: ConstructorParameters<typeof MutableChatModel>[0] & {
        readonly sessionId: string;
        readonly requests: unknown[];
        readonly responses: unknown[];
    };
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

function isRestorableTheiaChatData(candidate: unknown): candidate is RestorableTheiaChatData {
    const data = candidate as Partial<RestorableTheiaChatData> | undefined;
    const model = data?.model as Partial<RestorableTheiaChatData['model']> | undefined;
    return !!model
        && typeof model.sessionId === 'string'
        && Array.isArray(model.requests)
        && Array.isArray(model.responses);
}

export class MobileProjectsPanel {

    /** Max conversation rows per repo card before "More" expands the list. */
    protected static readonly CONVERSATIONS_COLLAPSED_LIMIT = 6;

    /** Initial session rows per project in the sessions sidebar before "Mostrar más". */
    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT = 5;

    /** Extra session rows revealed each time the user taps "Mostrar más" in the sidebar. */
    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE = 15;

    /** Max automatic verify→fix loops before the closed loop gives up (avoids runaway turns/cost). */
    protected static readonly VERIFY_AUTO_MAX_ATTEMPTS = 3;

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
    protected stickyComposerContext: AIVariableResolutionRequest[] = [];
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
    protected transcriptComposerProject: MobileProjectEntry | undefined;
    protected transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    protected transcriptComposerContext: AIVariableResolutionRequest[] = [];
    protected transcriptComposerFilesExpanded = true;
    protected transcriptComposerPinnedAgentId: string | undefined;
    protected transcriptComposerDraft = '';
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
    protected agentChatInputSession: ChatSession | undefined;
    protected transcriptChatInputWidget: AIChatInputWidget | undefined;
    protected transcriptChatViewWidget: MobileProjectChatViewWidget | undefined;
    protected transcriptRefreshTimer: number | undefined;
    protected transcriptScheduleRefresh: (() => void) | undefined;
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
    protected transcriptLiveUpdatesDispose: Disposable = Disposable.NULL;
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

    protected pinStickyComposerToCoder(cwd: string | undefined): void {
        this.stickyComposerPinnedAgentId = THEIA_CODER_AGENT_ID;
        writeStoredAgent(cwd, THEIA_CODER_AGENT_ID);
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

    protected executionSurfaceTabForProject(project: MobileProjectEntry): TranscriptTab {
        return this.executionSurfaceTabByProjectId.get(project.id) ?? 'messages';
    }

    protected setExecutionSurfaceTab(project: MobileProjectEntry, tab: TranscriptTab): void {
        this.executionSurfaceTabByProjectId.set(project.id, tab);
        this.syncExecutionSurfaceChrome(project);
    }

    /** Keep Chat vs overflow-select styling in sync on every connected header strip. */
    protected syncExecutionSurfaceChrome(project: MobileProjectEntry): void {
        const tab = this.executionSurfaceTabForProject(project);
        this.syncExecutionSurfaceChromeInHost(this.headerExecutionTabsHost, tab, linked => {
            this.projectDetailTabStrip = linked;
        });
        if (this.transcriptSheet?.isConnected) {
            this.syncExecutionSurfaceChromeInHost(this.transcriptSheet, tab, linked => {
                this.transcriptTabStrip = linked;
            });
        } else if (this.transcriptTabStrip?.isConnected) {
            this.refreshExecutionSurfaceTabStripState(this.transcriptTabStrip, tab);
        }
    }

    protected syncExecutionSurfaceChromeInHost(
        host: HTMLElement,
        tab: TranscriptTab,
        linkStrip: (strip: HTMLElement) => void,
    ): void {
        const strips = host.querySelectorAll<HTMLElement>('.theia-mobile-transcript-tabs.theia-mod-header-inline');
        if (strips.length === 0) {
            return;
        }
        strips.forEach(strip => this.refreshExecutionSurfaceTabStripState(strip, tab));
        linkStrip(strips[strips.length - 1]!);
    }

    protected resolveExecutionSurfaceTabStripHost(strip: HTMLElement | undefined): HTMLElement | undefined {
        if (!strip) {
            return undefined;
        }
        const host = strip.closest('.theia-mobile-projects-header-execution-tabs');
        return host instanceof HTMLElement ? host : strip.parentElement ?? undefined;
    }

    /** Same host wrapper as project-detail (task) header — keeps tab chrome CSS identical. */
    protected appendExecutionSurfaceTabStripToTitleRow(titleRow: HTMLElement, strip: HTMLElement): void {
        const host = document.createElement('div');
        host.className = 'theia-mobile-projects-header-execution-tabs';
        host.append(strip);
        titleRow.append(host);
    }

    /**
     * Shared execution header for VPS and Theia-chat transcript sheets: back · title/subtitle · tabs.
     */
    protected mountTranscriptExecutionHeader(
        header: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        titleText: string,
    ): { back: HTMLButtonElement; tabStrip: HTMLElement } {
        header.classList.add('theia-mod-execution-tabs');
        const title = document.createElement('h2');
        title.textContent = titleText;
        const back = this.ensureOverlayUi().parallel.appendTranscriptHeaderActions(header, title);
        const subtitle = this.createExecutionHeaderSubtitle(project);
        header.querySelector('.theia-mobile-agent-log-title-wrap')?.append(subtitle);
        this.transcriptHeaderSubtitle = subtitle;
        this.setExecutionSurfaceTab(project, 'messages');
        this.updateTranscriptHeader(project);
        const activeTab = this.executionSurfaceTabForProject(project);
        const tabStrip = this.buildTranscriptTabStrip(project, summary);
        const titleRow = header.querySelector('.theia-mobile-agent-log-title-row');
        if (titleRow instanceof HTMLElement) {
            this.appendExecutionSurfaceTabStripToTitleRow(titleRow, tabStrip);
        }
        this.refreshExecutionSurfaceTabStripState(tabStrip, activeTab);
        return { back, tabStrip };
    }

    protected createTranscriptSheetSurfaceHosts(): {
        planHost: HTMLElement;
        reviewHost: HTMLElement;
        previewHost: HTMLElement;
        filesHost: HTMLElement;
        terminalHost: HTMLElement;
    } {
        const planHost = document.createElement('div');
        planHost.className = 'theia-mobile-transcript-plan';
        planHost.hidden = true;
        const reviewHost = document.createElement('div');
        reviewHost.className = 'theia-mobile-transcript-review';
        reviewHost.hidden = true;
        const previewHost = document.createElement('div');
        previewHost.className = 'theia-mobile-transcript-preview';
        previewHost.hidden = true;
        const filesHost = document.createElement('div');
        filesHost.className = 'theia-mobile-transcript-files-host';
        filesHost.hidden = true;
        const terminalHost = document.createElement('div');
        terminalHost.className = 'theia-mobile-transcript-terminal-host';
        terminalHost.hidden = true;
        return { planHost, reviewHost, previewHost, filesHost, terminalHost };
    }

    protected replaceExecutionSurfaceTabStrip(currentStrip: HTMLElement | undefined, nextStrip: HTMLElement): void {
        const host = this.resolveExecutionSurfaceTabStripHost(currentStrip);
        if (host) {
            host.replaceChildren(nextStrip);
            return;
        }
        currentStrip?.replaceWith(nextStrip);
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
            this.conversationsDispose = this.conversations.onDidChange(() => {
                this.markTasksFirstLoadComplete(false);
                if (this.visible && this.isTasksHubView()) {
                    this.renderList();
                } else if (this.visible && !this.transcriptSheet) {
                    void this.applyActiveTasksRefresh();
                }
            });
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
            if (this.shouldUseAgentsHubLanding()) {
                const branchProject = this.transcriptOpenProject ?? this.resolveHomePinnedProject();
                if (branchProject) {
                    this.subtitleEl.hidden = true;
                    this.subtitleEl.textContent = '';
                    return;
                }
            }
            if (this.agentsHubInlineActive && this.transcriptOpenProject) {
                this.subtitleEl.textContent = this.buildProjectBranchSubtitle(this.transcriptOpenProject);
                return;
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

    protected createExecutionHeaderSubtitle(project: MobileProjectEntry): HTMLDivElement {
        const subtitle = document.createElement('div');
        subtitle.className = 'theia-mobile-projects-subtitle';
        subtitle.textContent = this.buildProjectBranchSubtitle(project);
        return subtitle;
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

    protected renderList(): void {
        if ((this.hubView !== 'tasks' || !this.shouldUseAgentsHubLanding()) && this.agentsHubShellActive) {
            this.teardownAgentsHubExecutionShell();
        }
        this.closeCardMenu();
        this.projectDetailSurfaceTargets = undefined;
        this.projectDetailTabStrip = undefined;
        this.scroll.replaceChildren();
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

    protected shouldUseAgentsHubLanding(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.homeMode
            && this.hubView === 'tasks'
            && !this.agentsHubLegacyInbox;
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

    protected collectAgentsHubRecentItems(
        projects: MobileProjectEntry[],
        limit = QAAP_AGENTS_HUB_RECENT_LIMIT,
        scopeProject?: MobileProjectEntry,
    ): Array<{ project: MobileProjectEntry; summary: QaapAgentConversationSummaryDTO }> {
        const query = this.query.trim().toLowerCase();
        const entries: Array<{
            project: MobileProjectEntry;
            summary: QaapAgentConversationSummaryDTO;
            updatedAt: number;
        }> = [];
        const scope = scopeProject ? [scopeProject] : projects;
        for (const project of scope) {
            const conversations = [
                ...this.localChatsForProject(project),
                ...this.vpsTasksForProject(project),
            ];
            for (const summary of conversations) {
                if (query && !this.conversationMatchesQuery(summary, query)) {
                    continue;
                }
                entries.push({ project, summary, updatedAt: summary.updatedAt });
            }
        }
        entries.sort((a, b) => b.updatedAt - a.updatedAt);
        return entries.slice(0, Math.max(0, limit)).map(({ project, summary }) => ({ project, summary }));
    }

    protected resolveAgentsHubShellProject(): MobileProjectEntry | undefined {
        if (this.agentsHubSelectedProjectId) {
            const selected = this.projects.find(project => project.id === this.agentsHubSelectedProjectId);
            if (selected) {
                return selected;
            }
        }
        return this.transcriptOpenProject ?? this.resolveHomePinnedProject();
    }

    protected resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        if (this.transcriptOpenSummary) {
            return this.transcriptOpenSummary;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id) ?? project.name;
        return buildAgentsHubIdleConversationSummary(cwd);
    }

    protected renderAgentsHubExecutionShell(): void {
        const project = this.resolveAgentsHubShellProject();
        if (!project) {
            this.agentsHubShellActive = false;
            const note = document.createElement('div');
            note.className = 'theia-mobile-agent-transcript-empty theia-mod-no-project';
            const title = document.createElement('div');
            title.className = 'theia-mobile-agent-transcript-empty-title';
            title.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerNoProject',
                'Add or open a repository first.',
            );
            note.append(title);
            this.scroll.append(note);
            this.updateTasksAttentionChrome();
            this.renderSubtitle();
            return;
        }
        const summary = this.resolveAgentsHubShellSummary(project);
        this.agentsHubShellActive = true;
        if (
            this.agentsHubInlineExecutionRoot?.isConnected
            && this.agentsHubInlineChatHost?.isConnected
        ) {
            this.renderAgentsHubShellChat(this.agentsHubInlineChatHost, project, summary);
            this.syncAgentsHubInlineExecutionHeader(project, summary);
            this.updateTasksAttentionChrome();
            this.renderSubtitle();
            void this.refreshTranscriptComposerAgents(project);
            this.renderStickyComposer();
            return;
        }
        const executionRoot = document.createElement('div');
        executionRoot.className = 'theia-mobile-agents-hub-inline-execution';
        this.agentsHubInlineExecutionRoot = executionRoot;

        if (!this.transcriptPlanHost) {
            const surfaces = this.createTranscriptSheetSurfaceHosts();
            this.transcriptPlanHost = surfaces.planHost;
            this.transcriptReviewHost = surfaces.reviewHost;
            this.transcriptPreviewHost = surfaces.previewHost;
            this.transcriptFilesHost = surfaces.filesHost;
            this.transcriptTerminalHost = surfaces.terminalHost;
        }
        executionRoot.append(
            this.transcriptPlanHost!,
            this.transcriptReviewHost!,
            this.transcriptPreviewHost!,
            this.transcriptFilesHost!,
            this.transcriptTerminalHost!,
        );

        const transcriptRoot = document.createElement('div');
        transcriptRoot.className = 'theia-mobile-agents-hub-inline-transcript';
        this.agentsHubInlineTranscriptRoot = transcriptRoot;
        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        this.agentsHubInlineChatHost = chatHost;
        this.transcriptChatHost = chatHost;
        this.renderAgentsHubShellChat(chatHost, project, summary);
        transcriptRoot.append(chatHost);
        executionRoot.append(transcriptRoot);
        this.scroll.append(executionRoot);

        this.transcriptUserScrollPinDispose.dispose();
        this.transcriptUserScrollPinDispose = attachTranscriptUserScrollPin(chatHost);
        this.updateTasksAttentionChrome();
        this.renderSubtitle();
        this.syncAgentsHubInlineExecutionHeader(project, summary);
        void this.refreshTranscriptComposerAgents(project);
        this.renderStickyComposer();
    }

    /** Same transcript host for idle and active sessions; idle shows starter chips in the scroll area. */
    protected renderAgentsHubShellChat(
        chatHost: HTMLElement,
        _project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const activeSummary = this.agentsHubInlineActive && this.transcriptOpenSummary
            ? this.transcriptOpenSummary
            : summary;
        const conv = this.agentsHubInlineActive
            && this.transcriptLastConv
            && this.transcriptLastConv.id === activeSummary.id
            ? this.transcriptLastConv
            : this.summaryToTranscriptPlaceholder(activeSummary);
        this.renderTranscriptMessages(chatHost, conv);
    }

    protected renderAgentsHubIdleSubmitOptimistic(
        chatHost: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        agentId: string,
    ): void {
        const outbound = draft.trim();
        if (!outbound) {
            return;
        }
        this.renderTranscriptMessages(chatHost, {
            id: summary.id,
            cwd: summary.cwd,
            agentId,
            title: outbound.slice(0, 120),
            status: 'streaming',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [{
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content: outbound,
                createdAt: Date.now(),
            }],
        });
    }

    protected syncAgentsHubInlineExecutionHeader(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const activeTab = this.executionSurfaceTabForProject(project);
        const tabStrip = this.buildTranscriptTabStrip(project, summary);
        this.headerExecutionTabsHost.hidden = false;
        this.headerExecutionTabsHost.replaceChildren(tabStrip);
        this.agentsHubInlineTabStrip = tabStrip;
        this.transcriptTabStrip = tabStrip;
        this.refreshExecutionSurfaceTabStripState(tabStrip, activeTab);
        this.showOnlyExecutionSurfaceTab(activeTab);
        this.mountTranscriptSurfaceTab(project, summary, activeTab);
        this.syncExecutionSurfaceChrome(project);
        this.root.classList.add('theia-mod-agents-hub-inline-active');
        this.root.classList.add('theia-mod-agents-hub-shell-active');
    }

    protected teardownAgentsHubExecutionShell(): void {
        this.agentsHubShellActive = false;
        this.agentsHubInlineActive = false;
        this.clearAgentsHubInlineExecutionChrome();
        this.agentsHubInlineChatHost = undefined;
        this.agentsHubInlineTranscriptRoot = undefined;
        this.transcriptChatHost = undefined;
        this.transcriptPlanHost?.remove();
        this.transcriptPlanHost = undefined;
        this.detachTranscriptReviewWidget();
        this.transcriptReviewHost = undefined;
        this.transcriptPreviewHost = undefined;
        this.disposeTranscriptEmbeddedPreview();
        this.transcriptFilesHost = undefined;
        this.transcriptTerminalHost = undefined;
        this.transcriptUserScrollPinDispose.dispose();
        this.transcriptUserScrollPinDispose = Disposable.NULL;
    }

    protected clearAgentsHubInlineExecutionChrome(): void {
        this.root.classList.remove('theia-mod-agents-hub-inline-active');
        this.root.classList.remove('theia-mod-agents-hub-shell-active');
        this.agentsHubInlineExecutionRoot = undefined;
        this.agentsHubInlineTabStrip = undefined;
        this.agentsHubInlineTranscriptRoot = undefined;
        this.headerExecutionTabsHost.hidden = true;
        this.headerExecutionTabsHost.replaceChildren();
        if (this.transcriptPlanHost) {
            this.transcriptPlanHost.remove();
            this.transcriptReviewHost?.remove();
            this.transcriptPreviewHost?.remove();
            this.transcriptFilesHost?.remove();
            this.transcriptTerminalHost?.remove();
        }
        this.transcriptPlanHost = undefined;
        this.transcriptReviewHost = undefined;
        this.transcriptPreviewHost = undefined;
        this.transcriptFilesHost = undefined;
        this.transcriptTerminalHost = undefined;
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

    protected selectTranscriptTab(tab: TranscriptTab, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        this.activateExecutionSurfaceTab(tab, project, summary, 'transcript');
    }

    /**
     * Single tab switch: hide every execution surface, show only the chosen one, then mount its content.
     */
    protected activateExecutionSurfaceTab(
        tab: TranscriptTab,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        origin: 'transcript' | 'project-detail',
    ): void {
        const sameTab = this.executionSurfaceTabForProject(project) === tab;
        if (sameTab) {
            this.syncExecutionSurfaceChrome(project);
            if (tab === 'messages') {
                this.closeExecutionTabOverflowMenu();
            }
        } else {
            recordExecutionSurfaceTabUse(tab);
            this.setExecutionSurfaceTab(project, tab);
            this.rebuildExecutionSurfaceTabStrips(project, tab);
            if (origin === 'transcript') {
                this.updateTranscriptHeader(project);
            } else {
                this.renderHeader();
                this.renderSubtitle();
            }
        }
        this.showOnlyExecutionSurfaceTab(tab);
        this.mountExecutionSurfaceTabContent(project, summary, tab);
        this.root.classList.toggle('theia-mod-project-surface-chat', tab === 'messages');
        this.root.classList.toggle('theia-mod-project-surface-tools', tab !== 'messages');
        this.renderStickyComposer();
        this.syncExecutionSurfaceChrome(project);
    }

    /** Hide all execution surfaces; reveal exactly one tab. */
    protected showOnlyExecutionSurfaceTab(tab: TranscriptTab): void {
        const showMessages = tab === 'messages';
        if (this.agentsHubInlineTranscriptRoot) {
            this.agentsHubInlineTranscriptRoot.hidden = !showMessages;
        }
        if (this.transcriptChatHost) {
            this.transcriptChatHost.hidden = !showMessages;
        }
        if (this.transcriptChatInputHost) {
            this.transcriptChatInputHost.hidden = !showMessages;
        }
        if (this.transcriptPlanHost) {
            this.transcriptPlanHost.hidden = tab !== 'plan';
        }
        if (this.transcriptReviewHost) {
            this.transcriptReviewHost.hidden = tab !== 'review';
        }
        if (this.transcriptPreviewHost) {
            this.transcriptPreviewHost.hidden = tab !== 'preview';
        }
        if (this.transcriptFilesHost) {
            this.transcriptFilesHost.hidden = tab !== 'files';
        }
        if (this.transcriptTerminalHost) {
            this.transcriptTerminalHost.hidden = tab !== 'terminal';
        }
        const targets = this.projectDetailSurfaceTargets;
        if (targets) {
            targets.chatHost.hidden = !showMessages;
            targets.planHost.hidden = tab !== 'plan';
            targets.reviewHost.hidden = tab !== 'review';
            targets.previewHost.hidden = tab !== 'preview';
            targets.filesHost.hidden = tab !== 'files';
            targets.terminalHost.hidden = tab !== 'terminal';
        }
        if (this.agentsHubShellActive) {
            this.stickyComposerHost.hidden = !showMessages;
            this.root.classList.toggle('theia-mod-sticky-composer', showMessages);
        }
        this.agentsHubInlineExecutionRoot?.setAttribute('data-active-surface', tab);
        this.transcriptSheet?.querySelector('.theia-mobile-agent-log-sheet')?.setAttribute('data-active-surface', tab);
        this.root.querySelector('.theia-mobile-projects-detail-surfaces-body')?.setAttribute('data-active-surface', tab);
    }

    protected mountExecutionSurfaceTabContent(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        if (this.transcriptSheet || this.agentsHubShellActive) {
            this.mountTranscriptSurfaceTab(project, summary, tab);
            return;
        }
        this.mountProjectDetailSurfaceTab(project, summary, tab);
    }

    protected syncHeaderExecutionTabStrip(): void {
        if (this.agentsHubShellActive) {
            return;
        }
        const project = this.isProjectDetailView() ? this.resolveSelectedProject() : undefined;
        if (!project) {
            this.headerExecutionTabsHost.hidden = true;
            this.headerExecutionTabsHost.replaceChildren();
            this.projectDetailTabStrip = undefined;
            this.headerExecutionTabsProjectId = undefined;
            return;
        }
        this.headerExecutionTabsHost.hidden = false;
        const activeTab = this.executionSurfaceTabForProject(project);
        const needsRebuild = this.headerExecutionTabsProjectId !== project.id
            || !this.projectDetailTabStrip
            || !this.headerExecutionTabsHost.contains(this.projectDetailTabStrip);
        if (needsRebuild) {
            this.headerExecutionTabsProjectId = project.id;
            const tabStrip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectProjectDetailTab(tab, project),
            );
            this.headerExecutionTabsHost.replaceChildren(tabStrip);
            this.projectDetailTabStrip = tabStrip;
            applyExecutionSurfaceHeaderChrome(tabStrip, activeTab);
            this.applyExecutionSurfaceIconSelectDisplay(tabStrip, activeTab);
            return;
        }
        this.syncProjectDetailTabStrip();
    }

    protected syncProjectDetailTabStrip(): void {
        const project = this.resolveExecutionSurfaceProject();
        if (!project) {
            return;
        }
        this.syncExecutionSurfaceChrome(project);
    }

    protected syncTranscriptTabStrip(project: MobileProjectEntry): void {
        if (!this.transcriptTabStrip) {
            return;
        }
        this.refreshExecutionSurfaceTabStripState(this.transcriptTabStrip, this.executionSurfaceTabForProject(project));
    }

    protected rebuildExecutionSurfaceTabStrips(project: MobileProjectEntry, activeTab: TranscriptTab): void {
        this.closeExecutionTabOverflowMenu();
        const summary = this.transcriptOpenSummary ?? this.resolveAgentsHubShellSummary(project);
        if (this.agentsHubShellActive && !this.headerExecutionTabsHost.hidden) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectTranscriptTab(tab, project, summary),
            );
            this.headerExecutionTabsHost.replaceChildren(strip);
            this.transcriptTabStrip = strip;
            this.agentsHubInlineTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        } else if (this.projectDetailTabStrip && this.headerExecutionTabsHost.contains(this.projectDetailTabStrip)) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectProjectDetailTab(tab, project),
            );
            this.headerExecutionTabsHost.replaceChildren(strip);
            this.projectDetailTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        }
        if (this.transcriptTabStrip?.isConnected
            && this.transcriptOpenSummary
            && this.transcriptTabStrip !== this.agentsHubInlineTabStrip) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectTranscriptTab(tab, project, summary),
            );
            this.replaceExecutionSurfaceTabStrip(this.transcriptTabStrip, strip);
            this.transcriptTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        }
    }

    /** Transcript + task headers share {@link applyExecutionSurfaceHeaderChrome}. */
    protected refreshExecutionSurfaceTabStripState(strip: HTMLElement, activeTab: TranscriptTab): void {
        if (activeTab === 'messages') {
            this.closeExecutionTabOverflowMenu();
        }
        applyExecutionSurfaceHeaderChrome(strip, activeTab);
        const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
        selectBtn?.setAttribute('aria-expanded', 'false');
        this.applyExecutionSurfaceIconSelectDisplay(strip, activeTab);
    }

    protected resolveExecutionSurfaceIconSelectDisplayTab(activeTab: TranscriptTab): TranscriptTab {
        return activeTab;
    }

    /**
     * Header back: leave Plan/Files/etc. for Chat before closing the project or transcript sheet.
     */
    protected navigateExecutionSurfaceBack(project: MobileProjectEntry): boolean {
        if (this.executionSurfaceTabForProject(project) === 'messages') {
            return false;
        }
        const agentsSummary = this.transcriptOpenSummary
            ?? (this.agentsHubShellActive ? this.resolveAgentsHubShellSummary(project) : undefined);
        if ((this.transcriptSheet || this.agentsHubShellActive) && agentsSummary) {
            this.selectTranscriptTab('messages', project, agentsSummary);
            return true;
        }
        if (this.isProjectDetailView() && this.expandedId === project.id) {
            this.selectProjectDetailTab('messages', project);
            return true;
        }
        return false;
    }

    protected applyExecutionSurfaceIconSelectDisplay(strip: HTMLElement, activeTab: TranscriptTab): void {
        const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
        const symbol = strip.querySelector<HTMLElement>('.theia-mobile-transcript-tab-icon-select-symbol');
        if (!selectBtn || !symbol) {
            return;
        }
        const displayTabId = this.resolveExecutionSurfaceIconSelectDisplayTab(activeTab);
        const spec = this.executionSurfaceTabSpecs().find(entry => entry.id === displayTabId);
        if (!spec) {
            return;
        }
        selectBtn.dataset.tab = spec.id;
        selectBtn.title = spec.label;
        selectBtn.setAttribute('aria-label', `${spec.label}, ${nls.localize('qaap/mobileProjects/tabOverflow', 'Change view')}`);
        symbol.replaceWith(createExecutionSurfaceIconElement(spec.icon, 'theia-mobile-transcript-tab-icon-select-symbol'));
        const triggerLabel = strip.querySelector<HTMLElement>('.theia-mobile-transcript-tab-icon-select-label');
        if (triggerLabel) {
            triggerLabel.textContent = spec.label;
        }
        for (const item of Array.from(strip.querySelectorAll<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select-option'))) {
            const tabId = item.dataset.tab as TranscriptTab | undefined;
            item.classList.toggle('theia-mod-active', tabId === activeTab);
        }
    }

    protected mountProjectDetailSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        switch (tab) {
            case 'plan':
                this.renderPlanTab(this.projectDetailSurfaceTargets?.planHost, undefined);
                break;
            case 'review':
                void this.mountProjectDetailReviewWidget(project);
                break;
            case 'preview':
                this.renderPreviewTab(project, summary);
                break;
            case 'files':
                this.ensureTranscriptFilesTab(project, summary);
                break;
            case 'terminal':
                void this.ensureTranscriptTerminalTab(project, summary);
                break;
            default:
                break;
        }
    }

    protected async mountProjectDetailReviewWidget(project: MobileProjectEntry): Promise<void> {
        const host = this.projectDetailSurfaceTargets?.reviewHost;
        if (!host || !this.createDiffReviewWidget) {
            return;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        if (!cwd) {
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-review-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/reviewUnavailable',
                'Review is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        host.replaceChildren();
        const diffHost = document.createElement('div');
        diffHost.className = 'theia-mobile-transcript-review-diff-host';
        host.append(diffHost);
        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        if (!this.diffReviewWidget) {
            this.diffReviewWidget = await this.createDiffReviewWidget();
        }
        if (!host.isConnected) {
            return;
        }
        this.diffReviewWidget.enableTranscriptEmbed({ externalChrome: true });
        this.diffReviewWidget.node.classList.add('theia-mobile-transcript-diff-embed');
        this.diffReviewWidget.setTranscriptAgentFeedbackHandler(async () => { /* project-level — use composer below */ });
        this.attachDiffReviewWidget(diffHost);
        this.diffReviewWidget.setRepositoryContext({
            rootUri,
            rootFsPath: cwd,
            isActiveWorkspace: project.isCurrent,
        });
    }

    /** Prefer transcript sheet hosts while the modal is open — project detail may still exist underneath. */
    protected executionSurfaceHost(
        transcriptHost: HTMLElement | undefined,
        projectDetailHost: HTMLElement | undefined,
    ): HTMLElement | undefined {
        if ((this.transcriptSheet || this.agentsHubShellActive) && transcriptHost) {
            return transcriptHost;
        }
        return projectDetailHost ?? transcriptHost;
    }

    protected executionPreviewHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.transcriptPreviewHost,
            this.projectDetailSurfaceTargets?.previewHost,
        );
    }

    protected executionFilesHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.transcriptFilesHost,
            this.projectDetailSurfaceTargets?.filesHost,
        );
    }

    protected executionTerminalHost(): HTMLElement | undefined {
        return this.executionSurfaceHost(
            this.transcriptTerminalHost,
            this.projectDetailSurfaceTargets?.terminalHost,
        );
    }

    protected async onStickyComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.pickContextVariable) {
            return;
        }
        const variable = await this.pickContextVariable(anchor);
        if (!variable) {
            return;
        }
        this.stickyComposerContext.push(variable);
        this.renderStickyComposer();
    }

    protected renderStickyComposer(): void {
        this.stickyComposerContextUsageDispose.dispose();
        this.stickyComposerHost.replaceChildren();
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
                if (this.transcriptComposerBackendAgents.length === 0) {
                    void this.refreshTranscriptComposerAgents(shellProject);
                }
                this.mountTranscriptStickyComposer(this.stickyComposerHost, shellProject, shellSummary, chatHost);
            }
            this.syncHeaderComposerSurfacePicker();
            this.updateNewFabVisibility();
            window.requestAnimationFrame(() => this.updateStickyComposerFabLift());
            return;
        }
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
        this.stickyComposerSurface = readStoredComposerSurface(cwd) ?? 'task';
        const isChatSurface = this.stickyComposerSurface === 'chat';
        if (isChatSurface) {
            this.pinStickyComposerToCoder(cwd);
        }
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
        const showApprovalPolicy = !isChatSurface && agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.stickyComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.stickyComposerApprovalPolicyId,
                cwd,
            );
        } else {
            this.stickyComposerApprovalPolicyId = undefined;
        }

        const column = this.buildStickyComposerColumn({
            project,
            surface: this.stickyComposerSurface,
            agentLocked: isChatSurface,
            getContext: () => this.stickyComposerContext,
            clearContext: () => {
                this.stickyComposerContext = [];
                this.renderStickyComposer();
            },
            removeContextItem: index => {
                this.stickyComposerContext.splice(index, 1);
                this.renderStickyComposer();
            },
            formatContextChip: item => this.formatComposerContextChip(item),
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
                const resolvedPinnedId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : this.resolveStickyComposerPinnedAgentId(project);
                const selectedAgentId = isChatSurface
                    ? THEIA_CODER_AGENT_ID
                    : resolveExplicitAgentForSubmit(draft, {
                        pinnedChatAgentId: resolvedPinnedId,
                    }) ?? resolvedPinnedId;
                const variables = this.stickyComposerContext.length > 0 ? [...this.stickyComposerContext] : undefined;
                const modeId = this.stickyComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.stickyComposerApprovalPolicyId,
                    cwd,
                );
                this.stickyComposerContext = [];
                const submitOptions = {
                    openConversation: isChatSurface,
                    selectedAgentId,
                    modeId,
                    variables,
                    autoApprove,
                };
                const done = isChatSurface
                    ? this.submitLocalChatFromComposer(project, draft, submitOptions)
                    : this.submitBackgroundAgentTask(project, draft, { ...submitOptions, openConversation: false, forceVps: true });
                void done.finally(() => this.renderStickyComposer());
            },
            onSubmitBlocked: () => {
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
                this.pinStickyComposerToCoder(cwd);
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
        resolveTarget: () => { readonly summary?: QaapAgentConversationSummaryDTO; readonly chatModel?: ChatModel } | undefined,
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
                });
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
    ): { readonly summary?: QaapAgentConversationSummaryDTO; readonly chatModel?: ChatModel } {
        if (summary.source === 'theia-chat') {
            const chatModel = this.resolveTranscriptTheiaChatModel(summary);
            return chatModel ? { chatModel } : {};
        }
        const cwd = summary.cwd;
        const live = this.conversations?.getConversationsForCwd(cwd).find(c => c.id === summary.id) ?? summary;
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
        getContext: () => AIVariableResolutionRequest[];
        clearContext: () => void;
        removeContextItem: (index: number) => void;
        formatContextChip: (item: AIVariableResolutionRequest) => StickyComposerContextChipView;
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
        if (this.stickyComposerSurface === 'chat') {
            return THEIA_CODER_AGENT_ID;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const pinned = this.stickyComposerPinnedAgentId ?? readStoredAgent(cwd);
        if (pinned) {
            return pinned;
        }
        return this.getOfferableCoderAgent()
            ? THEIA_CODER_AGENT_ID
            : (this.stickyComposerBackendAgents[0]?.id ?? QAIQ_AGENT_ID);
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
        return filterUiSelectableVpsAgents(agents);
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
        if (this.transcriptComposerBackendAgents.length === 0) {
            await this.refreshTranscriptComposerAgents(project);
        }
        return this.filterSelectableComposerAgents(this.transcriptComposerBackendAgents);
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
            onSelect: policyId => {
                this.stickyComposerApprovalPolicyId = policyId;
                if (cwd) {
                    writeStoredAgentApprovalPolicy(cwd, policyId);
                }
                this.closeStickyComposerSheets();
                this.renderStickyComposer();
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
        this.closeTranscriptComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.openApprovalPolicySheet({
            agentLabel,
            cwd,
            transcriptOverlay: true,
            selectedId: reconcileAgentApprovalPolicyId(this.transcriptComposerApprovalPolicyId, cwd),
            onSelect: policyId => {
                this.transcriptComposerApprovalPolicyId = policyId;
                if (cwd) {
                    writeStoredAgentApprovalPolicy(cwd, policyId);
                }
                this.closeTranscriptComposerSheets();
                this.remountTranscriptStickyComposer();
            },
            onClose: () => this.closeTranscriptComposerSheets(),
            assignSheet: sheet => { this.transcriptComposerApprovalSheet = sheet; },
        });
    }

    protected openApprovalPolicySheet(options: {
        readonly agentLabel: string;
        readonly cwd: string | undefined;
        readonly selectedId: QaapAgentApprovalPolicyId;
        /** Raise above the full-screen transcript overlay (z-index 2147483001). */
        readonly transcriptOverlay?: boolean;
        readonly onSelect: (policyId: QaapAgentApprovalPolicyId) => void;
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
        for (const policy of QAAP_AGENT_APPROVAL_POLICIES) {
            list.append(createApprovalPolicySheetOptionButton({
                policy,
                selected: policy.id === options.selectedId,
                onSelect: () => options.onSelect(policy.id),
            }));
        }

        panel.append(header, list);
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
        if (item.surface === 'chat') {
            await this.openTheiaChatTranscriptSheet(project, summary);
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

    protected updateTasksAttentionChrome(): void {
        if (!this.homeMode || !this.isTasksHubView() || this.tasksHubSurface === 'chat' || this.shouldUseAgentsHubLanding()) {
            this.titleAttentionEl.hidden = true;
            this.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        const { needsYou } = this.countTasksAttention();
        if (needsYou <= 0) {
            this.titleAttentionEl.hidden = true;
            this.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        this.titleAttentionEl.hidden = false;
        this.titleAttentionEl.setAttribute('aria-hidden', 'false');
        this.titleAttentionEl.textContent = String(needsYou);
        this.titleAttentionEl.title = nls.localize(
            'qaap/mobileProjects/tasksAttentionTitle',
            '{0} tasks need your attention',
            String(needsYou),
        );
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

    protected appendTasksHubTeamSection(container: HTMLElement): boolean {
        const { members, filteredApprovals } = this.getFilteredTeamHubState();
        const teamHost = document.createElement('div');
        teamHost.className = 'theia-mobile-hub-team-root theia-mod-embedded-in-tasks';
        const rendered = this.ensureOverlayUi().teamHub.renderSections(teamHost, members, {
            searchQuery: this.query,
            approvals: filteredApprovals,
            embedded: true,
        });
        if (rendered) {
            container.append(teamHost);
        }
        return rendered;
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
        return title || project.name;
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

    protected shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.transcriptSheet?.parentElement === document.body
            && !document.body.classList.contains('theia-mobile-mod-landing');
    }

    protected createAgentsHubQuickActionsBlock(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'theia-mobile-agent-transcript-empty-actions';
        container.setAttribute('role', 'group');
        container.setAttribute(
            'aria-label',
            nls.localize('qaap/agentsHub/quickActions', 'Quick actions'),
        );
        for (const action of QAAP_AGENTS_HUB_QUICK_ACTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-agent-transcript-empty-action';
            const iconWrap = document.createElement('span');
            iconWrap.className = 'theia-mobile-agent-transcript-empty-action-icon';
            const icon = document.createElement('i');
            icon.className = `codicon codicon-${action.icon}`;
            icon.setAttribute('aria-hidden', 'true');
            iconWrap.append(icon);
            const label = document.createElement('span');
            label.className = 'theia-mobile-agent-transcript-empty-action-label';
            label.textContent = nls.localize(action.labelKey, action.labelDefault);
            btn.append(iconWrap, label);
            btn.addEventListener('click', () => {
                this.applyComposerQuickActionPrompt(nls.localize(action.promptKey, action.promptDefault));
            });
            container.append(btn);
        }
        return container;
    }

    protected applyComposerQuickActionPrompt(prompt: string): void {
        const trimmed = prompt.trim();
        if (!trimmed) {
            return;
        }
        if (this.transcriptComposerHost?.isConnected) {
            this.transcriptComposerDraft = trimmed;
            this.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
            return;
        }
        this.stickyComposerDraft = trimmed;
        this.renderStickyComposer();
        window.requestAnimationFrame(() => {
            const input = this.stickyComposerHost?.querySelector<HTMLTextAreaElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            if (!input) {
                return;
            }
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
    }

    protected createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement {
        const recents = this.collectAgentsHubRecentItems(this.projects, QAAP_AGENTS_HUB_RECENT_LIMIT, project);
        const block = document.createElement('section');
        block.className = 'theia-mobile-agents-hub-landing theia-mod-transcript-recents';
        if (recents.length === 0) {
            return block;
        }
        const head = document.createElement('div');
        head.className = 'theia-mobile-agents-hub-landing-section-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agents-hub-landing-section-label q-overline';
        label.textContent = nls.localize('qaap/agentsHub/sessionsSection', 'Sessions');
        const count = document.createElement('span');
        count.className = 'theia-mobile-agents-hub-landing-section-count';
        count.textContent = String(recents.length);
        head.append(label, count);
        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list theia-mobile-agents-hub-landing-list';
        const parentIds = new Set<string>();
        for (const entry of recents) {
            if (entry.summary.forkedFromId) {
                parentIds.add(entry.summary.forkedFromId);
            }
        }
        const activeInfo = this.activeInfoForProject(project);
        for (const { summary } of recents) {
            const task = this.summaryToTaskView(summary);
            list.append(this.createTaskItem(project, task, activeInfo, summary, parentIds));
        }
        block.append(head, list);
        const viewAll = document.createElement('button');
        viewAll.type = 'button';
        viewAll.className = 'theia-mobile-agents-hub-landing-view-all';
        viewAll.textContent = nls.localize('qaap/agentsHub/viewAllSessions', 'View all sessions');
        viewAll.addEventListener('click', () => {
            this.openWorkHubSessionsSidebar();
        });
        block.append(viewAll);
        return block;
    }

    protected renderTasksHubView(projects: MobileProjectEntry[]): void {
        if (this.shouldUseAgentsHubLanding()) {
            void projects;
            this.renderAgentsHubExecutionShell();
            return;
        }
        if (this.agentsHubShellActive) {
            this.teardownAgentsHubExecutionShell();
        }
        const root = document.createElement('div');
        root.className = 'theia-mobile-tasks-hub-root';
        if (this.tasksHubSurface === 'chat') {
            const groups = this.collectChatHubGroups(projects);
            if (groups.length === 0) {
                root.append(this.createChatEmptyState());
            } else {
                const host = document.createElement('div');
                host.className = 'theia-mobile-projects-chats-inbox theia-mod-local-chat';
                for (const group of groups) {
                    const items: MobileWorkHubInboxItem[] = group.summaries.map(summary => ({
                        kind: 'conversation',
                        project: group.project,
                        summary,
                        sortAt: summary.updatedAt,
                        priority: 0,
                    }));
                    host.append(this.createInboxProjectGroup(group.project, items));
                }
                root.append(host);
            }
            this.scroll.append(root);
            this.updateTasksAttentionChrome();
            this.renderSubtitle();
            return;
        }

        const groups = this.collectTasksInboxGroups(projects);
        const teamRendered = this.appendTasksHubTeamSection(root);

        if (groups.length > 0) {
            const inbox = document.createElement('div');
            inbox.className = 'theia-mobile-projects-chats-inbox theia-mod-tasks-inbox';
            if (teamRendered) {
                const inboxHead = document.createElement('div');
                inboxHead.className = 'theia-mobile-tasks-inbox-section-head';
                const inboxLabel = document.createElement('span');
                inboxLabel.className = 'theia-mobile-tasks-inbox-section-label';
                inboxLabel.textContent = nls.localize('qaap/mobileProjects/tasksInboxSection', 'By project');
                inboxHead.append(inboxLabel);
                inbox.append(inboxHead);
            }
            for (const group of groups) {
                inbox.append(this.createInboxProjectGroup(group.project, group.items));
            }
            root.append(inbox);
        }

        if (!teamRendered && groups.length === 0) {
            if (this.tasksFirstLoadPending && !this.query.trim()) {
                root.append(this.createTasksLoadingState());
            } else {
                root.append(this.createTasksEmptyState());
            }
        }
        this.scroll.append(root);
        this.updateTasksAttentionChrome();
        this.renderSubtitle();
    }

    protected renderReviewHubView(projects: MobileProjectEntry[]): void {
        if (!this.inboxPullRequestsLoaded && !this.inboxPullRequestsLoading) {
            void this.refreshInboxPullRequests(projects);
        }
        const groups = this.collectReviewGroups(projects);
        const hasGithubRepos = githubRepoKeysForProjects(projects).length > 0;
        const root = document.createElement('div');
        root.className = 'theia-mobile-review-hub-root';

        if (groups.length > 0) {
            const inbox = document.createElement('div');
            inbox.className = 'theia-mobile-projects-chats-inbox theia-mod-review-inbox';
            for (const group of groups) {
                inbox.append(this.createInboxProjectGroup(group.project, group.items));
            }
            if (hasGithubRepos && this.inboxPullRequestsLoaded && this.inboxGithubSignedIn === false) {
                inbox.append(this.createInboxGithubSignInHint());
            }
            root.append(inbox);
            this.scroll.append(root);
        } else if (!this.inboxPullRequestsLoaded && this.inboxPullRequestsLoading) {
            this.scroll.append(this.createReviewLoadingState());
        } else if (hasGithubRepos && this.inboxGithubSignedIn === false) {
            const host = document.createElement('div');
            host.className = 'theia-mobile-review-hub-root';
            host.append(this.createInboxGithubSignInHint(), this.createReviewEmptyState());
            this.scroll.append(host);
        } else {
            this.scroll.append(this.createReviewEmptyState());
        }
        this.renderSubtitle();
    }

    protected renderChatHubView(projects: MobileProjectEntry[]): void {
        const groups = this.collectChatHubGroups(projects);
        if (groups.length === 0) {
            this.scroll.append(this.createChatEmptyState());
            this.renderSubtitle();
            return;
        }
        const host = document.createElement('div');
        host.className = 'theia-mobile-projects-chats-inbox theia-mod-local-chat';
        for (const group of groups) {
            const items: MobileWorkHubInboxItem[] = group.summaries.map(summary => ({
                kind: 'conversation',
                project: group.project,
                summary,
                sortAt: summary.updatedAt,
                priority: 0,
            }));
            host.append(this.createInboxProjectGroup(group.project, items));
        }
        this.scroll.append(host);
        this.renderSubtitle();
    }

    protected collectChatHubGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }> {
        const groups: Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }> = [];
        const query = this.query.trim().toLowerCase();
        for (const project of projects) {
            let summaries = this.localChatsForProject(project);
            if (query) {
                summaries = summaries.filter(c => this.conversationMatchesQuery(c, query));
            }
            if (summaries.length === 0) {
                continue;
            }
            groups.push({ project, summaries });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    protected renderCatalogHubView(): void {
        const sections = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.query);
        if (sections.length === 0) {
            this.scroll.append(this.createCatalogEmptyState());
            this.renderSubtitle();
            return;
        }
        const catalog = document.createElement('div');
        catalog.className = 'theia-mobile-hub-catalog';
        for (const section of sections) {
            catalog.append(this.createCatalogSection(section));
        }
        this.scroll.append(catalog);
        this.renderSubtitle();
    }

    protected renderRoutinesHubView(): void {
        if (!this.workHubRoutinesLoaded && !this.workHubRoutinesLoading) {
            void this.refreshWorkHubRoutines();
        }
        const routines = this.sortRoutinesForDisplay(filterRoutinesByQuery(this.workHubRoutines, this.query));
        if (!this.workHubRoutinesLoaded && this.workHubRoutinesLoading) {
            this.scroll.append(this.createRoutinesLoadingState());
            this.renderSubtitle();
            return;
        }
        if (routines.length === 0) {
            this.scroll.append(this.createRoutinesEmptyState());
            this.renderSubtitle();
            return;
        }
        const host = document.createElement('div');
        host.className = 'theia-mobile-hub-routines';
        const group = document.createElement('div');
        group.className = 'theia-mobile-hub-routines-group';
        for (const routine of routines) {
            group.append(this.createRoutineRow(routine));
        }
        host.append(group);
        this.scroll.append(host);
        this.renderSubtitle();
        this.scheduleRoutinesRefreshWhileRunning();
    }

    protected sortRoutinesForDisplay(routines: readonly QaapWorkHubRoutine[]): QaapWorkHubRoutine[] {
        const rank = (routine: QaapWorkHubRoutine): number => {
            if (routine.lastRunState === 'running') {
                return 0;
            }
            if (routine.enabled) {
                return 1;
            }
            return 2;
        };
        return [...routines].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    }

    protected patchRoutineLocally(
        id: string,
        patch: Partial<Pick<QaapWorkHubRoutine, 'enabled' | 'lastRunState'>>,
    ): void {
        this.workHubRoutines = this.workHubRoutines.map(routine =>
            routine.id === id ? { ...routine, ...patch } : routine,
        );
        if (this.visible && this.hubView === 'routines' && !this.routineSheet) {
            this.renderList();
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

    protected scheduleRoutinesRefreshWhileRunning(): void {
        window.clearTimeout(this.routinesRefreshTimer);
        if (this.routineInteractionLock || this.routineSheet) {
            return;
        }
        const hasRunning = this.workHubRoutines.some(r => r.lastRunState === 'running');
        if (!hasRunning || this.hubView !== 'routines' || !this.visible) {
            return;
        }
        this.routinesRefreshTimer = window.setTimeout(() => {
            void this.refreshWorkHubRoutines(true);
        }, 4000);
    }

    protected createRoutinesLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-routines-loading';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
        loading.append(title);
        return loading;
    }

    protected createRoutinesEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-routines-empty';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/routinesEmpty', 'No routines match your search')
            : nls.localize('qaap/mobileProjects/routinesEmptyAll', 'No routines yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize(
                'qaap/mobileProjects/routinesEmptySearchBody',
                'Try another keyword or clear the search.',
            )
            : nls.localize(
                'qaap/mobileProjects/routinesEmptyBody',
                'Tap + to schedule an agent on your VPS.',
            );
        empty.append(title, body);
        return empty;
    }

    protected routineRowSubtitle(routine: QaapWorkHubRoutine): string {
        if (routine.lastRunState === 'running') {
            return nls.localize('qaap/mobileProjects/routineStatusRunning', 'Running');
        }
        if (routine.lastRunState === 'failed') {
            return nls.localize('qaap/mobileProjects/routineStatusFailed', 'Failed');
        }
        if (!routine.enabled) {
            return nls.localize('qaap/mobileProjects/routinesSectionPaused', 'Paused');
        }
        return routineScheduleLabel(routine);
    }

    protected createRoutineRow(routine: QaapWorkHubRoutine): HTMLElement {
        const row = document.createElement('article');
        row.className = 'theia-mobile-hub-routine-row';
        if (routine.lastRunState === 'running') {
            row.classList.add('theia-mod-running');
        }
        if (!routine.enabled) {
            row.classList.add('theia-mod-paused');
        }

        const main = document.createElement('div');
        main.className = 'theia-mobile-hub-routine-main';
        main.setAttribute('role', 'button');
        main.tabIndex = 0;

        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-routine-title';
        title.textContent = routine.title;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-hub-routine-meta';
        meta.textContent = this.routineRowSubtitle(routine);
        main.append(title, meta);

        const openEditor = (): void => this.openRoutineEditor(routine);
        main.addEventListener('click', openEditor);
        main.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openEditor();
            }
        });

        const trailing = document.createElement('div');
        trailing.className = 'theia-mobile-hub-routine-trailing';
        trailing.addEventListener('click', ev => ev.stopPropagation());
        trailing.addEventListener('pointerdown', ev => ev.stopPropagation());

        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'theia-mobile-hub-routine-run q-icon-button codicon codicon-debug-start';
        run.title = nls.localize('qaap/mobileProjects/routineRun', 'Run');
        run.setAttribute('aria-label', run.title);
        run.disabled = routine.lastRunState === 'running';
        run.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            void this.runRoutineNow(routine);
        });

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-hub-routine-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', routine.enabled ? 'true' : 'false');
        toggle.title = routine.enabled
            ? nls.localize('qaap/mobileProjects/routineDisable', 'Disable routine')
            : nls.localize('qaap/mobileProjects/routineEnable', 'Enable routine');
        toggle.setAttribute('aria-label', toggle.title);
        toggle.classList.toggle('theia-mod-on', routine.enabled);
        toggle.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            void this.toggleRoutineEnabled(routine);
        });

        trailing.append(run, toggle);
        row.append(main, trailing);
        return row;
    }

    protected async toggleRoutineEnabled(routine: QaapWorkHubRoutine): Promise<void> {
        const previousEnabled = routine.enabled;
        const nextEnabled = !previousEnabled;
        this.routineInteractionLock = true;
        this.patchRoutineLocally(routine.id, { enabled: nextEnabled });
        try {
            await updateWorkHubRoutine(routine.id, { enabled: nextEnabled });
        } catch (error) {
            this.patchRoutineLocally(routine.id, { enabled: previousEnabled });
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.routineInteractionLock = false;
            await this.refreshWorkHubRoutines(true);
        }
    }

    protected async runRoutineNow(routine: QaapWorkHubRoutine): Promise<void> {
        this.routineInteractionLock = true;
        this.patchRoutineLocally(routine.id, { lastRunState: 'running' });
        try {
            await runWorkHubRoutineNow(routine.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineStarted', 'Routine started on the VPS'),
                { kind: 'success', duration: 1800 },
            );
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.routineInteractionLock = false;
            await this.refreshWorkHubRoutines(true);
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

    protected createCatalogSection(section: WorkHubCatalogSection): HTMLElement {
        const block = document.createElement('section');
        block.className = 'theia-mobile-hub-catalog-section';

        const head = document.createElement('div');
        head.className = 'theia-mobile-hub-catalog-section-head';
        const title = document.createElement('h2');
        title.className = 'theia-mobile-hub-catalog-section-title';
        title.textContent = section.title;
        const count = document.createElement('span');
        count.className = 'theia-mobile-hub-catalog-section-count';
        count.textContent = String(section.items.length);
        head.append(title, count);

        const list = document.createElement('div');
        list.className = 'theia-mobile-hub-catalog-cards';
        for (const item of section.items) {
            list.append(this.createCatalogCard(item));
        }

        block.append(head, list);
        return block;
    }

    protected createCatalogCard(item: WorkHubCatalogItem): HTMLElement {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theia-mobile-hub-catalog-card';
        if (item.accent) {
            card.style.setProperty('--qaap-hub-catalog-accent', item.accent);
        }

        const icon = document.createElement('span');
        icon.className = `theia-mobile-hub-catalog-card-icon codicon ${item.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-hub-catalog-card-body';

        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-catalog-card-title';
        title.textContent = item.title;

        const subtitle = document.createElement('span');
        subtitle.className = 'theia-mobile-hub-catalog-card-subtitle';
        subtitle.textContent = item.subtitle;

        body.append(title, subtitle);

        if (item.progress !== undefined) {
            const progressWrap = document.createElement('div');
            progressWrap.className = 'theia-mobile-hub-catalog-card-progress';
            progressWrap.setAttribute('role', 'progressbar');
            progressWrap.setAttribute('aria-valuemin', '0');
            progressWrap.setAttribute('aria-valuemax', '100');
            const percent = Math.round(Math.max(0, Math.min(1, item.progress)) * 100);
            progressWrap.setAttribute('aria-valuenow', String(percent));
            const bar = document.createElement('span');
            bar.className = 'theia-mobile-hub-catalog-card-progress-bar';
            bar.style.width = `${percent}%`;
            progressWrap.append(bar);
            body.append(progressWrap);
        }

        if (item.meta) {
            const meta = document.createElement('span');
            meta.className = 'theia-mobile-hub-catalog-card-meta';
            meta.textContent = item.meta;
            body.append(meta);
        }

        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-hub-catalog-card-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');

        card.append(icon, body, chevron);
        bindCatalogCardTapFeedback(card);
        card.addEventListener('click', () => { void this.runCatalogAction(item.action); });
        return card;
    }

    protected createCatalogEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-catalog-empty';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/workflowsEmpty', 'No workflows match your search');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/workflowsEmptyBody',
            'Try another keyword or clear the search field.',
        );
        empty.append(title, body);
        return empty;
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

    protected createInboxGithubSignInHint(): HTMLElement {
        const hint = document.createElement('div');
        hint.className = 'theia-mobile-projects-inbox-hint';
        const text = document.createElement('p');
        text.textContent = nls.localize(
            'qaap/mobileProjects/inboxSignInHint',
            'Sign in with GitHub to see open pull requests in this inbox.',
        );
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-projects-inbox-hint-btn';
        btn.textContent = nls.localize('qaap/mobileProjects/inboxSignIn', 'Sign in with GitHub');
        btn.addEventListener('click', () => startGithubOAuth());
        hint.append(text, btn);
        return hint;
    }

    protected collectTasksInboxGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        const groups: Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> = [];
        const query = this.query.trim().toLowerCase();
        for (const project of projects) {
            let conversations = this.conversations
                ? this.vpsTasksForProject(project)
                : [];
            if (query) {
                conversations = conversations.filter(c => this.conversationMatchesQuery(c, query));
            }
            const items = buildWorkHubInboxItems(project, conversations);
            if (items.length === 0) {
                continue;
            }
            groups.push({ project, items });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    protected collectReviewGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        const groups: Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> = [];
        const query = this.query.trim().toLowerCase();
        for (const project of projects) {
            let pullRequests = this.inboxPullRequests.filter(pr => {
                if (query) {
                    return pullRequestMatchesQuery(pr, query);
                }
                return true;
            });
            const conversations = this.conversations
                ? this.vpsTasksForProject(project)
                : [];
            const items = buildReviewHubPullRequestItems(
                project,
                pullRequests,
                conversations,
                this.activeAgentBranchForProject(project),
            );
            if (items.length === 0) {
                continue;
            }
            groups.push({ project, items });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    protected activeAgentBranchForProject(project: MobileProjectEntry): string | undefined {
        const streaming = this.conversations
            ? this.vpsTasksForProject(project).some(c => c.status === 'streaming')
            : false;
        return streaming && project.branch ? project.branch : undefined;
    }

    protected compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number {
        const aRunning = this.countRunningTasks(a) > 0 ? 1 : 0;
        const bRunning = this.countRunningTasks(b) > 0 ? 1 : 0;
        if (aRunning !== bRunning) {
            return bRunning - aRunning;
        }
        const aUnread = this.countUnreadTasks(a) > 0 ? 1 : 0;
        const bUnread = this.countUnreadTasks(b) > 0 ? 1 : 0;
        if (aUnread !== bUnread) {
            return bUnread - aUnread;
        }
        if (a.isCurrent !== b.isCurrent) {
            return a.isCurrent ? -1 : 1;
        }
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    }

    protected createInboxProjectGroup(
        project: MobileProjectEntry,
        items: MobileWorkHubInboxItem[],
    ): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-projects-chats-project-group';
        section.style.setProperty('--qaap-mobile-project-accent', project.color);

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'theia-mobile-projects-chats-project-head';
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-projects-chats-project-glyph';
        glyph.textContent = project.name.slice(0, 1).toUpperCase();
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-chats-project-label';
        label.textContent = project.name;
        const count = document.createElement('span');
        count.className = 'theia-mobile-projects-chats-project-count';
        count.textContent = String(items.length);
        head.append(glyph, label, count);
        head.addEventListener('click', () => {
            this.hubView = 'repos';
            this.projectsService.setHubView('repos');
            void this.openProjectDetail(project);
        });

        const parentIds = new Set<string>();
        for (const item of items) {
            if (item.kind === 'conversation' && item.summary.forkedFromId) {
                parentIds.add(item.summary.forkedFromId);
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        const activeInfo = this.activeInfoForProject(project);

        // Split out parallel-run variants so they render in their own grouped sub-section.
        const variantRuns = new Map<string, QaapAgentConversationSummaryDTO[]>();
        for (const item of items) {
            if (item.kind === 'conversation' && item.summary.parallelRunId) {
                const runId = item.summary.parallelRunId;
                const bucket = variantRuns.get(runId) ?? [];
                bucket.push(item.summary);
                variantRuns.set(runId, bucket);
                continue;
            }
            if (item.kind === 'conversation') {
                const task = this.summaryToTaskView(item.summary);
                list.append(this.createTaskItem(project, task, activeInfo, item.summary, parentIds));
            } else {
                list.append(this.createInboxPullRequestItem(project, item.pullRequest, item.agentActivityLabel));
            }
        }

        section.append(head, list);
        for (const [runId, summaries] of variantRuns) {
            section.append(this.ensureOverlayUi().parallel.createVariantRunSection(project, runId, summaries, activeInfo, parentIds));
        }
        return section;
    }

    protected createInboxPullRequestItem(
        project: MobileProjectEntry,
        pullRequest: QaapGithubPullRequestSummary,
        agentActivity?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-row theia-mobile-projects-inbox-pr-row';

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item theia-mobile-projects-inbox-pr-item';

        const icon = document.createElement('span');
        icon.className = 'theia-mobile-projects-task-dot theia-mod-pr';
        icon.append(this.createTaskLeadingGlyph('codicon-git-pull-request'));
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-task-body';

        const titleRow = document.createElement('div');
        titleRow.className = 'theia-mobile-projects-task-title-row';
        const title = document.createElement('span');
        title.className = 'theia-mobile-projects-task-title';
        title.textContent = pullRequest.title;
        const since = document.createElement('span');
        since.className = 'theia-mobile-projects-task-since';
        since.textContent = this.formatInboxPullRequestSince(pullRequest);
        titleRow.append(title, since);
        body.append(titleRow);

        const foot = document.createElement('div');
        foot.className = 'theia-mobile-projects-task-foot';
        const prChip = document.createElement('span');
        prChip.className = 'theia-mobile-projects-task-agent theia-mod-pr';
        prChip.textContent = nls.localize(
            'qaap/mobileProjects/inboxPrChip',
            '#{0} · @{1}',
            String(pullRequest.number),
            pullRequest.author,
        );
        foot.append(prChip);

        const branchChip = document.createElement('span');
        branchChip.className = 'theia-mobile-projects-inbox-pr-branch';
        branchChip.textContent = `${pullRequest.branch} → ${pullRequest.base}`;
        foot.append(branchChip);

        const stats = document.createElement('span');
        stats.className = 'theia-mobile-projects-inbox-pr-stats';
        stats.textContent = `+${pullRequest.adds} -${pullRequest.dels}`;
        foot.append(stats);

        if (agentActivity === 'agent-active') {
            const agentBadge = document.createElement('span');
            agentBadge.className = 'theia-mobile-projects-inbox-pr-agent';
            agentBadge.textContent = nls.localize('qaap/mobileProjects/inboxAgentOnPr', 'Agent working');
            foot.append(agentBadge);
        }

        body.append(foot);
        item.append(icon, body);
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            this.delegate.onOpenPullRequest?.(pullRequest);
        });
        row.append(item);
        return row;
    }

    protected formatInboxPullRequestSince(pullRequest: QaapGithubPullRequestSummary): string {
        const updated = Date.parse(pullRequest.updatedAt);
        if (!Number.isFinite(updated)) {
            return '';
        }
        const deltaMs = Date.now() - updated;
        const minutes = Math.floor(deltaMs / 60_000);
        if (minutes < 1) {
            return nls.localize('qaap/mobileProjects/inboxJustNow', 'just now');
        }
        if (minutes < 60) {
            return nls.localize('qaap/mobileProjects/inboxMinutesAgo', '{0}m ago', String(minutes));
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 48) {
            return nls.localize('qaap/mobileProjects/inboxHoursAgo', '{0}h ago', String(hours));
        }
        const days = Math.floor(hours / 24);
        return nls.localize('qaap/mobileProjects/inboxDaysAgo', '{0}d ago', String(days));
    }

    /**
     * Flips the one-shot "first conversations load" flag once data has arrived (or the safety
     * timeout fired). Idempotent: clears the fallback timer and only repaints when asked to.
     */
    protected markTasksFirstLoadComplete(render: boolean): void {
        if (this.tasksFirstLoadFallback !== undefined) {
            window.clearTimeout(this.tasksFirstLoadFallback);
            this.tasksFirstLoadFallback = undefined;
        }
        if (!this.tasksFirstLoadPending) {
            return;
        }
        this.tasksFirstLoadPending = false;
        if (render && this.visible && this.isTasksHubView()) {
            this.renderList();
        }
    }

    protected createTasksLoadingState(): HTMLElement {
        const list = document.createElement('div');
        list.className = 'theia-mobile-tasks-skeleton-list';
        list.setAttribute('aria-busy', 'true');
        list.setAttribute('aria-label', nls.localize('qaap/mobileProjects/tasksLoading', 'Loading tasks…'));
        for (let i = 0; i < 4; i++) {
            list.append(this.createTaskSkeletonRow());
        }
        return list;
    }

    protected createTaskSkeletonRow(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-tasks-skeleton-row q-card';
        const avatar = document.createElement('div');
        avatar.className = 'q-skeleton theia-mobile-tasks-skeleton-avatar';
        const body = document.createElement('div');
        body.className = 'theia-mobile-tasks-skeleton-body';
        const title = document.createElement('div');
        title.className = 'q-skeleton q-skeleton-text theia-mobile-tasks-skeleton-title';
        const meta = document.createElement('div');
        meta.className = 'q-skeleton q-skeleton-text theia-mobile-tasks-skeleton-meta';
        body.append(title, meta);
        row.append(avatar, body);
        return row;
    }

    protected createTasksEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-server-process';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noTasksSearchResults', 'No matching tasks')
            : nls.localize('qaap/mobileProjects/noTasks', 'No VPS tasks yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize(
                'qaap/mobileProjects/noTasksSearchResultsBody',
                'Try a task title, agent name, or branch.',
            )
            : nls.localize(
                'qaap/mobileProjects/noTasksBody',
                'Delegate work from a project — it keeps running on the server when you close the app.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    protected createReviewEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-pull-request';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noReviewSearchResults', 'No matching pull requests')
            : nls.localize('qaap/mobileProjects/noReview', 'No open pull requests');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize(
                'qaap/mobileProjects/noReviewSearchResultsBody',
                'Try a title, author, branch, or PR number.',
            )
            : nls.localize(
                'qaap/mobileProjects/noReviewBody',
                'When agents open PRs on your linked repos, they show up here for swipe review.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    protected createReviewLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-inbox-loading';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-loading codicon-mod-spin';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/reviewLoading', 'Loading pull requests…');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/reviewLoadingBody',
            'Fetching open pull requests from GitHub.',
        );
        loading.append(icon, title, body);
        return loading;
    }

    protected createChatEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-comment-discussion';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noChatSearchResults', 'No matching chats')
            : nls.localize('qaap/mobileProjects/noChat', 'No local chats yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize(
                'qaap/mobileProjects/noChatSearchResultsBody',
                'Try another title or message preview.',
            )
            : nls.localize(
                'qaap/mobileProjects/noChatBody',
                'Open a project and use Agent for interactive chat — sessions persist on this device.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    protected createChatsEmptyState(): HTMLElement {
        return this.createTasksEmptyState();
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
        if (summary.source === 'theia-chat') {
            await this.openTheiaChatTranscriptSheet(project, summary);
            return;
        }
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
            if (summary.source !== 'theia-chat') {
                const full = await forkConversation(summary.id);
                const forked = conversationToSummary(full);
                this.conversations?.recordSnapshot(forked);
                this.renderList();
                await this.openTranscriptSheet(project, forked);
                return;
            }
            const session = await this.forkTheiaConversation(project, summary);
            if (!session) {
                this.messageService?.error(nls.localize(
                    'qaap/mobileProjects/forkTaskFailedUnavailable',
                    'Could not fork this task because its saved transcript is unavailable.'
                ));
                return;
            }
            this.rememberChatSessionProject(session.id, project);
            this.trackChatServiceSessionModels();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            this.renderList();
            this.messageService?.info(nls.localize('qaap/mobileProjects/forkTaskCreated', 'Forked task created'));
            await this.openTheiaChatTranscriptSheet(project, {
                ...summary,
                id: `theia-chat:fork:${session.id}`,
                sessionId: session.id,
                title: session.title ?? summary.title,
                updatedAt: Date.now(),
                status: 'idle',
            });
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
            this.watchOpenTranscriptUntilIdle(project, summary.id);
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
                if (summary.source === 'theia-chat') {
                    await this.openTheiaChatTranscriptSheet(project, summary);
                } else {
                    await this.openTranscriptSheet(project, summary);
                }
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

    protected async submitLocalChatFromComposer(
        project: MobileProjectEntry,
        draft: string,
        options: {
            openConversation?: boolean;
            selectedAgentId?: string;
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        } = {},
    ): Promise<void> {
        if (!this.chatService) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'),
                { duration: 2400 },
            );
            return;
        }
        const cwd = this.projectsService.getProjectCwd(project)
            ?? this.preparedCwdByProjectId.get(project.id)
            ?? project.name;
        try {
            const summary = await this.createProjectTheiaChatSession(
                project,
                cwd,
                stripNonCoderAgentMention(draft),
                options,
            );
            this.stickyComposerDraft = '';
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/chatStarted', 'Chat started'),
                { kind: 'success', duration: 1400 },
            );
            await this.refreshChatServiceSessionSummaries();
            if (options.openConversation ?? true) {
                void this.openTheiaChatTranscriptSheet(project, summary);
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/chatStartFailed',
                'Could not start chat: {0}',
                detail,
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
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        if (!options.forceVps && this.shouldUseTheiaCoder(draft, options.selectedAgentId)) {
            return this.createProjectTheiaChatSession(project, cwd, draft, options);
        }
        const agent = await this.selectBackendConversationAgent(cwd, draft, options.selectedAgentId);
        const message = applyBackendInteractionModeToPrompt(draft, options.modeId);
        const agentModel = resolveStoredAgentModelForSubmit(agent, cwd);
        const contextPreamble = await this.backgroundContext?.resolve({
            text: draft,
            variables: options.variables,
        });
        const conversation = await createConversation({
            cwd,
            agent,
            title: draft,
            message,
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
    protected isActiveTranscriptConversation(summaryId: string): boolean {
        return this.transcriptOpenSummaryId === summaryId
            && (this.transcriptSheet !== undefined || this.agentsHubInlineActive);
    }

    protected scheduleTranscriptConversationRefresh(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        let refreshInFlight = false;
        const refresh = async (): Promise<void> => {
            if (this.isPendingNewChatSummary(summary)) {
                return;
            }
            if (refreshInFlight || !this.isActiveTranscriptConversation(summary.id) || !chatHost.isConnected) {
                return;
            }
            refreshInFlight = true;
            try {
                const full = await getConversation(summary.id);
                if (!this.isActiveTranscriptConversation(summary.id) || !chatHost.isConnected) {
                    return;
                }
                const fingerprint = this.conversationTranscriptFingerprint(full);
                this.transcriptLastConv = full;
                await this.syncTranscriptPreviewFromConversation(project, summary, full);
                if (fingerprint === this.transcriptLastFingerprint) {
                    return;
                }
                this.transcriptLastFingerprint = fingerprint;
                this.renderTranscriptMessages(chatHost, full);
                if (this.transcriptSheet) {
                    const surfaceTab = this.executionSurfaceTabForProject(project);
                    this.showOnlyExecutionSurfaceTab(surfaceTab);
                    this.mountTranscriptSurfaceTab(project, summary, surfaceTab);
                    this.syncExecutionSurfaceChrome(project);
                }
                this.handleTranscriptStatusForAutoVerify(project, summary, full.status);
                if (full.status === 'streaming' || this.transcriptPreviewRequestPending) {
                    this.watchOpenTranscriptUntilIdle(project, summary.id);
                } else {
                    this.setTranscriptLiveUpdates(Disposable.NULL);
                }
            } catch (error) {
                if (!chatHost.isConnected) {
                    return;
                }
                const messageHost = this.resolveTranscriptMessageHost(chatHost);
                messageHost.replaceChildren();
                const err = document.createElement('div');
                err.className = 'theia-mobile-agent-transcript-error';
                err.textContent = error instanceof Error ? error.message : String(error);
                messageHost.append(err);
            } finally {
                refreshInFlight = false;
            }
        };
        const scheduleRefresh = (): void => {
            if (!this.isActiveTranscriptConversation(summary.id)) {
                return;
            }
            if (this.transcriptRefreshTimer !== undefined) {
                window.clearTimeout(this.transcriptRefreshTimer);
            }
            this.transcriptRefreshTimer = window.setTimeout(() => {
                this.transcriptRefreshTimer = undefined;
                void refresh();
            }, 450);
        };
        this.transcriptScheduleRefresh = scheduleRefresh;
        void refresh();
    }

    protected async openAgentsHubInlineTranscript(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.agentsHubInlineActive) {
            this.replacingTranscriptSheet = true;
            this.closeAgentsHubSession();
            this.replacingTranscriptSheet = false;
        } else {
            this.replacingTranscriptSheet = true;
            this.closeTranscriptSheet();
            this.replacingTranscriptSheet = false;
        }
        this.agentsHubShellActive = true;
        this.agentsHubInlineActive = true;
        this.transcriptLastStatus = summary.status;
        this.transcriptOpenSummaryId = summary.id;
        this.transcriptOpenSummary = summary;
        this.transcriptOpenProject = project;
        this.transcriptLastFingerprint = undefined;
        if (this.visible) {
            this.renderHeader();
            this.renderSubtitle();
        }
        const inlineCwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.transcriptComposerPinnedAgentId = isAgentsHubIdleConversationSummary(summary)
            ? readStoredAgent(inlineCwd)
            : (migrateLegacyBackendAgentId(summary.agentId) ?? readStoredAgent(inlineCwd));
        void this.refreshTranscriptComposerAgents(project);
        const surfaceTab = this.executionSurfaceTabForProject(project);
        const chatHost = this.agentsHubInlineChatHost;
        if (this.agentsHubInlineExecutionRoot?.isConnected && chatHost?.isConnected) {
            this.syncAgentsHubInlineExecutionHeader(project, summary);
            this.renderAgentsHubShellChat(chatHost, project, summary);
            this.renderStickyComposer();
            this.scheduleTranscriptConversationRefresh(project, summary, chatHost);
            return;
        }
        if (this.visible) {
            this.renderList();
        }
        this.showOnlyExecutionSurfaceTab(surfaceTab);
        this.mountTranscriptSurfaceTab(project, summary, surfaceTab);
        this.renderStickyComposer();
        if (chatHost) {
            this.renderAgentsHubShellChat(chatHost, project, summary);
            this.scheduleTranscriptConversationRefresh(project, summary, chatHost);
        }
    }

    protected async openTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.shouldUseAgentsHubLanding() && !this.isProjectDetailView()) {
            await this.openAgentsHubInlineTranscript(project, summary);
            return;
        }
        this.replacingTranscriptSheet = true;
        this.closeTranscriptSheet();
        this.replacingTranscriptSheet = false;
        this.delegate.onEnterActiveTranscript?.();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-agent-transcript-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-transcript';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const headerTitle = this.resolveTranscriptHeaderTitle(project, summary);
        const { back, tabStrip } = this.mountTranscriptExecutionHeader(header, project, summary, headerTitle);

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        chatHost.hidden = false;
        this.renderTranscriptMessages(chatHost, this.summaryToTranscriptPlaceholder(summary));

        const chatInputHost = document.createElement('div');
        chatInputHost.className = 'theia-mobile-agent-transcript-chat-input';
        chatInputHost.hidden = false;

        const { planHost, reviewHost, previewHost, filesHost, terminalHost } = this.createTranscriptSheetSurfaceHosts();

        sheet.append(header, chatHost, planHost, reviewHost, previewHost, filesHost, terminalHost, chatInputHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;
        this.transcriptChatHost = chatHost;
        this.transcriptChatInputHost = chatInputHost;
        this.transcriptTabStrip = tabStrip;
        this.transcriptPlanHost = planHost;
        this.transcriptReviewHost = reviewHost;
        this.transcriptPreviewHost = previewHost;
        this.transcriptFilesHost = filesHost;
        this.transcriptTerminalHost = terminalHost;
        this.transcriptTerminalToolbar = undefined;
        this.transcriptTerminalSlider = undefined;
        this.transcriptTerminalDots = undefined;
        this.verifyResults = [];
        this.verifyChecksCwd = undefined;
        this.verifyChecksLoading = false;
        this.verifyRunning = false;
        this.verifyAutoAttempts = 0;
        this.transcriptHistoryPanelOpen = false;
        this.transcriptHistoryCommits = [];
        this.transcriptHistoryBranch = undefined;
        this.transcriptHistoryQuery = '';
        this.transcriptHistoryRoot = undefined;
        this.transcriptHistoryLoading = false;
        this.transcriptLastStatus = summary.status;
        this.transcriptOpenSummaryId = summary.id;
        this.transcriptOpenSummary = summary;
        this.transcriptOpenProject = project;
        this.transcriptLastFingerprint = undefined;
        if (this.visible) {
            this.renderHeader();
            this.renderSubtitle();
            this.renderList();
            this.syncHeaderExecutionTabStrip();
        }
        this.bindTranscriptSheetDismiss(back, backdrop);

        this.scheduleTranscriptConversationRefresh(project, summary, chatHost);

        this.transcriptComposerPinnedAgentId = migrateLegacyBackendAgentId(summary.agentId)
            ?? readStoredAgent(summary.cwd);
        void this.refreshTranscriptComposerAgents(project);
        this.mountTranscriptStickyComposer(chatInputHost, project, summary, chatHost);
        this.showOnlyExecutionSurfaceTab('messages');
        this.mountTranscriptSurfaceTab(project, summary, 'messages');
    }

    protected setTranscriptLiveUpdates(disposable: Disposable): void {
        this.transcriptLiveUpdatesDispose.dispose();
        this.transcriptLiveUpdatesDispose = disposable;
    }

    // ========================================================================
    // Verify tab (execution view · Phase 1 of the agentic surfaces)
    // ========================================================================

    /** Default checks run by the Verify tab. Single "Build" for now; structured for Test/Lint later. */
    protected async loadVerifyChecks(
        cwd: string,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<VerifyCheck[]> {
        if (this.verifyChecksCwd === cwd && !this.verifyChecksLoading && this.verifyResults.length > 0) {
            return this.verifyResults.map(result => result.check);
        }
        if (this.verifyChecksCwd === cwd && this.verifyChecksLoading) {
            return this.verifyResults.map(result => result.check);
        }

        this.verifyChecksCwd = cwd;
        this.verifyChecksLoading = true;
        this.verifyResults = [];
        this.refreshTranscriptChecksViews(project, summary);

        let checks: VerifyCheck[] = [];
        if (this.resolveVerifyChecks) {
            try {
                checks = await this.resolveVerifyChecks(cwd);
            } catch {
                checks = [];
            }
        }

        this.verifyResults = checks.map(check => ({ check, state: 'idle' as const }));
        this.verifyChecksLoading = false;
        if (this.transcriptOpenSummaryId === summary.id) {
            this.refreshTranscriptChecksViews(project, summary);
        }
        return checks;
    }

    protected verifyAutoStorageKey(cwd: string | undefined): string {
        return `qaap.verify.auto:${cwd ?? ''}`;
    }

    protected isAutoVerifyEnabled(cwd: string | undefined): boolean {
        try {
            return localStorage.getItem(this.verifyAutoStorageKey(cwd)) === '1';
        } catch {
            return false;
        }
    }

    protected setAutoVerifyEnabled(cwd: string | undefined, on: boolean): void {
        try {
            localStorage.setItem(this.verifyAutoStorageKey(cwd), on ? '1' : '0');
        } catch {
            /* private mode — ignore */
        }
    }

    /** Execution view tab strip — single overflow picker for Chat, Plan, Changes, etc. */
    protected buildTranscriptTabStrip(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): HTMLElement {
        return this.buildExecutionViewTabStrip(
            this.executionSurfaceTabForProject(project),
            tab => this.selectTranscriptTab(tab, project, summary),
        );
    }

    protected buildExecutionViewTabStrip(
        activeTab: TranscriptTab,
        onSelect: (tab: TranscriptTab) => void,
    ): HTMLElement {
        const strip = document.createElement('div');
        strip.className = 'theia-mobile-transcript-tabs theia-mod-header-inline';
        strip.setAttribute('role', 'tablist');
        const tabSpecs = this.executionSurfaceTabSpecs();
        const selectTab = (tab: TranscriptTab): void => {
            this.closeExecutionTabOverflowMenu();
            onSelect(tab);
        };
        const displayTabId = this.resolveExecutionSurfaceIconSelectDisplayTab(activeTab);
        strip.append(this.createExecutionSurfaceIconSelect(
            displayTabId,
            activeTab,
            tabSpecs,
            selectTab,
        ));
        applyExecutionSurfaceHeaderChrome(strip, activeTab);
        return strip;
    }

    protected executionSurfaceTabSpecs(): Array<{ id: TranscriptTab; label: string; icon: string }> {
        return [
            { id: 'messages', label: nls.localize('qaap/mobileProjects/tabChat', 'Chat'), icon: 'codicon-comment-discussion' },
            { id: 'plan', label: nls.localize('qaap/mobileProjects/tabPlan', 'Plan'), icon: 'codicon-file-text' },
            { id: 'review', label: nls.localize('qaap/mobileProjects/tabChanges', 'Changes'), icon: QAAP_SCM_CHANGES_ICON_CLASS },
            { id: 'preview', label: nls.localize('qaap/mobileProjects/tabPreview', 'Preview'), icon: 'codicon-globe' },
            { id: 'files', label: nls.localize('qaap/mobileProjects/tabFiles', 'Files'), icon: 'codicon-folder-opened' },
            { id: 'terminal', label: nls.localize('qaap/mobileProjects/tabTerminal', 'Terminal'), icon: 'codicon-terminal' },
        ];
    }

    protected createExecutionSurfaceIconSelect(
        displayTabId: TranscriptTab,
        activeTab: TranscriptTab,
        tabSpecs: Array<{ id: TranscriptTab; label: string; icon: string }>,
        onSelect: (tab: TranscriptTab) => void,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-tab-icon-select-host';

        const displaySpec = tabSpecs.find(entry => entry.id === displayTabId) ?? tabSpecs[0];
        const menuLabel = nls.localize('qaap/mobileProjects/tabOverflow', 'Change view');
        const menuOptions = this.executionSurfaceTabSpecs();

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-transcript-tab-icon-select-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', menuLabel);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'theia-mobile-transcript-tab-icon-select';
        trigger.dataset.tab = displaySpec.id;
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('theia-mod-active');
        trigger.classList.add('theia-mod-selected');
        trigger.dataset.surfaceActive = 'true';
        trigger.setAttribute('aria-selected', 'true');
        trigger.title = displaySpec.label;
        trigger.setAttribute('aria-label', menuLabel);

        appendExecutionSurfaceTabIcon(trigger, displaySpec.icon, 'theia-mobile-transcript-tab-icon-select-symbol');
        const triggerLabel = document.createElement('span');
        triggerLabel.className = 'theia-mobile-transcript-tab-icon-select-label';
        triggerLabel.textContent = displaySpec.label;
        triggerLabel.setAttribute('aria-hidden', 'true');
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-transcript-tab-icon-select-chevron codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.append(triggerLabel, chevron);
        trigger.addEventListener('click', event => {
            event.stopPropagation();
            if (this.executionTabOverflowMenu?.classList.contains('theia-mod-open')) {
                this.closeExecutionTabOverflowMenu();
                return;
            }
            this.openExecutionTabOverflowMenu(trigger, menu);
        });

        for (const spec of menuOptions) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'theia-mobile-transcript-tab-icon-select-option';
            item.dataset.tab = spec.id;
            item.setAttribute('role', 'menuitem');
            item.classList.toggle('theia-mod-active', spec.id === activeTab);
            item.title = spec.label;
            item.setAttribute('aria-label', spec.label);
            appendExecutionSurfaceTabIcon(item, spec.icon, '');
            const itemLabel = document.createElement('span');
            itemLabel.textContent = spec.label;
            item.append(itemLabel);
            item.addEventListener('click', event => {
                event.stopPropagation();
                this.closeExecutionTabOverflowMenu();
                onSelect(spec.id);
            });
            menu.append(item);
        }

        wrap.append(trigger, menu);
        return wrap;
    }

    protected resolveExecutionTabOverflowMenuPortal(anchor: HTMLElement): HTMLElement {
        const transcriptRoot = anchor.closest('.theia-mobile-agent-transcript-root');
        if (transcriptRoot instanceof HTMLElement) {
            return transcriptRoot;
        }
        return this.root;
    }

    protected openExecutionTabOverflowMenu(anchor: HTMLButtonElement, menu: HTMLElement): void {
        this.closeExecutionTabOverflowMenu();
        this.closeCardMenu();
        this.executionTabOverflowAnchor = anchor;
        this.executionTabOverflowMenu = menu;
        anchor.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        menu.classList.add('theia-mod-open', 'theia-mod-floating');
        this.resolveExecutionTabOverflowMenuPortal(anchor).append(menu);
        window.requestAnimationFrame(() => {
            if (this.executionTabOverflowMenu === menu && this.executionTabOverflowAnchor === anchor) {
                this.positionExecutionTabOverflowMenu(menu, anchor);
            }
        });
        const onDismiss = (event: Event): void => {
            const target = event.target;
            if (target instanceof Node && (menu.contains(target) || anchor.contains(target))) {
                return;
            }
            this.closeExecutionTabOverflowMenu();
        };
        const onReposition = (): void => {
            if (this.executionTabOverflowMenu === menu && this.executionTabOverflowAnchor === anchor) {
                this.positionExecutionTabOverflowMenu(menu, anchor);
            }
        };
        window.setTimeout(() => {
            window.addEventListener('pointerdown', onDismiss, true);
        }, 0);
        window.addEventListener('resize', onReposition);
        this.scroll.addEventListener('scroll', onReposition, { passive: true });
        this.executionTabOverflowDispose = Disposable.create(() => {
            window.removeEventListener('pointerdown', onDismiss, true);
            window.removeEventListener('resize', onReposition);
            this.scroll.removeEventListener('scroll', onReposition);
        });
    }

    protected executionTabOverflowMenuMinTop(anchor: HTMLElement): number {
        const gap = 6;
        const titleRow = anchor.closest('.theia-mobile-transcript-tabs')
            ?.closest('.theia-mobile-projects-title-row, .theia-mobile-agent-log-title-row');
        if (titleRow) {
            return titleRow.getBoundingClientRect().bottom + gap;
        }
        const header = anchor.closest('.theia-mobile-agent-log-header, .theia-mobile-projects-header');
        if (header) {
            return header.getBoundingClientRect().bottom + gap;
        }
        return anchor.getBoundingClientRect().bottom + gap;
    }

    protected positionExecutionTabOverflowMenu(menu: HTMLElement, anchor: HTMLElement): void {
        const margin = 8;
        const gap = 6;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth || menu.scrollWidth, 188);
        const menuHeight = Math.max(menu.offsetHeight || menu.scrollHeight, 1);
        const minTop = this.executionTabOverflowMenuMinTop(anchor);
        let top = Math.max(anchorRect.bottom + gap, minTop);
        const maxBottom = window.innerHeight - margin;
        if (top + menuHeight > maxBottom) {
            const aboveTop = anchorRect.top - gap - menuHeight;
            if (aboveTop >= margin && aboveTop >= minTop) {
                top = aboveTop;
            } else {
                top = Math.max(minTop, Math.max(margin, maxBottom - menuHeight));
            }
        }
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        menu.style.position = 'fixed';
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    protected closeExecutionTabOverflowMenu(): void {
        const menu = this.executionTabOverflowMenu;
        const anchor = this.executionTabOverflowAnchor;
        if (!menu) {
            return;
        }
        menu.hidden = true;
        menu.classList.remove('theia-mod-open', 'theia-mod-floating');
        menu.style.position = '';
        menu.style.zIndex = '';
        menu.style.top = '';
        menu.style.left = '';
        const parent = anchor?.closest('.theia-mobile-transcript-tab-icon-select-host');
        if (parent && !parent.contains(menu)) {
            parent.append(menu);
        }
        anchor?.setAttribute('aria-expanded', 'false');
        this.executionTabOverflowDispose.dispose();
        this.executionTabOverflowDispose = Disposable.NULL;
        this.executionTabOverflowMenu = undefined;
        this.executionTabOverflowAnchor = undefined;
    }

    protected mountTranscriptSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        if (tab === 'plan') {
            this.renderPlanTab(this.transcriptPlanHost, this.transcriptLastConv);
        } else if (tab === 'review') {
            void this.mountTranscriptReviewWidget(project, summary);
        } else if (tab === 'preview') {
            this.renderPreviewTab(project, summary);
        } else if (tab === 'files') {
            this.ensureTranscriptFilesTab(project, summary);
        } else if (tab === 'terminal') {
            void this.ensureTranscriptTerminalTab(project, summary);
        }
        if (this.transcriptOpenProject) {
            this.syncExecutionSurfaceChrome(this.transcriptOpenProject);
        }
    }

    protected renderPlanTab(host: HTMLElement | undefined, conv: QaapAgentConversationDTO | undefined): void {
        if (!host) {
            return;
        }
        host.replaceChildren();
        const segments = this.latestAgentSegments(conv);
        if (!segments || segments.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-plan-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/planEmpty',
                'Plan appears here as soon as the agent starts thinking or using tools.',
            );
            host.append(note);
            return;
        }

        const items = this.resolveTranscriptActivityItems(segments);
        if (items.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-plan-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/planNoActivity',
                'No structured activity has been reported for this turn yet.',
            );
            host.append(note);
            return;
        }

        const done = items.filter(item => item.state === 'done').length;
        const ratio = Math.max(0, Math.min(1, done / Math.max(items.length, 1)));
        const head = document.createElement('div');
        head.className = 'theia-mobile-transcript-plan-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-transcript-plan-label';
        label.textContent = nls.localize('qaap/mobileProjects/planLabel', 'Execution plan');
        const stat = document.createElement('span');
        stat.className = 'theia-mobile-transcript-review-checks-stat';
        stat.textContent = nls.localize(
            'qaap/mobileProjects/planProgress',
            '{0}/{1}',
            String(done),
            String(items.length),
        );
        head.append(label, stat);

        const progress = document.createElement('div');
        progress.className = 'theia-mobile-transcript-plan-prog';
        const bar = document.createElement('i');
        bar.style.width = `${Math.round(ratio * 100)}%`;
        progress.append(bar);

        const list = document.createElement('div');
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'theia-mobile-transcript-plan-step';
            if (item.state === 'done') {
                row.classList.add('theia-mod-done');
            }
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-transcript-plan-dot';
            if (item.state === 'done') {
                dot.classList.add('theia-mod-done');
            } else if (item.state === 'running' || item.state === 'thinking') {
                dot.classList.add('theia-mod-current');
            }
            const text = document.createElement('span');
            text.className = 'theia-mobile-transcript-plan-text';
            text.textContent = item.label;
            row.append(dot, text);
            list.append(row);
        }

        host.append(head, progress, list);
    }

    protected latestAgentSegments(conv: QaapAgentConversationDTO | undefined): QaapAgentMessageSegmentDTO[] | undefined {
        if (!conv) {
            return undefined;
        }
        for (let i = conv.messages.length - 1; i >= 0; i--) {
            const msg = conv.messages[i];
            if (msg.role !== 'agent') {
                continue;
            }
            const segments = this.resolveTranscriptAgentSegments(conv, msg);
            if (segments && segments.length > 0) {
                return segments;
            }
        }
        return undefined;
    }

    protected transcriptConversationMeta(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        const agentLabel = summary.agentId ? `@${summary.agentId.replace(/^@/, '')}` : '';
        return agentLabel ? `${project.name} · ${agentLabel}` : project.name;
    }

    protected updateTranscriptHeader(project: MobileProjectEntry): void {
        const titleEl = this.transcriptSheet?.querySelector('.theia-mobile-agent-log-header h2');
        const subtitle = this.transcriptHeaderSubtitle;
        if (!titleEl || !subtitle) {
            return;
        }
        titleEl.textContent = project.name;
        subtitle.hidden = false;
        subtitle.textContent = this.buildProjectBranchSubtitle(project);
    }

    /** Changes tab: inline working-tree diff for the conversation workspace. */
    protected async mountTranscriptReviewWidget(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        const host = this.transcriptReviewHost;
        if (!host || !this.createDiffReviewWidget) {
            return;
        }
        const cwd = summary.cwd ?? this.projectsService.getProjectCwd(project);
        if (!cwd) {
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-review-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/reviewUnavailable',
                'Review is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        host.replaceChildren();
        const diffHost = document.createElement('div');
        diffHost.className = 'theia-mobile-transcript-review-diff-host';
        const historyResizeHandle = document.createElement('div');
        historyResizeHandle.className = 'theia-mobile-transcript-history-resize';
        historyResizeHandle.setAttribute('role', 'separator');
        historyResizeHandle.setAttribute('aria-orientation', 'horizontal');
        historyResizeHandle.setAttribute('aria-label', nls.localize('qaap/mobileProjects/historyResizePanel', 'Resize history panel'));
        historyResizeHandle.hidden = !this.transcriptHistoryPanelOpen;
        const historyPanel = document.createElement('div');
        historyPanel.className = 'theia-mobile-transcript-history-panel';
        historyPanel.hidden = !this.transcriptHistoryPanelOpen;
        if (this.transcriptHistoryPanelHeightPx !== undefined) {
            historyPanel.style.setProperty('--qaap-transcript-history-height', `${this.transcriptHistoryPanelHeightPx}px`);
        }
        const dock = document.createElement('div');
        dock.className = 'theia-mobile-transcript-changes-dock';
        const dockControls = document.createElement('div');
        dockControls.className = 'theia-mobile-transcript-changes-controls';
        const checksHost = document.createElement('div');
        checksHost.className = 'theia-mobile-transcript-review-checks';
        const historyToggleHost = document.createElement('div');
        historyToggleHost.className = 'theia-mobile-transcript-history-toggle-host';
        dockControls.append(checksHost, historyToggleHost);
        dock.append(dockControls);
        host.append(diffHost, historyResizeHandle, historyPanel, dock);
        this.transcriptReviewDiffHost = diffHost;
        this.transcriptReviewChecksHost = checksHost;
        this.transcriptHistoryRoot = cwd;
        this.installTranscriptHistoryResize(historyResizeHandle, historyPanel);

        const rootUri = project.uri?.toString() ?? `file://${cwd}`;
        if (!this.diffReviewWidget) {
            this.diffReviewWidget = await this.createDiffReviewWidget();
        }
        if (this.transcriptReviewHost !== host || !diffHost.isConnected) {
            return;
        }
        this.diffReviewWidget.enableTranscriptEmbed({ externalChrome: true });
        this.diffReviewWidget.node.classList.add('theia-mobile-transcript-diff-embed');
        this.diffReviewWidget.setTranscriptAgentFeedbackHandler(async message => {
            await this.submitTranscriptReviewFeedback(project, summary, message);
        });
        this.attachDiffReviewWidget(diffHost);
        this.diffReviewWidget.setRepositoryContext({
            rootUri,
            rootFsPath: cwd,
            isActiveWorkspace: project.isCurrent,
        });
        this.renderChecksSection(checksHost, project, summary, { embedded: true });
        this.renderTranscriptHistoryToggle(historyToggleHost, historyPanel, historyResizeHandle, cwd);
        this.renderTranscriptHistoryPanel(historyPanel, cwd);
    }

    protected renderTranscriptHistoryToggle(
        host: HTMLElement,
        panel: HTMLElement,
        resizeHandle: HTMLElement,
        root: string,
    ): void {
        host.replaceChildren();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-transcript-history-toggle codicon codicon-history';
        btn.title = nls.localize('qaap/mobileProjects/historyToggle', 'Show commit history');
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', String(this.transcriptHistoryPanelOpen));
        btn.classList.toggle('theia-mod-active', this.transcriptHistoryPanelOpen);
        btn.addEventListener('click', () => {
            this.transcriptHistoryPanelOpen = !this.transcriptHistoryPanelOpen;
            btn.setAttribute('aria-pressed', String(this.transcriptHistoryPanelOpen));
            btn.classList.toggle('theia-mod-active', this.transcriptHistoryPanelOpen);
            panel.hidden = !this.transcriptHistoryPanelOpen;
            resizeHandle.hidden = !this.transcriptHistoryPanelOpen;
            if (this.transcriptHistoryPanelOpen) {
                this.renderTranscriptHistoryPanel(panel, root);
                void this.loadTranscriptHistory(root, panel, true);
            }
        });
        host.append(btn);
        if (this.transcriptHistoryPanelOpen) {
            void this.loadTranscriptHistory(root, panel);
        }
    }

    protected async loadTranscriptHistory(root: string, panel: HTMLElement, force = false): Promise<void> {
        if (!force && this.transcriptHistoryRoot === root && this.transcriptHistoryCommits.length > 0) {
            return;
        }
        const generation = ++this.transcriptHistoryLoadGeneration;
        this.transcriptHistoryLoading = true;
        this.renderTranscriptHistoryPanel(panel, root);
        try {
            const params = new URLSearchParams({ root });
            const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/history?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as QaapGitHistoryResponse;
            if (generation !== this.transcriptHistoryLoadGeneration || this.transcriptHistoryRoot !== root || !panel.isConnected) {
                return;
            }
            this.transcriptHistoryBranch = payload.branch;
            this.transcriptHistoryCommits = payload.commits;
        } catch (error) {
            if (generation === this.transcriptHistoryLoadGeneration && panel.isConnected) {
                this.transcriptHistoryCommits = [];
                this.transcriptHistoryBranch = error instanceof Error ? error.message : String(error);
            }
        } finally {
            if (generation === this.transcriptHistoryLoadGeneration && panel.isConnected) {
                this.transcriptHistoryLoading = false;
                this.renderTranscriptHistoryPanel(panel, root);
            }
        }
    }

    protected renderTranscriptHistoryPanel(panel: HTMLElement, root: string): void {
        panel.replaceChildren();
        if (panel.hidden) {
            return;
        }
        const header = document.createElement('div');
        header.className = 'theia-mobile-transcript-history-header';
        const title = document.createElement('div');
        title.className = 'theia-mobile-transcript-history-title';
        title.textContent = nls.localize('qaap/mobileProjects/historyTitle', 'History');
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-transcript-history-actions';
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'theia-mobile-transcript-history-icon codicon codicon-refresh';
        refresh.title = nls.localize('qaap/mobileProjects/historyRefresh', 'Refresh history');
        refresh.setAttribute('aria-label', refresh.title);
        refresh.addEventListener('click', () => { void this.loadTranscriptHistory(root, panel, true); });
        actions.append(refresh);
        header.append(title, actions);

        const searchWrap = document.createElement('label');
        searchWrap.className = 'theia-mobile-transcript-history-search';
        const searchIcon = document.createElement('span');
        searchIcon.className = 'codicon codicon-search';
        searchIcon.setAttribute('aria-hidden', 'true');
        const search = document.createElement('input');
        search.type = 'search';
        search.value = this.transcriptHistoryQuery;
        search.placeholder = nls.localize('qaap/mobileProjects/historySearch', 'Search commits');
        search.setAttribute('aria-label', search.placeholder);
        search.addEventListener('input', () => {
            this.transcriptHistoryQuery = search.value;
            this.renderTranscriptHistoryPanel(panel, root);
        });
        searchWrap.append(searchIcon, search);

        const filters = document.createElement('div');
        filters.className = 'theia-mobile-transcript-history-filters';
        const branch = document.createElement('button');
        branch.type = 'button';
        branch.className = 'theia-mobile-transcript-history-filter';
        branch.textContent = this.transcriptHistoryBranch ?? nls.localize('qaap/mobileProjects/historyBranch', 'Branch');
        const user = document.createElement('button');
        user.type = 'button';
        user.className = 'theia-mobile-transcript-history-filter';
        user.textContent = nls.localize('qaap/mobileProjects/historyUser', 'User');
        filters.append(branch, user);

        const list = document.createElement('div');
        list.className = 'theia-mobile-transcript-history-list';
        const query = this.transcriptHistoryQuery.trim().toLowerCase();
        const commits = query
            ? this.transcriptHistoryCommits.filter(commit => `${commit.subject} ${commit.authorName} ${commit.refs.join(' ')}`.toLowerCase().includes(query))
            : this.transcriptHistoryCommits;
        if (this.transcriptHistoryLoading) {
            list.append(this.createTranscriptHistoryNote(nls.localize('qaap/mobileProjects/historyLoading', 'Loading history...')));
        } else if (commits.length === 0) {
            list.append(this.createTranscriptHistoryNote(query
                ? nls.localize('qaap/mobileProjects/historyNoMatches', 'No matching commits.')
                : nls.localize('qaap/mobileProjects/historyEmpty', 'No commits found.')));
        } else {
            commits.forEach((commit, index) => list.append(this.createTranscriptHistoryRow(commit, index)));
        }
        panel.append(header, searchWrap, filters, list);
    }

    protected createTranscriptHistoryNote(text: string): HTMLElement {
        const note = document.createElement('div');
        note.className = 'theia-mobile-transcript-history-note';
        note.textContent = text;
        return note;
    }

    protected createTranscriptHistoryRow(commit: QaapGitHistoryCommit, index: number): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'theia-mobile-transcript-history-row';
        row.title = `${commit.subject}\n${commit.shortHash}`;
        const lane = document.createElement('span');
        lane.className = `theia-mobile-transcript-history-lane theia-mod-${index % 5}`;
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-transcript-history-dot';
        lane.append(dot);
        const body = document.createElement('span');
        body.className = 'theia-mobile-transcript-history-body';
        const subject = document.createElement('span');
        subject.className = 'theia-mobile-transcript-history-subject';
        subject.textContent = commit.subject || commit.shortHash;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-transcript-history-meta';
        meta.textContent = `${commit.authorName || commit.shortHash}, ${this.formatTranscriptHistoryDate(commit.authoredAt)}`;
        body.append(subject, meta);
        if (commit.refs.length > 0) {
            const refs = document.createElement('span');
            refs.className = 'theia-mobile-transcript-history-refs';
            for (const ref of commit.refs.slice(0, 3)) {
                const chip = document.createElement('span');
                chip.className = 'theia-mobile-transcript-history-ref';
                chip.textContent = ref.replace(/^HEAD ->\s*/, '');
                refs.append(chip);
            }
            body.append(refs);
        }
        row.append(lane, body);
        return row;
    }

    protected formatTranscriptHistoryDate(value: string): string {
        const date = value ? new Date(value) : undefined;
        if (!date || Number.isNaN(date.getTime())) {
            return '';
        }
        return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
    }

    protected installTranscriptHistoryResize(handle: HTMLElement, panel: HTMLElement): void {
        let drag: { startY: number; startHeight: number; pointerId?: number } | undefined;
        const applyHeight = (height: number): void => {
            const hostHeight = this.transcriptReviewHost?.getBoundingClientRect().height ?? window.innerHeight;
            const max = Math.max(180, Math.min(420, hostHeight * 0.62));
            const next = Math.round(Math.max(150, Math.min(max, height)));
            this.transcriptHistoryPanelHeightPx = next;
            panel.style.setProperty('--qaap-transcript-history-height', `${next}px`);
        };
        const onMove = (event: PointerEvent): void => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            applyHeight(drag.startHeight + (drag.startY - event.clientY));
        };
        const onEnd = (event: PointerEvent): void => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            drag = undefined;
            this.transcriptReviewHost?.classList.remove('theia-mod-resizing-history');
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', onEnd, true);
            document.removeEventListener('pointercancel', onEnd, true);
        };
        handle.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            event.preventDefault();
            const measured = panel.getBoundingClientRect().height;
            drag = { startY: event.clientY, startHeight: this.transcriptHistoryPanelHeightPx ?? measured, pointerId: event.pointerId };
            this.transcriptReviewHost?.classList.add('theia-mod-resizing-history');
            try {
                handle.setPointerCapture(event.pointerId);
            } catch {
                /* capture is best-effort */
            }
            document.addEventListener('pointermove', onMove, { capture: true, passive: false });
            document.addEventListener('pointerup', onEnd, { capture: true });
            document.addEventListener('pointercancel', onEnd, { capture: true });
        });
    }

    protected async submitTranscriptReviewFeedback(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        message: string,
    ): Promise<void> {
        const chatHost = this.transcriptChatHost;
        if (!chatHost) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                await this.submitTranscriptViaTheiaChat(project, summary, message, chatHost);
            } else {
                await this.submitTranscriptViaBackendConversation(project, summary, message, {
                    selectedAgentId: this.resolveTranscriptComposerPinnedAgentId(project, summary),
                    modeId: this.transcriptComposerModeId,
                });
            }
            this.selectTranscriptTab('messages', project, summary);
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected refreshTranscriptChecksViews(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (this.transcriptReviewChecksHost) {
            this.renderChecksSection(this.transcriptReviewChecksHost, project, summary, { embedded: true });
        }
    }

    protected transcriptChecksChipLabel(
        failed: number,
        checksReady: boolean,
        checksAvailable: boolean,
    ): { text: string; fail: boolean } {
        if (this.verifyRunning) {
            return { text: nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…'), fail: false };
        }
        if (this.verifyChecksLoading) {
            return { text: nls.localize('qaap/mobileProjects/verifyLoadingChecks', 'Loading…'), fail: false };
        }
        if (failed > 0) {
            return {
                text: nls.localize('qaap/mobileProjects/verifyFailing', '{0} failing', String(failed)),
                fail: true,
            };
        }
        if (checksReady && !checksAvailable) {
            return { text: nls.localize('qaap/mobileProjects/checksUnavailable', 'No checks'), fail: false };
        }
        const first = this.verifyResults[0]?.check.label;
        if (first) {
            return {
                text: nls.localize('qaap/mobileProjects/verifyRunNamed', 'Run {0}', first),
                fail: false,
            };
        }
        return { text: nls.localize('qaap/mobileProjects/verifyRun', 'Run checks'), fail: false };
    }

    protected renderChecksSection(
        host: HTMLElement | undefined,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        options: { readonly embedded?: boolean } = {},
    ): void {
        if (!host) {
            return;
        }
        host.replaceChildren();
        if (!summary.cwd) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-verify-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/verifyNoWorkspace',
                'Verify is unavailable until this conversation has a workspace path.',
            );
            host.append(note);
            return;
        }
        if (this.verifyChecksCwd !== summary.cwd && !this.verifyChecksLoading) {
            void this.loadVerifyChecks(summary.cwd, project, summary);
        }
        const failed = this.verifyResults.filter(r => r.state === 'fail').length;
        const checksReady = this.verifyChecksCwd === summary.cwd && !this.verifyChecksLoading;
        const checksAvailable = checksReady && this.verifyResults.length > 0;

        const contentHost = document.createElement('div');
        contentHost.className = 'theia-mobile-transcript-review-checks-body';

        const list = document.createElement('div');
        list.className = 'theia-mobile-transcript-verify-list';
        for (const result of this.verifyResults) {
            list.append(this.createVerifyCheckRow(result));
        }
        contentHost.append(list);

        if (checksReady && !checksAvailable) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-verify-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/verifyNoScripts',
                'No compile, build, test, typecheck, or lint script found in package.json.',
            );
            contentHost.append(note);
        }

        if (!options.embedded) {
            const runRow = document.createElement('div');
            runRow.className = 'theia-mobile-transcript-review-checks-run-row';
            const runBtn = document.createElement('button');
            runBtn.type = 'button';
            runBtn.className = 'theia-mobile-transcript-verify-run theia-mod-embedded';
            runBtn.disabled = this.verifyRunning || this.verifyChecksLoading || !checksAvailable;
            runBtn.textContent = this.verifyRunning
                ? nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…')
                : nls.localize('qaap/mobileProjects/verifyRun', 'Run checks');
            runBtn.addEventListener('click', () => { void this.runVerifyChecks(project, summary); });
            runRow.append(runBtn);
            contentHost.append(runRow);
        }

        if (failed > 0 && !this.verifyRunning) {
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.className = 'theia-mobile-transcript-verify-send theia-mod-embedded';
            sendBtn.textContent = nls.localize('qaap/mobileProjects/verifySendFailure', 'Send failure to agent');
            sendBtn.addEventListener('click', () => { void this.sendVerifyFailureToAgent(project, summary); });
            contentHost.append(sendBtn);
        }

        const toggle = document.createElement('label');
        toggle.className = 'theia-mobile-transcript-verify-toggle';
        const toggleText = document.createElement('span');
        toggleText.textContent = nls.localize('qaap/mobileProjects/verifyAutoFix', 'Auto-verify & fix after each turn');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.isAutoVerifyEnabled(summary.cwd);
        cb.addEventListener('change', () => this.setAutoVerifyEnabled(summary.cwd, cb.checked));
        toggle.append(toggleText, cb);
        contentHost.append(toggle);

        if (options.embedded) {
            if (failed > 0) {
                this.transcriptChecksPanelOpen = true;
            }
            host.classList.add('theia-mod-compact');
            const control = document.createElement('div');
            control.className = 'theia-mobile-transcript-checks-control';

            const chipLabel = this.transcriptChecksChipLabel(failed, checksReady, checksAvailable);
            const runChip = document.createElement('button');
            runChip.type = 'button';
            runChip.className = 'theia-mobile-transcript-checks-run-chip';
            runChip.classList.toggle('theia-mod-fail', chipLabel.fail);
            runChip.classList.toggle('theia-mod-running', this.verifyRunning);
            runChip.disabled = this.verifyRunning || this.verifyChecksLoading
                || (checksReady && !checksAvailable);
            const runIcon = document.createElement('i');
            runIcon.className = this.verifyRunning
                ? 'codicon codicon-loading codicon-mod-spin'
                : 'codicon codicon-play';
            runIcon.setAttribute('aria-hidden', 'true');
            const runText = document.createElement('span');
            runText.textContent = chipLabel.text;
            runChip.append(runIcon, runText);
            runChip.addEventListener('click', () => { void this.runVerifyChecks(project, summary); });

            const panel = document.createElement('div');
            panel.className = 'theia-mobile-transcript-checks-panel';
            panel.hidden = !this.transcriptChecksPanelOpen;
            panel.append(contentHost);

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'theia-mobile-transcript-checks-chevron codicon codicon-chevron-down';
            toggleBtn.title = nls.localize('qaap/mobileProjects/checksMore', 'Checks options');
            toggleBtn.setAttribute('aria-label', toggleBtn.title);
            toggleBtn.setAttribute('aria-expanded', this.transcriptChecksPanelOpen ? 'true' : 'false');
            toggleBtn.classList.toggle('theia-mod-open', this.transcriptChecksPanelOpen);
            toggleBtn.addEventListener('click', () => {
                this.transcriptChecksPanelOpen = !this.transcriptChecksPanelOpen;
                toggleBtn.setAttribute('aria-expanded', this.transcriptChecksPanelOpen ? 'true' : 'false');
                toggleBtn.classList.toggle('theia-mod-open', this.transcriptChecksPanelOpen);
                panel.hidden = !this.transcriptChecksPanelOpen;
            });

            control.append(runChip, toggleBtn);
            host.append(control, panel);
            return;
        }

        const between = document.createElement('div');
        between.className = 'theia-mobile-transcript-review-checks-between';
        const checksLabel = document.createElement('span');
        checksLabel.className = 'theia-mobile-transcript-review-checks-title';
        checksLabel.textContent = nls.localize('qaap/mobileProjects/tabChecks', 'Checks');
        const checksStat = document.createElement('span');
        checksStat.className = 'theia-mobile-transcript-review-checks-stat';
        if (this.verifyRunning) {
            checksStat.textContent = nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…');
        } else if (this.verifyChecksLoading) {
            checksStat.textContent = nls.localize('qaap/mobileProjects/verifyLoadingChecks', 'Loading checks…');
        } else if (failed > 0) {
            checksStat.classList.add('theia-mod-fail');
            checksStat.textContent = nls.localize('qaap/mobileProjects/verifyFailing', '{0} failing', String(failed));
        } else {
            checksStat.textContent = nls.localize('qaap/mobileProjects/verifyChecks', 'Checks');
        }
        between.append(checksLabel, checksStat);
        host.append(between, contentHost);
    }

    protected detachTranscriptReviewWidget(): void {
        if (!this.diffReviewWidget?.isAttached || !this.transcriptReviewDiffHost) {
            return;
        }
        if (this.transcriptReviewDiffHost.contains(this.diffReviewWidget.node)) {
            this.detachDiffReviewWidgetFromHost();
            this.diffReviewWidget.node.classList.remove('theia-mobile-transcript-diff-embed');
            this.diffReviewWidget.setTranscriptAgentFeedbackHandler(undefined);
            this.diffReviewWidget.setReviewStatsChangeHandler(undefined);
        }
        this.transcriptReviewDiffHost = undefined;
        this.transcriptReviewChecksHost = undefined;
        this.transcriptHistoryRoot = undefined;
        this.transcriptHistoryLoading = false;
    }

    protected disposeTranscriptEmbeddedPreview(): void {
        this.transcriptEmbeddedPreview?.dispose();
        this.transcriptEmbeddedPreview = undefined;
    }

    protected mountTranscriptEmbeddedPreview(host: HTMLElement, previewUrl: string): void {
        if (this.transcriptEmbeddedPreview) {
            this.transcriptEmbeddedPreview.setUrl(previewUrl);
            if (!host.contains(this.transcriptEmbeddedPreview.root)) {
                host.append(this.transcriptEmbeddedPreview.root);
            }
            return;
        }
        this.transcriptEmbeddedPreview = mountEmbeddedAgentPreviewChrome(host, {
            url: previewUrl,
            messageService: this.messageService,
            clipboard: this.previewClipboard,
            previewSurfaces: this.previewSurfaceRegistry,
            inspectorDeps: this.previewInspectorDeps,
            notify: (message, kind) => {
                MobileSnackbar.show(message, { kind: kind === 'warn' ? 'warning' : 'success' });
            },
            openExternal: target => {
                window.open(target, '_blank', 'noopener,noreferrer');
            },
        });
    }

    protected renderPreviewTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        const host = this.executionPreviewHost();
        if (!host) {
            return;
        }

        const conv = this.transcriptLastConv;
        const latestProject = this.projects.find(candidate => candidate.id === project.id) ?? project;
        const previewUrl = this.resolveTranscriptPreviewUrl(latestProject, conv);
        if (previewUrl) {
            this.transcriptPreviewRequestPending = false;
            this.transcriptPreviewRequestRunning = false;
            if (latestProject.previewUrl !== previewUrl) {
                void this.projectsService.recordProjectPreviewUrl(latestProject, previewUrl)
                    .then(() => {
                        this.projects = this.projects.map(candidate => candidate.id === latestProject.id
                            ? { ...candidate, previewUrl }
                            : candidate);
                    });
            }
            host.replaceChildren();
            this.mountTranscriptEmbeddedPreview(host, previewUrl);
            return;
        }

        const waitingForPreview = this.isTranscriptPreviewWaiting(conv);
        if (waitingForPreview) {
            this.recoverTranscriptPreviewUrl(project, summary);
        }

        const canKeepEmptyPreview = this.transcriptEmbeddedPreview?.root.isConnected === true
            && host.contains(this.transcriptEmbeddedPreview.root)
            && this.transcriptEmbeddedPreview.root.classList.contains('theia-mod-empty-preview');
        if (canKeepEmptyPreview) {
            this.updateTranscriptPreviewRunButtonState(conv);
            return;
        }

        this.disposeTranscriptEmbeddedPreview();
        host.replaceChildren();
        this.mountTranscriptEmptyPreview(host, project, summary);
    }

    protected isTranscriptPreviewWaiting(conv: QaapAgentConversationDTO | undefined = this.transcriptLastConv): boolean {
        return this.transcriptPreviewRequestRunning
            || this.transcriptPreviewRequestPending
            || conv?.status === 'streaming';
    }

    protected findTranscriptPreviewRunButton(): HTMLButtonElement | undefined {
        const button = this.transcriptEmbeddedPreview?.root.querySelector('.theia-mobile-transcript-preview-run');
        return button instanceof HTMLButtonElement ? button : undefined;
    }

    protected updateTranscriptPreviewRunButtonState(conv: QaapAgentConversationDTO | undefined = this.transcriptLastConv): void {
        const button = this.findTranscriptPreviewRunButton();
        if (!button) {
            return;
        }
        const loading = this.isTranscriptPreviewWaiting(conv);
        button.disabled = loading;
        button.classList.toggle('theia-mod-loading', loading);
        const label = loading
            ? nls.localize('qaap/mobileProjects/previewLoading', 'Cargando...')
            : nls.localize('qaap/mobileProjects/previewButton', 'Vista previa');
        button.title = label;
        button.setAttribute('aria-label', label);
        if (loading) {
            button.setAttribute('aria-busy', 'true');
        } else {
            button.removeAttribute('aria-busy');
        }
    }

    protected recoverTranscriptPreviewUrl(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        if (this.transcriptPreviewRecoveryRequests.has(summary.id)) {
            return;
        }
        this.transcriptPreviewRecoveryRequests.add(summary.id);
        void this.refreshTranscriptPreviewProject(project, summary).then(latestProject => {
            if (!latestProject.previewUrl || this.transcriptOpenSummaryId !== summary.id || this.activeExecutionTab(project) !== 'preview') {
                return;
            }
            this.projects = this.projects.map(candidate => candidate.id === latestProject.id ? latestProject : candidate);
            this.renderPreviewTab(latestProject, summary);
        }).finally(() => {
            this.transcriptPreviewRecoveryRequests.delete(summary.id);
        });
    }

    protected mountTranscriptEmptyPreview(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const removeEmptyState = (): void => {
            this.transcriptEmbeddedPreview?.root.classList.remove('theia-mod-empty-preview');
            this.transcriptEmbeddedPreview?.root.querySelector('.theia-mobile-transcript-preview-empty-overlay')?.remove();
        };
        this.transcriptEmbeddedPreview = mountEmbeddedAgentPreviewChrome(host, {
            url: 'about:blank',
            messageService: this.messageService,
            clipboard: this.previewClipboard,
            previewSurfaces: this.previewSurfaceRegistry,
            inspectorDeps: this.previewInspectorDeps,
            onNavigate: removeEmptyState,
            notify: (message, kind) => {
                MobileSnackbar.show(message, { kind: kind === 'warn' ? 'warning' : 'success' });
            },
            openExternal: target => {
                window.open(target, '_blank', 'noopener,noreferrer');
            },
        });
        this.transcriptEmbeddedPreview.root.classList.add('theia-mod-empty-preview');
        const input = this.transcriptEmbeddedPreview.root.querySelector<HTMLInputElement>('.theia-mini-browser-url-field input');
        if (input) {
            input.value = '';
            input.placeholder = nls.localize('qaap/mobileProjects/previewUrlPlaceholder', 'Ingresa una URL');
        }
        const content = this.transcriptEmbeddedPreview.root.querySelector<HTMLElement>('.qaap-preview-content-area');
        if (!content) {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'theia-mobile-transcript-preview-empty-overlay';
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-preview-empty';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-transcript-preview-run';
        const ring = document.createElement('span');
        ring.className = 'theia-mobile-transcript-preview-run-ring';
        ring.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('i');
        icon.className = 'codicon codicon-play';
        icon.setAttribute('aria-hidden', 'true');
        btn.append(ring, icon);
        btn.addEventListener('click', () => { void this.requestTranscriptPreview(project, summary); });
        wrap.append(btn);
        overlay.append(wrap);
        content.append(overlay);
        this.updateTranscriptPreviewRunButtonState();
    }

    /**
     * Workspace path for transcript Files/Terminal.
     * Hub project URI locally; on the VPS, {@link QaapAgentConversationSummaryDTO.cwd} wins for agent tasks.
     */
    protected resolveTranscriptProjectCwd(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string | undefined {
        return resolveTranscriptWorkspaceCwd({
            summary,
            projectCwd: this.projectsService.getProjectCwd(project),
            preparedCwd: this.preparedCwdByProjectId.get(project.id),
        });
    }

    protected resolveTranscriptWorkspaceKey(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): TranscriptWorkspaceSurfaceKey | undefined {
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        if (!cwd) {
            return undefined;
        }
        const terminalServices = this.createTranscriptTerminalViewServices?.();
        const resolved = terminalServices ? terminalServices.resolveCwd(cwd) : cwd;
        return normalizeTranscriptWorkspaceKey(resolved);
    }

    protected ensureTranscriptFilesTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        const host = this.executionFilesHost();
        if (!host) {
            return;
        }
        const workspaceKey = this.resolveTranscriptWorkspaceKey(project, summary);
        if (!workspaceKey && project.github && this.projectsService) {
            void this.projectsService.prepareProjectCwd(project).then(prepared => {
                if (!prepared || !this.executionFilesHost()?.isConnected || this.activeExecutionTab(project) !== 'files') {
                    return;
                }
                this.preparedCwdByProjectId.set(project.id, prepared);
                this.ensureTranscriptFilesTab(project, summary);
            });
        }
        if (!workspaceKey) {
            this.detachTranscriptFilesFromHost();
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-files-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/filesUnavailable',
                'Files are unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        if (this.transcriptFilesAttachedKey === workspaceKey && host.querySelector('.theia-mobile-transcript-files')) {
            return;
        }
        this.detachTranscriptFilesFromHost();
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        const services = this.createTranscriptFilesViewServices?.();
        if (!cwd || !services) {
            return;
        }
        const wrappedServices: TranscriptFilesViewServices = {
            ...services,
            renderMarkdownPreview: services.renderMarkdownPreview
                ? (resourcePath, markdown) => services.renderMarkdownPreview!(
                    resourcePath,
                    this.cleanTranscriptDisplayText(markdown),
                )
                : undefined,
        };
        let mount = this.transcriptWorkspaceSurfaces.peekFiles(workspaceKey);
        if (!mount) {
            const stash = document.createElement('div');
            stash.className = 'theia-mobile-transcript-files-staging';
            stash.hidden = true;
            stash.setAttribute('aria-hidden', 'true');
            document.body.append(stash);
            mount = mountTranscriptFilesView(stash, cwd, wrappedServices);
            this.transcriptWorkspaceSurfaces.setFiles(workspaceKey, mount);
        }
        host.replaceChildren();
        host.append(mount.root);
        this.transcriptFilesAttachedKey = workspaceKey;
        mount.root.querySelector<HTMLElement>('.theia-mobile-transcript-files-preview-body')
            ?.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
    }

    protected async ensureTranscriptTerminalTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        const host = this.executionTerminalHost();
        if (!host) {
            return;
        }
        const workspaceKey = this.resolveTranscriptWorkspaceKey(project, summary);
        if (!workspaceKey && project.github && this.projectsService) {
            void this.projectsService.prepareProjectCwd(project).then(prepared => {
                if (!prepared || !this.executionTerminalHost()?.isConnected || this.activeExecutionTab(project) !== 'terminal') {
                    return;
                }
                this.preparedCwdByProjectId.set(project.id, prepared);
                void this.ensureTranscriptTerminalTab(project, summary);
            });
        }
        if (!workspaceKey) {
            this.detachTranscriptTerminalFromHost();
            host.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-terminal-note';
            note.textContent = nls.localize(
                'qaap/mobileProjects/terminalUnavailable',
                'Terminal is unavailable for this conversation (no workspace path).',
            );
            host.append(note);
            return;
        }
        const cwd = this.resolveTranscriptProjectCwd(project, summary);
        const services = this.createTranscriptTerminalViewServices?.();
        if (!cwd || !services) {
            return;
        }
        if (!host.isConnected) {
            return;
        }

        this.ensureTranscriptTerminalChrome(host, workspaceKey, cwd, services, project, summary);
        let state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!state) {
            state = { surfaces: [], activeIndex: 0 };
            this.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
        }
        if (state.surfaces.length === 0) {
            await this.createTranscriptTerminalSlide(workspaceKey, cwd, services, project, summary);
            state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        }
        if (state && state.surfaces.length > 0) {
            this.renderTranscriptTerminalSlides(workspaceKey);
        }
    }

    protected ensureTranscriptTerminalChrome(
        host: HTMLElement,
        workspaceKey: TranscriptWorkspaceSurfaceKey,
        cwd: string,
        services: TranscriptTerminalViewServices,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (this.transcriptTerminalSlider?.parentElement === host
            && this.transcriptTerminalToolbar?.parentElement === host
            && this.transcriptTerminalDots?.parentElement === this.transcriptTerminalToolbar) {
            return;
        }
        host.classList.add('theia-mobile-transcript-terminal');
        host.replaceChildren();

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-transcript-terminal-toolbar';
        const switcher = document.createElement('div');
        switcher.className = 'theia-mobile-transcript-terminal-switcher';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'theia-mobile-transcript-terminal-add codicon codicon-add';
        addBtn.title = services.localize('qaap/mobileProjects/transcriptTerminalNew', 'New terminal');
        addBtn.setAttribute('aria-label', addBtn.title);
        addBtn.addEventListener('click', () => {
            void this.createTranscriptTerminalSlide(workspaceKey, cwd, services, project, summary, true);
        });
        toolbar.append(switcher, addBtn);

        const slider = document.createElement('div');
        slider.className = 'theia-mobile-transcript-terminal-slider';
        host.append(toolbar, slider);
        this.transcriptTerminalToolbar = toolbar;
        this.transcriptTerminalSlider = slider;
        this.transcriptTerminalDots = switcher;
    }

    protected async createTranscriptTerminalSlide(
        workspaceKey: TranscriptWorkspaceSurfaceKey,
        cwd: string,
        services: TranscriptTerminalViewServices,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        activateNewest = false,
    ): Promise<void> {
        const host = this.executionTerminalHost();
        if (!host?.isConnected) {
            return;
        }
        try {
            const staging = createTranscriptTerminalStagingHost();
            const surface = await createTranscriptTerminalSurface(staging, cwd, services);
            const state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey) ?? { surfaces: [], activeIndex: 0 };
            state.surfaces.push(surface);
            state.activeIndex = activateNewest ? state.surfaces.length - 1 : Math.max(0, state.activeIndex);
            this.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
            if (this.activeExecutionTab(project) === 'terminal'
                && this.resolveTranscriptWorkspaceKey(project, summary) === workspaceKey) {
                this.renderTranscriptTerminalSlides(workspaceKey);
            }
        } catch (error) {
            if (!host.isConnected) {
                return;
            }
            const slider = this.transcriptTerminalSlider;
            if (slider) {
                slider.replaceChildren();
            }
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-terminal-error';
            const message = error instanceof Error ? error.message : String(error);
            note.textContent = services.localize(
                'qaap/mobileProjects/transcriptTerminalFailed',
                'Could not start the terminal: {0}',
                message,
            );
            slider?.append(note);
            console.error('[qaap-mobile-shell] transcript terminal failed', error);
        }
    }

    protected renderTranscriptTerminalSlides(workspaceKey: TranscriptWorkspaceSurfaceKey): void {
        const slider = this.transcriptTerminalSlider;
        const state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!slider || !state) {
            return;
        }
        slider.replaceChildren();
        const active = state.surfaces[state.activeIndex];
        if (active) {
            const slide = document.createElement('div');
            slide.className = 'theia-mobile-transcript-terminal-slide theia-mod-active';
            slide.dataset.index = String(state.activeIndex);
            slide.append(active.mountHost);
            slider.append(slide);
            scheduleTranscriptTerminalResize(active.terminal);
            this.syncTranscriptTerminalResizeObserver(slider, active.terminal);
        } else {
            this.syncTranscriptTerminalResizeObserver(undefined, undefined);
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-transcript-terminal-note';
            empty.textContent = nls.localize(
                'qaap/mobileProjects/transcriptTerminalEmpty',
                'No terminals open. Create one with +.',
            );
            slider.append(empty);
        }
        this.renderTranscriptTerminalDots(workspaceKey);
    }

    protected syncTranscriptTerminalResizeObserver(
        slider: HTMLElement | undefined,
        terminal: TerminalWidget | undefined,
    ): void {
        this.transcriptTerminalResizeObserver?.disconnect();
        this.transcriptTerminalResizeObserver = undefined;
        if (!slider || !terminal || typeof ResizeObserver === 'undefined') {
            return;
        }
        this.transcriptTerminalResizeObserver = new ResizeObserver(() => {
            if (terminal.isAttached && !slider.hidden) {
                scheduleTranscriptTerminalResize(terminal);
            }
        });
        this.transcriptTerminalResizeObserver.observe(slider);
    }

    protected renderTranscriptTerminalDots(workspaceKey: TranscriptWorkspaceSurfaceKey): void {
        const dots = this.transcriptTerminalDots;
        const state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!dots || !state) {
            return;
        }
        dots.replaceChildren();
        state.surfaces.forEach((surface, index) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'theia-mobile-transcript-terminal-tab';
            tab.classList.toggle('theia-mod-active', index === state.activeIndex);
            const title = this.resolveTranscriptTerminalTabTitle(surface, index);
            tab.title = title;
            tab.setAttribute('aria-label', title);
            tab.addEventListener('click', () => {
                state.activeIndex = index;
                this.renderTranscriptTerminalSlides(workspaceKey);
                this.renderTranscriptTerminalDots(workspaceKey);
            });

            const icon = document.createElement('span');
            icon.className = 'theia-mobile-transcript-terminal-tab-icon codicon codicon-terminal';
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'theia-mobile-transcript-terminal-tab-label';
            label.textContent = title;
            tab.append(icon, label);

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'theia-mobile-transcript-terminal-tab-close codicon codicon-close';
            close.title = nls.localize('qaap/mobileProjects/transcriptTerminalClose', 'Close terminal');
            close.setAttribute('aria-label', close.title);
            close.addEventListener('click', event => {
                event.stopPropagation();
                this.closeTranscriptTerminalTab(workspaceKey, index);
            });
            tab.append(close);

            dots.append(tab);
        });
    }

    protected resolveTranscriptTerminalTabTitle(surface: TranscriptTerminalSurface, index: number): string {
        const title = surface.terminal.title.label?.trim();
        if (title) {
            return title;
        }
        return nls.localize('qaap/mobileProjects/transcriptTerminalIndex', 'Terminal {0}', String(index + 1));
    }

    protected closeTranscriptTerminalTab(workspaceKey: TranscriptWorkspaceSurfaceKey, index: number): void {
        const state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
        if (!state) {
            return;
        }
        const [removed] = state.surfaces.splice(index, 1);
        removed?.dispose.dispose();
        if (state.surfaces.length === 0) {
            state.activeIndex = 0;
        } else if (state.activeIndex >= state.surfaces.length) {
            state.activeIndex = state.surfaces.length - 1;
        }
        this.transcriptTerminalSlidesByWorkspace.set(workspaceKey, state);
        this.renderTranscriptTerminalSlides(workspaceKey);
    }

    protected detachTranscriptFilesFromHost(): void {
        const host = this.executionFilesHost();
        if (host) {
            host.querySelector('.theia-mobile-transcript-files')?.remove();
            host.querySelector('.theia-mobile-transcript-files-note')?.remove();
        }
        this.transcriptFilesAttachedKey = undefined;
    }

    protected detachTranscriptTerminalFromHost(): void {
        this.syncTranscriptTerminalResizeObserver(undefined, undefined);
        const host = this.executionTerminalHost();
        if (host) {
            host.replaceChildren();
            host.classList.remove('theia-mobile-transcript-terminal');
        }
        this.transcriptTerminalToolbar = undefined;
        this.transcriptTerminalSlider = undefined;
        this.transcriptTerminalDots = undefined;
    }

    protected detachTranscriptWorkspaceSurfacesFromSheet(): void {
        this.detachTranscriptFilesFromHost();
        this.detachTranscriptTerminalFromHost();
    }

    protected disposeTranscriptTerminalSlides(workspaceKey?: TranscriptWorkspaceSurfaceKey): void {
        if (workspaceKey) {
            const state = this.transcriptTerminalSlidesByWorkspace.get(workspaceKey);
            if (state) {
                for (const surface of state.surfaces) {
                    surface.dispose.dispose();
                }
            }
            this.transcriptTerminalSlidesByWorkspace.delete(workspaceKey);
            return;
        }
        for (const state of this.transcriptTerminalSlidesByWorkspace.values()) {
            for (const surface of state.surfaces) {
                surface.dispose.dispose();
            }
        }
        this.transcriptTerminalSlidesByWorkspace.clear();
    }

    protected createTranscriptPreviewLoading(_conv: QaapAgentConversationDTO | undefined): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-preview-loading';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');

        const line = document.createElement('div');
        line.className = 'theia-mobile-agent-stream-line theia-mod-thinking';
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-agent-stream-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-stream-label';
        label.textContent = nls.localize('qaap/mobileProjects/previewLoading', 'Cargando...');
        line.append(dot, label);
        wrap.append(line);
        return wrap;
    }

    protected async syncTranscriptPreviewFromConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        if (this.activeExecutionTab(project) !== 'preview' && !this.transcriptPreviewRequestPending) {
            return;
        }
        const latestProject = await this.refreshTranscriptPreviewProject(project, summary);
        if (this.resolveTranscriptPreviewUrl(latestProject, conv) || conv.status !== 'streaming') {
            this.transcriptPreviewRequestPending = false;
        }
        if (this.activeExecutionTab(project) === 'preview' && (this.transcriptOpenSummaryId === summary.id || this.projectDetailSurfaceTargets)) {
            this.renderPreviewTab(latestProject, summary);
        }
    }

    protected async refreshTranscriptPreviewProject(project: MobileProjectEntry, summary?: QaapAgentConversationSummaryDTO): Promise<MobileProjectEntry> {
        try {
            const previousPreviewUrl = project.previewUrl
                ?? this.projects.find(candidate => candidate.id === project.id)?.previewUrl;
            this.projects = await this.projectsService.loadProjects();
            const loadedProject = this.projects.find(candidate => candidate.id === project.id) ?? project;
            const latestProject = previousPreviewUrl && !loadedProject.previewUrl
                ? { ...loadedProject, previewUrl: previousPreviewUrl }
                : loadedProject;
            if (latestProject.previewUrl) {
                if (await this.previewUrlMatchesProject(latestProject.previewUrl, latestProject)) {
                    return latestProject;
                }
            }
            const previewUrl = await this.projectsService.resolveProjectPreviewUrl(latestProject, summary?.cwd);
            if (previewUrl && await this.previewUrlMatchesProject(previewUrl, latestProject)) {
                return { ...latestProject, previewUrl };
            }
            const discoveredPreviewUrl = await this.discoverProjectDevPreviewUrl(latestProject);
            return discoveredPreviewUrl ? { ...latestProject, previewUrl: discoveredPreviewUrl } : latestProject;
        } catch {
            const previewUrl = await this.projectsService.resolveProjectPreviewUrl(project, summary?.cwd).catch(() => undefined);
            if (previewUrl && await this.previewUrlMatchesProject(previewUrl, project).catch(() => false)) {
                return { ...project, previewUrl };
            }
            const discoveredPreviewUrl = await this.discoverProjectDevPreviewUrl(project).catch(() => undefined);
            if (discoveredPreviewUrl) {
                return { ...project, previewUrl: discoveredPreviewUrl };
            }
            return project;
        }
    }

    protected async previewUrlMatchesProject(previewUrl: string, project: MobileProjectEntry): Promise<boolean> {
        const projectName = project.name.trim().toLowerCase();
        if (!projectName) {
            return true;
        }
        try {
            const response = await fetch(normalizePreviewUrlForSameOrigin(previewUrl), { cache: 'no-store' });
            if (!response.ok) {
                return false;
            }
            const html = await response.text();
            const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim().toLowerCase();
            return !title || title.includes(projectName);
        } catch {
            return false;
        }
    }

    protected async discoverProjectDevPreviewUrl(project: MobileProjectEntry): Promise<string | undefined> {
        const ports = Array.from({ length: 18 }, (_, index) => 5173 + index);
        const probes = await Promise.all(ports.map(async port => {
            const probe = await probeQaapDevPreviewPort(port);
            if (!probe.ready || !await this.previewUrlMatchesProject(probe.previewUrl, project)) {
                return undefined;
            }
            return normalizePreviewUrlForSameOrigin(probe.previewUrl);
        }));
        const previewUrl = probes.find(Boolean);
        if (previewUrl) {
            void this.projectsService.recordProjectPreviewUrl(project, previewUrl);
        }
        return previewUrl;
    }

    protected resolveTranscriptPreviewUrl(
        project: MobileProjectEntry,
        conv: QaapAgentConversationDTO | undefined,
    ): string | undefined {
        if (conv) {
            for (const message of [...conv.messages].reverse()) {
                const fromContent = this.extractDevPreviewUrlFromText(message.content);
                if (fromContent) {
                    return normalizePreviewUrlForSameOrigin(fromContent);
                }
                for (const segment of [...(message.segments ?? [])].reverse()) {
                    const text = segment.type === 'tool'
                        ? `${segment.args}\n${segment.result ?? ''}`
                        : segment.content;
                    const fromSegment = this.extractDevPreviewUrlFromText(text);
                    if (fromSegment) {
                        return normalizePreviewUrlForSameOrigin(fromSegment);
                    }
                }
            }
        }
        return project.previewUrl ? normalizePreviewUrlForSameOrigin(project.previewUrl) : undefined;
    }

    protected extractDevPreviewUrlFromText(text: string | undefined): string | undefined {
        if (!text?.trim()) {
            return undefined;
        }
        const directUrl = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):(\d{2,5})(?:\/[^\s`*)\]]*)?/i);
        const port = directUrl?.[1] ?? text.match(/\bport(?:o|)\s+(\d{2,5})\b/i)?.[1] ?? text.match(/\bpuerto\s+(\d{2,5})\b/i)?.[1];
        if (!port) {
            return undefined;
        }
        const parsed = Number(port);
        if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
            return undefined;
        }
        return toDevPreviewUrl(parsed);
    }

    protected async requestTranscriptPreview(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.transcriptPreviewRequestRunning) {
            return;
        }
        const latestProject = this.projects.find(candidate => candidate.id === project.id) ?? project;
        if (latestProject.previewUrl && this.delegate.onResumePreview) {
            await this.delegate.onResumePreview(latestProject);
            return;
        }

        const message = nls.localize(
            'qaap/mobileProjects/previewAgentRequest',
            'Start this app for preview. Install dependencies if needed. Before starting the server, check whether the default port is already in use; if it is, pick another free port for this project without stopping previews for other projects. Run the dev server on that available port and keep it running with hot reload/HMR so changes appear automatically in the preview. Whenever you modify code or any project file, run the available build, compile, typecheck, or check before considering the change done; if it fails, fix the issue and verify again. Expose the final URL and let me know when the preview is ready.',
        );
        this.transcriptPreviewRequestRunning = true;
        this.transcriptPreviewRequestPending = true;
        this.updateTranscriptPreviewRunButtonState();
        if (summary.cwd) {
            this.setAutoVerifyEnabled(summary.cwd, true);
            this.refreshTranscriptChecksViews(project, summary);
        }
        this.renderPreviewTab(project, summary);
        try {
            if (summary.source === 'theia-chat') {
                if (!this.transcriptChatHost) {
                    throw new Error(nls.localize('qaap/mobileProjects/transcriptUnavailable', 'This chat could not be loaded.'));
                }
                await this.submitTranscriptViaTheiaChat(project, summary, message, this.transcriptChatHost, this.transcriptComposerModeId);
            } else {
                await this.submitTranscriptViaBackendConversation(project, summary, message, {
                    selectedAgentId: this.resolveTranscriptComposerPinnedAgentId(project, summary),
                    modeId: this.transcriptComposerModeId,
                });
            }
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/previewRequestSent', 'Preview request sent to agent'),
                { kind: 'success', duration: 1600 },
            );
            this.transcriptScheduleRefresh?.();
        } catch (error) {
            this.transcriptPreviewRequestPending = false;
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        } finally {
            this.transcriptPreviewRequestRunning = false;
            if (this.transcriptOpenSummaryId === summary.id) {
                this.renderPreviewTab(project, summary);
            }
        }
    }

    protected createVerifyCheckRow(result: VerifyCheckResult): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-transcript-verify-check';

        const dot = document.createElement('span');
        dot.className = `theia-mobile-transcript-verify-dot theia-mod-${result.state}`;
        const name = document.createElement('span');
        name.className = 'theia-mobile-transcript-verify-name';
        name.textContent = result.check.label;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-transcript-verify-meta';
        if (result.state === 'running') {
            meta.textContent = nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…');
        } else if (result.durationMs !== undefined) {
            meta.textContent = `${(result.durationMs / 1000).toFixed(1)}s`;
        }
        row.append(dot, name, meta);

        if (result.state === 'fail' && result.logTail) {
            const log = document.createElement('pre');
            log.className = 'theia-mobile-transcript-verify-log';
            log.textContent = result.logTail;
            row.append(log);
        }
        return row;
    }

    /** Run the checks sequentially via the agent-task backend (no new dependency). */
    protected async runVerifyChecks(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, auto = false): Promise<void> {
        if (this.verifyRunning || !summary.cwd) {
            return;
        }
        const checks = await this.loadVerifyChecks(summary.cwd, project, summary);
        if (checks.length === 0) {
            return;
        }
        if (!auto) {
            // A manual Run starts a fresh closed-loop budget.
            this.verifyAutoAttempts = 0;
        }
        this.verifyRunning = true;
        this.verifyResults = checks.map(check => ({ check, state: 'idle' as const }));
        this.refreshTranscriptChecksViews(project, summary);

        for (const result of this.verifyResults) {
            if (this.transcriptOpenSummaryId !== summary.id) {
                break; // sheet closed mid-run
            }
            result.state = 'running';
            this.refreshTranscriptChecksViews(project, summary);
            try {
                const created = await createAgentTask({ command: result.check.command, cwd: summary.cwd });
                const detail = await this.pollVerifyTask(created.id, summary.id);
                if (!detail) {
                    break;
                }
                result.exitCode = detail.exitCode;
                result.durationMs = detail.finishedAt ? Math.max(0, detail.finishedAt - (created.createdAt ?? detail.finishedAt)) : undefined;
                result.logTail = this.tailLog(detail.log);
                result.state = detail.state === 'completed' && (detail.exitCode ?? 0) === 0 ? 'ok' : 'fail';
            } catch (error) {
                result.state = 'fail';
                result.logTail = error instanceof Error ? error.message : String(error);
            }
            this.refreshTranscriptChecksViews(project, summary);
        }

        this.verifyRunning = false;
        if (this.transcriptOpenSummaryId === summary.id) {
            this.refreshTranscriptChecksViews(project, summary);
        }

        if (this.transcriptOpenSummaryId !== summary.id) {
            return;
        }
        const failedCount = this.verifyResults.filter(r => r.state === 'fail').length;
        if (failedCount === 0) {
            // Green build ends the loop.
            this.verifyAutoAttempts = 0;
            return;
        }
        // Closed loop: in auto mode, feed the failure back to the agent until it passes or the budget runs out.
        // The agent's next turn flips status streaming→idle, which re-triggers this run via
        // handleTranscriptStatusForAutoVerify — so we don't recurse here directly.
        if (auto && summary.source !== 'theia-chat') {
            if (this.verifyAutoAttempts < MobileProjectsPanel.VERIFY_AUTO_MAX_ATTEMPTS) {
                this.verifyAutoAttempts++;
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/verifyAutoFixing',
                        'Verify failed — asking the agent to fix ({0}/{1})',
                        String(this.verifyAutoAttempts),
                        String(MobileProjectsPanel.VERIFY_AUTO_MAX_ATTEMPTS),
                    ),
                    { kind: 'warning', duration: 2000 },
                );
                void this.sendVerifyFailureToAgent(project, summary, true);
            } else {
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/verifyAutoGaveUp', 'Auto-verify gave up after {0} attempts — fix needed manually', String(MobileProjectsPanel.VERIFY_AUTO_MAX_ATTEMPTS)),
                    { kind: 'warning', duration: 2600 },
                );
            }
        }
    }

    /** Poll a verify task until it finishes, aborting if the sheet closes. */
    protected async pollVerifyTask(taskId: string, summaryId: string): Promise<QaapAgentTaskDetailDTO | undefined> {
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
            if (this.transcriptOpenSummaryId !== summaryId) {
                return undefined;
            }
            const detail = await fetchAgentTaskDetail(taskId);
            if (isAgentTaskFinished(detail.state)) {
                return detail;
            }
            await new Promise(resolve => window.setTimeout(resolve, 700));
        }
        throw new Error(nls.localize('qaap/mobileProjects/verifyTimeout', 'Verification timed out'));
    }

    protected tailLog(log: string | undefined, lines = 12): string {
        if (!log) {
            return '';
        }
        return log.trimEnd().split('\n').slice(-lines).join('\n');
    }

    /** Compose a failure report and push it back into the agent conversation. */
    protected async sendVerifyFailureToAgent(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, auto = false): Promise<void> {
        const failed = this.verifyResults.filter(r => r.state === 'fail');
        if (failed.length === 0) {
            return;
        }
        const report = [
            nls.localize('qaap/mobileProjects/verifyReportHeader', 'Verification failed. Please fix these checks:'),
            '',
            ...failed.map(r => `### ${r.check.label} — \`${r.check.command}\` (exit ${r.exitCode ?? '?'})\n${r.logTail ?? ''}`),
        ].join('\n');

        // VPS-backed conversations accept a follow-up message that triggers the next agent turn.
        if (summary.source !== 'theia-chat') {
            try {
                const agentModel = resolveStoredAgentModelForSubmit(summary.agentId, summary.cwd);
                await postConversationMessage(summary.id, report, undefined, agentModel);
                if (!auto) {
                    // Manual send: jump to Chat so the user watches the agent react.
                    this.selectTranscriptTab('messages', project, summary);
                    MobileSnackbar.show(nls.localize('qaap/mobileProjects/verifySent', 'Failure sent to agent'), { kind: 'success', duration: 1600 });
                }
            } catch (error) {
                MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
            }
            return;
        }

        // Theia-chat sessions have no conversation endpoint — copy the report so the user can paste it.
        try {
            await navigator.clipboard.writeText(report);
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/verifyCopied', 'Failure report copied — paste it into the chat'), { kind: 'success', duration: 2200 });
        } catch {
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/verifyCopyFailed', 'Could not copy the report'), { kind: 'warning' });
        }
    }

    /** Auto-verify when a turn finishes (streaming → idle), if enabled for this workspace. */
    protected handleTranscriptStatusForAutoVerify(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        status: QaapAgentConversationSummaryDTO['status'],
    ): void {
        const prev = this.transcriptLastStatus;
        this.transcriptLastStatus = status;
        if (prev === 'streaming' && status !== 'streaming'
            && !this.verifyRunning
            && this.transcriptOpenSummaryId === summary.id
            && this.isAutoVerifyEnabled(summary.cwd)) {
            void this.runVerifyChecks(project, summary, true);
        }
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

    protected bindTranscriptSheetDismiss(back: HTMLButtonElement, backdrop: HTMLElement): void {
        const dismiss = (ev?: Event): void => {
            ev?.preventDefault();
            ev?.stopPropagation();
            const project = this.transcriptOpenProject;
            if (project && this.navigateExecutionSurfaceBack(project)) {
                return;
            }
            this.closeTranscriptSheet();
        };
        // Dismiss on click only — closing on pointerdown removes the overlay before the
        // synthesized click fires, so the tap can land on the workbench back/account controls.
        back.addEventListener('click', dismiss);
        backdrop.addEventListener('click', dismiss);
        const onKeyDown = (ev: KeyboardEvent): void => {
            if (ev.key === 'Escape') {
                dismiss(ev);
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        const previousDispose = this.transcriptSheetDispose;
        this.transcriptSheetDispose = Disposable.create(() => {
            previousDispose.dispose();
            back.removeEventListener('click', dismiss);
            backdrop.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', onKeyDown, true);
        });
    }

    protected isTranscriptStickyComposerAgentWorking(): boolean {
        const summary = this.transcriptComposerSummary;
        if (!summary || !this.transcriptComposerHost?.isConnected) {
            return false;
        }
        if (this.transcriptLastConv?.id === summary.id && this.transcriptLastConv.status === 'streaming') {
            return true;
        }
        if (summary.source === 'theia-chat' && this.chatService) {
            const sessionId = summary.sessionId ?? this.transcriptTheiaSessionByConversationId.get(summary.id);
            const session = sessionId ? this.chatService.getSession(sessionId) : undefined;
            if (session && this.isChatSessionWorking(session)) {
                return true;
            }
        }
        const project = this.transcriptComposerProject;
        if (project) {
            const latest = this.conversationsForProject(project).find(candidate => candidate.id === summary.id);
            if (latest?.status === 'streaming') {
                return true;
            }
        }
        return false;
    }

    protected mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        this.transcriptComposerHost = host;
        this.transcriptComposerProject = project;
        this.transcriptComposerSummary = summary;
        this.transcriptComposerSendRefresh = undefined;
        this.stickyComposerContextUsageDispose.dispose();
        host.replaceChildren();
        const shell = document.createElement('div');
        shell.className = 'theia-mobile-projects-sticky-composer';
        const isTheiaChat = summary.source === 'theia-chat';
        if (isTheiaChat) {
            this.transcriptComposerPinnedAgentId = THEIA_CODER_AGENT_ID;
        }
        const pinnedId = this.resolveTranscriptComposerPinnedAgentId(project, summary);
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const modes = resolveStickyComposerModes(pinnedId, this.chatAgentService);
        this.transcriptComposerModeId = reconcileComposerModeId(
            this.transcriptComposerModeId,
            modes,
            cwd,
        );
        const showApprovalPolicy = !isTheiaChat && agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.transcriptComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.transcriptComposerApprovalPolicyId,
                cwd,
            );
        } else {
            this.transcriptComposerApprovalPolicyId = undefined;
        }
        const column = this.buildStickyComposerColumn({
            project,
            surface: isAgentsHubIdleConversationSummary(summary)
                ? 'task'
                : (isTheiaChat ? 'chat' : 'task'),
            agentLocked: isTheiaChat,
            getContext: () => this.transcriptComposerContext,
            clearContext: () => {
                this.transcriptComposerContext = [];
                this.remountTranscriptStickyComposer();
            },
            removeContextItem: index => {
                this.transcriptComposerContext.splice(index, 1);
                this.remountTranscriptStickyComposer();
            },
            formatContextChip: item => this.formatComposerContextChip(item),
            filesExpanded: this.transcriptComposerFilesExpanded,
            onFilesExpandedChange: expanded => { this.transcriptComposerFilesExpanded = expanded; },
            getDraft: () => this.transcriptComposerDraft,
            setDraft: value => { this.transcriptComposerDraft = value; },
            resolveAgentLabel: () => this.resolveTranscriptComposerAgentLabel(),
            resolveAgentId: () => this.resolveTranscriptComposerPinnedAgentId(project, summary),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.transcriptComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? () => { this.openTranscriptComposerModeSheet(project, summary, modes); }
                : undefined,
            approvalPolicyId: showApprovalPolicy ? this.transcriptComposerApprovalPolicyId : undefined,
            onOpenApprovalPolicySheet: showApprovalPolicy
                ? () => {
                    this.openTranscriptComposerApprovalPolicySheet(
                        project,
                        summary,
                        this.resolveTranscriptComposerAgentLabel(),
                    );
                }
                : undefined,
            canSubmit: true,
            isAgentWorking: () => this.isTranscriptStickyComposerAgentWorking(),
            onStop: () => { void this.onCancelConversation(project, summary); },
            onSendControlMounted: refresh => { this.transcriptComposerSendRefresh = refresh; },
            onAttach: anchor => { void this.onTranscriptComposerAttach(project, anchor); },
            onOpenAgentSheet: isTheiaChat
                ? () => { /* Chat is Coder-only */ }
                : () => { this.openTranscriptComposerAgentSheet(project, summary); },
            sendLabel: nls.localize('qaap/mobileProjects/transcriptSend', 'Send'),
            onSubmit: draft => {
                const resolvedPinnedId = isTheiaChat
                    ? THEIA_CODER_AGENT_ID
                    : this.resolveTranscriptComposerPinnedAgentId(project, summary);
                const selectedAgentId = isTheiaChat
                    ? THEIA_CODER_AGENT_ID
                    : resolveExplicitAgentForSubmit(draft, {
                        pinnedChatAgentId: resolvedPinnedId,
                    }) ?? resolvedPinnedId;
                const outboundDraft = isTheiaChat ? stripNonCoderAgentMention(draft) : draft;
                const variables = this.transcriptComposerContext.length > 0
                    ? [...this.transcriptComposerContext]
                    : undefined;
                const modeId = this.transcriptComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.transcriptComposerApprovalPolicyId,
                    summary.cwd,
                );
                this.transcriptComposerContext = [];
                if (isAgentsHubIdleConversationSummary(summary)) {
                    this.renderAgentsHubIdleSubmitOptimistic(chatHost, summary, draft, selectedAgentId);
                    this.transcriptComposerSendRefresh?.();
                    void (async () => {
                        try {
                            await this.submitBackgroundAgentTask(project, draft, {
                                openConversation: true,
                                forceVps: true,
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                            });
                        } catch {
                            /* submitBackgroundAgentTask surfaces errors */
                        } finally {
                            this.renderStickyComposer();
                        }
                    })();
                    return;
                }
                void (async () => {
                    try {
                        if (summary.source === 'theia-chat') {
                            await this.submitTranscriptViaTheiaChat(
                                project,
                                summary,
                                outboundDraft,
                                chatHost,
                                modeId,
                                undefined,
                                undefined,
                            );
                        } else {
                            await this.submitTranscriptViaBackendConversation(project, summary, draft, {
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                            });
                        }
                    } catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        this.messageService?.error(nls.localize(
                            'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                        ));
                    } finally {
                        this.remountTranscriptStickyComposer();
                    }
                })();
            },
            getMentionOptions: () => this.resolveComposerMentionOptions(this.transcriptComposerBackendAgents, isTheiaChat),
            getVariableOptions: this.getComposerVariables
                ? () => this.resolveComposerVariableOptions()
                : undefined,
            inputPlaceholder: isAgentsHubIdleConversationSummary(summary)
                ? nls.localize('qaap/mobileProjects/stickyComposerNewTask', 'Delegate a task…')
                : summary.source === 'theia-chat'
                    ? nls.localize('qaap/mobileProjects/transcriptChatPlaceholder', 'Reply in local chat…')
                    : nls.localize('qaap/mobileProjects/transcriptTaskPlaceholder', 'Follow up on this task…'),
            onContextUsageBadgeMounted: badge => {
                this.stickyComposerContextUsageDispose = this.mountStickyComposerContextUsage(
                    badge,
                    () => this.resolveTranscriptContextUsageTarget(summary),
                );
            },
            showWorkspaceBar: this.shouldShowComposerWorkspaceBar(summary),
            transcriptOverlay: !this.agentsHubShellActive,
        });
        shell.append(column);
        host.append(shell);
    }

    protected remountTranscriptStickyComposer(): void {
        const host = this.transcriptComposerHost;
        const project = this.transcriptComposerProject;
        const summary = this.transcriptComposerSummary;
        const chatHost = this.transcriptChatHost;
        if (!host?.isConnected || !project || !summary || !chatHost) {
            return;
        }
        this.mountTranscriptStickyComposer(host, project, summary, chatHost);
    }

    protected resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        if (summary.source === 'theia-chat') {
            return THEIA_CODER_AGENT_ID;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const summaryAgent = isAgentsHubIdleConversationSummary(summary)
            ? undefined
            : migrateLegacyBackendAgentId(summary.agentId);
        const pinned = this.transcriptComposerPinnedAgentId
            ?? summaryAgent
            ?? readStoredAgent(cwd);
        if (pinned && pinned !== 'task') {
            return pinned;
        }
        return this.getOfferableCoderAgent()
            ? THEIA_CODER_AGENT_ID
            : (this.transcriptComposerBackendAgents[0]?.id ?? QAIQ_AGENT_ID);
    }

    protected resolveTranscriptComposerAgentLabel(): string {
        const pinned = this.transcriptComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.transcriptComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        return this.resolveConversationAgentLabel(this.transcriptComposerSummary);
    }

    protected async refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project)
            ?? this.transcriptComposerSummary?.cwd
            ?? this.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.loadBackendAgentSnapshot();
            const filteredAgents = this.filterSelectableComposerAgents(snapshot.agents);
            this.transcriptComposerBackendAgents = filteredAgents;
            this.transcriptComposerQaiqModels = snapshot.qaiqModels;
            const resolved = this.reconcileStickyComposerPinnedAgent(
                this.transcriptComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            if (this.transcriptComposerPinnedAgentId !== resolved) {
                this.transcriptComposerPinnedAgentId = resolved;
                this.remountTranscriptStickyComposer();
            }
        } catch {
            this.transcriptComposerBackendAgents = this.filterSelectableComposerAgents(this.activeTasks?.getAgents() ?? []);
            this.transcriptComposerQaiqModels = [];
        }
    }

    protected async onTranscriptComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.pickContextVariable) {
            return;
        }
        const variable = await this.pickContextVariable(anchor);
        if (!variable) {
            return;
        }
        this.transcriptComposerContext.push(variable);
        this.remountTranscriptStickyComposer();
    }

    protected openTranscriptComposerAgentSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat') {
            return;
        }
        this.closeTranscriptComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const chrome = this.createComposerAgentPickerChrome({
            sheetClassName: 'theia-mobile-sticky-composer-sheet theia-mod-agent theia-mod-transcript-overlay',
            closeTitle: nls.localize('qaap/mobileProjects/closeTranscript', 'Close'),
            onClose: () => this.closeTranscriptComposerSheets(),
        });
        document.body.append(chrome.sheet);
        this.transcriptComposerAgentSheet = chrome.sheet;
        this.showComposerAgentPickerLoading(chrome);
        void this.ensureTranscriptComposerAgentsLoaded(project).then(agents => {
            if (this.transcriptComposerAgentSheet !== chrome.sheet) {
                return;
            }
            void this.renderComposerAgentPicker(chrome, {
                view: 'agents',
                cwd,
                agents,
                selectedAgentId: this.transcriptComposerPinnedAgentId,
                includeCoder: true,
                onSelectAgent: (agentId, model) => {
                    this.transcriptComposerPinnedAgentId = agentId;
                    if (cwd) {
                        writeStoredAgent(cwd, agentId);
                        if (model) {
                            writeStoredAgentModel(cwd, agentId, model);
                        }
                    }
                    const modes = resolveStickyComposerModes(agentId, this.chatAgentService);
                    this.transcriptComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.transcriptComposerModeId) {
                        writeStoredComposerMode(cwd, this.transcriptComposerModeId);
                    }
                    this.closeTranscriptComposerSheets();
                    this.remountTranscriptStickyComposer();
                },
            });
        });
    }

    protected openTranscriptComposerModeSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        modes: readonly ChatMode[],
    ): void {
        this.closeTranscriptComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-mode theia-mod-transcript-overlay';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeTranscriptComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeTranscriptComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.createModeSheetOption(
                mode.name,
                mode.id,
                this.transcriptComposerModeId,
                id => {
                    this.transcriptComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    this.closeTranscriptComposerSheets();
                    this.remountTranscriptStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.transcriptComposerModeSheet = sheet;
    }

    protected closeTranscriptComposerSheets(): void {
        if (this.transcriptComposerAgentSheet) {
            this.transcriptComposerAgentSheet.remove();
            this.transcriptComposerAgentSheet = undefined;
        }
        if (this.transcriptComposerQaiqModelSheet) {
            this.transcriptComposerQaiqModelSheet.remove();
            this.transcriptComposerQaiqModelSheet = undefined;
        }
        if (this.transcriptComposerModeSheet) {
            this.transcriptComposerModeSheet.remove();
            this.transcriptComposerModeSheet = undefined;
        }
        if (this.transcriptComposerApprovalSheet) {
            this.transcriptComposerApprovalSheet.remove();
            this.transcriptComposerApprovalSheet = undefined;
        }
        if (this.stickyComposerWorkspaceSheet) {
            this.stickyComposerWorkspaceSheet.remove();
            this.stickyComposerWorkspaceSheet = undefined;
        }
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
    protected summaryToTranscriptPlaceholder(summary: QaapAgentConversationSummaryDTO): QaapAgentConversationDTO {
        const messages: QaapAgentConversationDTO['messages'] = [];
        if (summary.lastMessagePreview?.trim()) {
            messages.push({
                id: `${summary.id}:preview`,
                role: summary.lastMessageRole ?? 'user',
                content: summary.lastMessagePreview,
                createdAt: summary.updatedAt,
            });
        }
        return {
            id: summary.id,
            cwd: summary.cwd,
            agentId: summary.agentId,
            title: summary.title,
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages,
        };
    }

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

    protected inferBackendAgentIdFromChatSession(session: ChatSession): string | undefined {
        let lastMention: string | undefined;
        for (const request of session.model.getRequests()) {
            const mentioned = extractBackendAgentMention(request.request.text ?? '');
            if (mentioned) {
                lastMention = mentioned;
            }
        }
        if (lastMention) {
            return lastMention;
        }
        const pinned = migrateLegacyBackendAgentId(session.pinnedAgent?.id);
        if (pinned && pinned !== 'chat' && (normalizeBackendAgentId(pinned) || pinned === QAIQ_AGENT_ID)) {
            return pinned;
        }
        return undefined;
    }

    protected inferBackendAgentIdFromMessages(
        messages: ReadonlyArray<{ readonly content?: string }> | undefined,
    ): string | undefined {
        if (!messages?.length) {
            return undefined;
        }
        let last: string | undefined;
        for (const message of messages) {
            const mentioned = extractBackendAgentMention(message.content ?? '');
            if (mentioned) {
                last = mentioned;
            }
        }
        return last;
    }

    protected resolveBackendAgentIdForTranscript(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): string | undefined {
        if (summary.source === 'theia-chat') {
            return THEIA_CODER_AGENT_ID;
        }
        if (session) {
            const fromSession = this.inferBackendAgentIdFromChatSession(session);
            if (fromSession) {
                return fromSession;
            }
        }
        const fromMessages = this.inferBackendAgentIdFromMessages(messages);
        if (fromMessages) {
            return fromMessages;
        }
        const fromTitle = extractBackendAgentMention(summary.title ?? '');
        if (fromTitle) {
            return fromTitle;
        }
        const fromSummary = migrateLegacyBackendAgentId(summary.agentId?.trim());
        if (fromSummary && fromSummary !== 'chat' && normalizeBackendAgentId(fromSummary)) {
            return fromSummary;
        }
        return readStoredAgent(summary.cwd);
    }

    protected resolveTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        return this.chatAgentForBackendId(this.resolveBackendAgentIdForTranscript(summary, session, messages));
    }

    protected applyTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session: ChatSession,
        inputWidget?: AIChatInputWidget,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        const agent = this.resolveTranscriptPinnedAgent(summary, session, messages);
        if (!agent) {
            return undefined;
        }
        session.pinnedAgent = agent;
        if (inputWidget) {
            inputWidget.pinnedAgent = agent;
        }
        if (summary.cwd) {
            writeStoredAgent(summary.cwd, agent.id);
        }
        return agent;
    }

    /** Local chat always routes to Coder — strip VPS @mentions and ensure a Coder prefix. */
    protected formatTheiaChatRequestText(content: string, _pinnedAgentId?: string): string {
        const cleaned = stripNonCoderAgentMention(content);
        if (isTheiaCoderMention(cleaned)) {
            return cleaned;
        }
        return `@${THEIA_CODER_AGENT_ID} ${cleaned}`;
    }

    protected async submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: AIVariableResolutionRequest[];
            widget?: AIChatInputWidget;
        } = {},
    ): Promise<void> {
        if (this.isPendingNewChatSummary(summary)) {
            const created = await this.createProjectChatSession(project, summary.cwd, content, {
                selectedAgentId: options.selectedAgentId,
                modeId: options.modeId,
                autoApprove: options.autoApprove,
                variables: options.variables,
            });
            this.transcriptOpenSummaryId = created.id;
            this.transcriptOpenSummary = created;
            this.transcriptComposerSummary = created;
            if (this.transcriptChatHost) {
                const full = await getConversation(created.id);
                this.transcriptLastFingerprint = undefined;
                this.renderTranscriptMessages(this.transcriptChatHost, full);
                this.watchOpenTranscriptUntilIdle(project, created.id);
            }
            this.applyTaskStartedToProject(created.cwd, content, created.id);
            return;
        }
        const agent = resolveExplicitAgentForSubmit(content, {
            pinnedChatAgentId: options.selectedAgentId ?? options.widget?.pinnedAgent?.id ?? summary.agentId,
        }) ?? options.selectedAgentId ?? summary.agentId;
        const outbound = applyBackendInteractionModeToPrompt(content, options.modeId);
        const base = await getConversation(summary.id);
        const optimistic: QaapAgentConversationDTO = {
            ...base,
            status: 'streaming',
            messages: [...base.messages, {
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content: outbound,
                createdAt: Date.now(),
            }],
        };
        if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
            this.transcriptLastFingerprint = undefined;
            this.renderTranscriptMessages(this.transcriptChatHost, optimistic);
        }
        try {
            const agentModel = resolveStoredAgentModelForSubmit(agent, summary.cwd);
            const updated = await postConversationMessage(
                summary.id,
                outbound,
                agent,
                agentModel,
                options.autoApprove,
            );
            const nextSummary = conversationToSummary(updated);
            this.conversations?.recordSnapshot(nextSummary);
            if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
                this.transcriptLastFingerprint = undefined;
                this.renderTranscriptMessages(this.transcriptChatHost, updated);
            }
            this.applyTaskStartedToProject(summary.cwd, content, summary.id);
            this.watchOpenTranscriptUntilIdle(project, summary.id);
        } catch (error) {
            if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
                this.transcriptLastFingerprint = undefined;
                this.renderTranscriptMessages(this.transcriptChatHost, base);
            }
            throw error;
        }
    }

    protected async createProjectTheiaChatSession(
        project: MobileProjectEntry,
        cwd: string,
        draft: string,
        options: {
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        if (!this.chatService) {
            throw new Error(nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'));
        }
        const previousActiveSessionId = this.chatService.getActiveSession()?.id;
        const coderAgent = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
        this.rememberChatSessionProject(session.id, project);
        if (cwd) {
            writeStoredAgent(cwd, THEIA_CODER_AGENT_ID);
        }
        this.trackChatServiceSessionModels();
        const summary = this.chatServiceSessionToSummary(session, project, cwd, draft, 'streaming');
        this.upsertProjectChatServiceSummary(project.id, summary);
        if (previousActiveSessionId && this.chatService.getSession(previousActiveSessionId)) {
            this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
        }
        const pinnedId = THEIA_CODER_AGENT_ID;
        const invocation = await this.chatService.sendRequest(session.id, {
            text: this.formatTheiaChatRequestText(stripNonCoderAgentMention(draft), pinnedId),
            modeId: options.modeId,
            capabilityOverrides: options.capabilityOverrides,
            genericCapabilitySelections: options.genericCapabilitySelections,
            ...(options.variables && options.variables.length > 0 ? { variables: options.variables } : {}),
        });
        this.scheduleChatServiceRefresh();
        void invocation?.responseCompleted.finally(() => this.scheduleChatServiceRefresh());
        return summary;
    }

    protected async submitTranscriptViaTheiaChat(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        transcript: HTMLElement,
        modeId?: string,
        capabilityOverrides?: Record<string, boolean>,
        genericCapabilitySelections?: GenericCapabilitySelections,
        widget?: AIChatInputWidget,
    ): Promise<void> {
        if (!this.chatService) {
            throw new Error(nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'));
        }
        let sessionId = this.transcriptTheiaSessionByConversationId.get(summary.id);
        let session = sessionId ? this.chatService.getSession(sessionId) : undefined;
        if (!session) {
            session = await this.getOrRestoreProjectChatSession(project, summary)
                ?? this.chatService.createSession(
                    ChatAgentLocation.Panel,
                    { focus: false },
                    this.resolveTranscriptPinnedAgent(summary),
                );
            this.transcriptTheiaSessionByConversationId.set(summary.id, session.id);
            sessionId = session.id;
        }
        this.applyTranscriptPinnedAgent(summary, session, widget);
        const base = summary.source === 'theia-chat'
            ? await this.conversations?.getTheiaConversation(summary.id)
            : await getConversation(summary.id);
        if (!base) {
            throw new Error(nls.localize('qaap/mobileProjects/transcriptUnavailable', 'This chat could not be loaded.'));
        }
        const userMessage = {
            id: `${session.id}:${Date.now()}:user`,
            role: 'user' as const,
            content,
            createdAt: Date.now(),
        };
        this.renderTranscriptMessages(transcript, {
            ...base,
            status: 'streaming',
            messages: [...base.messages, userMessage],
        });
        const invocation = await this.chatService.sendRequest(session.id, {
            text: this.formatTheiaChatRequestText(stripNonCoderAgentMention(content)),
            modeId,
            capabilityOverrides,
            genericCapabilitySelections,
        });
        if (!invocation) {
            throw new Error(nls.localize('qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', 'no agent'));
        }
        await invocation.responseCompleted;
        const coderConversation = await this.getChatServiceConversation({ ...summary, sessionId: session.id });
        this.renderTranscriptMessages(transcript, {
            ...base,
            status: 'idle',
            messages: [
                ...base.messages,
                ...(coderConversation?.messages ?? []),
            ],
        });
        this.upsertProjectChatServiceSummary(project.id, this.chatServiceSessionToSummary(session, project, summary.cwd, summary.title, 'idle'));
    }

    protected async mountCoderChatView(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
    ): Promise<void> {
        try {
            if (!this.createChatViewWidget || !this.chatService) {
                throw new Error(nls.localize('qaap/mobileProjects/agentViewUnavailable', 'Agent chat is unavailable.'));
            }
            let sessionId = this.transcriptTheiaSessionByConversationId.get(summary.id);
            let session = sessionId ? this.chatService.getSession(sessionId) : undefined;
            if (!session) {
                const coderAgent = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
                session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
                session.title = summary.title || project.name;
                this.transcriptTheiaSessionByConversationId.set(summary.id, session.id);
                sessionId = session.id;
                this.rememberChatSessionProject(session.id, project);
                this.trackChatServiceSessionModels();
            }
            const previousActiveSessionId = this.chatService.getActiveSession()?.id;
            this.chatService.setActiveSession(session.id, { focus: false });
            const uniqueId = `transcript-coder-${project.id}-${summary.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
            const widget = await this.createChatViewWidget(uniqueId) as MobileProjectChatViewWidget;
            if (!this.transcriptSheet || !host.isConnected) {
                widget.dispose();
                return;
            }
            if (this.attachTranscriptChatViewWidget(widget, host, session)) {
                this.transcriptChatViewWidget = widget;
            } else {
                widget.dispose();
            }
            const previousDispose = this.transcriptSheetDispose;
            this.transcriptSheetDispose = Disposable.create(() => {
                previousDispose.dispose();
                if (previousActiveSessionId && this.chatService?.getSession(previousActiveSessionId)) {
                    this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
                }
            });
        } catch (error) {
            const messageHost = this.resolveTranscriptMessageHost(host);
            messageHost.replaceChildren();
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error instanceof Error ? error.message : String(error);
            messageHost.append(err);
        }
    }

    protected async openTheiaChatTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.setExecutionSurfaceTab(project, 'messages');
        this.replacingTranscriptSheet = true;
        this.closeTranscriptSheet();
        this.replacingTranscriptSheet = false;
        this.delegate.onEnterActiveTranscript?.();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-agent-transcript-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-transcript';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const headerTitle = this.resolveTranscriptHeaderTitle(project, summary);
        const { back, tabStrip } = this.mountTranscriptExecutionHeader(header, project, summary, headerTitle);

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        chatHost.hidden = false;
        this.renderTranscriptMessages(chatHost, this.summaryToTranscriptPlaceholder(summary));

        const chatInputHost = document.createElement('div');
        chatInputHost.className = 'theia-mobile-agent-transcript-chat-input';
        chatInputHost.hidden = false;

        const { planHost, reviewHost, previewHost, filesHost, terminalHost } = this.createTranscriptSheetSurfaceHosts();

        sheet.append(header, chatHost, planHost, reviewHost, previewHost, filesHost, terminalHost, chatInputHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;
        this.notifyWorkspaceHubBottomBarRefresh();

        const previousActiveSessionId = this.chatService?.getActiveSession()?.id;

        this.transcriptChatHost = chatHost;
        this.transcriptChatInputHost = chatInputHost;
        this.transcriptTabStrip = tabStrip;
        this.transcriptPlanHost = planHost;
        this.transcriptReviewHost = reviewHost;
        this.transcriptPreviewHost = previewHost;
        this.transcriptFilesHost = filesHost;
        this.transcriptTerminalHost = terminalHost;
        this.transcriptOpenSummaryId = summary.id;
        this.transcriptOpenSummary = summary;
        this.transcriptOpenProject = project;
        if (this.visible) {
            this.renderHeader();
            this.renderSubtitle();
            this.renderList();
            this.syncHeaderExecutionTabStrip();
        }
        this.bindTranscriptSheetDismiss(back, backdrop);
        this.transcriptComposerPinnedAgentId = migrateLegacyBackendAgentId(summary.agentId)
            ?? readStoredAgent(summary.cwd);
        void this.refreshTranscriptComposerAgents(project);
        this.mountTranscriptStickyComposer(chatInputHost, project, summary, chatHost);
        this.showOnlyExecutionSurfaceTab('messages');
        this.mountTranscriptSurfaceTab(project, summary, 'messages');
        try {
            if (!this.chatService || !summary.sessionId) {
                throw new Error(nls.localize('qaap/mobileProjects/agentViewUnavailable', 'Agent chat is unavailable.'));
            }
            const theiaConversation = summary.id.startsWith('theia-chat')
                ? await this.conversations?.getTheiaConversation(summary.id)
                : await this.getChatServiceConversation(summary);
            if (theiaConversation) {
                this.transcriptLastFingerprint = this.conversationTranscriptFingerprint(theiaConversation);
                this.renderTranscriptMessages(chatHost, theiaConversation);
                const surfaceTab = this.executionSurfaceTabForProject(project);
                this.showOnlyExecutionSurfaceTab(surfaceTab);
                this.mountTranscriptSurfaceTab(project, summary, surfaceTab);
                this.syncExecutionSurfaceChrome(project);
            }
            this.transcriptSheetDispose = Disposable.create(() => {
                if (previousActiveSessionId && this.chatService?.getSession(previousActiveSessionId)) {
                    this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
                }
            });
        } catch (error) {
            const messageHost = this.resolveTranscriptMessageHost(chatHost);
            messageHost.replaceChildren();
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error instanceof Error ? error.message : String(error);
            messageHost.append(err);
            this.transcriptSheetDispose = Disposable.NULL;
        }
    }

    protected async getOrRestoreProjectChatSession(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !summary.sessionId) {
            return undefined;
        }
        const existing = this.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        if (summary.source === 'theia-chat' || summary.id.startsWith('theia-chat:')) {
            const fromProjects = await this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
            if (fromProjects) {
                return fromProjects;
            }
        }
        const restored = await this.chatService.getOrRestoreSession(summary.sessionId);
        return restored ?? this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
    }

    protected async forkTheiaConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !this.conversations || !summary.sessionId) {
            return undefined;
        }

        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const existing = await this.getOrRestoreProjectChatSession(project, summary);
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.conversations.getTheiaSerializedConversation(summary.id)
            : await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
            ?? await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        const baseData: RestorableTheiaChatData | undefined = isRestorableTheiaChatData(raw)
            ? raw
            : existing
                ? {
                    title: existing.title,
                    pinnedAgentId: existing.pinnedAgent?.id,
                    saveDate: existing.lastInteraction?.getTime() ?? Date.now(),
                    model: existing.model.toSerializable() as RestorableTheiaChatData['model'],
                }
                : undefined;
        if (!baseData) {
            return undefined;
        }

        const sessionId = generateUuid();
        const serializedModel = JSON.parse(JSON.stringify(baseData.model)) as RestorableTheiaChatData['model'];
        (serializedModel as { sessionId: string }).sessionId = sessionId;

        const model = new MutableChatModel(serializedModel);
        const service = this.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
            saveSession?: (sessionId: string) => Promise<void>;
        };
        await service.restoreSessionData?.(model, serializedModel);

        const title = nls.localize(
            'qaap/mobileProjects/forkedTaskTitle',
            '{0} fork',
            baseData.title ?? summary.title ?? project.name
        );
        const pinnedAgentId = baseData.pinnedAgentId ?? existing?.pinnedAgent?.id;
        const session: ChatSession = {
            id: sessionId,
            title,
            lastInteraction: new Date(),
            model,
            isActive: false,
            pinnedAgent: pinnedAgentId ? this.chatAgentService?.getAgent(pinnedAgentId) : existing?.pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        await service.saveSession?.(session.id);
        this.chatService.setActiveSession(session.id, { focus: false });
        return session;
    }

    protected async restoreTheiaChatSessionFromProjectsStorage(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !summary.sessionId || !this.conversations) {
            return undefined;
        }
        const existing = this.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.conversations.getTheiaSerializedConversation(summary.id)
            : await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
            ?? await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        if (!isRestorableTheiaChatData(raw)) {
            return undefined;
        }

        const model = new MutableChatModel(raw.model);
        const service = this.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
        };
        await service.restoreSessionData?.(model, raw.model);
        const pinnedAgent = raw.pinnedAgentId ? this.chatAgentService?.getAgent(raw.pinnedAgentId) : undefined;
        const session: ChatSession = {
            id: summary.sessionId,
            title: raw.title ?? summary.title,
            lastInteraction: new Date(raw.saveDate ?? summary.updatedAt),
            model,
            isActive: false,
            pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        return session;
    }

    protected async getChatServiceConversation(summary: QaapAgentConversationSummaryDTO): Promise<QaapAgentConversationDTO | undefined> {
        const sessionId = summary.sessionId;
        if (!sessionId || !this.chatService) {
            return undefined;
        }
        const session = await this.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return undefined;
        }
        const messages: QaapAgentConversationDTO['messages'] = [];
        let offset = 0;
        for (const request of session.model.getRequests()) {
            const userText = request.request.text?.trim();
            if (userText) {
                messages.push({
                    id: `${request.id}:user`,
                    role: 'user',
                    content: userText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
            const agentText = request.response.response.asString().trim();
            if (agentText) {
                messages.push({
                    id: `${request.id}:agent`,
                    role: 'agent',
                    content: agentText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
        }
        return {
            id: summary.id,
            cwd: summary.cwd,
            agentId: session.pinnedAgent?.id ?? summary.agentId,
            title: summary.title,
            status: 'idle',
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages,
        };
    }

    protected async mountTranscriptChatInput(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
        submit: (content: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections, widget?: AIChatInputWidget) => Promise<void>,
    ): Promise<void> {
        if (!this.createChatInputWidget || !this.chatService) {
            host.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            return;
        }
        if (this.transcriptChatInputWidget && !this.transcriptChatInputWidget.isDisposed) {
            this.transcriptChatInputWidget.dispose();
        }
        this.transcriptChatInputWidget = undefined;

        const uniqueId = `transcript-${project.id}-${summary.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
        let widget: AIChatInputWidget;
        try {
            widget = await this.createChatInputWidget(uniqueId);
        } catch (error) {
            console.error('[qaap-mobile-projects] transcript createChatInputWidget threw:', error);
            host.textContent = `Agent input failed to load: ${error instanceof Error ? error.message : String(error)}`;
            return;
        }
        widget.id = `mobile-projects-transcript-chat-input-${uniqueId}`;
        if (!this.transcriptSheet || !host.isConnected) {
            widget.dispose();
            return;
        }

        host.replaceChildren();
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add('chat-input-widget', 'theia-mobile-projects-real-agent-input');
        widget.show();

        const restoredSession = summary.sessionId && summary.id.startsWith('theia-chat')
            ? await this.chatService.getOrRestoreSession(summary.sessionId)
            : undefined;
        const session = restoredSession ?? this.ensureAgentChatSession(summary.cwd);
        widget.chatModel = session.model;
        const convMessages = summary.source === 'theia-chat'
            ? (await this.conversations?.getTheiaConversation(summary.id))?.messages
            : (await getConversation(summary.id).catch(() => undefined))?.messages;
        this.applyTranscriptPinnedAgent(summary, session, widget, convMessages);
        widget.initialValue = '';
        widget.setEnabled(true);
        widget.onQuery = async (query: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections) => {
            const cleaned = query.trim();
            if (!cleaned) {
                return;
            }
            try {
                await submit(cleaned, modeId, capabilityOverrides, genericCapabilitySelections, widget);
                widget.clearPendingImageAttachments();
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                this.messageService?.error(nls.localize(
                    'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                ));
            }
        };
        widget.onCancel = (requestModel: ChatRequestModel) => {
            void this.chatService?.cancelRequest(requestModel.session.id, requestModel.id);
        };
        widget.onUnpin = () => {
            session.pinnedAgent = undefined;
            widget.pinnedAgent = undefined;
        };
        widget.onDeleteChangeSet = ((sessionId: string) => {
            this.chatService?.deleteChangeSet(sessionId);
        }) as unknown as (requestModel: ChatRequestModel) => void;
        widget.onDeleteChangeSetElement = ((sessionId: string, uri: Parameters<ChatService['deleteChangeSetElement']>[1]) => {
            this.chatService?.deleteChangeSetElement(sessionId, uri);
        }) as unknown as (requestModel: ChatRequestModel, index: number) => void;

        this.transcriptChatInputWidget = widget;
        widget.activate();
        widget.update();
    }

    /** Structured transcript UI: persisted segments (QAIQ/OpenCode) or on-the-fly OpenCode replay only. */
    protected resolveTranscriptAgentSegments(
        conv: QaapAgentConversationDTO,
        msg: QaapAgentMessageDTO,
    ): QaapAgentMessageSegmentDTO[] | undefined {
        if (msg.segments && msg.segments.length > 0) {
            return msg.segments;
        }
        // Never infer OpenCode-shaped segments for Codex, Claude, Aider, etc.
        if (msg.role !== 'agent' || !isOpencodeAgent(conv.agentId)) {
            return undefined;
        }
        const parsed = parseOpencodeLog(msg.content);
        return parsed.segments.length > 0 ? parsed.segments : undefined;
    }

    protected renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        this.transcriptLastConv = conv;
        const messageHost = this.resolveTranscriptMessageHost(host);
        messageHost.replaceChildren();
        const isEmptyChat = conv.messages.length === 0 && conv.status !== 'streaming';
        messageHost.classList.toggle('theia-mod-empty-chat', isEmptyChat);
        if (isEmptyChat) {
            const project = this.transcriptOpenProject;
            if (project && this.shouldEmbedAgentsHubRecentsInWorkspaceTranscript()) {
                messageHost.append(this.createAgentsHubRecentsBlock(project));
            }
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-agent-transcript-empty';
            empty.append(this.createAgentsHubQuickActionsBlock());
            messageHost.append(empty);
            return;
        }
        for (const msg of conv.messages) {
            const agentSegments = this.resolveTranscriptAgentSegments(conv, msg);
            if (msg.role === 'user') {
                messageHost.append(this.createTranscriptUserMessageRow(msg, conv));
            } else if (agentSegments && agentSegments.length > 0) {
                messageHost.append(this.createTranscriptAgentSegmentsRow(agentSegments, msg.error));
            } else {
                messageHost.append(this.createTranscriptMessageRow(
                    msg.role,
                    normalizeAgentMessageContentForDisplay(msg.content),
                    msg.error,
                ));
            }
        }
        const last = conv.messages[conv.messages.length - 1];
        if (conv.status === 'streaming') {
            if (last?.role === 'agent') {
                messageHost.lastElementChild?.classList.add('theia-mod-streaming');
            } else {
                messageHost.append(this.createTranscriptStreamingActivityRow(conv));
            }
        }
        scrollElementToEnd(messageHost);
        this.transcriptUserScrollPinDispose.dispose();
        this.transcriptUserScrollPinDispose = attachTranscriptUserScrollPin(messageHost);
        this.ensureOverlayUi().team.renderTeamSection(host, conv);
        this.transcriptComposerSendRefresh?.();
    }

    protected createTranscriptAgentSegmentsRow(
        segments: QaapAgentMessageSegmentDTO[],
        error?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-transcript-segments';

        const thoughtBrief = this.createTranscriptThoughtBriefBlock(segments);
        if (thoughtBrief) {
            body.append(thoughtBrief);
        }

        // Hero content first — Cursor-style: intent/thought, then the visible answer, then artifacts.
        for (const segment of segments) {
            if (segment.type === 'text' && segment.content.trim()) {
                body.append(this.createTranscriptSegmentDetails(segment));
            }
        }

        const artifacts = document.createElement('div');
        artifacts.className = 'theia-mobile-agent-transcript-artifacts';
        const activity = this.createTranscriptActivityTimeline(segments, !thoughtBrief);
        if (activity) {
            artifacts.append(activity);
        }
        const changedFiles = this.createTranscriptChangedFilesCard(segments);
        if (changedFiles) {
            artifacts.append(changedFiles);
        } else {
            const diffSummary = this.createTranscriptDiffSummaryCard(segments);
            if (diffSummary) {
                artifacts.append(diffSummary);
            }
        }
        const verification = this.createTranscriptVerificationCard(segments);
        if (verification) {
            artifacts.append(verification);
        }
        const activityTimelineShown = hasTranscriptActivityTimeline(segments);
        for (const segment of segments) {
            if (segment.type !== 'tool') {
                continue;
            }
            if (!shouldRenderTranscriptToolSegmentInline({
                activityTimelineShown,
                finished: segment.finished,
                resultFailed: this.transcriptToolResultFailed(segment.result),
            })) {
                continue;
            }
            artifacts.append(this.createTranscriptSegmentDetails(segment));
        }
        if (artifacts.childElementCount > 0) {
            body.append(artifacts);
        }

        if (!thoughtBrief) {
            const technicalDetails = this.createTranscriptTechnicalDetailsCard(segments);
            if (technicalDetails) {
                body.append(technicalDetails);
            }
        }

        row.append(body);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    protected createTranscriptThoughtBriefBlock(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const thinking = resolveTranscriptThinkingContent(segments);
        const stats = resolveTranscriptActivityStats(segments);
        const hasStats = hasTranscriptActivityStats(stats);
        if (!thinking && !hasStats) {
            return undefined;
        }

        const block = document.createElement('section');
        block.className = 'theia-mobile-agent-thought-brief';

        const title = document.createElement('div');
        title.className = 'theia-mobile-agent-thought-brief-title';
        title.textContent = thinking
            ? nls.localize('qaap/mobileProjects/transcriptThoughtBriefly', 'Thought briefly')
            : nls.localize('qaap/mobileProjects/transcriptExploredWorkspace', 'Explored the workspace');
        block.append(title);

        if (hasStats) {
            const meta = document.createElement('div');
            meta.className = 'theia-mobile-agent-thought-brief-meta';
            meta.textContent = this.formatTranscriptActivityMeta(stats);
            block.append(meta);
        }

        if (thinking) {
            const preview = excerptTranscriptThought(thinking);
            const body = document.createElement('p');
            body.className = 'theia-mobile-agent-thought-brief-body';
            body.textContent = preview;
            block.append(body);

            if (isTranscriptThoughtExcerptTruncated(thinking)) {
                const details = document.createElement('details');
                details.className = 'theia-mobile-agent-thought-brief-more';
                const summary = document.createElement('summary');
                summary.textContent = nls.localize('qaap/mobileProjects/transcriptThoughtFull', 'Show full reasoning');
                const full = document.createElement('pre');
                full.className = 'theia-mobile-agent-thought-brief-more-body';
                full.textContent = this.cleanTranscriptDisplayText(thinking);
                details.append(summary, full);
                block.append(details);
            }
        }

        return block;
    }

    protected formatTranscriptActivityMeta(stats: QaapTranscriptActivityStats): string {
        const parts: string[] = [];
        if (stats.fileReads > 0) {
            parts.push(stats.fileReads === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneFile', '1 file')
                : nls.localize('qaap/mobileProjects/transcriptMetaFiles', '{0} files', String(stats.fileReads)));
        }
        if (stats.searches > 0) {
            parts.push(stats.searches === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneSearch', '1 search')
                : nls.localize('qaap/mobileProjects/transcriptMetaSearches', '{0} searches', String(stats.searches)));
        }
        if (stats.shells > 0) {
            parts.push(stats.shells === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneCommand', '1 command')
                : nls.localize('qaap/mobileProjects/transcriptMetaCommands', '{0} commands', String(stats.shells)));
        }
        if (stats.edits > 0) {
            parts.push(stats.edits === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneEdit', '1 edit')
                : nls.localize('qaap/mobileProjects/transcriptMetaEdits', '{0} edits', String(stats.edits)));
        }
        if (stats.otherTools > 0) {
            parts.push(stats.otherTools === 1
                ? nls.localize('qaap/mobileProjects/transcriptMetaOneTool', '1 tool')
                : nls.localize('qaap/mobileProjects/transcriptMetaTools', '{0} tools', String(stats.otherTools)));
        }
        return nls.localize('qaap/mobileProjects/transcriptThoughtMeta', 'Explored {0}', parts.join(', '));
    }

    protected createTranscriptActivityTimeline(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): HTMLElement | undefined {
        const items = this.resolveTranscriptActivityItems(segments, includeThinkingSteps);
        if (items.length === 0) {
            return undefined;
        }
        const visibleItems = items.slice(-8);
        const activeIndex = visibleItems.findIndex(item => item.state === 'running' || item.state === 'thinking');
        const timeline = document.createElement('section');
        timeline.className = 'theia-mobile-agent-premium-card theia-mobile-agent-activity-timeline';
        timeline.append(this.createTranscriptPremiumHead(
            'codicon-checklist',
            nls.localize('qaap/mobileProjects/transcriptActivityTimeline', 'Activity'),
            { count: visibleItems.length, variant: 'todos' },
        ));
        const list = document.createElement('ol');
        list.className = 'theia-mobile-agent-activity-list';
        visibleItems.forEach((item, index) => {
            const isActive = index === activeIndex;
            const li = document.createElement('li');
            li.className = `theia-mobile-agent-activity-item theia-mod-${item.state}${isActive ? ' theia-mod-active' : ''}`;
            li.append(
                this.createTranscriptActivityIcon(item.state, isActive),
                this.createTranscriptActivityLabel(item.label),
            );
            list.append(li);
        });
        timeline.append(list);
        return timeline;
    }

    protected createTranscriptActivityIcon(
        state: 'done' | 'running' | 'thinking',
        active: boolean,
    ): HTMLElement {
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-activity-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (active) {
            icon.classList.add('theia-mod-active');
            const arrow = document.createElement('span');
            arrow.className = 'codicon codicon-arrow-small-right';
            arrow.setAttribute('aria-hidden', 'true');
            icon.append(arrow);
            return icon;
        }
        if (state === 'done') {
            icon.classList.add('theia-mod-done', 'codicon', 'codicon-check');
            return icon;
        }
        icon.classList.add('theia-mod-pending');
        return icon;
    }

    protected createTranscriptActivityLabel(text: string): HTMLElement {
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-activity-label';
        label.textContent = text;
        return label;
    }

    /** Consistent card header: a muted leading codicon plus a label, shared by the premium cards. */
    protected createTranscriptPremiumHead(
        iconClass: string,
        label: string,
        options?: { readonly count?: number; readonly variant?: 'default' | 'todos' },
    ): HTMLElement {
        const head = document.createElement('div');
        head.className = 'theia-mobile-agent-premium-head';
        if (options?.variant === 'todos') {
            head.classList.add('theia-mod-todos');
        }
        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-premium-head-icon codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-agent-premium-head-label';
        text.textContent = label;
        head.append(icon, text);
        if (options?.count !== undefined) {
            const count = document.createElement('span');
            count.className = 'theia-mobile-agent-premium-head-count';
            count.textContent = String(options.count);
            head.append(count);
        }
        return head;
    }

    protected createTranscriptDiffSummaryCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const stats = this.resolveTranscriptDiffStats(segments);
        if (!stats || (stats.added === 0 && stats.removed === 0)) {
            return undefined;
        }
        const card = document.createElement('section');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-diff-summary';
        card.append(this.createTranscriptPremiumHead(
            'codicon-diff',
            nls.localize('qaap/mobileProjects/transcriptDiffSummary', 'Change summary'),
        ));
        const statsRow = document.createElement('div');
        statsRow.className = 'theia-mobile-agent-diff-stats';
        const added = document.createElement('span');
        added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
        added.textContent = `+${stats.added}`;
        const removed = document.createElement('span');
        removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
        removed.textContent = `-${stats.removed}`;
        statsRow.append(added, removed);
        card.append(statsRow);
        return card;
    }

    protected createTranscriptChangedFilesCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const files = this.resolveTranscriptChangedFiles(segments);
        if (files.length === 0) {
            return undefined;
        }
        const stats = this.resolveTranscriptDiffStats(segments);

        // Collapsible, GitHub-style card: a compact header (count + aggregate +/- stats) that
        // expands to the per-file list.
        const card = document.createElement('details');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-changed-files';

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-changed-files-summary';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-changed-files-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-changed-files-title';
        title.textContent = files.length === 1
            ? nls.localize('qaap/mobileProjects/transcriptChangedFilesOne', '{0} file changed', '1')
            : nls.localize('qaap/mobileProjects/transcriptChangedFilesCount', '{0} files changed', String(files.length));
        summary.append(chevron, title);
        if (stats && (stats.added > 0 || stats.removed > 0)) {
            const statsRow = document.createElement('span');
            statsRow.className = 'theia-mobile-agent-changed-files-stats';
            const added = document.createElement('span');
            added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
            added.textContent = `+${stats.added}`;
            const removed = document.createElement('span');
            removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
            removed.textContent = `-${stats.removed}`;
            statsRow.append(added, removed);
            summary.append(statsRow);
        }
        summary.append(this.createTranscriptChangedFilesReviewButton());
        card.append(summary);

        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-changed-files-list';
        for (const file of files.slice(0, 12)) {
            list.append(this.createTranscriptChangedFileRow(file));
        }
        if (files.length > 12) {
            const more = document.createElement('div');
            more.className = 'theia-mobile-agent-changed-files-more';
            more.textContent = nls.localize(
                'qaap/mobileProjects/transcriptChangedFilesMore',
                '+{0} more',
                String(files.length - 12),
            );
            list.append(more);
        }
        card.append(list);
        return card;
    }

    /** "Review" button in the changed-files header — jumps to the transcript's diff Review tab. */
    protected createTranscriptChangedFilesReviewButton(): HTMLButtonElement {
        const review = document.createElement('button');
        review.type = 'button';
        review.className = 'theia-mobile-agent-changed-files-review';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-compare';
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = nls.localize('qaap/mobileProjects/transcriptChangedFilesReview', 'Review');
        review.append(icon, label);
        review.addEventListener('click', event => {
            // Inside <summary>: stop the click from toggling the collapsible card.
            event.preventDefault();
            event.stopPropagation();
            const project = this.transcriptComposerProject;
            const convSummary = this.transcriptComposerSummary;
            if (project && convSummary) {
                this.selectTranscriptTab('review', project, convSummary);
            }
        });
        return review;
    }

    protected createTranscriptChangedFileRow(
        file: { readonly path: string; readonly kind: 'edited' | 'created' },
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-changed-file theia-mod-${file.kind}`;

        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-changed-file-icon codicon ${this.transcriptFileIconClass(file.path)}`;
        icon.setAttribute('aria-hidden', 'true');

        const info = document.createElement('span');
        info.className = 'theia-mobile-agent-changed-file-info';
        const slash = file.path.lastIndexOf('/');
        const name = document.createElement('span');
        name.className = 'theia-mobile-agent-changed-file-name';
        name.textContent = slash >= 0 ? file.path.slice(slash + 1) : file.path;
        info.append(name);
        if (slash > 0) {
            const dir = document.createElement('span');
            dir.className = 'theia-mobile-agent-changed-file-dir';
            dir.textContent = file.path.slice(0, slash);
            info.append(dir);
        }

        const badge = document.createElement('span');
        badge.className = `theia-mobile-agent-changed-file-badge theia-mod-${file.kind}`;
        badge.textContent = file.kind === 'created'
            ? nls.localize('qaap/mobileProjects/transcriptChangedFileNew', 'New')
            : nls.localize('qaap/mobileProjects/transcriptChangedFileEdited', 'Edited');

        row.append(icon, info, badge);
        return row;
    }

    /** Codicon for a changed-file row, derived from the file extension. */
    protected transcriptFileIconClass(path: string): string {
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
        if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'sh'].includes(ext)) {
            return 'codicon-file-code';
        }
        if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env'].includes(ext)) {
            return 'codicon-settings-gear';
        }
        if (['md', 'mdx', 'txt', 'rst'].includes(ext)) {
            return 'codicon-markdown';
        }
        if (['css', 'scss', 'less', 'html', 'svg'].includes(ext)) {
            return 'codicon-symbol-color';
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) {
            return 'codicon-file-media';
        }
        return 'codicon-file';
    }

    protected createTranscriptVerificationCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const checks = this.resolveTranscriptVerificationChecks(segments);
        if (checks.length === 0) {
            return undefined;
        }
        const card = document.createElement('section');
        card.className = 'theia-mobile-agent-premium-card theia-mobile-agent-verification';
        card.append(this.createTranscriptPremiumHead(
            'codicon-check-all',
            nls.localize('qaap/mobileProjects/transcriptVerification', 'Verification'),
        ));
        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-verification-list';
        for (const check of checks.slice(-4)) {
            const row = document.createElement('div');
            row.className = `theia-mobile-agent-verification-row theia-mod-${check.state}`;
            const state = document.createElement('span');
            state.className = 'theia-mobile-agent-verification-state';
            state.textContent = check.state === 'passed'
                ? nls.localize('qaap/mobileProjects/transcriptVerificationPassed', 'OK')
                : check.state === 'failed'
                    ? nls.localize('qaap/mobileProjects/transcriptVerificationFailed', 'Fail')
                    : nls.localize('qaap/mobileProjects/transcriptVerificationRunning', 'Run');
            const command = document.createElement('span');
            command.className = 'theia-mobile-agent-verification-command';
            command.textContent = check.command;
            row.append(state, command);
            list.append(row);
        }
        card.append(list);
        return card;
    }

    protected createTranscriptTechnicalDetailsCard(segments: QaapAgentMessageSegmentDTO[]): HTMLElement | undefined {
        const technical = segments.filter(segment => segment.type === 'thinking');
        if (technical.length === 0) {
            return undefined;
        }
        const details = document.createElement('details');
        details.className = 'theia-mobile-agent-technical-details';
        const summary = document.createElement('summary');
        summary.textContent = nls.localize(
            'qaap/mobileProjects/transcriptTechnicalDetails',
            'Technical details ({0})',
            String(technical.length),
        );
        details.append(summary);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-technical-details-body';
        for (const segment of technical) {
            body.append(this.createTranscriptSegmentDetails(segment));
        }
        details.append(body);
        return details;
    }

    protected resolveTranscriptActivityItems(
        segments: QaapAgentMessageSegmentDTO[],
        includeThinkingSteps = true,
    ): Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> {
        const items: Array<{ readonly label: string; readonly state: 'done' | 'running' | 'thinking' }> = [];
        for (const segment of segments) {
            if (segment.type === 'thinking' && segment.content.trim()) {
                if (includeThinkingSteps) {
                    items.push({
                        label: nls.localize('qaap/mobileProjects/transcriptActivityPlanning', 'Planning next steps'),
                        state: 'thinking',
                    });
                }
            } else if (segment.type === 'tool') {
                items.push({
                    label: this.localizeActivityLabel(formatToolActivityLabel(segment.name, segment.args)),
                    state: segment.finished ? 'done' : 'running',
                });
            }
        }
        if (segments.some(segment => segment.type === 'text' && segment.content.trim())) {
            items.push({
                label: nls.localize('qaap/mobileProjects/transcriptActivityResponseReady', 'Writing response'),
                state: 'done',
            });
        }
        return items;
    }

    protected resolveTranscriptChangedFiles(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly path: string; readonly kind: 'edited' | 'created' }> {
        const byPath = new Map<string, 'edited' | 'created'>();
        for (const segment of segments) {
            if (segment.type !== 'tool') {
                continue;
            }
            const kind = this.resolveTranscriptFileChangeKind(segment.name);
            if (!kind) {
                continue;
            }
            const path = this.extractTranscriptToolPath(segment.args);
            if (!path) {
                continue;
            }
            byPath.set(path, kind === 'created' ? 'created' : byPath.get(path) ?? 'edited');
        }
        return [...byPath.entries()].map(([path, kind]) => ({ path, kind }));
    }

    protected resolveTranscriptVerificationChecks(
        segments: QaapAgentMessageSegmentDTO[],
    ): Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> {
        const checks: Array<{ readonly command: string; readonly state: 'passed' | 'failed' | 'running' }> = [];
        for (const segment of segments) {
            if (segment.type !== 'tool' || !this.isTranscriptShellTool(segment.name)) {
                continue;
            }
            const command = this.extractTranscriptToolCommand(segment.args);
            if (!command || !this.isTranscriptVerificationCommand(command)) {
                continue;
            }
            checks.push({
                command: this.compactTranscriptCommand(command),
                state: !segment.finished ? 'running' : this.transcriptToolResultFailed(segment.result) ? 'failed' : 'passed',
            });
        }
        return checks;
    }

    protected resolveTranscriptDiffStats(
        segments: QaapAgentMessageSegmentDTO[],
    ): { readonly added: number; readonly removed: number } | undefined {
        let added = 0;
        let removed = 0;
        let found = false;
        for (const segment of segments) {
            const texts = segment.type === 'tool'
                ? [segment.args, segment.result ?? '']
                : [segment.content];
            for (const text of texts) {
                const parsed = parseDiffStatsFromText(this.cleanTranscriptDisplayText(text));
                if (parsed) {
                    added += parsed.added;
                    removed += parsed.removed;
                    found = true;
                }
            }
        }
        return found ? { added, removed } : undefined;
    }

    protected resolveTranscriptFileChangeKind(toolName: string): 'edited' | 'created' | undefined {
        const name = toolName.toLowerCase();
        if (name.includes('write') || name.includes('create')) {
            return 'created';
        }
        if (name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'edited';
        }
        return undefined;
    }

    protected extractTranscriptToolPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path ? this.compactTranscriptPath(path) : undefined;
        } catch {
            return undefined;
        }
    }

    protected extractTranscriptToolCommand(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            return typeof args.command === 'string' && args.command.trim() ? args.command.trim() : undefined;
        } catch {
            return undefined;
        }
    }

    protected isTranscriptShellTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_');
    }

    protected isTranscriptReadLikeTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        return name.includes('read') || name.includes('grep') || name.includes('glob') || name.includes('search') || name.includes('list');
    }

    protected isTranscriptVerificationCommand(command: string): boolean {
        return /\b(test|spec|check|lint|compile|build|typecheck|tsc|vitest|jest|mocha|playwright|pytest|cargo test|go test)\b/i.test(command);
    }

    protected transcriptToolResultFailed(result: string | undefined): boolean {
        if (!result?.trim()) {
            return false;
        }
        return /\b(error|failed|failure|exit\s+[1-9]\d*|code\s+[1-9]\d*)\b/i.test(result)
            && !/\b0\s+failed\b/i.test(result);
    }

    protected shouldOpenTranscriptToolDetails(segment: { readonly finished: boolean; readonly result?: string }): boolean {
        return shouldOpenTranscriptToolDetails({
            finished: segment.finished,
            resultFailed: this.transcriptToolResultFailed(segment.result),
        });
    }

    protected compactTranscriptCommand(command: string): string {
        const clean = command.replace(/\s+/g, ' ').trim();
        return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
    }

    protected formatTranscriptToolResult(result: string): string {
        return this.stripTranscriptLineNumberPrefixes(this.cleanTranscriptDisplayText(result));
    }

    protected stripTranscriptLineNumberPrefixes(text: string): string {
        const lines = text.split('\n');
        const stripped = lines.map(line => line.replace(/^\s*\d+[→:|]\s?/, ''));
        return stripped.some((line, index) => line !== lines[index]) ? stripped.join('\n') : text;
    }

    protected isTranscriptPureReadTool(toolName: string): boolean {
        const name = toolName.toLowerCase();
        if (name.includes('grep') || name.includes('search') || name.includes('glob')
            || name.includes('list') || name.includes('ls')) {
            return false;
        }
        return name === 'read' || name.endsWith('_read') || /\bread\b/.test(name);
    }

    protected extractTranscriptToolFullPath(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const path = typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                    ? args.file_path
                    : typeof args.filename === 'string'
                        ? args.filename
                        : undefined;
            return path?.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    protected splitTranscriptFilePath(path: string): { fileName: string; dirPath: string } {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        const fileName = parts.pop() ?? clean;
        const dirParts = parts.length > 3 ? parts.slice(-2) : parts;
        return { fileName, dirPath: dirParts.join('/') };
    }

    protected countTranscriptResultLines(result: string): number {
        const clean = this.stripTranscriptLineNumberPrefixes(this.cleanTranscriptDisplayText(result));
        return clean ? clean.split('\n').length : 0;
    }

    protected shouldShowTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        kind: string,
    ): boolean {
        if (!segment.result?.trim()) {
            return false;
        }
        if (this.isTranscriptPureReadTool(segment.name)) {
            return false;
        }
        return kind === 'searching' || kind === 'editing' || kind === 'tool';
    }

    protected compactTranscriptPath(path: string): string {
        const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
        const parts = clean.split('/').filter(Boolean);
        return parts.length > 3 ? parts.slice(-3).join('/') : clean;
    }

    protected createTranscriptSegmentDetails(segment: QaapAgentMessageSegmentDTO): HTMLElement {
        if (segment.type === 'thinking') {
            const details = document.createElement('details');
            details.className = 'theia-mobile-agent-transcript-details theia-mod-thinking';
            const summary = document.createElement('summary');
            summary.textContent = nls.localize('qaap/mobileProjects/transcriptThinking', 'Thinking');
            const pre = document.createElement('pre');
            pre.textContent = this.cleanTranscriptDisplayText(segment.content);
            details.append(summary, pre);
            return details;
        }
        if (segment.type === 'tool') {
            if (this.isTranscriptShellTool(segment.name)) {
                return this.createTranscriptShellDetails(segment);
            }
            return this.createTranscriptToolWindow(segment);
        }
        const block = document.createElement('div');
        block.className = 'theia-mobile-agent-transcript-content';
        this.renderTranscriptRichContent(block, segment.content);
        return block;
    }

    /**
     * Render preformatted output that clamps to a few preview lines when long, with an inline
     * expand/collapse toggle — used for tool results and terminal output so the transcript stays
     * compact but every line is one tap away.
     */
    protected createTranscriptClampedPre(text: string, className: string): HTMLElement {
        const pre = document.createElement('pre');
        pre.className = className;
        pre.textContent = text;
        return this.createTranscriptClampedBlock(pre, text.split('\n').length);
    }

    protected createTranscriptClampedBlock(content: HTMLElement, lineCount: number, previewLines = 4): HTMLElement {
        if (lineCount <= previewLines) {
            return content;
        }
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-agent-clamp';
        wrap.style.setProperty('--qaap-clamp-lines', String(previewLines));
        wrap.append(content);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-agent-clamp-toggle';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-clamp-chevron codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        const hiddenLines = lineCount - previewLines;
        const syncToggle = () => {
            const expanded = wrap.classList.contains('theia-mod-expanded');
            label.textContent = expanded
                ? nls.localize('qaap/mobileProjects/transcriptShowLess', 'Show less')
                : nls.localize('qaap/mobileProjects/transcriptShowMoreLines', 'Show {0} more lines', String(hiddenLines));
            chevron.classList.toggle('codicon-chevron-down', !expanded);
            chevron.classList.toggle('codicon-chevron-up', expanded);
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };
        syncToggle();
        toggle.append(chevron, label);
        toggle.addEventListener('click', () => {
            wrap.classList.toggle('theia-mod-expanded');
            syncToggle();
        });
        wrap.append(toggle);
        return wrap;
    }

    /** Minimal one-line read status: `Read file.ts L2505-2554`. */
    protected createTranscriptReadLine(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const line = document.createElement('div');
        line.className = 'theia-mobile-agent-read-line';
        if (!segment.finished) {
            line.classList.add('theia-mod-running');
        }
        const verb = document.createElement('span');
        verb.className = 'theia-mobile-agent-read-line-verb';
        verb.textContent = nls.localize('qaap/mobileProjects/transcriptToolRead', 'Read');
        const detail = document.createElement('span');
        detail.className = 'theia-mobile-agent-read-line-detail';
        detail.textContent = formatReadToolDetailFromArgs(segment.args)
            ?? (fullPath ? this.splitTranscriptFilePath(fullPath).fileName : '');
        line.append(verb, detail);
        if (fullPath) {
            this.attachTranscriptFileOpenAction(line, fullPath);
        }
        return line;
    }

    protected createTranscriptToolWindow(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const kind = this.resolveTranscriptToolKind(segment.name);
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const target = fullPath ? this.compactTranscriptPath(fullPath)
            : this.extractTranscriptToolShortArg(segment.args);
        const hasResult = !!segment.result?.trim();
        const showResultBody = this.shouldShowTranscriptToolResultBody(segment, kind);
        const pureRead = this.isTranscriptPureReadTool(segment.name);

        if (pureRead && !showResultBody) {
            return this.createTranscriptReadLine(segment);
        }

        const head = this.createTranscriptToolHead({
            kind,
            toolName: segment.name,
            fullPath,
            target,
            hasResult,
            showResultBody,
            pureRead,
            result: segment.result,
            finished: segment.finished,
        });

        const details = document.createElement('details');
        details.className = `theia-mobile-agent-tool-window theia-mod-${kind}`;
        details.open = this.shouldOpenTranscriptToolDetails(segment);
        details.classList.add(segment.finished ? 'theia-mod-done' : 'theia-mod-running');
        details.append(head);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-tool-body';
        body.append(this.createTranscriptToolResultBody(segment, kind));
        details.append(body);
        return details;
    }

    protected createTranscriptToolResultBody(
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        _kind: string,
    ): HTMLElement {
        const text = this.formatTranscriptToolResult(segment.result!);
        const fullPath = this.extractTranscriptToolFullPath(segment.args);
        const language = resolveTranscriptCodeLanguage(fullPath, text);
        const view = createTranscriptCodeView(text, language);
        return this.createTranscriptClampedBlock(view, text.split('\n').length);
    }

    protected handleTranscriptFileOpen(filePath: string): void {
        if (!this.openTranscriptFile) {
            return;
        }
        void Promise.resolve(this.openTranscriptFile(filePath)).catch(error => {
            console.warn('[qaap-mobile-shell] Failed to open transcript file:', error);
            this.messageService?.error(
                nls.localize('qaap/mobileProjects/transcriptOpenFileFailed', 'Could not open {0}', filePath),
            );
        });
    }

    protected attachTranscriptFileOpenAction(head: HTMLElement, filePath: string): void {
        if (!this.openTranscriptFile) {
            return;
        }
        head.classList.add('theia-mod-clickable');
        head.title = nls.localize('qaap/mobileProjects/transcriptOpenFile', 'Open in editor');
        head.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            this.handleTranscriptFileOpen(filePath);
        });
    }

    protected createTranscriptToolHead(options: {
        kind: string;
        toolName: string;
        fullPath?: string;
        target?: string;
        hasResult: boolean;
        showResultBody: boolean;
        pureRead: boolean;
        result?: string;
        finished: boolean;
    }): HTMLElement {
        const head = document.createElement(options.showResultBody ? 'summary' : 'div');
        head.className = 'theia-mobile-agent-tool-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-tool-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        if (!options.showResultBody) {
            chevron.hidden = true;
        }
        const icon = document.createElement('span');
        icon.className = `theia-mobile-agent-tool-icon codicon ${this.transcriptToolIconClass(options.kind)}`;
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'theia-mobile-agent-tool-title';
        title.textContent = this.transcriptToolVerb(options.kind, options.toolName);
        head.append(chevron, icon, title);
        if (options.fullPath && options.kind === 'reading') {
            const { fileName, dirPath } = this.splitTranscriptFilePath(options.fullPath);
            const fileNameEl = document.createElement('span');
            fileNameEl.className = 'theia-mobile-agent-tool-file-name';
            fileNameEl.textContent = fileName;
            head.append(fileNameEl);
            if (dirPath) {
                const dirEl = document.createElement('span');
                dirEl.className = 'theia-mobile-agent-tool-file-dir';
                dirEl.textContent = dirPath;
                head.append(dirEl);
            }
            if (!options.showResultBody) {
                this.attachTranscriptFileOpenAction(head, options.fullPath);
            }
        } else if (options.target) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-agent-tool-target';
            chip.textContent = options.target;
            head.append(chip);
        }
        if (options.hasResult && options.pureRead && options.result) {
            const lineCount = this.countTranscriptResultLines(options.result);
            if (lineCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'theia-mobile-agent-tool-badge';
                badge.textContent = lineCount === 1
                    ? nls.localize('qaap/mobileProjects/transcriptToolLineCountOne', '1 line')
                    : nls.localize('qaap/mobileProjects/transcriptToolLineCount', '{0} lines', String(lineCount));
                head.append(badge);
            }
        } else if (options.hasResult && options.kind === 'searching' && options.result) {
            const matchLines = this.countTranscriptResultLines(options.result);
            if (matchLines > 0) {
                const badge = document.createElement('span');
                badge.className = 'theia-mobile-agent-tool-badge theia-mod-muted';
                badge.textContent = matchLines === 1
                    ? nls.localize('qaap/mobileProjects/transcriptToolMatchCountOne', '1 match')
                    : nls.localize('qaap/mobileProjects/transcriptToolMatchCount', '{0} matches', String(matchLines));
                head.append(badge);
            }
        }
        const state = document.createElement('span');
        state.className = 'theia-mobile-agent-tool-state';
        state.setAttribute('aria-hidden', 'true');
        head.append(state);
        return head;
    }

    /** Codicon for a tool window header, by resolved tool kind. */
    protected transcriptToolIconClass(kind: string): string {
        switch (kind) {
            case 'reading': return 'codicon-file';
            case 'searching': return 'codicon-search';
            case 'editing': return 'codicon-edit';
            case 'terminal': return 'codicon-terminal';
            default: return 'codicon-tools';
        }
    }

    /** Human verb for a finished/running tool, e.g. "Read", "Edited", "Searched". */
    protected transcriptToolVerb(kind: string, toolName: string): string {
        switch (kind) {
            case 'reading': return nls.localize('qaap/mobileProjects/transcriptToolRead', 'Read');
            case 'searching': return nls.localize('qaap/mobileProjects/transcriptToolSearched', 'Searched');
            case 'editing': return nls.localize('qaap/mobileProjects/transcriptToolEdited', 'Edited');
            case 'terminal': return nls.localize('qaap/mobileProjects/transcriptToolRan', 'Ran');
            default: return toolName.replace(/_/g, ' ');
        }
    }

    protected transcriptShellStateAriaLabel(finished: boolean, failed: boolean): string {
        if (!finished) {
            return nls.localize('qaap/mobileProjects/transcriptShellRunning', 'running');
        }
        return failed
            ? nls.localize('qaap/mobileProjects/transcriptShellFailed', 'failed')
            : nls.localize('qaap/mobileProjects/transcriptShellDone', 'done');
    }

    /** Full shell-window text for clipboard: `$ command` plus any output block. */
    protected collectTranscriptShellBodyCopyText(body: HTMLElement): string {
        const parts: string[] = [];
        const command = body.querySelector('.theia-mobile-agent-shell-command code')?.textContent?.trim();
        if (command) {
            parts.push(`$ ${command}`);
        }
        const output = body.querySelector('.theia-mobile-agent-shell-output')?.textContent;
        if (output?.trim()) {
            if (parts.length) {
                parts.push('');
            }
            parts.push(output.trimEnd());
        }
        if (parts.length) {
            return parts.join('\n');
        }
        return body.textContent?.trim() ?? '';
    }

    protected appendTranscriptShellSummaryTail(
        summary: HTMLElement,
        options: { finished: boolean; failed: boolean; copyFrom?: () => string; copyLabel?: string },
    ): void {
        const tail = document.createElement('div');
        tail.className = 'theia-mobile-agent-shell-tail';
        const state = document.createElement('span');
        state.className = 'theia-mobile-agent-shell-state';
        state.setAttribute('role', 'status');
        state.setAttribute('aria-label', this.transcriptShellStateAriaLabel(options.finished, options.failed));
        tail.append(state);
        if (options.copyFrom) {
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'theia-mobile-agent-shell-copy codicon codicon-copy';
            const copyLabel = options.copyLabel
                ?? nls.localize('qaap/mobileProjects/transcriptShellCopy', 'Copy');
            copyBtn.setAttribute('aria-label', copyLabel);
            const tip = document.createElement('span');
            tip.className = 'theia-mobile-agent-shell-copy-tip';
            tip.setAttribute('role', 'tooltip');
            tip.textContent = nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied');
            copyBtn.append(tip);
            copyBtn.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();
                const text = options.copyFrom!().trim();
                if (text) {
                    void this.copyTranscriptShellText(text, copyBtn, tip, copyLabel);
                }
            });
            tail.append(copyBtn);
        }
        summary.append(tail);
    }

    protected async copyTranscriptShellText(
        text: string,
        copyBtn: HTMLButtonElement,
        tip: HTMLElement,
        copyLabel: string,
    ): Promise<void> {
        const copiedLabel = nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied');
        const failedLabel = nls.localize('qaap/mobileProjects/transcriptShellCopyFailed', 'Could not copy');
        try {
            await navigator.clipboard.writeText(text);
            this.flashTranscriptShellCopyTooltip(copyBtn, tip, copiedLabel, copyLabel, false);
        } catch {
            this.flashTranscriptShellCopyTooltip(copyBtn, tip, failedLabel, copyLabel, true);
        }
    }

    protected flashTranscriptShellCopyTooltip(
        copyBtn: HTMLButtonElement,
        tip: HTMLElement,
        message: string,
        copyLabel: string,
        failed: boolean,
    ): void {
        tip.textContent = message;
        copyBtn.classList.remove('theia-mod-copied', 'theia-mod-copy-failed');
        copyBtn.classList.add(failed ? 'theia-mod-copy-failed' : 'theia-mod-copied');
        copyBtn.setAttribute('aria-label', message);
        window.clearTimeout(copyBtn.dataset.copyTipTimerId ? Number(copyBtn.dataset.copyTipTimerId) : undefined);
        copyBtn.dataset.copyTipTimerId = String(window.setTimeout(() => {
            copyBtn.classList.remove('theia-mod-copied', 'theia-mod-copy-failed');
            copyBtn.setAttribute('aria-label', copyLabel);
            delete copyBtn.dataset.copyTipTimerId;
        }, 1400));
    }

    protected createTranscriptShellDetails(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): HTMLElement {
        const details = document.createElement('details');
        details.className = 'theia-mobile-agent-shell-window';
        const failed = this.transcriptToolResultFailed(segment.result);
        details.open = this.shouldOpenTranscriptToolDetails(segment);
        if (segment.finished) {
            details.classList.add(failed ? 'theia-mod-failed' : 'theia-mod-done');
        } else {
            details.classList.add('theia-mod-running');
        }

        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-shell-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-shell-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-shell-icon';
        icon.textContent = '>_';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-shell-title';
        const command = this.extractTranscriptToolCommand(segment.args)
            ?? this.cleanTranscriptDisplayText(segment.args);
        label.textContent = command && command !== '{}'
            ? this.compactTranscriptCommand(command)
            : nls.localize('qaap/mobileProjects/transcriptShell', 'Shell');
        summary.append(chevron, icon, label);

        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-shell-body';
        const commandLine = document.createElement('div');
        commandLine.className = 'theia-mobile-agent-shell-command';
        const prompt = document.createElement('span');
        prompt.className = 'theia-mobile-agent-shell-prompt';
        prompt.textContent = '$';
        const commandText = document.createElement('code');
        commandText.textContent = command;
        commandLine.append(prompt, commandText);
        body.append(commandLine);
        if (segment.result?.trim()) {
            body.append(this.createTranscriptClampedPre(
                this.formatTranscriptToolResult(segment.result),
                'theia-mobile-agent-shell-output',
            ));
        }
        this.appendTranscriptShellSummaryTail(summary, {
            finished: segment.finished,
            failed,
            copyFrom: () => this.collectTranscriptShellBodyCopyText(body),
        });
        details.append(summary, body);
        return details;
    }

    protected createTranscriptStreamingActivityRow(conv: QaapAgentConversationDTO): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent theia-mod-streaming theia-mobile-agent-activity';
        const state = this.resolveTranscriptStreamingActivity(conv);

        // A single, live "thinking/acting" line — minimalist, with an animated dot and a shimmering
        // label that reflects what the agent is doing right now.
        const line = document.createElement('div');
        line.className = `theia-mobile-agent-stream-line theia-mod-${state.kind}`;
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-agent-stream-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-stream-label';
        label.textContent = `${state.title}…`;
        line.append(dot, label);
        row.append(line);
        return row;
    }

    protected resolveTranscriptStreamingActivity(conv: QaapAgentConversationDTO): { kind: string; title: string; detail: string } {
        const lastAgent = [...conv.messages].reverse().find(message => message.role === 'agent');
        const segments = lastAgent?.segments ?? [];
        const activeTool = [...segments].reverse().find((segment): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> =>
            segment.type === 'tool' && !segment.finished);
        if (activeTool) {
            const label = this.localizeActivityLabel(formatToolActivityLabel(activeTool.name, activeTool.args));
            return {
                kind: this.resolveTranscriptToolKind(activeTool.name),
                title: label,
                detail: this.resolveTranscriptToolDetail(activeTool),
            };
        }
        const hasText = segments.some(segment => segment.type === 'text' && segment.content.trim().length > 0);
        if (hasText) {
            return {
                kind: 'writing',
                title: nls.localize('qaap/mobileProjects/transcriptActivityWriting', 'Writing the response'),
                detail: nls.localize('qaap/mobileProjects/transcriptActivityWritingDetail', 'Composing the next visible update.'),
            };
        }
        const hasThinking = segments.some(segment => segment.type === 'thinking' && segment.content.trim().length > 0);
        if (hasThinking) {
            return {
                kind: 'thinking',
                title: nls.localize('qaap/mobileProjects/transcriptActivityThinking', 'Thinking'),
                detail: nls.localize('qaap/mobileProjects/transcriptActivityThinkingDetail', 'Planning the next step before changing anything.'),
            };
        }
        return {
            kind: 'starting',
            title: nls.localize('qaap/mobileProjects/transcriptActivityStarting', 'Starting the turn'),
            detail: nls.localize('qaap/mobileProjects/transcriptActivityStartingDetail', 'Preparing context and selecting the next action.'),
        };
    }

    protected resolveTranscriptToolKind(toolName: string): string {
        const name = toolName.toLowerCase();
        if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
            return 'terminal';
        }
        if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
            return 'editing';
        }
        if (name.includes('grep') || name.includes('search') || name.includes('glob')) {
            return 'searching';
        }
        if (name.includes('read') || name.includes('list') || name.includes('ls')) {
            return 'reading';
        }
        return 'tool';
    }

    protected resolveTranscriptToolDetail(segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>): string {
        const name = segment.name.replace(/_/g, ' ');
        const shortArgs = this.extractTranscriptToolShortArg(segment.args);
        return shortArgs
            ? nls.localize('qaap/mobileProjects/transcriptActivityToolDetailWithArgs', '{0}: {1}', name, shortArgs)
            : nls.localize('qaap/mobileProjects/transcriptActivityToolDetail', 'Calling {0}', name);
    }

    protected extractTranscriptToolShortArg(argsJson: string): string | undefined {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const value = typeof args.command === 'string' ? args.command
                : typeof args.path === 'string' ? args.path
                    : typeof args.file_path === 'string' ? args.file_path
                        : typeof args.pattern === 'string' ? args.pattern
                            : typeof args.query === 'string' ? args.query
                                : undefined;
            if (!value?.trim()) {
                return undefined;
            }
            const clean = value.trim().replace(/\s+/g, ' ');
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        } catch {
            const clean = argsJson.trim().replace(/\s+/g, ' ');
            if (!clean || clean === '{}') {
                return undefined;
            }
            return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
        }
    }

    protected createTranscriptUserMessageRow(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-agent-transcript-user-wrap';
        wrap.dataset.messageId = msg.id;

        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-user';
        const contentEl = document.createElement('div');
        contentEl.className = 'theia-mobile-agent-transcript-content';
        const displayContent = normalizeAgentMessageContentForDisplay(msg.content);
        this.renderTranscriptRichContent(contentEl, displayContent);
        row.append(contentEl);
        if (msg.error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = msg.error;
            row.append(err);
        }
        wrap.append(row);

        const plainText = this.cleanTranscriptDisplayText(displayContent).trim();
        const summary = this.transcriptComposerSummary;
        const isTheiaChat = summary?.source === 'theia-chat';
        const actionsEnabled = conv.status !== 'streaming' && !msg.id.startsWith('pending-user-');

        wrap.append(this.createTranscriptUserMessageActions({
            plainText,
            canEdit: actionsEnabled,
            canUndo: actionsEnabled && !isTheiaChat,
            onEdit: () => { void this.editTranscriptUserMessage(msg, conv); },
            onCopy: () => { void this.copyTranscriptUserMessage(plainText); },
            onUndo: () => { void this.undoTranscriptUserMessage(msg, conv); },
        }));
        return wrap;
    }

    protected createTranscriptUserMessageActions(options: {
        plainText: string;
        canEdit: boolean;
        canUndo: boolean;
        onEdit: () => void;
        onCopy: () => void;
        onUndo: () => void;
    }): HTMLElement {
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-agent-transcript-user-actions';

        const editLabel = nls.localize('qaap/mobileProjects/transcriptUserEdit', 'Edit');
        const copyLabel = nls.localize('qaap/mobileProjects/transcriptUserCopy', 'Copy');
        const undoLabel = nls.localize('qaap/mobileProjects/transcriptUserUndo', 'Undo');

        const editBtn = this.createTranscriptUserActionButton('edit', editLabel, 'codicon-edit', options.onEdit);
        editBtn.disabled = !options.canEdit || !options.plainText;
        const copyBtn = this.createTranscriptUserActionButton('copy', copyLabel, 'codicon-copy', options.onCopy);
        copyBtn.disabled = !options.plainText;
        const undoBtn = this.createTranscriptUserActionButton('undo', undoLabel, 'codicon-discard', options.onUndo);
        undoBtn.disabled = !options.canUndo;

        actions.append(editBtn, copyBtn, undoBtn);
        return actions;
    }

    protected createTranscriptUserActionButton(
        action: 'edit' | 'copy' | 'undo',
        label: string,
        iconClass: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `theia-mobile-agent-transcript-user-action theia-mod-${action}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = `<span class="codicon ${iconClass}" aria-hidden="true"></span><span class="theia-mobile-agent-transcript-user-action-label">${label}</span>`;
        button.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            onClick();
        });
        return button;
    }

    protected async copyTranscriptUserMessage(text: string): Promise<void> {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        try {
            if (this.previewClipboard) {
                await this.previewClipboard.writeText(trimmed);
            } else {
                await navigator.clipboard.writeText(trimmed);
            }
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptShellCopied', 'Copied'), { kind: 'success', duration: 1800 });
        } catch {
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptShellCopyFailed', 'Could not copy'), { kind: 'warning' });
        }
    }

    protected async editTranscriptUserMessage(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        const summary = this.transcriptComposerSummary;
        if (!summary || this.transcriptOpenSummaryId !== conv.id) {
            return;
        }
        const plainText = this.cleanTranscriptDisplayText(normalizeAgentMessageContentForDisplay(msg.content)).trim();
        if (!plainText) {
            return;
        }
        if (summary.source === 'theia-chat') {
            this.transcriptComposerDraft = plainText;
            this.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
            return;
        }
        try {
            const updated = await rewindConversationToMessage(conv.id, msg.id);
            this.conversations?.recordSnapshot(conversationToSummary(updated));
            this.transcriptLastFingerprint = undefined;
            if (this.transcriptChatHost) {
                this.renderTranscriptMessages(this.transcriptChatHost, updated);
            }
            this.transcriptComposerDraft = plainText;
            this.remountTranscriptStickyComposer();
            this.focusTranscriptComposerInput();
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }

    protected async undoTranscriptUserMessage(
        msg: QaapAgentMessageDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void> {
        const summary = this.transcriptComposerSummary;
        if (!summary || this.transcriptOpenSummaryId !== conv.id || summary.source === 'theia-chat') {
            return;
        }
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/transcriptUndoTitle', 'Undo message'),
            msg: nls.localize(
                'qaap/mobileProjects/transcriptUndoMsg',
                'Remove this message and everything after it? Tracked files may revert to the previous checkpoint.',
            ),
            ok: nls.localize('qaap/mobileProjects/transcriptUserUndo', 'Undo'),
            cancel: nls.localize('qaap/mobileProjects/parallelCancel', 'Back'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            const updated = await rewindConversationToMessage(conv.id, msg.id);
            this.conversations?.recordSnapshot(conversationToSummary(updated));
            this.transcriptLastFingerprint = undefined;
            if (this.transcriptChatHost) {
                this.renderTranscriptMessages(this.transcriptChatHost, updated);
            }
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/transcriptUndoDone', 'Message undone'), { kind: 'success', duration: 2200 });
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }

    protected focusTranscriptComposerInput(): void {
        window.requestAnimationFrame(() => {
            const input = this.transcriptComposerHost?.querySelector<HTMLTextAreaElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            if (!input) {
                return;
            }
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
    }

    /** Plain DOM fallback when {@link ChatViewWidget} is unavailable. */
    protected createTranscriptMessageRow(
        role: 'user' | 'agent',
        content: string,
        error?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-transcript-msg theia-mod-${role}`;
        // Ownership is conveyed by alignment and the bubble surface, so no redundant "You" label.
        const contentEl = document.createElement('div');
        contentEl.className = 'theia-mobile-agent-transcript-content';
        this.renderTranscriptRichContent(contentEl, normalizeAgentMessageContentForDisplay(content));
        row.append(contentEl);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    protected renderTranscriptRichContent(host: HTMLElement, content: string): void {
        const clean = this.cleanTranscriptDisplayText(content).trim();
        if (isTranscriptTerminalOutputText(clean)) {
            host.append(this.createTranscriptTextTerminalWindow(clean));
            return;
        }
        host.classList.add('theia-mod-markdown');
        this.renderTranscriptMarkdown(host, clean);
    }

    protected createTranscriptTextTerminalWindow(content: string): HTMLElement {
        const details = document.createElement('details');
        const failed = isTranscriptErrorOutput(content);
        details.className = `theia-mobile-agent-shell-window ${failed ? 'theia-mod-failed' : 'theia-mod-done'} theia-mod-text-output`;
        details.open = shouldOpenTranscriptToolDetails({ finished: true, resultFailed: failed });
        const cleanContent = this.cleanTranscriptDisplayText(content);
        const summary = document.createElement('summary');
        summary.className = 'theia-mobile-agent-shell-head';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-agent-shell-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-agent-shell-icon';
        icon.textContent = '>_';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agent-shell-title';
        label.textContent = failed
            ? nls.localize('qaap/mobileProjects/transcriptErrorOutput', 'Error output')
            : nls.localize('qaap/mobileProjects/transcriptTerminalOutput', 'Terminal output');
        summary.append(chevron, icon, label);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-shell-body';
        body.append(this.createTranscriptClampedPre(cleanContent, 'theia-mobile-agent-shell-output'));
        this.appendTranscriptShellSummaryTail(summary, {
            finished: true,
            failed,
            copyFrom: () => this.collectTranscriptShellBodyCopyText(body),
        });
        details.append(summary, body);
        return details;
    }

    protected renderTranscriptMarkdown(host: HTMLElement, content: string): void {
        const html = this.transcriptMarkdownIt.render(this.linkifyTranscriptPreviewUrls(this.cleanTranscriptDisplayText(content)));
        host.innerHTML = DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true,
        });
        host.addEventListener('click', event => {
            let target = event.target as HTMLElement | null;
            while (target && target.tagName !== 'A') {
                target = target.parentElement;
            }
            if (!target) {
                return;
            }
            const href = target.getAttribute('href');
            if (!href) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void this.openTranscriptPreviewUrlFromLink(href).then(handled => {
                if (!handled) {
                    window.open(href, '_blank', 'noopener');
                }
            });
        });
    }

    protected linkifyTranscriptPreviewUrls(content: string): string {
        return content.replace(
            /(^|[\s(])((?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):\d{2,5}(?:\/[^\s\x60<)]*)?|\/qaap-dev\/\d{2,5}(?:\/[^\s\x60<)]*)?)/gi,
            (match, prefix: string, url: string, offset: number) => {
                const before = content.slice(0, offset);
                if (/\[[^\]]*$/.test(before) || /\]\([^)]*$/.test(before)) {
                    return match;
                }
                return prefix + '[' + url + '](' + url + ')';
            },
        );
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

    protected cleanTranscriptDisplayText(content: string): string {
        return content
            .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
            .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
    }

    protected conversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
        const last = conv.messages[conv.messages.length - 1];
        const segmentCount = last?.segments?.length ?? 0;
        const lastSegment = last?.segments?.[segmentCount - 1];
        const segmentTail = lastSegment && 'content' in lastSegment ? lastSegment.content.length : 0;
        const segmentState = lastSegment?.type === 'tool'
            ? `${lastSegment.name}:${lastSegment.finished ? '1' : '0'}:${lastSegment.args.length}:${lastSegment.result?.length ?? 0}`
            : lastSegment?.type === 'thinking' || lastSegment?.type === 'text'
                ? `${lastSegment.type}:${lastSegment.content.length}`
                : '';
        return `${conv.autoApprove === false ? '0' : '1'}|${conv.status}|${conv.updatedAt}|${conv.messages.length}|${last?.id ?? ''}|${last?.content?.length ?? 0}|${segmentCount}|${segmentTail}|${segmentState}`;
    }

    protected shouldRefreshOpenTranscript(project: MobileProjectEntry, conversationId: string): boolean {
        if (this.transcriptOpenSummaryId !== conversationId) {
            return false;
        }
        const latest = this.conversationsForProject(project).find(c => c.id === conversationId);
        return latest?.status === 'streaming' || (!!latest && this.transcriptPreviewRequestPending);
    }

    protected watchOpenTranscriptUntilIdle(project: MobileProjectEntry, conversationId: string): void {
        if (!this.conversations || !this.transcriptScheduleRefresh || this.transcriptOpenSummaryId !== conversationId) {
            return;
        }
        this.setTranscriptLiveUpdates(this.conversations.onDidChange(() => {
            if (this.shouldRefreshOpenTranscript(project, conversationId)) {
                this.transcriptScheduleRefresh?.();
            } else {
                this.setTranscriptLiveUpdates(Disposable.NULL);
            }
        }));
        this.transcriptScheduleRefresh();
    }

    /** Close the open Agents session but keep the in-panel execution shell (tabs + surfaces). */
    protected closeAgentsHubSession(): void {
        this.closeExecutionTabOverflowMenu();
        this.closeTranscriptComposerSheets();
        this.transcriptComposerHost = undefined;
        this.transcriptComposerProject = undefined;
        this.transcriptComposerSummary = undefined;
        this.transcriptComposerContext = [];
        this.transcriptComposerPinnedAgentId = undefined;
        this.transcriptComposerModeId = undefined;
        this.transcriptComposerDraft = '';
        this.agentsHubInlineActive = false;
        this.transcriptOpenSummaryId = undefined;
        this.transcriptOpenSummary = undefined;
        this.transcriptOpenProject = undefined;
        this.transcriptLastFingerprint = undefined;
        this.transcriptLastConv = undefined;
        this.transcriptLastStatus = undefined;
        this.transcriptTheiaSessionByConversationId.clear();
        if (this.transcriptRefreshTimer !== undefined) {
            window.clearTimeout(this.transcriptRefreshTimer);
            this.transcriptRefreshTimer = undefined;
        }
        this.transcriptScheduleRefresh = undefined;
        this.setTranscriptLiveUpdates(Disposable.NULL);
        const chatHost = this.agentsHubInlineChatHost;
        const project = this.resolveAgentsHubShellProject();
        if (chatHost && project && this.agentsHubShellActive) {
            this.renderAgentsHubShellChat(chatHost, project, this.resolveAgentsHubShellSummary(project));
        } else if (chatHost) {
            chatHost.replaceChildren();
        }
        if (this.visible) {
            this.renderHeader();
            this.renderSubtitle();
            this.renderList();
        }
        if (!this.replacingTranscriptSheet) {
            this.notifyWorkspaceHubBottomBarRefresh();
        }
    }

    protected closeTranscriptSheet(): void {
        this.closeExecutionTabOverflowMenu();
        this.ensureOverlayUi().parallel.closeSheet();
        this.closeTranscriptComposerSheets();
        this.transcriptComposerHost = undefined;
        this.transcriptComposerProject = undefined;
        this.transcriptComposerSummary = undefined;
        this.transcriptComposerContext = [];
        this.transcriptComposerPinnedAgentId = undefined;
        this.transcriptComposerModeId = undefined;
        this.transcriptComposerDraft = '';

        const wasAgentsHubInline = this.agentsHubInlineActive;
        const preserveAgentsShell = wasAgentsHubInline && this.shouldUseAgentsHubLanding();
        if (preserveAgentsShell) {
            this.closeAgentsHubSession();
            if (!this.transcriptSheet) {
                return;
            }
        } else if (wasAgentsHubInline && !this.shouldUseAgentsHubLanding()) {
            this.teardownAgentsHubExecutionShell();
        }

        const sheet = this.transcriptSheet;
        const sheetWasOnBody = sheet?.parentElement === document.body;
        this.transcriptSheet = undefined;
        this.transcriptOpenSummaryId = undefined;
        this.transcriptOpenSummary = undefined;
        this.transcriptOpenProject = undefined;
        this.transcriptLastFingerprint = undefined;
        this.transcriptLastConv = undefined;
        this.transcriptChatHost = undefined;
        this.transcriptChatInputHost = undefined;
        this.transcriptTabStrip = undefined;
        this.transcriptHeaderSubtitle = undefined;
        this.transcriptPlanHost = undefined;
        this.detachTranscriptReviewWidget();
        this.transcriptReviewHost = undefined;
        this.transcriptPreviewHost = undefined;
        this.disposeTranscriptEmbeddedPreview();
        this.detachTranscriptWorkspaceSurfacesFromSheet();
        this.transcriptFilesHost = undefined;
        this.transcriptTerminalHost = undefined;
        this.transcriptTerminalToolbar = undefined;
        this.transcriptTerminalSlider = undefined;
        this.transcriptTerminalDots = undefined;
        this.transcriptPreviewRequestRunning = false;
        this.transcriptPreviewRequestPending = false;
        this.verifyResults = [];
        this.verifyChecksCwd = undefined;
        this.verifyChecksLoading = false;
        this.verifyRunning = false;
        this.verifyAutoAttempts = 0;
        this.transcriptLastStatus = undefined;
        if (this.visible) {
            this.renderHeader();
            this.renderSubtitle();
            this.renderList();
        }

        if (this.transcriptRefreshTimer !== undefined) {
            window.clearTimeout(this.transcriptRefreshTimer);
            this.transcriptRefreshTimer = undefined;
        }
        this.transcriptScheduleRefresh = undefined;
        this.setTranscriptLiveUpdates(Disposable.NULL);
        this.transcriptUserScrollPinDispose.dispose();
        this.transcriptUserScrollPinDispose = Disposable.NULL;
        this.transcriptSheetDispose.dispose();
        this.transcriptSheetDispose = Disposable.NULL;
        this.transcriptTheiaSessionByConversationId.clear();

        sheet?.remove();
        if (sheetWasOnBody) {
            if (!this.replacingTranscriptSheet) {
                setMobileActiveTranscriptChrome(false);
                this.delegate.onExitActiveTranscript?.();
            }
            this.notifyWorkspaceHubBottomBarRefresh();
        } else if (wasAgentsHubInline && !this.replacingTranscriptSheet) {
            this.notifyWorkspaceHubBottomBarRefresh();
        }

        const inputWidget = this.transcriptChatInputWidget;
        const viewWidget = this.transcriptChatViewWidget;
        this.transcriptChatInputWidget = undefined;
        this.transcriptChatViewWidget = undefined;
        if (!inputWidget && !viewWidget) {
            return;
        }
        window.setTimeout(() => {
            if (inputWidget && !inputWidget.isDisposed) {
                inputWidget.dispose();
            }
            if (viewWidget && !viewWidget.isDisposed) {
                viewWidget.dispose();
            }
        }, 0);
    }


    /** Sheet overlay only — home dashboard stays visible until the workspace reloads. */
    protected dismissPanelIfSheet(): void {
        if (this.homeMode) {
            return;
        }
        this.hide();
        this.delegate.onDismiss();
    }
}
