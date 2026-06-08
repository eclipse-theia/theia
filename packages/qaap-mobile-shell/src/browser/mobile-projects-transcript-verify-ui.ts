// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    type QaapAgentConversationSummaryDTO,
    postConversationMessage,
} from '../common/qaap-agent-conversation-client';
import {
    createAgentTask,
    fetchAgentTaskDetail,
    isAgentTaskFinished,
    resolveStoredAgentModelForSubmit,
    type QaapAgentTaskDetailDTO,
} from '../common/qaap-agent-task-client';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectEntry } from './mobile-projects-types';

interface VerifyCheck {
    readonly label: string;
    readonly command: string;
}

interface VerifyCheckResult {
    readonly check: VerifyCheck;
    state: 'idle' | 'running' | 'ok' | 'fail';
    durationMs?: number;
    exitCode?: number;
    logTail?: string;
}

const VERIFY_AUTO_MAX_ATTEMPTS = 3;

/** Panel surface for transcript verify checks in the Changes tab. */
export interface MobileProjectsTranscriptVerifyHost {
    transcriptReviewChecksHost: HTMLElement | undefined;
    transcriptOpenSummaryId: string | undefined;
    transcriptChecksPanelOpen: boolean;
    transcriptLastStatus: QaapAgentConversationSummaryDTO['status'] | undefined;
    verifyAutoAttempts: number;
    verifyChecksLoading: boolean;
    verifyChecksCwd: string | undefined;
    verifyRunning: boolean;
    verifyResults: VerifyCheckResult[];
    resolveVerifyChecks: ((cwd: string) => Promise<VerifyCheck[]>) | undefined;

    selectTranscriptTab(
        tab: 'messages',
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void;
}

/** Verify checks UI, run loop, and auto-verify after agent turns. */
export class MobileProjectsTranscriptVerifyUi {

    constructor(protected readonly host: MobileProjectsTranscriptVerifyHost) { }

    // ========================================================================
    // Verify tab (execution view · Phase 1 of the agentic surfaces)
    // ========================================================================

