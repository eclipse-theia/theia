// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import type { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import type { EmbeddedAgentPreviewChrome } from '@theia/qaap-adapters/lib/browser/qaap-agent-preview-chrome';
import type { Widget } from '@lumino/widgets';
import {
    type QaapAgentApprovalPolicyId,
    type QaapAgentApprovalRequestDTO,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentTaskAgentOption,
    type QaapAgentToolApprovalRules,
    type QaapGitHistoryCommit,
    type QaapQaiqModelOption,
    type StickyComposerContextEntry,
} from '../common/qaap-transcript-agent-types';
import { TranscriptFollowUpQueue } from '../common/qaap-transcript-follow-up-queue';
import type { MobileProjectEntry } from '../common/qaap-transcript-project-entry';
import type { TranscriptTerminalSurface } from './qaap-transcript-surface-types';
import {
    TranscriptWorkspaceSurfacesCache,
    type TranscriptWorkspaceSurfaceKey,
} from './qaap-transcript-workspace-surfaces-cache';

interface TranscriptTerminalSliderState {
    surfaces: TranscriptTerminalSurface[];
    activeIndex: number;
}

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

/** Every {@link TranscriptOverlayState} field — explicit list (Object.keys misses uninitialized class fields). */
export const TRANSCRIPT_OVERLAY_STATE_KEYS = [
    'replacingTranscriptSheet',
    'transcriptComposerHost',
    'transcriptComposerMountKey',
    'transcriptComposerProject',
    'transcriptComposerSummary',
    'transcriptComposerContext',
    'transcriptComposerFilesExpanded',
    'transcriptComposerQueueExpanded',
    'transcriptComposerChangedFilesExpandedById',
    'transcriptComposerPinnedAgentId',
    'transcriptComposerDraft',
    'transcriptFollowUpQueue',
    'transcriptFollowUpFlushInFlight',
    'transcriptComposerSendRefresh',
    'transcriptComposerBackendAgents',
    'transcriptComposerQaiqModels',
    'transcriptComposerAgentSheet',
    'transcriptComposerQaiqModelSheet',
    'transcriptComposerModeSheet',
    'transcriptComposerApprovalSheet',
    'transcriptComposerModeId',
    'transcriptComposerApprovalPolicyId',
    'transcriptComposerToolApprovalRules',
    'transcriptComposerPrefsConvId',
    'transcriptComposerDraftPersistTimer',
    'transcriptComposerPrefsPersistTimer',
    'transcriptChatInputWidget',
    'transcriptChatViewWidget',
    'transcriptScheduleRefresh',
    'transcriptLastRenderedConversationId',
    'transcriptLastRenderedMessageId',
    'transcriptLastSseDeltaAt',
    'transcriptApprovalRefreshTimer',
    'cachedAgentApprovals',
    'transcriptChatHost',
    'transcriptChatInputHost',
    'transcriptComposerSizeDispose',
    'transcriptTabStrip',
    'transcriptPlanHost',
    'transcriptReviewHost',
    'transcriptReviewDiffHost',
    'transcriptReviewChecksHost',
    'transcriptChecksPanelOpen',
    'transcriptHistoryPanelOpen',
    'transcriptHistoryPanelHeightPx',
    'transcriptHistoryLoading',
    'transcriptHistoryCommits',
    'transcriptHistoryBranch',
    'transcriptHistoryQuery',
    'transcriptHistoryRoot',
    'transcriptHistoryLoadGeneration',
    'transcriptPreviewHost',
    'transcriptEmbeddedPreview',
    'transcriptFilesHost',
    'transcriptTerminalHost',
    'transcriptTerminalToolbar',
    'transcriptTerminalSlider',
    'transcriptTerminalDots',
    'transcriptTerminalResizeObserver',
    'transcriptWorkspaceSurfaces',
    'transcriptFilesAttachedKey',
    'transcriptTerminalSlidesByWorkspace',
    'transcriptPreviewRequestRunning',
    'transcriptPreviewRequestPending',
    'transcriptPreviewRecoveryRequests',
    'diffReviewWidget',
    'projectDetailSurfaceTargets',
    'verifyRunning',
    'verifyResults',
    'verifyChecksCwd',
    'verifyChecksLoading',
    'verifyAutoAttempts',
    'transcriptLastStatus',
    'transcriptOpenSummaryId',
    'transcriptOpenSummary',
    'transcriptOpenProject',
    'transcriptAutoApproveBusy',
    'transcriptLastFingerprint',
    'transcriptLastConv',
    'transcriptTheiaSessionByConversationId',
    'stickyComposerContextUsageDispose',
    'transcriptSheet',
    'transcriptHeaderSubtitle',
    'transcriptSheetDispose',
    'transcriptUserScrollPinDispose',
] as const satisfies readonly (keyof TranscriptOverlayState)[];

const READONLY_TRANSCRIPT_OVERLAY_STATE_KEYS = new Set<keyof TranscriptOverlayState>([
    'transcriptComposerChangedFilesExpandedById',
    'transcriptFollowUpQueue',
    'transcriptWorkspaceSurfaces',
    'transcriptTerminalSlidesByWorkspace',
    'transcriptPreviewRecoveryRequests',
    'transcriptTheiaSessionByConversationId',
]);

/**
 * Mutable transcript overlay state extracted from `MobileProjectsPanel` (Phase 2).
 * Panel exposes each field via accessors installed by {@link bindTranscriptOverlayStateAccessors}.
 */
