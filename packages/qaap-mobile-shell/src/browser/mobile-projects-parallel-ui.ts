// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { MobileProjectEntry } from './mobile-projects-types';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import {
    getConversation,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    chooseParallelVariant,
    createParallelRun,
    deleteParallelRun,
    fetchParallelRun,
    type QaapParallelChooseAction,
    type QaapParallelRunVariantDTO,
} from '../common/qaap-parallel-run-client';
import { filterUiSelectableVpsAgents, type QaapAgentTaskAgentOption } from '../common/qaap-agent-task-client';
import { createAgentBrandChip, createAgentRowAvatar, createDiffStatsLine } from './qaap-agent-ui';
import { MobileSnackbar } from './mobile-snackbar';

const VARIANT_STATS_POLL_MS = 5000;

export interface MobileProjectsParallelUiDeps {
    getAgents(): QaapAgentTaskAgentOption[];
    onRunsChanged(): void;
    openTimeline(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    buildVariantTaskRow(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        parentIds: ReadonlySet<string>,
    ): HTMLElement;
}

/** Parallel-run sheets, variant groups in Chats, and live diff stats polling. */
export class MobileProjectsParallelUi {

    protected sheetRoot: HTMLElement | undefined;
    protected busy = false;
    protected readonly selectedAgents = new Set<string>();
    protected readonly statsPolls = new Map<string, number>();

    constructor(protected readonly deps: MobileProjectsParallelUiDeps) { }

    closeSheet(): void {
        this.sheetRoot?.remove();
        this.sheetRoot = undefined;
        this.busy = false;
    }

    dispose(): void {
        this.closeSheet();
        for (const runId of [...this.statsPolls.keys()]) {
            this.clearStatsPoll(runId);
        }
    }

    supportsQaapAgentWorkflow(summary: QaapAgentConversationSummaryDTO): boolean {
        return summary.source !== 'theia-chat';
    }

    appendTranscriptHeaderActions(
        header: HTMLElement,
        title: HTMLElement,
        close: HTMLButtonElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const titleWrap = document.createElement('div');
        titleWrap.className = 'theia-mobile-agent-log-title-wrap';
        const titleRow = document.createElement('div');
        titleRow.className = 'theia-mobile-agent-log-title-row';
        const backSpacer = document.createElement('span');
        backSpacer.className = 'theia-mobile-agent-log-title-back-spacer';
        backSpacer.setAttribute('aria-hidden', 'true');
        titleRow.append(backSpacer, title);
        titleWrap.append(titleRow);
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-agent-log-header-actions';
        if (this.supportsQaapAgentWorkflow(summary)) {
            const timelineBtn = document.createElement('button');
            timelineBtn.type = 'button';
            timelineBtn.className = 'theia-mobile-agent-log-action codicon codicon-history';
            timelineBtn.title = nls.localize('qaap/mobileProjects/timeline', 'Timeline');
            timelineBtn.setAttribute('aria-label', timelineBtn.title);
            timelineBtn.addEventListener('click', () => this.deps.openTimeline(project, summary));
            actions.append(timelineBtn);
        }
        actions.append(close);
        header.append(titleWrap, actions);
    }

