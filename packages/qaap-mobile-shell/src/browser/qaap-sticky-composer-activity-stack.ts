// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type { TranscriptFollowUpEntry } from '../common/qaap-transcript-follow-up-queue';

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
    onReview?: () => void;
}

export function renderStickyComposerActivityStack(options: StickyComposerActivityStackOptions): HTMLElement | undefined {
    const queueSection = options.queueEntries?.length
        ? renderStickyComposerQueueSection(options)
        : undefined;
    const hasFiles = (options.changedFiles?.length ?? 0) > 0;
    const hasStats = !!options.diffStats && ((options.diffStats.added ?? 0) > 0 || (options.diffStats.removed ?? 0) > 0);
    const filesSection = hasFiles || (options.agentWorking && hasStats)
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

function renderStickyComposerChangedFilesSection(options: StickyComposerActivityStackOptions): HTMLElement {
    const files = options.changedFiles ?? [];
    const stats = options.diffStats;
    const hasStats = !!stats && ((stats.added ?? 0) > 0 || (stats.removed ?? 0) > 0);
    const hasFileRows = files.length > 0;
    const fileCount = hasFileRows ? files.length : (hasStats ? 1 : 0);
    let expanded = hasFileRows ? (options.filesExpanded ?? true) : false;

    const section = document.createElement('div');
    section.className = 'theia-mobile-sticky-composer-activity-section theia-mod-files';
    if (!hasFileRows) {
        section.classList.add('theia-mod-stats-only');
    }

    const headRow = document.createElement('div');
    headRow.className = 'theia-mobile-sticky-composer-activity-head-row';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'theia-mobile-sticky-composer-activity-head theia-mod-files-toggle';
    head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (!hasFileRows) {
        head.disabled = true;
        head.classList.add('theia-mod-static');
    }

    if (hasFileRows) {
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-sticky-composer-activity-chevron codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.classList.toggle('theia-mod-collapsed', !expanded);
        head.append(chevron);
    }

    const title = document.createElement('span');
    title.className = 'theia-mobile-sticky-composer-activity-title';
    title.textContent = fileCount === 1
        ? nls.localize('qaap/mobileProjects/stickyComposerFilesOne', '1 File')
        : nls.localize('qaap/mobileProjects/stickyComposerFilesMany', '{0} Files', String(fileCount));
    head.append(title);

    if (hasStats) {
        const statsInline = document.createElement('span');
        statsInline.className = 'theia-mobile-sticky-composer-activity-inline-stats';
        if ((stats!.added ?? 0) > 0) {
            const added = document.createElement('span');
            added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
            added.textContent = `+${stats!.added}`;
            statsInline.append(added);
        }
        if ((stats!.removed ?? 0) > 0) {
            const removed = document.createElement('span');
            removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
            removed.textContent = `-${stats!.removed}`;
            statsInline.append(removed);
        }
        head.append(statsInline);
    }

    const headActions = document.createElement('div');
    headActions.className = 'theia-mobile-sticky-composer-activity-head-actions';

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
        reviewBtn.textContent = nls.localize('qaap/mobileProjects/transcriptChangedFilesReview', 'Review');
        reviewBtn.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onReview?.();
        });
        headActions.append(reviewBtn);
    }

    headRow.append(head, headActions);
    section.append(headRow);

    if (hasFileRows) {
        const body = document.createElement('div');
        body.className = 'theia-mobile-sticky-composer-activity-body theia-mobile-sticky-composer-files-list';
        body.hidden = !expanded;

        for (const file of files.slice(0, 12)) {
            body.append(renderChangedFileRow(file));
        }
        if (files.length > 12) {
            const more = document.createElement('div');
            more.className = 'theia-mobile-sticky-composer-files-more';
            more.textContent = nls.localize(
                'qaap/mobileProjects/transcriptChangedFilesMore',
                '+{0} more',
                String(files.length - 12),
            );
            body.append(more);
        }

        head.addEventListener('click', ev => {
            ev.stopPropagation();
            expanded = !expanded;
            head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            head.querySelector('.theia-mobile-sticky-composer-activity-chevron')
                ?.classList.toggle('theia-mod-collapsed', !expanded);
            body.hidden = !expanded;
            options.onFilesExpandedChange?.(expanded);
        });

        section.append(body);
    }

    return section;
}

function renderChangedFileRow(file: StickyComposerChangedFileView): HTMLElement {
    const row = document.createElement('div');
    row.className = `theia-mobile-sticky-composer-file-row theia-mod-${file.kind}`;

    const icon = document.createElement('span');
    icon.className = `theia-mobile-sticky-composer-file-icon codicon ${composerFileIconClass(file.path)}`;
    icon.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'theia-mobile-sticky-composer-file-name';
    const slash = file.path.lastIndexOf('/');
    name.textContent = slash >= 0 ? file.path.slice(slash + 1) : file.path;

    row.append(icon, name);

    if ((file.added ?? 0) > 0 || (file.removed ?? 0) > 0) {
        const stats = document.createElement('span');
        stats.className = 'theia-mobile-sticky-composer-file-stats';
        if ((file.added ?? 0) > 0) {
            const added = document.createElement('span');
            added.className = 'theia-mobile-agent-diff-stat theia-mod-added';
            added.textContent = `+${file.added}`;
            stats.append(added);
        }
        if ((file.removed ?? 0) > 0) {
            const removed = document.createElement('span');
            removed.className = 'theia-mobile-agent-diff-stat theia-mod-removed';
            removed.textContent = `-${file.removed}`;
            stats.append(removed);
        }
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

function composerFileIconClass(path: string): string {
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
