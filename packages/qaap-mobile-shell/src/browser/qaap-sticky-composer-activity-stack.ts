// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type { TranscriptFollowUpEntry } from '../common/qaap-transcript-follow-up-queue';
import {
    resolveDocumentIconClasses,
    truncateContextDetail,
} from './qaap-sticky-composer-context-ui';

export interface StickyComposerChangedFileView {
    readonly path: string;
    readonly kind: 'edited' | 'created';
    readonly added?: number;
    readonly removed?: number;
}

export interface StickyComposerActivityStackOptions {
    queueEntries?: readonly TranscriptFollowUpEntry[];
    queueExpanded?: boolean;
    onQueueExpandedChange?: (expanded: boolean) => void;
    onQueueEdit?: (index: number, entry: TranscriptFollowUpEntry) => void;
    onQueueMoveUp?: (index: number) => void;
    onQueueRemove?: (index: number) => void;
    changedFiles?: readonly StickyComposerChangedFileView[];
    diffStats?: { readonly added: number; readonly removed: number };
    filesExpanded?: boolean;
    onFilesExpandedChange?: (expanded: boolean) => void;
    agentWorking?: boolean;
    onStop?: () => void;
    onUndoAll?: () => void;
    onKeepAll?: () => void;
    changedFilesBulkBusy?: boolean;
    onReview?: () => void;
}

export function renderStickyComposerActivityStack(options: StickyComposerActivityStackOptions): HTMLElement | undefined {
    const queueSection = options.queueEntries?.length
        ? renderStickyComposerQueueSection(options)
        : undefined;
    const hasFiles = (options.changedFiles?.length ?? 0) > 0;
    const hasStats = !!options.diffStats && ((options.diffStats.added ?? 0) > 0 || (options.diffStats.removed ?? 0) > 0);
    const filesSection = hasFiles || hasStats
        ? renderStickyComposerChangedFilesSection(options)
        : undefined;
    if (!queueSection && !filesSection) {
        return undefined;
    }
    const stack = document.createElement('div');
    stack.className = 'theia-mobile-sticky-composer-activity-stack';
    if (queueSection) {
        stack.append(queueSection);
    }
    if (filesSection) {
        stack.append(filesSection);
    }
    return stack;
}

function renderStickyComposerQueueSection(options: StickyComposerActivityStackOptions): HTMLElement {
    const entries = options.queueEntries ?? [];
    let expanded = options.queueExpanded ?? true;

    const section = document.createElement('div');
    section.className = 'theia-mobile-sticky-composer-activity-section theia-mod-queue';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'theia-mobile-sticky-composer-activity-head';
    head.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    const chevron = document.createElement('span');
    chevron.className = 'theia-mobile-sticky-composer-activity-chevron codicon codicon-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.classList.toggle('theia-mod-collapsed', !expanded);

    const title = document.createElement('span');
    title.className = 'theia-mobile-sticky-composer-activity-title';
    title.textContent = entries.length === 1
        ? nls.localize('qaap/mobileProjects/stickyComposerQueueOne', '1 Queued')
        : nls.localize('qaap/mobileProjects/stickyComposerQueueMany', '{0} Queued', String(entries.length));

    head.append(chevron, title);

    const body = document.createElement('div');
    body.className = 'theia-mobile-sticky-composer-activity-body theia-mobile-sticky-composer-queue-list';
    body.hidden = !expanded;

    const syncExpanded = (): void => {
        head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        chevron.classList.toggle('theia-mod-collapsed', !expanded);
        body.hidden = !expanded;
        options.onQueueExpandedChange?.(expanded);
    };

    head.addEventListener('click', ev => {
        ev.stopPropagation();
        expanded = !expanded;
        syncExpanded();
    });

    entries.forEach((entry, index) => {
        body.append(renderQueueItem(entry, index, entries.length, options));
    });

    section.append(head, body);
    return section;
}