    createVariantRunSection(
        project: MobileProjectEntry,
        runId: string,
        summaries: QaapAgentConversationSummaryDTO[],
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        parentIds: ReadonlySet<string>,
    ): HTMLElement {
        const wrap = document.createElement('section');
        wrap.className = 'theia-mobile-projects-variant-group';
        wrap.dataset.parallelRunId = runId;

        const head = document.createElement('div');
        head.className = 'theia-mobile-projects-variant-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-variant-label';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-branch';
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = nls.localize('qaap/mobileProjects/variantGroup', 'Variants · {0}', String(summaries.length));
        const runStatus = document.createElement('span');
        runStatus.className = 'theia-mobile-projects-variant-run-status';
        label.append(icon, text, runStatus);
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'theia-mobile-projects-variant-discard';
        discard.textContent = nls.localize('qaap/mobileProjects/parallelDiscard', 'Discard');
        discard.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.discardParallelRun(runId);
        });
        head.append(label, discard);
        wrap.append(head);

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        for (const summary of summaries) {
            const row = document.createElement('div');
            row.className = 'theia-mobile-projects-variant-row';
            row.append(this.deps.buildVariantTaskRow(project, summary, activeInfo, parentIds));
            const side = document.createElement('div');
            side.className = 'theia-mobile-projects-variant-side';
            side.append(createAgentRowAvatar({
                agentId: summary.agentId,
                state: this.summaryVariantState(summary) === 'running'
                    ? 'running'
                    : this.summaryVariantState(summary) === 'failed'
                        ? 'failed'
                        : 'idle',
            }));
            const meta = document.createElement('div');
            meta.className = 'theia-mobile-projects-variant-meta';
            meta.dataset.parallelConversationId = summary.id;
            meta.append(createDiffStatsLine({}));
            const choose = document.createElement('button');
            choose.type = 'button';
            choose.className = 'theia-mobile-projects-variant-choose';
            choose.textContent = nls.localize('qaap/mobileProjects/parallelChoose', 'Choose');
            choose.disabled = summary.status === 'streaming';
            choose.addEventListener('click', ev => {
                ev.stopPropagation();
                this.openVariantChooseSheet(runId, summary);
            });
            side.append(meta, choose);
            row.append(side);
            list.append(row);
        }
        wrap.append(list);
        this.attachVariantStatsPolling(wrap, runId);
        return wrap;
    }

    protected attachVariantStatsPolling(wrap: HTMLElement, runId: string): void {
        void this.refreshVariantStats(wrap, runId);
        this.clearStatsPoll(runId);
        const timerId = window.setInterval(() => {
            if (!wrap.isConnected) {
                this.clearStatsPoll(runId);
                return;
            }
            void this.refreshVariantStats(wrap, runId);
        }, VARIANT_STATS_POLL_MS);
        this.statsPolls.set(runId, timerId);
    }

    protected clearStatsPoll(runId: string): void {
        const timerId = this.statsPolls.get(runId);
        if (timerId !== undefined) {
            window.clearInterval(timerId);
            this.statsPolls.delete(runId);
        }
    }

    protected async refreshVariantStats(wrap: HTMLElement, runId: string): Promise<void> {
        try {
            const run = await fetchParallelRun(runId);
            if (!wrap.isConnected) {
                return;
            }
            const runningCount = run.variants.filter(variant => variant.state === 'running').length;
            const runStatus = wrap.querySelector('.theia-mobile-projects-variant-run-status');
            if (runStatus) {
                runStatus.textContent = runningCount > 0
                    ? nls.localize('qaap/mobileProjects/variantRunActive', '{0} running', String(runningCount))
                    : nls.localize('qaap/mobileProjects/variantRunIdle', 'All idle');
            }
            for (const variant of run.variants) {
                const meta = wrap.querySelector<HTMLElement>(`[data-parallel-conversation-id="${variant.conversationId}"]`);
                if (!meta) {
                    continue;
                }
                meta.replaceChildren(createDiffStatsLine({
                    added: variant.adds,
                    removed: variant.dels,
                    fileCount: variant.fileCount,
                }));
                if (variant.state === 'running') {
                    const running = document.createElement('span');
                    running.className = 'theia-mobile-projects-variant-running';
                    running.textContent = nls.localize('qaap/mobileProjects/variantRunning', 'Running');
                    meta.append(running);
                } else if (variant.state === 'failed') {
                    const failed = document.createElement('span');
                    failed.className = 'theia-mobile-projects-variant-failed';
                    failed.textContent = nls.localize('qaap/mobileProjects/variantFailed', 'Failed');
                    meta.append(failed);
                }
                const row = meta.closest('.theia-mobile-projects-variant-row');
                const avatar = row?.querySelector('.theia-qaap-agent-row-avatar');
                if (avatar) {
                    avatar.className = `theia-qaap-agent-row-avatar theia-mod-${variant.state === 'running' ? 'running' : variant.state === 'failed' ? 'failed' : 'idle'}`;
                }
                const choose = row?.querySelector<HTMLButtonElement>('.theia-mobile-projects-variant-choose');
                if (choose) {
                    choose.disabled = variant.state === 'running';
                }
            }
        } catch {
            /* run discarded or backend unavailable — leave last-known UI */
        }
    }

    protected formatVariantMeta(variant: QaapParallelRunVariantDTO): string {
        const parts: string[] = [];
        if (variant.fileCount > 0 || variant.adds > 0 || variant.dels > 0) {
            parts.push(`+${variant.adds} −${variant.dels} · ${variant.fileCount} files`);
        }
        if (variant.state === 'running') {
            parts.push(nls.localize('qaap/mobileProjects/variantRunning', 'Running'));
        } else if (variant.state === 'failed') {
            parts.push(nls.localize('qaap/mobileProjects/variantFailed', 'Failed'));
        }
        return parts.join(' · ') || '—';
    }

    protected summaryVariantState(summary: QaapAgentConversationSummaryDTO): string {
        if (summary.status === 'streaming') {
            return 'running';
        }
        if (summary.status === 'failed') {
            return 'failed';
        }
        return 'idle';
    }

    protected availableAgents(): QaapAgentTaskAgentOption[] {
        const agents = this.deps.getAgents();
        const selectable = filterUiSelectableVpsAgents(agents);
        return selectable.length > 0 ? selectable : agents;
    }

    protected parallelAgentLabel(agentId: string): string {
        return this.availableAgents().find(agent => agent.id === agentId)?.label ?? `@${agentId}`;
    }

    protected async resolveParallelPromptSeed(summary: QaapAgentConversationSummaryDTO): Promise<string> {
        if (!this.supportsQaapAgentWorkflow(summary)) {
            return summary.title ?? '';
        }
        try {
            const conv = await getConversation(summary.id);
            const lastUser = [...conv.messages].reverse().find(message => message.role === 'user');
            if (lastUser?.content.trim()) {
                return lastUser.content.trim();
            }
        } catch {
            /* fall through */
        }
        return summary.lastMessagePreview?.trim() || summary.title || '';
    }

    openParallelRunsSheet(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        if (!this.supportsQaapAgentWorkflow(summary)) {
            return;
        }
        this.closeSheet();
        this.selectedAgents.clear();
        for (const agent of this.availableAgents().slice(0, 2)) {
            this.selectedAgents.add(agent.id);
        }

        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-parallel-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        backdrop.addEventListener('click', () => this.closeSheet());
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-parallel';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/parallelTitle', 'Parallel runs');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeSheet());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'theia-mobile-parallel-body';
        sheet.append(header, body);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.sheetRoot = root;
        void this.loadParallelSetup(body, project, summary);
    }

    protected async loadParallelSetup(
        body: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        body.replaceChildren();
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-parallel-note';
        loading.textContent = nls.localize('qaap/mobileProjects/parallelLoading', 'Loading…');
        body.append(loading);
        const promptSeed = await this.resolveParallelPromptSeed(summary);
        if (!this.sheetRoot || !body.isConnected) {
            return;
        }
        this.renderParallelSetup(body, project, summary, promptSeed);
    }

    protected resolveParallelBody(): HTMLElement | undefined {
        return this.sheetRoot?.querySelector<HTMLElement>('.theia-mobile-parallel-body') ?? undefined;
    }

    protected renderParallelSetup(
        body: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        promptSeed: string,
    ): void {
        body.replaceChildren();
        if (!summary.cwd) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-parallel-note';
            note.textContent = nls.localize('qaap/mobileProjects/parallelUnavailable', 'Parallel runs need a workspace path.');
            body.append(note);
            return;
        }
        const agents = this.availableAgents();
        if (agents.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-parallel-note';
            note.textContent = nls.localize('qaap/mobileProjects/parallelNoAgents', 'No agents are configured.');
            body.append(note);
            return;
        }

        const promptLabel = document.createElement('div');
        promptLabel.className = 'theia-mobile-parallel-label';
        promptLabel.textContent = nls.localize('qaap/mobileProjects/parallelTask', 'Task');
        const textarea = document.createElement('textarea');
        textarea.className = 'theia-mobile-parallel-prompt';
        textarea.rows = 3;
        textarea.value = promptSeed;
        textarea.placeholder = nls.localize('qaap/mobileProjects/parallelPlaceholder', 'Describe the task to fan out across agents…');

        const agentsLabel = document.createElement('div');
        agentsLabel.className = 'theia-mobile-parallel-label';
        agentsLabel.textContent = nls.localize('qaap/mobileProjects/parallelAgents', 'Agents');
        const chips = document.createElement('div');
        chips.className = 'theia-mobile-parallel-agents';
        for (const agent of agents) {
            const chip = createAgentBrandChip({
                agentId: agent.id,
                label: agent.label,
                selected: this.selectedAgents.has(agent.id),
                onClick: () => {
                    if (this.selectedAgents.has(agent.id)) {
                        this.selectedAgents.delete(agent.id);
                    } else {
                        this.selectedAgents.add(agent.id);
                    }
                    chip.classList.toggle('theia-mod-selected', this.selectedAgents.has(agent.id));
                    run.disabled = this.selectedAgents.size === 0;
                    run.textContent = nls.localize('qaap/mobileProjects/parallelRun', 'Run {0} variants', String(this.selectedAgents.size));
                },
            });
            chips.append(chip);
        }

        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'theia-mobile-parallel-run';
        run.disabled = this.selectedAgents.size === 0;
        run.textContent = nls.localize('qaap/mobileProjects/parallelRun', 'Run {0} variants', String(this.selectedAgents.size));
        run.addEventListener('click', () => { void this.startParallelRun(project, summary, textarea.value); });

        body.append(promptLabel, textarea, agentsLabel, chips, run);
    }

    protected async startParallelRun(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, prompt: string): Promise<void> {
        const agents = [...this.selectedAgents];
        if (!summary.cwd || agents.length === 0 || !prompt.trim() || this.busy) {
            return;
        }
        this.busy = true;
        const body = this.resolveParallelBody();
        if (body) {
            body.replaceChildren();
            const loading = document.createElement('div');
            loading.className = 'theia-mobile-parallel-note';
            loading.textContent = nls.localize('qaap/mobileProjects/parallelCreating', 'Creating {0} isolated worktrees…', String(agents.length));
            body.append(loading);
        }
        try {
            await createParallelRun(summary.cwd, prompt.trim(), agents);
            this.closeSheet();
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/parallelStarted', '{0} variants started — see them in Chats', String(agents.length)),
                { kind: 'success', duration: 2800 },
            );
            this.deps.onRunsChanged();
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
            const setupBody = this.resolveParallelBody();
            if (setupBody) {
                void this.loadParallelSetup(setupBody, project, summary);
            }
        } finally {
            this.busy = false;
        }
    }

    openVariantChooseSheet(runId: string, summary: QaapAgentConversationSummaryDTO): void {
        this.closeSheet();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-parallel-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        backdrop.addEventListener('click', () => this.closeSheet());
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-parallel';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/parallelChooseAction', 'Keep {0}?', this.parallelAgentLabel(summary.agentId));
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.addEventListener('click', () => this.closeSheet());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'theia-mobile-parallel-body';
        const actions: Array<{ id: QaapParallelChooseAction; label: string }> = [
            { id: 'keep-branch', label: nls.localize('qaap/mobileProjects/parallelKeepBranch', 'Keep its branch (safe)') },
            { id: 'merge', label: nls.localize('qaap/mobileProjects/parallelMerge', 'Merge into current branch') },
            { id: 'none', label: nls.localize('qaap/mobileProjects/parallelNoGit', 'Just close (no git change)') },
        ];
        for (const action of actions) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-parallel-action';
            btn.textContent = action.label;
            btn.addEventListener('click', () => { void this.performParallelChoose(runId, summary.id, action.id); });
            body.append(btn);
        }
        sheet.append(header, body);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.sheetRoot = root;
    }

    protected async performParallelChoose(runId: string, conversationId: string, action: QaapParallelChooseAction): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        try {
            const result = await chooseParallelVariant(runId, conversationId, action);
            if (!result.ok) {
                MobileSnackbar.show(result.error ?? nls.localize('qaap/mobileProjects/parallelChooseFailed', 'Could not apply that action'), { kind: 'warning' });
                return;
            }
            const msg = action === 'merge'
                ? nls.localize('qaap/mobileProjects/parallelMerged', 'Merged {0}', result.branch ?? '')
                : action === 'keep-branch'
                    ? nls.localize('qaap/mobileProjects/parallelKept', 'Kept branch {0}', result.branch ?? '')
                    : nls.localize('qaap/mobileProjects/parallelClosed', 'Done');
            MobileSnackbar.show(msg, { kind: 'success', duration: 2200 });
            this.closeSheet();
            this.deps.onRunsChanged();
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        } finally {
            this.busy = false;
        }
    }

    protected async discardParallelRun(runId: string): Promise<void> {
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/parallelDiscardTitle', 'Discard variant run'),
            msg: nls.localize(
                'qaap/mobileProjects/parallelDiscardConfirm',
                'Discard all variants? Worktrees, branches and chats for this run will be removed.',
            ),
            ok: nls.localize('qaap/mobileProjects/parallelDiscard', 'Discard'),
            cancel: nls.localize('qaap/mobileProjects/parallelCancel', 'Back'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            await deleteParallelRun(runId);
            this.clearStatsPoll(runId);
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/parallelDiscarded', 'Variant run discarded'), { kind: 'success', duration: 1800 });
            this.deps.onRunsChanged();
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }

    /** Shared overlay root — timeline sheets reuse the same layer. */
    getOverlaySheet(): HTMLElement | undefined {
        return this.sheetRoot;
    }

    setOverlaySheet(root: HTMLElement | undefined): void {
        this.sheetRoot = root;
    }
}