export class TranscriptOverlayState {
    replacingTranscriptSheet = false;
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerMountKey: string | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerContext: StickyComposerContextEntry[] = [];
    transcriptComposerFilesExpanded = true;
    transcriptComposerQueueExpanded = true;
    readonly transcriptComposerChangedFilesExpandedById = new Map<string, boolean>();
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerDraft = '';
    readonly transcriptFollowUpQueue = new TranscriptFollowUpQueue();
    transcriptFollowUpFlushInFlight = false;
    transcriptComposerSendRefresh: (() => void) | undefined;
    transcriptComposerBackendAgents: QaapAgentTaskAgentOption[] = [];
    transcriptComposerQaiqModels: QaapQaiqModelOption[] = [];
    transcriptComposerAgentSheet: HTMLElement | undefined;
    transcriptComposerQaiqModelSheet: HTMLElement | undefined;
    transcriptComposerModeSheet: HTMLElement | undefined;
    transcriptComposerApprovalSheet: HTMLElement | undefined;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerDraftPersistTimer: number | undefined;
    transcriptComposerPrefsPersistTimer: number | undefined;
    transcriptChatInputWidget: AIChatInputWidget | undefined;
    transcriptChatViewWidget: AIChatInputWidget | undefined;
    transcriptScheduleRefresh: (() => void) | undefined;
    transcriptLastRenderedConversationId: string | undefined;
    transcriptLastRenderedMessageId: string | undefined;
    transcriptLastSseDeltaAt: number | undefined;
    transcriptApprovalRefreshTimer: number | undefined;
    cachedAgentApprovals: QaapAgentApprovalRequestDTO[] = [];
    transcriptChatHost: HTMLElement | undefined;
    transcriptChatInputHost: HTMLElement | undefined;
    transcriptComposerSizeDispose: Disposable = Disposable.NULL;
    transcriptTabStrip: HTMLElement | undefined;
    transcriptPlanHost: HTMLElement | undefined;
    transcriptReviewHost: HTMLElement | undefined;
    transcriptReviewDiffHost: HTMLElement | undefined;
    transcriptReviewChecksHost: HTMLElement | undefined;
    transcriptChecksPanelOpen = false;
    transcriptHistoryPanelOpen = false;
    transcriptHistoryPanelHeightPx: number | undefined;
    transcriptHistoryLoading = false;
    transcriptHistoryCommits: QaapGitHistoryCommit[] = [];
    transcriptHistoryBranch: string | undefined;
    transcriptHistoryQuery = '';
    transcriptHistoryRoot: string | undefined;
    transcriptHistoryLoadGeneration = 0;
    transcriptPreviewHost: HTMLElement | undefined;
    transcriptEmbeddedPreview: EmbeddedAgentPreviewChrome | undefined;
    transcriptFilesHost: HTMLElement | undefined;
    transcriptTerminalHost: HTMLElement | undefined;
    transcriptTerminalToolbar: HTMLElement | undefined;
    transcriptTerminalSlider: HTMLElement | undefined;
    transcriptTerminalDots: HTMLElement | undefined;
    transcriptTerminalResizeObserver: ResizeObserver | undefined;
    readonly transcriptWorkspaceSurfaces = new TranscriptWorkspaceSurfacesCache();
    transcriptFilesAttachedKey: TranscriptWorkspaceSurfaceKey | undefined;
    readonly transcriptTerminalSlidesByWorkspace = new Map<TranscriptWorkspaceSurfaceKey, TranscriptTerminalSliderState>();
    transcriptPreviewRequestRunning = false;
    transcriptPreviewRequestPending = false;
    readonly transcriptPreviewRecoveryRequests = new Set<string>();
    diffReviewWidget: Widget | undefined;
    projectDetailSurfaceTargets: {
        readonly chatHost: HTMLElement;
        readonly planHost: HTMLElement;
        readonly reviewHost: HTMLElement;
        readonly previewHost: HTMLElement;
        readonly filesHost: HTMLElement;
        readonly terminalHost: HTMLElement;
    } | undefined;
    verifyRunning = false;
    verifyResults: VerifyCheckResult[] = [];
    verifyChecksCwd: string | undefined;
    verifyChecksLoading = false;
    verifyAutoAttempts = 0;
    transcriptLastStatus: QaapAgentConversationSummaryDTO['status'] | undefined;
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptAutoApproveBusy = false;
    transcriptLastFingerprint: string | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    readonly transcriptTheiaSessionByConversationId = new Map<string, string>();
    stickyComposerContextUsageDispose: Disposable = Disposable.NULL;
    transcriptSheet: HTMLElement | undefined;
    transcriptHeaderSubtitle: HTMLElement | undefined;
    transcriptSheetDispose: Disposable = Disposable.NULL;
    transcriptUserScrollPinDispose: Disposable = Disposable.NULL;
}

/** Installs panel-level getters/setters that delegate to a {@link TranscriptOverlayState} bag. */
export function bindTranscriptOverlayStateAccessors(panel: object, state: TranscriptOverlayState): void {
    for (const key of TRANSCRIPT_OVERLAY_STATE_KEYS) {
        if (READONLY_TRANSCRIPT_OVERLAY_STATE_KEYS.has(key)) {
            Object.defineProperty(panel, key, {
                get() {
                    return state[key];
                },
                enumerable: true,
                configurable: true,
            });
            continue;
        }
        Object.defineProperty(panel, key, {
            get() {
                return state[key];
            },
            set(value: TranscriptOverlayState[typeof key]) {
                (state as Record<keyof TranscriptOverlayState, unknown>)[key] = value;
            },
            enumerable: true,
            configurable: true,
        });
    }
}