    /** Default checks run by the Verify tab. Single "Build" for now; structured for Test/Lint later. */
    async loadVerifyChecks(
        cwd: string,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<VerifyCheck[]> {
        if (this.host.verifyChecksCwd === cwd && !this.host.verifyChecksLoading && this.host.verifyResults.length > 0) {
            return this.host.verifyResults.map(result => result.check);
        }
        if (this.host.verifyChecksCwd === cwd && this.host.verifyChecksLoading) {
            return this.host.verifyResults.map(result => result.check);
        }

        this.host.verifyChecksCwd = cwd;
        this.host.verifyChecksLoading = true;
        this.host.verifyResults = [];
        this.refreshTranscriptChecksViews(project, summary);

        let checks: VerifyCheck[] = [];
        if (this.host.resolveVerifyChecks) {
            try {
                checks = await this.host.resolveVerifyChecks(cwd);
            } catch {
                checks = [];
            }
        }

        this.host.verifyResults = checks.map(check => ({ check, state: 'idle' as const }));
        this.host.verifyChecksLoading = false;
        if (this.host.transcriptOpenSummaryId === summary.id) {
            this.refreshTranscriptChecksViews(project, summary);
        }
        return checks;
    }

    verifyAutoStorageKey(cwd: string | undefined): string {
        return `qaap.verify.auto:${cwd ?? ''}`;
    }

    isAutoVerifyEnabled(cwd: string | undefined): boolean {
        try {
            return localStorage.getItem(this.verifyAutoStorageKey(cwd)) === '1';
        } catch {
            return false;
        }
    }

    setAutoVerifyEnabled(cwd: string | undefined, on: boolean): void {
        try {
            localStorage.setItem(this.verifyAutoStorageKey(cwd), on ? '1' : '0');
        } catch {
            /* private mode — ignore */
        }
    }

    refreshTranscriptChecksViews(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (this.host.transcriptReviewChecksHost) {
            this.renderChecksSection(this.host.transcriptReviewChecksHost, project, summary, { embedded: true });
        }
    }

    transcriptChecksChipLabel(
        failed: number,
        checksReady: boolean,
        checksAvailable: boolean,
    ): { text: string; fail: boolean } {
        if (this.host.verifyRunning) {
            return { text: nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…'), fail: false };
        }
        if (this.host.verifyChecksLoading) {
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
        const first = this.host.verifyResults[0]?.check.label;
        if (first) {
            return {
                text: nls.localize('qaap/mobileProjects/verifyRunNamed', 'Run {0}', first),
                fail: false,
            };
        }
        return { text: nls.localize('qaap/mobileProjects/verifyRun', 'Run checks'), fail: false };
    }

    renderChecksSection(
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
        if (this.host.verifyChecksCwd !== summary.cwd && !this.host.verifyChecksLoading) {
            void this.loadVerifyChecks(summary.cwd, project, summary);
        }
        const failed = this.host.verifyResults.filter(r => r.state === 'fail').length;
        const checksReady = this.host.verifyChecksCwd === summary.cwd && !this.host.verifyChecksLoading;
        const checksAvailable = checksReady && this.host.verifyResults.length > 0;

        const contentHost = document.createElement('div');
        contentHost.className = 'theia-mobile-transcript-review-checks-body';

        const list = document.createElement('div');
        list.className = 'theia-mobile-transcript-verify-list';
        for (const result of this.host.verifyResults) {
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
            runBtn.disabled = this.host.verifyRunning || this.host.verifyChecksLoading || !checksAvailable;
            runBtn.textContent = this.host.verifyRunning
                ? nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…')
                : nls.localize('qaap/mobileProjects/verifyRun', 'Run checks');
            runBtn.addEventListener('click', () => { void this.runVerifyChecks(project, summary); });
            runRow.append(runBtn);
            contentHost.append(runRow);
        }

        if (failed > 0 && !this.host.verifyRunning) {
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
                this.host.transcriptChecksPanelOpen = true;
            }
            host.classList.add('theia-mod-compact');
            const control = document.createElement('div');
            control.className = 'theia-mobile-transcript-checks-control';

            const chipLabel = this.transcriptChecksChipLabel(failed, checksReady, checksAvailable);
            const runChip = document.createElement('button');
            runChip.type = 'button';
            runChip.className = 'theia-mobile-transcript-checks-run-chip';
            runChip.classList.toggle('theia-mod-fail', chipLabel.fail);
            runChip.classList.toggle('theia-mod-running', this.host.verifyRunning);
            runChip.disabled = this.host.verifyRunning || this.host.verifyChecksLoading
                || (checksReady && !checksAvailable);
            const runIcon = document.createElement('i');
            runIcon.className = this.host.verifyRunning
                ? 'codicon codicon-loading codicon-mod-spin'
                : 'codicon codicon-play';
            runIcon.setAttribute('aria-hidden', 'true');
            const runText = document.createElement('span');
            runText.textContent = chipLabel.text;
            runChip.append(runIcon, runText);
            runChip.addEventListener('click', () => { void this.runVerifyChecks(project, summary); });

            const panel = document.createElement('div');
            panel.className = 'theia-mobile-transcript-checks-panel';
            panel.hidden = !this.host.transcriptChecksPanelOpen;
            panel.append(contentHost);

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'theia-mobile-transcript-checks-chevron codicon codicon-chevron-down';
            toggleBtn.title = nls.localize('qaap/mobileProjects/checksMore', 'Checks options');
            toggleBtn.setAttribute('aria-label', toggleBtn.title);
            toggleBtn.setAttribute('aria-expanded', this.host.transcriptChecksPanelOpen ? 'true' : 'false');
            toggleBtn.classList.toggle('theia-mod-open', this.host.transcriptChecksPanelOpen);
            toggleBtn.addEventListener('click', () => {
                this.host.transcriptChecksPanelOpen = !this.host.transcriptChecksPanelOpen;
                toggleBtn.setAttribute('aria-expanded', this.host.transcriptChecksPanelOpen ? 'true' : 'false');
                toggleBtn.classList.toggle('theia-mod-open', this.host.transcriptChecksPanelOpen);
                panel.hidden = !this.host.transcriptChecksPanelOpen;
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
        if (this.host.verifyRunning) {
            checksStat.textContent = nls.localize('qaap/mobileProjects/verifyRunningShort', 'Running…');
        } else if (this.host.verifyChecksLoading) {
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


    createVerifyCheckRow(result: VerifyCheckResult): HTMLElement {
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
    async runVerifyChecks(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, auto = false): Promise<void> {
        if (this.host.verifyRunning || !summary.cwd) {
            return;
        }
        const checks = await this.loadVerifyChecks(summary.cwd, project, summary);
        if (checks.length === 0) {
            return;
        }
        if (!auto) {
            // A manual Run starts a fresh closed-loop budget.
            this.host.verifyAutoAttempts = 0;
        }
        this.host.verifyRunning = true;
        this.host.verifyResults = checks.map(check => ({ check, state: 'idle' as const }));
        this.refreshTranscriptChecksViews(project, summary);

        for (const result of this.host.verifyResults) {
            if (this.host.transcriptOpenSummaryId !== summary.id) {
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

        this.host.verifyRunning = false;
        if (this.host.transcriptOpenSummaryId === summary.id) {
            this.refreshTranscriptChecksViews(project, summary);
        }

        if (this.host.transcriptOpenSummaryId !== summary.id) {
            return;
        }
        const failedCount = this.host.verifyResults.filter(r => r.state === 'fail').length;
        if (failedCount === 0) {
            // Green build ends the loop.
            this.host.verifyAutoAttempts = 0;
            return;
        }
        // Closed loop: in auto mode, feed the failure back to the agent until it passes or the budget runs out.
        // The agent's next turn flips status streaming→idle, which re-triggers this run via
        // handleTranscriptStatusForAutoVerify — so we don't recurse here directly.
        if (auto && summary.source !== 'theia-chat') {
            if (this.host.verifyAutoAttempts < VERIFY_AUTO_MAX_ATTEMPTS) {
                this.host.verifyAutoAttempts++;
                MobileSnackbar.show(
                    nls.localize(
                        'qaap/mobileProjects/verifyAutoFixing',
                        'Verify failed — asking the agent to fix ({0}/{1})',
                        String(this.host.verifyAutoAttempts),
                        String(VERIFY_AUTO_MAX_ATTEMPTS),
                    ),
                    { kind: 'warning', duration: 2000 },
                );
                void this.sendVerifyFailureToAgent(project, summary, true);
            } else {
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/verifyAutoGaveUp', 'Auto-verify gave up after {0} attempts — fix needed manually', String(VERIFY_AUTO_MAX_ATTEMPTS)),
                    { kind: 'warning', duration: 2600 },
                );
            }
        }
    }

    /** Poll a verify task until it finishes, aborting if the sheet closes. */
    async pollVerifyTask(taskId: string, summaryId: string): Promise<QaapAgentTaskDetailDTO | undefined> {
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
            if (this.host.transcriptOpenSummaryId !== summaryId) {
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

    tailLog(log: string | undefined, lines = 12): string {
        if (!log) {
            return '';
        }
        return log.trimEnd().split('\n').slice(-lines).join('\n');
    }

    /** Compose a failure report and push it back into the agent conversation. */
    async sendVerifyFailureToAgent(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, auto = false): Promise<void> {
        const failed = this.host.verifyResults.filter(r => r.state === 'fail');
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
                await postConversationMessage(summary.id, report, { agentModel });
                if (!auto) {
                    // Manual send: jump to Chat so the user watches the agent react.
                    this.host.selectTranscriptTab('messages', project, summary);
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
    handleTranscriptStatusForAutoVerify(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        status: QaapAgentConversationSummaryDTO['status'],
    ): void {
        const prev = this.host.transcriptLastStatus;
        this.host.transcriptLastStatus = status;
        if (prev === 'streaming' && status !== 'streaming'
            && !this.host.verifyRunning
            && this.host.transcriptOpenSummaryId === summary.id
            && this.isAutoVerifyEnabled(summary.cwd)) {
            void this.runVerifyChecks(project, summary, true);
        }
    }
}
