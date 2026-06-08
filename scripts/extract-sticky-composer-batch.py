#!/usr/bin/env python3
"""Extract sticky-composer block from mobile-projects-panel.ts."""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / 'packages/qaap-mobile-shell/src/browser/mobile-projects-panel.ts'
BROWSER = PANEL.parent

HEADER = '''// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
'''

METHOD_RE = re.compile(
    r'^    protected (async )?([a-zA-Z_][a-zA-Z0-9_]*)\(',
    re.MULTILINE,
)

ALL_METHODS = [
    # context
    'onStickyComposerAttach', 'createStickyComposerAttachHandlers', 'createTranscriptComposerAttachHandlers',
    'hasPendingComposerAttachments', 'notifyPendingComposerAttachments',
    'formatComposerContextEntry', 'formatComposerContextChip',
    'resolveComposerMentionOptions', 'resolveComposerVariableOptions',
    # render
    'renderStickyComposer', 'mountStickyComposerContextUsage',
    # workspace
    'resolveComposerWorkspaceBranch', 'refreshComposerWorkspaceBranch', 'resolveComposerWorkspaceBarView',
    'remountComposerWithWorkspaceBar', 'openComposerWorkspaceProjectSheet', 'createComposerProjectSheetAction',
    'onCreateNewProjectFromSheet', 'openComposerWorkspaceBranchSheet', 'loadComposerWorkspaceBranchSheet',
    'checkoutComposerWorkspaceBranch',
    # column
    'buildStickyComposerColumn',
    # agents
    'resolveStickyComposerPinnedAgentId', 'resolveStickyComposerAgentLabel', 'resolveStickyComposerModelLabel',
    'reconcileStickyComposerPinnedAgent', 'filterSelectableComposerAgents',
    'refreshStickyComposerAgents', 'showComposerAgentPickerLoading', 'ensureStickyComposerAgentsLoaded',
    # sheets
    'closeStickyComposerSheets', 'openStickyComposerAgentSheet', 'openStickyComposerModeSheet',
    'openStickyComposerApprovalPolicySheet', 'openApprovalPolicySheet', 'createModeSheetOption',
    'createAgentSheetOption', 'resolveModelsForAgentPicker', 'createComposerAgentPickerChrome',
    'renderComposerAgentPicker', 'appendAgentModelPickerList',
]

