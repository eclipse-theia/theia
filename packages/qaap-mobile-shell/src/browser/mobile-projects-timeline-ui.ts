// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { MobileProjectEntry } from './mobile-projects-types';
import {
    getConversation,
    restoreConversationCheckpoint,
    type QaapAgentConversationSummaryDTO,
    type QaapConversationCheckpointDTO,
} from '../common/qaap-agent-conversation-client';
import { MobileProjectsParallelUi } from './mobile-projects-parallel-ui';
import { createDiffStatsLine } from './qaap-agent-ui';
import { MobileSnackbar } from './mobile-snackbar';

/** Timeline / checkpoint restore overlay for qaap-agent conversations. */
export class MobileProjectsTimelineUi {

    constructor(protected readonly parallelUi: MobileProjectsParallelUi) { }

    openTimelineSheet(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        if (!this.parallelUi.supportsQaapAgentWorkflow(summary)) {
            return;
        }
        this.parallelUi.closeSheet();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-parallel-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        backdrop.addEventListener('click', () => this.parallelUi.closeSheet());
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-parallel';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/timeline', 'Timeline');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.addEventListener('click', () => this.parallelUi.closeSheet());
        header.append(title, close);
        const body = document.createElement('div');
        body.className = 'theia-mobile-parallel-body';
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-parallel-note';
        loading.textContent = nls.localize('qaap/mobileProjects/timelineLoading', 'Loading checkpoints…');
        body.append(loading);
        sheet.append(header, body);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.parallelUi.setOverlaySheet(root);
        void this.loadTimeline(body, summary);
    }

    protected async loadTimeline(body: HTMLElement, summary: QaapAgentConversationSummaryDTO): Promise<void> {
        try {
            const conv = await getConversation(summary.id);
            if (this.parallelUi.getOverlaySheet() === undefined || !body.isConnected) {
                return;
            }
            this.renderTimeline(body, summary, conv.checkpoints ?? []);
        } catch (error) {
            if (this.parallelUi.getOverlaySheet() === undefined || !body.isConnected) {
                return;
            }
            body.replaceChildren();
            const err = document.createElement('div');
            err.className = 'theia-mobile-parallel-note';
            err.textContent = error instanceof Error ? error.message : String(error);
            body.append(err);
        }
    }

    protected renderTimeline(
        body: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        checkpoints: QaapConversationCheckpointDTO[],
    ): void {
        body.replaceChildren();
        if (checkpoints.length === 0) {
            const note = document.createElement('div');
            note.className = 'theia-mobile-parallel-note';
            note.textContent = nls.localize('qaap/mobileProjects/timelineEmpty', 'No checkpoints yet — one is captured after each agent turn.');
            body.append(note);
            return;
        }
        const list = document.createElement('div');
        list.className = 'theia-mobile-timeline-list';
        const ordered = [...checkpoints].reverse();
        for (let index = 0; index < ordered.length; index++) {
            const checkpoint = ordered[index];
            const row = document.createElement('div');
            row.className = 'theia-mobile-timeline-node';
            if ((checkpoint.added ?? 0) > 0 || (checkpoint.removed ?? 0) > 0) {
                row.classList.add('theia-mod-ok');
            }
            if (index === 0) {
                row.classList.add('theia-mod-current');
            }
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-timeline-dot';
            dot.setAttribute('aria-hidden', 'true');
            const info = document.createElement('div');
            info.className = 'theia-mobile-timeline-info';
            const label = document.createElement('div');
            label.className = 'theia-mobile-timeline-label';
            label.textContent = checkpoint.label;
            const meta = document.createElement('div');
            meta.className = 'theia-mobile-timeline-meta';
            const when = document.createElement('span');
            when.className = 'theia-mobile-timeline-when';
            when.textContent = new Date(checkpoint.capturedAt).toLocaleTimeString();
            meta.append(when);
            if ((checkpoint.added ?? 0) > 0 || (checkpoint.removed ?? 0) > 0) {
                meta.append(createDiffStatsLine({
                    added: checkpoint.added,
                    removed: checkpoint.removed,
                }));
            }
            info.append(label, meta);
            const actions = document.createElement('div');
            actions.className = 'theia-mobile-timeline-actions';
            const restore = document.createElement('button');
            restore.type = 'button';
            restore.className = 'theia-mobile-timeline-restore';
            restore.textContent = nls.localize('qaap/mobileProjects/timelineRestore', 'Restore');
            restore.addEventListener('click', () => { void this.restoreTimelineCheckpoint(body, summary, checkpoint); });
            actions.append(restore);
            row.append(dot, info, actions);
            list.append(row);
        }
        body.append(list);
    }

    protected async restoreTimelineCheckpoint(
        body: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        checkpoint: QaapConversationCheckpointDTO,
    ): Promise<void> {
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/timelineRestoreTitle', 'Restore checkpoint'),
            msg: nls.localize(
                'qaap/mobileProjects/timelineRestoreMsg',
                'Restore tracked files to “{0}”? Files added after this checkpoint stay on disk. An undo snapshot is saved first.',
                checkpoint.label,
            ),
            ok: nls.localize('qaap/mobileProjects/timelineRestore', 'Restore'),
            cancel: nls.localize('qaap/mobileProjects/parallelCancel', 'Back'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            const conv = await restoreConversationCheckpoint(summary.id, checkpoint.id);
            if (!this.parallelUi.getOverlaySheet() || !body.isConnected) {
                return;
            }
            MobileSnackbar.show(nls.localize('qaap/mobileProjects/timelineRestored', 'Restored · undo available in Timeline'), { kind: 'success', duration: 2800 });
            this.renderTimeline(body, summary, conv.checkpoints ?? []);
        } catch (error) {
            MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning' });
        }
    }
}
