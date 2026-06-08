#!/usr/bin/env python3
"""Extract sessions sidebar block from mobile-projects-panel.ts."""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / 'packages/qaap-mobile-shell/src/browser/mobile-projects-panel.ts'
OUT = PANEL.parent / 'mobile-projects-sessions-sidebar-ui.ts'

PUBLIC = {'openWorkHubSessionsSidebar', 'toggleWorkHubSessionsSidebar', 'isWorkHubSessionsSidebarVisible'}

METHODS = [
    'openWorkHubSessionsSidebar', 'toggleWorkHubSessionsSidebar', 'prepareSessionsSidebarData',
    'isWorkHubSessionsSidebarVisible', 'ensureWorkHubSessionsSidebar', 'resolveWorkHubSessionsSidebarProject',
    'renderWorkHubSessionsSidebarList', 'syncSessionsSidebarAnimatedListHeights',
    'isSessionsSidebarPinnedConversation', 'collectSessionsSidebarPinnedGroups',
    'createSessionsSidebarPinnedSection', 'getSessionsSidebarConversationDisplayLimit',
    'resolveSessionsSidebarVisibleConversations', 'appendSessionsSidebarConversationItems',
    'createSessionsSidebarShowMoreControl', 'createSessionsSidebarShowLessControl',
    'createSessionsSidebarPinnedProjectGroup', 'seedSessionsSidebarAccordionDefaults',
    'createSessionsSidebarProjectGroup', 'createSessionsSidebarProjectRowHead',
    'createSessionsSidebarIdeOpenControl', 'createSessionsSidebarIdeOpenBadge',
    'onWorkHubSessionsSidebarNewChat', 'openEmptyMobileChatSheet',
    'onWorkHubSessionsSidebarAutomations', 'onSessionsSidebarAccountClick', 'openSessionsSidebarSearch',
]

METHOD_RE = re.compile(r'^    (?:protected (async )?|async )?([a-zA-Z_][a-zA-Z0-9_]*)\(', re.MULTILINE)


def find_method_span(source: str, name: str) -> tuple[int, int]:
    if name in PUBLIC:
        pat = rf'^    {re.escape(name)}\('
    else:
        pat = rf'^    protected (async )?{re.escape(name)}\('
    match = None
    for m in re.finditer(pat, source, re.MULTILINE):
        match = m
    if not match:
        raise SystemExit(f'not found: {name}')
    start = match.start()
    po = source.index('(', match.end() - 1)
    depth = 0
    i = po
    while i < len(source):
        if source[i] == '(':
            depth += 1
        elif source[i] == ')':
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
        if source[j] == '{':
            depth += 1
        elif source[j] == '}':
            depth -= 1
            if depth == 0:
                return start, j + 1
        j += 1
    raise SystemExit(f'unbalanced: {name}')


def transform(body: str, internal: set[str]) -> str:
    body = re.sub(r'^    protected ', '    ', body, count=1)

    def repl(m: re.Match[str]) -> str:
        n = m.group(1)
        return f'this.{n}' if n in internal else f'this.host.{n}'

    body = re.sub(r'\bMobileProjectsPanel\.SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT\b',
                  'MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT', body)
    body = re.sub(r'\bMobileProjectsPanel\.SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE\b',
                  'MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE', body)
    return re.sub(r'\bthis\.([a-zA-Z_][a-zA-Z0-9_]*)', repl, body)


def param_names(params: str) -> str:
    names, depth, chunk = [], 0, ''
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
                n = part.split(':')[0].strip().replace('readonly ', '').split('=')[0].strip().rstrip('?')
                if n:
                    names.append(n)
            chunk = ''
        else:
            chunk += ch
    return ', '.join(names)


def make_delegator(body: str, ui: str, name: str) -> str:
    po = body.index('(')
    depth = 0
    i = po
    while i < len(body):
        if body[i] == '(':
            depth += 1
        elif body[i] == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    brace = i + 1
    while brace < len(body) and body[brace] != '{':
        brace += 1
    sig = body[:brace].rstrip()
    params = body[po + 1:i].strip()
    call = param_names(params)
    is_async = 'async ' in sig[:80]
    ret = 'void'
    rest = body[i + 1:brace].lstrip()
    if rest.startswith(':'):
        ret = rest[1:].strip()
    is_void = ret in ('void', 'Promise<void>')
    if is_async:
        return f'{sig} {{\n        {"await " if is_void else "return "}this.{ui}.{name}({call});\n    }}'
    if ret != 'void':
        return f'{sig} {{\n        return this.{ui}.{name}({call});\n    }}'
    return f'{sig} {{\n        this.{ui}.{name}({call});\n    }}'


