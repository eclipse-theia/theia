#!/usr/bin/env python3
"""Wire extracted MobileProjects*Ui modules into mobile-projects-panel.ts."""

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

PUBLIC_METHODS = {'selectHubLandingView'}

METHOD_TO_UI: dict[str, str] = {}
for ui, methods in {
    'backgroundTaskUi': [
        'ensureInlineComposerCwd', 'submitBackgroundAgentTask', 'createProjectChatSession',
        'shouldUseTheiaCoder', 'loadBackendAgentSnapshot', 'selectBackendConversationAgent',
        'applyTaskStartedToProject',
    ],
    'chatServiceSummariesUi': [
        'refreshChatServiceSessionSummaries', 'projectForChatSession', 'rememberChatSessionProject',
        'isChatSessionWorking', 'isChatSessionWaitingForInput', 'chatSessionPreview', 'chatServiceConversationId',
    ],
    'composerHeaderUi': [
        'composerSurfaceSegmentOptions', 'shouldShowHeaderComposerSurfacePicker',
        'syncHeaderComposerSurfacePicker', 'onHeaderComposerSurfaceChange',
        'updateStickyComposerFabLift', 'shouldShowComposerWorkspaceBar',
    ],
    'conversationIndexUi': [
        'isProjectRunning', 'countRunningTasks', 'vpsTasksForProject', 'localChatsForProject',
        'countDoneTasks', 'countNeedsInputTasks', 'countFailedTasks', 'countUnreadTasks',
        'isConversationUnread', 'conversationsForProject', 'mergeConversationSummaries',
        'compareConversationOrder', 'resolveConversationLineage', 'resolveConversationFlags',
        'preferConversationSummary', 'summaryToTaskView', 'tasksForProject', 'conversationTaskState',
        'fallbackTasksFromProject',
    ],
    'conversationOpenUi': ['openTaskInAgent', 'openConversationSummary'],
    'diffHubUi': [
        'renderDiffHubView', 'renderDiffProjectTabs', 'refreshDiffHubView', 'scanSingleProjectWithChanges',
        'scanProjectsWithChanges', 'mountDiffReviewWidget', 'applyDiffTabToWidget',
        'detachDiffReviewWidget', 'attachDiffReviewWidget', 'detachDiffReviewWidgetFromHost',
    ],
    'homeHubUi': [
        'refreshHomeHubData', 'buildHomeSnapshot', 'resolveHomeFavoriteModelLabel', 'buildHomeGreeting',
        'formatHomeRelativeTime', 'buildHomeWorkspaceActivity', 'getHomeWorkspaceStatus', 'buildHomeSubtitle',
        'resolveHomeAgentLabel', 'renderHomeHubView', 'resolveHomePinnedProject', 'onHomeNavigate',
        'onHomeOpenProject', 'onHomeOpenRecent', 'onHomeOpenAttention', 'onHomeQuickAction',
    ],
    'hubHeaderUi': ['renderHeader', 'syncAgentsHubAccountChrome', 'projectDetailHeaderTitle'],
    'hubLandingUi': ['selectHubLandingView'],
    'hubListChromeUi': ['updateNewFabVisibility', 'syncLandingHubListChrome'],
    'hubQueryUi': [
        'applyFilter', 'applySearch', 'projectMatchesSearch', 'conversationMatchesQuery',
        'projectsForCurrentHubList', 'isReviewHubView', 'isHomeHubView', 'isTasksHubView',
        'isSidebarSecondaryHubView',
    ],
    'hubRenderUi': ['render', 'syncHubViewAvailability'],
    'overlayFactoryUi': ['ensureOverlayUi'],
    'projectDetailUi': ['createProjectDetailView', 'projectDetailSurfaceSummary', 'selectProjectDetailTab'],
    'projectNavigationUi': ['openProjectDetail', 'toggleRowExpanded', 'closeCurrentWorkspace'],
    'renderListUi': ['renderList'],
    'repoFiltersUi': [
        'renderFilters', 'repoFilterLabel', 'isSearchChromeHidden', 'syncSearchChrome', 'workHubSearchPlaceholder',
    ],
    'repoLifecycleUi': [
        'onNewClick', 'onCloneClick', 'refreshProjects', 'onTogglePin', 'openAgentComposer',
        'notifyWorkspaceHubBottomBarRefresh',
    ],
    'subtitleUi': ['renderSubtitle', 'buildProjectBranchSubtitle'],
    'workHubSearchUi': [
        'openWorkHubSearchQuickPick', 'closeWorkHubSearchQuickPick', 'buildWorkHubSearchPickItems',
        'buildProjectDetailSearchPickItems', 'buildReposSearchPickItems', 'buildTasksHubSearchPickItems',
        'buildChatHubSearchPickItems', 'buildReviewSearchPickItems', 'buildWorkflowSearchPickItems',
        'buildRoutineSearchPickItems', 'conversationToSearchPickItem', 'activateWorkHubSearchTarget',
    ],
}.items():
    for m in methods:
        METHOD_TO_UI[m] = ui

IMPORTS = textwrap.dedent('''
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
        MobileProjectsWorkHubSearchUi,
        type MobileProjectsWorkHubSearchHost,
    } from './mobile-projects-work-hub-search-ui';
''').strip()