MODULE_SPECS = [
    {
        'file': 'mobile-projects-sticky-composer-sheets-ui.ts',
        'class': 'MobileProjectsStickyComposerSheetsUi',
        'host': 'MobileProjectsStickyComposerSheetsHost',
        'extra_types': textwrap.dedent('''
            export type ComposerAgentPickerView = 'agents' | 'models';

            export interface ComposerAgentPickerChrome {
                readonly sheet: HTMLElement;
                readonly header: HTMLElement;
                readonly title: HTMLElement;
                readonly backBtn: HTMLButtonElement;
                readonly list: HTMLElement;
            }
        ''').strip(),
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { ChatMode } from '@theia/ai-chat';
            import {
                agentSupportsModelPicker,
                agentUsesSettingsModelCatalog,
                fetchAgentModelsForAgent,
                isSameAgentModel,
                isStickyComposerAgentSelected,
                readStoredAgentModel,
                writeStoredAgent,
                writeStoredAgentModel,
                type QaapAgentTaskAgentOption,
                type QaapQaiqModelOption,
            } from '../common/qaap-agent-task-client';
            import {
                reconcileComposerModeId,
                resolveStickyComposerModes,
                writeStoredComposerMode,
            } from '../common/qaap-sticky-composer-mode';
            import {
                QAAP_AGENT_APPROVAL_POLICIES,
                reconcileAgentApprovalPolicyId,
                type QaapAgentApprovalPolicyId,
            } from '../common/qaap-sticky-composer-approval-policy';
            import {
                reconcileAgentToolApprovalRules,
                writeStoredAgentApprovalPolicy,
                writeStoredAgentToolApprovalRules,
                type QaapAgentToolApprovalRules,
            } from '../common/qaap-agent-tool-approval-rules';
            import {
                createAgentSheetOptionButton,
                createApprovalPolicySheetOptionButton,
                createPickerSheetOptionButton,
                createToolApprovalRuleToggle,
            } from './qaap-agent-ui';
            import {
                formatQaiqModelProviderLabel,
                groupQaiqModelsByProvider,
                listQaiqModelsFromPreferences,
            } from '../common/qaap-qaiq-model-catalog';
            import { THEIA_CODER_AGENT_ID } from '../common/qaap-agent-task-client';
            import type { MobileProjectEntry } from './mobile-projects-types';
            import type { MobileProjectsService } from './mobile-projects-service';
            import type { QaapComposerSurface } from '../common/qaap-composer-surface';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            stickyComposerAgentSheet: HTMLElement | undefined;
            stickyComposerModeSheet: HTMLElement | undefined;
            stickyComposerApprovalSheet: HTMLElement | undefined;
            stickyComposerWorkspaceSheet: HTMLElement | undefined;
            stickyComposerSurface: QaapComposerSurface;
            stickyComposerPinnedAgentId: string | undefined;
            stickyComposerModeId: string | undefined;
            stickyComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
            stickyComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
            preparedCwdByProjectId: Map<string, string>;
            projectsService: MobileProjectsService;
            chatAgentService?: import('@theia/ai-chat/lib/common/chat-agent-service').ChatAgentService;
            readPreference?: import('@theia/core/lib/browser/preferences/preference-service').PreferenceService;
            renderStickyComposer(): void;
            ensureStickyComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]>;
            getOfferableCoderAgent(): import('@theia/ai-chat').ChatAgent | undefined;
            closeTranscriptComposerSheets(): void;
        ''').strip(),
        'methods': [
            'closeStickyComposerSheets', 'openStickyComposerAgentSheet', 'openStickyComposerModeSheet',
            'openStickyComposerApprovalPolicySheet', 'openApprovalPolicySheet', 'createModeSheetOption',
            'createAgentSheetOption', 'resolveModelsForAgentPicker', 'createComposerAgentPickerChrome',
            'renderComposerAgentPicker', 'appendAgentModelPickerList',
        ],
    },
    {
        'file': 'mobile-projects-sticky-composer-agents-ui.ts',
        'class': 'MobileProjectsStickyComposerAgentsUi',
        'host': 'MobileProjectsStickyComposerAgentsHost',
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
            import {
                agentSupportsModelPicker,
                filterQaapComposerAgents,
                isTheiaCoderAgent,
                QAAP_PRIMARY_AGENT_ID,
                readStoredAgent,
                readStoredAgentModel,
                reconcileStickyComposerAgent,
                THEIA_CODER_AGENT_ID,
                type QaapAgentTaskAgentOption,
                type QaapAgentTaskListSnapshot,
                type QaapQaiqModelOption,
            } from '../common/qaap-agent-task-client';
            import type { MobileProjectEntry } from './mobile-projects-types';
            import type { MobileProjectsService } from './mobile-projects-service';
            import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
            import type { ComposerAgentPickerChrome } from './mobile-projects-sticky-composer-sheets-ui';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            stickyComposerPinnedAgentId: string | undefined;
            stickyComposerBackendAgents: QaapAgentTaskAgentOption[];
            stickyComposerQaiqModels: QaapQaiqModelOption[];
            preparedCwdByProjectId: Map<string, string>;
            projectsService: MobileProjectsService;
            chatAgentService?: ChatAgentService;
            activeTasks?: MobileProjectsActiveTasks;
            renderStickyComposer(): void;
            loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot>;
            getOfferableCoderAgent(): import('@theia/ai-chat').ChatAgent | undefined;
            resolveConversationAgentLabel(agentId: string | undefined): string;
        ''').strip(),
        'methods': [
            'resolveStickyComposerPinnedAgentId', 'resolveStickyComposerAgentLabel', 'resolveStickyComposerModelLabel',
            'reconcileStickyComposerPinnedAgent', 'filterSelectableComposerAgents',
            'refreshStickyComposerAgents', 'showComposerAgentPickerLoading', 'ensureStickyComposerAgentsLoaded',
        ],
    },
    {
        'file': 'mobile-projects-sticky-composer-context-ui.ts',
        'class': 'MobileProjectsStickyComposerContextUi',
        'host': 'MobileProjectsStickyComposerContextHost',
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { ChatAgent } from '@theia/ai-chat';
            import { AIVariableResolutionRequest } from '@theia/ai-core';
            import {
                buildStickyComposerMentionOptions,
                buildStickyComposerVariableOptions,
                type StickyComposerTokenOption,
            } from '../common/qaap-sticky-composer-mention';
            import {
                resolveStickyComposerContextChip,
                resolveStickyComposerContextEntry,
                type StickyComposerContextChipView,
            } from './qaap-sticky-composer-context-ui';
            import {
                createComposerContextEntry,
                hasPendingComposerContextEntries,
                revokeComposerContextPreview,
                type StickyComposerContextEntry,
            } from '../common/qaap-composer-context-entry';
            import { type QaapAgentTaskAgentOption } from '../common/qaap-agent-task-client';
            import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
            import type { MobileProjectEntry } from './mobile-projects-types';
            import { MobileSnackbar } from './mobile-snackbar';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            stickyComposerContext: StickyComposerContextEntry[];
            transcriptComposerContext: StickyComposerContextEntry[];
            pickContextVariable?: (anchor: HTMLElement, handlers: MobileComposerAttachHandlers) => Promise<AIVariableResolutionRequest[]>;
            formatContextChip?: (item: AIVariableResolutionRequest) => StickyComposerContextChipView | undefined;
            getComposerVariables?: () => AIVariableResolutionRequest[];
            renderStickyComposer(): void;
            remountTranscriptStickyComposer(): void;
            getOfferableCoderAgent(): ChatAgent | undefined;
        ''').strip(),
        'methods': [
            'onStickyComposerAttach', 'createStickyComposerAttachHandlers', 'createTranscriptComposerAttachHandlers',
            'hasPendingComposerAttachments', 'notifyPendingComposerAttachments',
            'formatComposerContextEntry', 'formatComposerContextChip',
            'resolveComposerMentionOptions', 'resolveComposerVariableOptions',
        ],
    },
    {
        'file': 'mobile-projects-sticky-composer-workspace-ui.ts',
        'class': 'MobileProjectsStickyComposerWorkspaceUi',
        'host': 'MobileProjectsStickyComposerWorkspaceHost',
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { QAAP_GIT_REVIEW_API_PATH, type QaapGitBranchesResponse } from '../common/qaap-git-review';
            import type { StickyComposerWorkspaceBarView } from './qaap-sticky-composer-workspace-bar';
            import type { MobileProjectEntry } from './mobile-projects-types';
            import type { MobileProjectsService } from './mobile-projects-service';
            import { MobileSnackbar } from './mobile-snackbar';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            composerWorkspaceBranchByProjectId: Map<string, string>;
            preparedCwdByProjectId: Map<string, string>;
            projects: MobileProjectEntry[];
            agentsHubSelectedProjectId: string | undefined;
            agentsHubShellActive: boolean;
            stickyComposerWorkspaceSheet: HTMLElement | undefined;
            transcriptComposerHost: HTMLElement | undefined;
            transcriptComposerProject: MobileProjectEntry | undefined;
            transcriptComposerSummary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO | undefined;
            projectsService: MobileProjectsService;
            delegate: { onProjectsChanged?: () => void };
            renderStickyComposer(): void;
            render(): void;
            renderAgentsHubExecutionShell(): void;
            openProject(project: MobileProjectEntry): Promise<void>;
            onNewClick(): Promise<void>;
            remountTranscriptStickyComposer(): void;
            closeStickyComposerSheets(): void;
            closeTranscriptComposerSheets(): void;
        ''').strip(),
        'methods': [
            'resolveComposerWorkspaceBranch', 'refreshComposerWorkspaceBranch', 'resolveComposerWorkspaceBarView',
            'remountComposerWithWorkspaceBar', 'openComposerWorkspaceProjectSheet', 'createComposerProjectSheetAction',
            'onCreateNewProjectFromSheet', 'openComposerWorkspaceBranchSheet', 'loadComposerWorkspaceBranchSheet',
            'checkoutComposerWorkspaceBranch',
        ],
    },
    {
        'file': 'mobile-projects-sticky-composer-column-ui.ts',
        'class': 'MobileProjectsStickyComposerColumnUi',
        'host': 'MobileProjectsStickyComposerColumnHost',
        'extra_types': '',
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { ChatMode } from '@theia/ai-chat';
            import type { QaapComposerSurface } from '../common/qaap-composer-surface';
            import {
                attachStickyComposerMentionUi,
                type StickyComposerTokenOption,
            } from '../common/qaap-sticky-composer-mention';
            import {
                agentSupportsApprovalPolicy,
                resolveAgentApprovalPolicyOption,
                type QaapAgentApprovalPolicyId,
            } from '../common/qaap-sticky-composer-approval-policy';
            import {
                populateAgentToolbarButton,
                populateApprovalPolicyToolbarButton,
            } from './qaap-agent-ui';
            import {
                renderStickyComposerContextStrip,
                type StickyComposerContextChipView,
            } from './qaap-sticky-composer-context-ui';
            import {
                createStickyComposerWorkspacePill,
                renderStickyComposerWorkspaceBar,
                type StickyComposerWorkspaceBarView,
            } from './qaap-sticky-composer-workspace-bar';
            import {
                createContextUsageIndicatorBadge,
            } from './qaap-chat-context-usage-indicator';
            import type { StickyComposerContextEntry } from '../common/qaap-composer-context-entry';
            import type { AIVariableResolutionRequest } from '@theia/ai-core';
            import type { MobileProjectEntry } from './mobile-projects-types';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            resolveStickyComposerModelLabel(agentId: string, project?: MobileProjectEntry): string | undefined;
            resolveComposerWorkspaceBarView(project: MobileProjectEntry): StickyComposerWorkspaceBarView;
            openComposerWorkspaceProjectSheet(project: MobileProjectEntry, transcriptOverlay?: boolean): void;
            openComposerWorkspaceBranchSheet(project: MobileProjectEntry, transcriptOverlay?: boolean): void;
            refreshComposerWorkspaceBranch(project: MobileProjectEntry): Promise<string>;
            resolveAttachmentPreview?: (item: AIVariableResolutionRequest) => Promise<string | undefined>;
        ''').strip(),
        'methods': ['buildStickyComposerColumn'],
        'export_options_type': 'StickyComposerColumnOptions',
    },
    {
        'file': 'mobile-projects-sticky-composer-render-ui.ts',
        'class': 'MobileProjectsStickyComposerRenderUi',
        'host': 'MobileProjectsStickyComposerRenderHost',
        'imports': textwrap.dedent('''
            import { nls } from '@theia/core/lib/common/nls';
            import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
            import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
            import { ChatMode, ChatModel, ChatService } from '@theia/ai-chat';
            import {
                THEIA_CODER_AGENT_ID,
                resolveExplicitAgentForSubmit,
            } from '../common/qaap-agent-task-client';
            import {
                describeComposerInteractionMode,
                reconcileComposerModeId,
                resolveComposerModeLabel,
                resolveStickyComposerModes,
            } from '../common/qaap-sticky-composer-mode';
            import {
                agentSupportsApprovalPolicy,
                reconcileAgentApprovalPolicyId,
                resolveComposerAutoApprove,
            } from '../common/qaap-sticky-composer-approval-policy';
            import {
                reconcileAgentToolApprovalRules,
            } from '../common/qaap-agent-tool-approval-rules';
            import {
                composerContextRequests,
                disposeComposerContextEntries,
                revokeComposerContextPreview,
            } from '../common/qaap-composer-context-entry';
            import {
                bindContextUsageIndicator,
                isContextUsageIndicatorEnabled,
                resolveContextUsageIndicatorState,
                resolveContextUsageWarningThreshold,
                resolveContextUsageWarningThresholdPercentage,
                resolveVpsContextUsageIndicatorState,
            } from './qaap-chat-context-usage-indicator';
            import type { QaapAgentConversationSummaryDTO, QaapAgentConversationDTO } from '../common/qaap-agent-conversation-client';
            import type { QaapAgentApprovalPolicyId } from '../common/qaap-sticky-composer-approval-policy';
            import type { QaapAgentToolApprovalRules } from '../common/qaap-agent-tool-approval-rules';
            import type { StickyComposerContextEntry } from '../common/qaap-composer-context-entry';
            import type { QaapComposerSurface } from '../common/qaap-composer-surface';
            import type { MobileProjectEntry, MobileProjectFilter } from './mobile-projects-types';
            import type { MobileProjectsService } from './mobile-projects-service';
            import type { MobileProjectsConversations } from './mobile-projects-conversations';
            import { MobileSnackbar } from './mobile-snackbar';
            import type { StickyComposerColumnOptions } from './mobile-projects-sticky-composer-column-ui';
        ''').strip(),
        'host_fields': textwrap.dedent('''
            root: HTMLElement;
            stickyComposerHost: HTMLElement;
            stickyComposerContextUsageDispose: Disposable;
            projects: MobileProjectEntry[];
            filter: MobileProjectFilter;
            homeMode: boolean;
            hubView: import('./mobile-projects-types').MobileProjectsHubView;
            agentsHubShellActive: boolean;
            agentsHubInlineChatHost: HTMLElement | undefined;
            transcriptChatHost: HTMLElement | undefined;
            transcriptComposerMountKey: string | undefined;
            transcriptComposerHost: HTMLElement | undefined;
            stickyComposerContext: StickyComposerContextEntry[];
            stickyComposerFilesExpanded: boolean;
            stickyComposerDraft: string;
            stickyComposerSurface: QaapComposerSurface;
            stickyComposerModeId: string | undefined;
            stickyComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
            stickyComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
            stickyComposerBackendAgents: import('../common/qaap-agent-task-client').QaapAgentTaskAgentOption[];
            stickyComposerPinnedAgentId: string | undefined;
            preparedCwdByProjectId: Map<string, string>;
            chatService?: ChatService;
            chatAgentService?: ChatAgentService;
            conversations?: MobileProjectsConversations;
            readPreference?: import('@theia/core/lib/browser/preferences/preference-service').PreferenceService;
            getComposerVariables?: unknown;
            applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[];
            applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[];
            resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined;
            resolveAgentsHubShellProject(): MobileProjectEntry | undefined;
            resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO | undefined;
            executionSurfaceTabForProject(project: MobileProjectEntry): import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId;
            refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void>;
            mountTranscriptStickyComposer(host: HTMLElement, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, chatHost: HTMLElement): void;
            syncHeaderComposerSurfacePicker(): void;
            updateNewFabVisibility(): void;
            updateStickyComposerFabLift(): void;
            closeStickyComposerSheets(): void;
            refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void>;
            resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string;
            resolveStickyComposerAgentLabel(project?: MobileProjectEntry): string;
            openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void;
            openStickyComposerApprovalPolicySheet(project: MobileProjectEntry, agentLabel: string): void;
            openStickyComposerAgentSheet(project: MobileProjectEntry): void;
            onStickyComposerAttach(project: MobileProjectEntry, anchor: HTMLElement): Promise<void>;
            hasPendingComposerAttachments(): boolean;
            notifyPendingComposerAttachments(): void;
            formatComposerContextEntry(entry: StickyComposerContextEntry): import('./qaap-sticky-composer-context-ui').StickyComposerContextChipView;
            resolveComposerMentionOptions(agents: readonly import('../common/qaap-agent-task-client').QaapAgentTaskAgentOption[], coderOnly?: boolean): readonly import('../common/qaap-sticky-composer-mention').StickyComposerTokenOption[];
            resolveComposerVariableOptions(): readonly import('../common/qaap-sticky-composer-mention').StickyComposerTokenOption[];
            mountStickyComposerContextUsage(badge: HTMLElement, resolveTarget: () => unknown): Disposable;
            resolveProjectTheiaChatModel(project: MobileProjectEntry): ChatModel | undefined;
            shouldShowComposerWorkspaceBar(summary?: QaapAgentConversationSummaryDTO): boolean;
            submitBackgroundAgentTask(project: MobileProjectEntry, draft: string, options: Record<string, unknown>): Promise<void>;
            buildStickyComposerColumn(options: StickyComposerColumnOptions): HTMLElement;
            isProjectDetailView(): boolean;
            projectsService: MobileProjectsService;
            transcriptComposerSendRefresh: (() => void) | undefined;
        ''').strip(),
        'methods': ['renderStickyComposer', 'mountStickyComposerContextUsage'],
    },
]


def find_method_span(source: str, name: str) -> tuple[int, int]:
    match = None
    for m in METHOD_RE.finditer(source):
        if m.group(2) == name:
            match = m
    if not match:
        raise SystemExit(f'method not found: {name}')
    start = match.start()
    paren_open = source.index('(', match.end() - 1)
    depth = 0
    i = paren_open
    while i < len(source):
        ch = source[i]
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    brace = i + 1
    while brace < len(source) and source[brace] != '{':
        brace += 1
    depth = 0
    j = brace
    while j < len(source):
        c = source[j]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return start, j + 1
        j += 1
    raise SystemExit(f'unbalanced braces for {name}')


def transform_method(body: str, internal: set[str]) -> str:
    body = re.sub(r'^    protected ', '    ', body, count=1)

    def repl(m: re.Match[str]) -> str:
        name = m.group(1)
        if name in internal:
            return f'this.{name}'
        return f'this.host.{name}'

    return re.sub(r'\bthis\.([a-zA-Z_][a-zA-Z0-9_]*)', repl, body)


def build_ui_file(spec: dict, source: str) -> str:
    internal = set(spec['methods'])
    methods_src = []
    options_export = ''
    for name in spec['methods']:
        s, e = find_method_span(source, name)
        chunk = source[s:e]
        if spec.get('export_options_type') == 'StickyComposerColumnOptions' and name == 'buildStickyComposerColumn':
            sig_end = chunk.index('): HTMLElement')
            options_export = (
                'export type StickyComposerColumnOptions = Parameters<'
                f'MobileProjectsStickyComposerColumnUi[\'buildStickyComposerColumn\']>[0];\n\n'
            )
            # will fix after class name is known - use placeholder
        methods_src.append(transform_method(chunk, internal))

    extra = spec.get('extra_types', '')
    extra_block = (extra + '\n\n') if extra else ''
    class_name = spec['class']
    if options_export:
        options_export = (
            f'export type StickyComposerColumnOptions = Parameters<'
            f'{class_name}[\'buildStickyComposerColumn\']>[0];\n\n'
        )
    return (
        HEADER + '\n'
        + spec['imports'] + '\n\n'
        + extra_block
        + f'export interface {spec["host"]} {{\n'
        + spec['host_fields'] + '\n'
        + '}\n\n'
        + f'export class {class_name} {{\n'
        + f'    constructor(protected readonly host: {spec["host"]}) {{ }}\n\n'
        + '\n'.join(methods_src)
        + '\n}\n\n'
        + options_export
    )


def extract_signature(body: str, name: str) -> tuple[str, str, bool]:
    is_async = bool(re.match(rf'    protected async {name}\(', body))
    prefix = 'async ' if is_async else ''
    start = body.index(f'protected {prefix}{name}(')
    i = body.index('(', start) + 1
    depth = 1
    while i < len(body) and depth > 0:
        ch = body[i]
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        i += 1
    params = re.sub(r'\s+', ' ', body[start + len(f'protected {prefix}{name}('): i - 1].strip())
    rest = body[i:].lstrip()
    ret = 'void'
    if rest.startswith(':'):
        colon_end = rest.find('{')
        ret = re.sub(r'\s+', ' ', rest[1:colon_end].strip())
    return params, ret, is_async


def param_names(params: str) -> str:
    names: list[str] = []
    depth = 0
    chunk = ''
    for ch in params + ',':
        if ch in '([{':
            depth += 1
            chunk += ch
        elif ch in ')]}':
            depth -= 1
            chunk += ch
        elif ch == ',' and depth == 0:
            part = chunk.strip()
            if part:
                name = part.split(':')[0].strip().replace('readonly ', '').split('=')[0].strip().rstrip('?')
                if name:
                    names.append(name)
            chunk = ''
        else:
            chunk += ch
    return ', '.join(names)


UI_MAP = {
    'onStickyComposerAttach': 'stickyComposerContextUi',
    'createStickyComposerAttachHandlers': 'stickyComposerContextUi',
    'createTranscriptComposerAttachHandlers': 'stickyComposerContextUi',
    'hasPendingComposerAttachments': 'stickyComposerContextUi',
    'notifyPendingComposerAttachments': 'stickyComposerContextUi',
    'formatComposerContextEntry': 'stickyComposerContextUi',
    'formatComposerContextChip': 'stickyComposerContextUi',
    'resolveComposerMentionOptions': 'stickyComposerContextUi',
    'resolveComposerVariableOptions': 'stickyComposerContextUi',
    'renderStickyComposer': 'stickyComposerRenderUi',
    'mountStickyComposerContextUsage': 'stickyComposerRenderUi',
    'resolveComposerWorkspaceBranch': 'stickyComposerWorkspaceUi',
    'refreshComposerWorkspaceBranch': 'stickyComposerWorkspaceUi',
    'resolveComposerWorkspaceBarView': 'stickyComposerWorkspaceUi',
    'remountComposerWithWorkspaceBar': 'stickyComposerWorkspaceUi',
    'openComposerWorkspaceProjectSheet': 'stickyComposerWorkspaceUi',
    'createComposerProjectSheetAction': 'stickyComposerWorkspaceUi',
    'onCreateNewProjectFromSheet': 'stickyComposerWorkspaceUi',
    'openComposerWorkspaceBranchSheet': 'stickyComposerWorkspaceUi',
    'loadComposerWorkspaceBranchSheet': 'stickyComposerWorkspaceUi',
    'checkoutComposerWorkspaceBranch': 'stickyComposerWorkspaceUi',
    'buildStickyComposerColumn': 'stickyComposerColumnUi',
    'resolveStickyComposerPinnedAgentId': 'stickyComposerAgentsUi',
    'resolveStickyComposerAgentLabel': 'stickyComposerAgentsUi',
    'resolveStickyComposerModelLabel': 'stickyComposerAgentsUi',
    'reconcileStickyComposerPinnedAgent': 'stickyComposerAgentsUi',
    'filterSelectableComposerAgents': 'stickyComposerAgentsUi',
    'refreshStickyComposerAgents': 'stickyComposerAgentsUi',
    'showComposerAgentPickerLoading': 'stickyComposerAgentsUi',
    'ensureStickyComposerAgentsLoaded': 'stickyComposerAgentsUi',
    'closeStickyComposerSheets': 'stickyComposerSheetsUi',
    'openStickyComposerAgentSheet': 'stickyComposerSheetsUi',
    'openStickyComposerModeSheet': 'stickyComposerSheetsUi',
    'openStickyComposerApprovalPolicySheet': 'stickyComposerSheetsUi',
    'openApprovalPolicySheet': 'stickyComposerSheetsUi',
    'createModeSheetOption': 'stickyComposerSheetsUi',
    'createAgentSheetOption': 'stickyComposerSheetsUi',
    'resolveModelsForAgentPicker': 'stickyComposerSheetsUi',
    'createComposerAgentPickerChrome': 'stickyComposerSheetsUi',
    'renderComposerAgentPicker': 'stickyComposerSheetsUi',
    'appendAgentModelPickerList': 'stickyComposerSheetsUi',
}


def make_delegator(name: str, body: str) -> str:
    ui = UI_MAP[name]
    paren_open = body.index('(')
    depth = 0
    i = paren_open
    while i < len(body):
        ch = body[i]
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    brace = i + 1
    while brace < len(body) and body[brace] != '{':
        brace += 1
    sig = body[:brace].rstrip()
    params, ret, is_async = extract_signature(body, name)
    call_args = param_names(params)
    is_void = ret == 'void' or ret == 'Promise<void>'
    if is_async:
        if is_void:
            return f'{sig} {{\n        await this.{ui}.{name}({call_args});\n    }}'
        return f'{sig} {{\n        return this.{ui}.{name}({call_args});\n    }}'
    if is_void:
        return f'{sig} {{\n        this.{ui}.{name}({call_args});\n    }}'
    return f'{sig} {{\n        return this.{ui}.{name}({call_args});\n    }}'


def patch_panel(source: str) -> str:
    # remove panel-local picker types
    source = re.sub(
        r"type ComposerAgentPickerView = 'agents' \| 'models';\n\ninterface ComposerAgentPickerChrome \{[^}]+\}\n\n",
        '',
        source,
        count=1,
    )

    # remove methods bottom-up
    for name in sorted(ALL_METHODS, key=lambda n: find_method_span(source, n)[0], reverse=True):
        s, e = find_method_span(source, name)
        body = source[s:e]
        delegator = make_delegator(name, body)
        source = source[:s] + delegator + '\n\n' + source[e:]

    imports_to_add = textwrap.dedent('''
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
    ''').strip()

    if 'mobile-projects-sticky-composer-context-ui' not in source:
        anchor = "import { MobileProjectsOverlayFactoryUi"
        source = source.replace(anchor, imports_to_add + '\n' + anchor)

    if 'ComposerAgentPickerChrome' not in source:
        source = source.replace(
            "} from './mobile-projects-sticky-composer-sheets-ui';",
            ", type ComposerAgentPickerChrome } from './mobile-projects-sticky-composer-sheets-ui';",
        )

    ui_instances = textwrap.dedent('''
        protected readonly stickyComposerContextUi = new MobileProjectsStickyComposerContextUi(this as unknown as MobileProjectsStickyComposerContextHost);
        protected readonly stickyComposerAgentsUi = new MobileProjectsStickyComposerAgentsUi(this as unknown as MobileProjectsStickyComposerAgentsHost);
        protected readonly stickyComposerSheetsUi = new MobileProjectsStickyComposerSheetsUi(this as unknown as MobileProjectsStickyComposerSheetsHost);
        protected readonly stickyComposerWorkspaceUi = new MobileProjectsStickyComposerWorkspaceUi(this as unknown as MobileProjectsStickyComposerWorkspaceHost);
        protected readonly stickyComposerColumnUi = new MobileProjectsStickyComposerColumnUi(this as unknown as MobileProjectsStickyComposerColumnHost);
        protected readonly stickyComposerRenderUi = new MobileProjectsStickyComposerRenderUi(this as unknown as MobileProjectsStickyComposerRenderHost);
    ''').strip()

    if 'stickyComposerContextUi' not in source:
        source = source.replace(
            'protected readonly overlayFactoryUi = new MobileProjectsOverlayFactoryUi',
            ui_instances + '\n    protected readonly overlayFactoryUi = new MobileProjectsOverlayFactoryUi',
        )

    return source


def main() -> None:
    source = PANEL.read_text()
    for spec in MODULE_SPECS:
        out = BROWSER / spec['file']
        out.write_text(build_ui_file(spec, source))
        print(f'wrote {out.name} ({len(spec["methods"])} methods)')

    patched = patch_panel(source)
    PANEL.write_text(patched)
    print(f'patched {PANEL.name}')


if __name__ == '__main__':
    main()