function renderQueueItem(
    entry: TranscriptFollowUpEntry,
    index: number,
    total: number,
    options: StickyComposerActivityStackOptions,
): HTMLElement {
    const row = document.createElement('div');
    row.className = 'theia-mobile-sticky-composer-queue-item';

    const marker = document.createElement('span');
    marker.className = 'theia-mobile-sticky-composer-queue-marker';
    marker.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'theia-mobile-sticky-composer-queue-text';
    text.textContent = entry.draft;

    const actions = document.createElement('div');
    actions.className = 'theia-mobile-sticky-composer-queue-actions';

    const editBtn = createQueueActionButton(
        'codicon-edit',
        nls.localize('qaap/mobileProjects/stickyComposerQueueEdit', 'Edit queued message'),
        () => options.onQueueEdit?.(index, entry),
    );
    actions.append(editBtn);

    if (index > 0) {
        actions.append(createQueueActionButton(
            'codicon-arrow-up',
            nls.localize('qaap/mobileProjects/stickyComposerQueueMoveUp', 'Move up in queue'),
            () => options.onQueueMoveUp?.(index),
        ));
    }

    actions.append(createQueueActionButton(
        'codicon-trash',
        nls.localize('qaap/mobileProjects/stickyComposerQueueRemove', 'Remove from queue'),
        () => options.onQueueRemove?.(index),
    ));

    row.append(marker, text, actions);
    row.title = total > 1
        ? nls.localize('qaap/mobileProjects/stickyComposerQueueItemHint', 'Queued message {0} of {1}', String(index + 1), String(total))
        : '';
    return row;
}

function buildChangedFilesHeadLabel(fileCount: number): string {
    return fileCount === 1
        ? nls.localize('qaap/mobileProjects/stickyComposerFilesOne', '1 File')
        : nls.localize('qaap/mobileProjects/stickyComposerFilesMany', '{0} Files', String(fileCount));
}

function appendDiffStatsInline(
    host: HTMLElement,
    stats: { readonly added?: number; readonly removed?: number } | undefined,
): void {
    if (!stats || ((stats.added ?? 0) <= 0 && (stats.removed ?? 0) <= 0)) {
        return;
    }
    const statsInline = document.createElement('span');
    statsInline.className = 'theia-mobile-sticky-composer-activity-inline-stats';
    if ((stats.added ?? 0) > 0) {
        const added = document.createElement('span');
        added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
        added.textContent = `+${stats.added}`;
        statsInline.append(added);
    }
    if ((stats.removed ?? 0) > 0) {
        const removed = document.createElement('span');
        removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
        removed.textContent = `-${stats.removed}`;
        statsInline.append(removed);
    }
    host.append(statsInline);
}