UI_INSTANCES = textwrap.dedent('''
    protected readonly backgroundTaskUi = new MobileProjectsBackgroundTaskUi(this as unknown as MobileProjectsBackgroundTaskHost);
    protected readonly chatServiceSummariesUi = new MobileProjectsChatServiceSummariesUi(this as unknown as MobileProjectsChatServiceSummariesHost);
    protected readonly composerHeaderUi = new MobileProjectsComposerHeaderUi(this as unknown as MobileProjectsComposerHeaderHost);
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
    protected readonly projectDetailUi = new MobileProjectsProjectDetailUi(this as unknown as MobileProjectsProjectDetailHost);
    protected readonly projectNavigationUi = new MobileProjectsProjectNavigationUi(this as unknown as MobileProjectsProjectNavigationHost);
    protected readonly renderListUi = new MobileProjectsRenderListUi(this as unknown as MobileProjectsRenderListHost);
    protected readonly repoFiltersUi = new MobileProjectsRepoFiltersUi(this as unknown as MobileProjectsRepoFiltersHost);
    protected readonly repoLifecycleUi = new MobileProjectsRepoLifecycleUi(this as unknown as MobileProjectsRepoLifecycleHost);
    protected readonly subtitleUi = new MobileProjectsSubtitleUi(this as unknown as MobileProjectsSubtitleHost);
    protected readonly workHubSearchUi = new MobileProjectsWorkHubSearchUi(this as unknown as MobileProjectsWorkHubSearchHost);
''').strip()

BACKGROUND_TASK_METHODS = METHOD_TO_UI.keys().__class__  # placeholder


def find_method_span(source: str, name: str) -> tuple[int, int]:
    if name in PUBLIC_METHODS:
        pattern = rf'^    {re.escape(name)}\('
    else:
        pattern = rf'^    protected (async )?{re.escape(name)}\('
    match = None
    for m in re.finditer(pattern, source, re.MULTILINE):
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


def transform_method(body: str) -> str:
    body = re.sub(r'^    protected ', '    ', body, count=1)
    return re.sub(r'\bthis\.', 'this.host.', body)


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


def extract_signature(body: str, name: str) -> tuple[str, str, bool]:
    is_async = 'async ' in body[:120]
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
    params = body[paren_open + 1:i].strip()
    rest = body[i + 1:].lstrip()
    ret = 'void'
    if rest.startswith(':'):
        ret = rest[1:rest.find('{')].strip()
    return params, ret, is_async


def make_delegator(name: str, body: str, ui: str) -> str:
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


def create_background_task_ui(source: str) -> None:
    methods = [
        'ensureInlineComposerCwd', 'submitBackgroundAgentTask', 'createProjectChatSession',
        'shouldUseTheiaCoder', 'loadBackendAgentSnapshot', 'selectBackendConversationAgent',
        'applyTaskStartedToProject',
    ]
    parts = [transform_method(source[find_method_span(source, n)[0]:find_method_span(source, n)[1]]) for n in methods]
    content = HEADER + '''
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { GenericCapabilitySelections } from '@theia/ai-core';
import {
    conversationToSummary,
    createConversation,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    extractBackendAgentMention,
    fetchAgentTaskListAll,
    isTheiaCoderAgent,
    isTheiaCoderMention,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgent,
    resolveBackendAgentForTurn,
    resolveStoredAgentModelForSubmit,
    writeStoredAgent,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import { applyBackendInteractionModeToPrompt } from '../common/qaap-sticky-composer-mode';
import { reconcileAgentApprovalPolicyId } from '../common/qaap-sticky-composer-approval-policy';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { QaapBackgroundContextProvider } from './qaap-background-context-provider';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsBackgroundTaskHost {
    projects: MobileProjectEntry[];
    preparedCwdByProjectId: Map<string, string>;
    justAddedTaskId: string | undefined;
    agentsHubShellActive: boolean;
    projectsService: MobileProjectsService;
    conversations?: MobileProjectsConversations;
    backgroundContext?: QaapBackgroundContextProvider;
    messageService?: MessageService;
    activeTasks?: MobileProjectsActiveTasks;
    sessionsSidebar?: MobileWorkHubSessionsSidebar;
    delegate: { onProjectsChanged?: () => void };
    openTranscriptSheet(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    shouldUseAgentsHubLanding(): boolean;
    renderSubtitle(): void;
    renderList(): void;
}

export class MobileProjectsBackgroundTaskUi {
    constructor(protected readonly host: MobileProjectsBackgroundTaskHost) { }

''' + '\n'.join(parts) + '\n}\n'
    (BROWSER / 'mobile-projects-background-task-ui.ts').write_text(content)
    print('wrote mobile-projects-background-task-ui.ts')


def wire_panel(source: str) -> str:
    missing = []
    for name in sorted(METHOD_TO_UI, key=lambda n: find_method_span(source, n)[0], reverse=True):
        ui = METHOD_TO_UI[name]
        try:
            s, e = find_method_span(source, name)
        except SystemExit:
            missing.append(name)
            continue
        body = source[s:e]
        if f'this.{ui}.{name}' in body:
            continue
        delegator = make_delegator(name, body, ui)
        source = source[:s] + delegator + '\n\n' + source[e:]

    if missing:
        print('skipped (not found):', ', '.join(missing))

    if 'mobile-projects-background-task-ui' not in source:
        anchor = "import {\n    MobileProjectsStickyComposerContextUi"
        source = source.replace(anchor, IMPORTS + '\n' + anchor)

    if 'backgroundTaskUi' not in source:
        source = source.replace(
            'protected readonly stickyComposerContextUi = new MobileProjectsStickyComposerContextUi',
            UI_INSTANCES + '\n    protected readonly stickyComposerContextUi = new MobileProjectsStickyComposerContextUi',
        )

    return source


def main() -> None:
    source = PANEL.read_text()
    create_background_task_ui(source)
    patched = wire_panel(source)
    PANEL.write_text(patched)
    print(f'patched {PANEL.name}')


if __name__ == '__main__':
    main()