HOST = textwrap.dedent('''
    sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
    sessionsSidebarExpandedProjectIds: Set<string>;
    sessionsSidebarVisibleConversationCountByProjectId: Map<string, number>;
    sessionsSidebarAccordionDefaultsApplied: boolean;
    projects: MobileProjectEntry[];
    query: string;
    transcriptOpenSummaryId: string | undefined;
    activeTasks?: import('./mobile-projects-active-tasks').MobileProjectsActiveTasks;
    conversations?: import('./mobile-projects-conversations').MobileProjectsConversations;
    projectsService: import('./mobile-projects-service').MobileProjectsService;
    commands: import('@theia/core/lib/common/command').CommandRegistry;
    quickInputService?: import('@theia/core/lib/browser').QuickInputService;
    delegate: {
        onProjectOpenInIde?(project: MobileProjectEntry): void | Promise<void>;
        onShowRoutinesHub?(): void | Promise<void>;
    };

    compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number;
    conversationsForProject(project: MobileProjectEntry): import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO[];
    conversationMatchesQuery(conversation: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO, query: string): boolean;
    compareConversationOrder(a: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO, b: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): number;
    resolveConversationFlags(summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean };
    activeInfoForProject(project: MobileProjectEntry): ReturnType<import('./mobile-projects-active-tasks').MobileProjectsActiveTasks['getForCwd']>;
    summaryToTaskView(conversation: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): import('./mobile-projects-active-tasks').MobileProjectTaskView;
    createTaskItem(
        project: MobileProjectEntry,
        task: import('./mobile-projects-active-tasks').MobileProjectTaskView,
        activeInfo: ReturnType<import('./mobile-projects-active-tasks').MobileProjectsActiveTasks['getForCwd']>,
        summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO | undefined,
        parentIds: ReadonlySet<string>,
        options?: { onActivate?: () => void; compact?: boolean },
    ): HTMLElement;
    countRunningTasks(project: MobileProjectEntry): number;
    buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement;
    toggleCardMenu(row: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void;
    closeCardMenu(): void;
    resolveHomePinnedProject(): MobileProjectEntry | undefined;
    refreshChatServiceSessionSummaries(): Promise<void>;
    shouldUseAgentsHubLanding(): boolean;
    isProjectDetailView(): boolean;
    transcriptSheet: HTMLElement | undefined;
    agentsHubInlineActive: boolean;
    visible: boolean;
    closeTranscriptSheet(): void;
    closeAgentsHubSession(): void;
    setExecutionSurfaceTab(project: MobileProjectEntry, tab: import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId): void;
    renderHeader(): void;
    renderSubtitle(): void;
    renderStickyComposer(): void;
    openTranscriptSheet(project: MobileProjectEntry, summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): Promise<void>;
    closeCurrentWorkspace(): Promise<void>;
    openConversationSummary(project: MobileProjectEntry, summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): Promise<void>;
    runCatalogAction(action: import('../common/mobile-work-hub-catalog').WorkHubCatalogAction): Promise<void>;
''').strip()

IMPORTS = textwrap.dedent('''
import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import {
    readStoredAgent,
    SHELL_AGENT_ID,
} from '../common/qaap-agent-task-client';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import { QAAP_WORK_HUB_GETTING_STARTED, type WorkHubCatalogAction } from '../common/mobile-work-hub-catalog';
import { readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { buildQaapAccountMenuEntries, toggleQaapAccountMenu } from './qaap-workbench-account-menu';
import type { MobileProjectEntry } from './mobile-projects-types';
import { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';

export const MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT = 5;
export const MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE = 15;
''').strip()


def main() -> None:
    source = PANEL.read_text()
    internal = set(METHODS)
    chunks = []
    for name in METHODS:
        s, e = find_method_span(source, name)
        chunks.append(transform(source[s:e], internal))

    file_body = f'''// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

{IMPORTS}

export interface MobileProjectsSessionsSidebarHost {{
{HOST}
}}

export class MobileProjectsSessionsSidebarUi {{
    constructor(protected readonly host: MobileProjectsSessionsSidebarHost) {{ }}

{chr(10).join(chunks)}
}}
'''
    OUT.write_text(file_body)
    print(f'wrote {OUT.name}')

    for name in sorted(METHODS, key=lambda n: find_method_span(source, n)[0], reverse=True):
        s, e = find_method_span(source, name)
        deleg = make_delegator(source[s:e], 'sessionsSidebarUi', name)
        source = source[:s] + deleg + '\n\n' + source[e:]

    imp = '''import {
    MobileProjectsSessionsSidebarUi,
    type MobileProjectsSessionsSidebarHost,
} from './mobile-projects-sessions-sidebar-ui';
'''
    if 'mobile-projects-sessions-sidebar-ui' not in source:
        source = source.replace(
            'import { MobileWorkHubSessionsSidebar } from \'./mobile-work-hub-sessions-sidebar\';',
            imp + 'import { MobileWorkHubSessionsSidebar } from \'./mobile-work-hub-sessions-sidebar\';',
        )

    inst = '    protected readonly sessionsSidebarUi = new MobileProjectsSessionsSidebarUi(this as unknown as MobileProjectsSessionsSidebarHost);\n'
    if 'sessionsSidebarUi' not in source:
        source = source.replace(
            'protected readonly workHubSearchUi = new MobileProjectsWorkHubSearchUi',
            inst + '    protected readonly workHubSearchUi = new MobileProjectsWorkHubSearchUi',
        )

    # drop panel static constants if unused
    source = re.sub(
        r'\n    /\*\* Initial session rows.*?\n    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE = 15;\n',
        '\n',
        source,
        count=1,
        flags=re.DOTALL,
    )
    source = re.sub(
        r'\n    protected static readonly SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT = 5;\n',
        '\n',
        source,
        count=1,
    )

    PANEL.write_text(source)
    print('patched panel')


if __name__ == '__main__':
    main()