function renderStickyComposerChangedFilesSection(options: StickyComposerActivityStackOptions): HTMLElement {
    const files = options.changedFiles ?? [];
    const stats = options.diffStats;
    const hasStats = !!stats && ((stats.added ?? 0) > 0 || (stats.removed ?? 0) > 0);
    const hasFileRows = files.length > 0;
    const fileCount = hasFileRows ? files.length : (hasStats ? 1 : 0);
    let expanded = options.filesExpanded ?? true;

    const section = document.createElement('div');
    section.className = 'theia-mobile-sticky-composer-activity-section theia-mod-files';
    if (!hasFileRows) {
        section.classList.add('theia-mod-stats-only');
    }

    const strip = document.createElement('div');
    strip.className = 'theia-mobile-projects-sticky-composer-context-strip theia-mod-changed-files';

    const head = document.createElement('div');
    head.className = 'theia-mobile-projects-sticky-composer-context-head';

    const headMain = document.createElement('div');
    headMain.className = 'theia-mobile-projects-sticky-composer-context-head-main';

    let filesToggle: HTMLButtonElement | undefined;
    let filesBodyHost: HTMLElement | undefined;

    const syncFilesExpanded = (): void => {
        filesToggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        filesToggle?.classList.toggle('theia-mod-collapsed', !expanded);
        strip.classList.toggle('theia-mod-files-collapsed', !expanded);
        options.onFilesExpandedChange?.(expanded);
        if (filesBodyHost) {
            filesBodyHost.hidden = !expanded;
        }
    };

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theia-mobile-projects-sticky-composer-context-files-toggle';
    filesToggle = toggle;

    const chevron = document.createElement('span');
    chevron.className = 'codicon codicon-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'theia-mobile-projects-sticky-composer-context-head-label';
    text.textContent = buildChangedFilesHeadLabel(fileCount);

    toggle.append(chevron, text);
    appendDiffStatsInline(toggle, stats);
    toggle.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        expanded = !expanded;
        syncFilesExpanded();
    });
    headMain.append(toggle);

    const headActions = document.createElement('div');
    headActions.className = 'theia-mobile-projects-sticky-composer-context-head-actions';

    const bulkBusy = options.changedFilesBulkBusy === true;

    if (hasFileRows && options.onUndoAll) {
        const undoAll = document.createElement('button');
        undoAll.type = 'button';
        undoAll.className = 'theia-mobile-sticky-composer-activity-bulk-action theia-mod-undo';
        undoAll.textContent = nls.localize('qaap/mobileProjects/stickyComposerUndoAll', 'Undo All');
        undoAll.disabled = bulkBusy;
        undoAll.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onUndoAll?.();
        });
        headActions.append(undoAll);
    }

    if (hasFileRows && options.onKeepAll) {
        const keepAll = document.createElement('button');
        keepAll.type = 'button';
        keepAll.className = 'theia-mobile-sticky-composer-activity-bulk-action theia-mod-keep';
        keepAll.textContent = nls.localize('qaap/mobileProjects/stickyComposerKeepAll', 'Keep All');
        keepAll.disabled = bulkBusy;
        keepAll.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onKeepAll?.();
        });
        headActions.append(keepAll);
    }

    if (options.agentWorking && options.onStop) {
        const stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.className = 'theia-mobile-sticky-composer-activity-stop';
        stopBtn.title = nls.localize('qaap/mobileProjects/cancelTaskRun', 'Cancel run');
        stopBtn.setAttribute('aria-label', stopBtn.title);
        stopBtn.textContent = nls.localize('qaap/mobileProjects/stickyComposerFilesStop', 'Stop');
        stopBtn.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onStop?.();
        });
        headActions.append(stopBtn);
    }

    if (options.onReview) {
        const reviewBtn = document.createElement('button');
        reviewBtn.type = 'button';
        reviewBtn.className = 'theia-mobile-sticky-composer-activity-review';
        reviewBtn.disabled = bulkBusy;
        reviewBtn.textContent = nls.localize('qaap/mobileProjects/transcriptChangedFilesReview', 'Review');
        reviewBtn.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onReview?.();
        });
        headActions.append(reviewBtn);
    }

    head.append(headMain);
    if (headActions.childElementCount > 0) {
        head.append(headActions);
    }
    strip.append(head);

    if (hasFileRows) {
        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-sticky-composer-context-body';
        filesBodyHost = body;

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-changed-files-list';
        list.setAttribute('role', 'list');

        for (const file of files.slice(0, 12)) {
            list.append(renderChangedFileRow(file));
        }
        if (files.length > 12) {
            const more = document.createElement('div');
            more.className = 'theia-mobile-sticky-composer-changed-files-more';
            more.textContent = nls.localize(
                'qaap/mobileProjects/transcriptChangedFilesMore',
                '+{0} more',
                String(files.length - 12),
            );
            list.append(more);
        }

        body.append(list);
        strip.append(body);
    }

    syncFilesExpanded();
    section.append(strip);
    return section;
}

function renderChangedFileRow(file: StickyComposerChangedFileView): HTMLElement {
    const slash = file.path.lastIndexOf('/');
    const fileName = slash >= 0 ? file.path.slice(slash + 1) : file.path;

    const row = document.createElement('div');
    row.className = 'theia-mobile-sticky-composer-changed-file-row';
    row.classList.add(`theia-mod-${file.kind}`);
    row.setAttribute('role', 'listitem');
    row.title = file.path;

    const icon = document.createElement('span');
    icon.className = `theia-mobile-sticky-composer-changed-file-icon ${resolveDocumentIconClasses(fileName)}`;
    icon.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'theia-mobile-sticky-composer-changed-file-name';
    name.textContent = truncateContextDetail(fileName, 36);

    const stats = document.createElement('span');
    stats.className = 'theia-mobile-sticky-composer-changed-file-stats';
    const added = file.added ?? (file.kind === 'created' ? 1 : 0);
    const removed = file.removed ?? 0;
    if (added > 0) {
        const addedStat = document.createElement('span');
        addedStat.className = 'theia-mobile-agent-diff-stat theia-mod-added';
        addedStat.textContent = `+${added}`;
        stats.append(addedStat);
    }
    if (removed > 0) {
        const removedStat = document.createElement('span');
        removedStat.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
        removedStat.textContent = `-${removed}`;
        stats.append(removedStat);
    }

    row.append(icon, name);
    if (stats.childElementCount > 0) {
        row.append(stats);
    }
    return row;
}

function createQueueActionButton(iconClass: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theia-mobile-sticky-composer-queue-action';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span class="codicon ${iconClass}" aria-hidden="true"></span>`;
    btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick();
    });
    return btn;
}
