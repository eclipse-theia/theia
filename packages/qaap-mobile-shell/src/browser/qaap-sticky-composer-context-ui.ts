// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { nls } from '@theia/core/lib/common/nls';
import type { LabelProvider } from '@theia/core/lib/browser';
import { installMobileHorizontalTouchScroll } from './mobile-horizontal-touch-scroll';

export interface StickyComposerContextChipView {
    title: string;
    subtitle?: string;
    iconClasses: string;
    kind: string;
}

export function resolveStickyComposerContextChip(
    request: AIVariableResolutionRequest,
    labelProvider?: LabelProvider,
): StickyComposerContextChipView {
    const variable = request.variable;
    const title = (labelProvider?.getName(request) ?? variable.label ?? variable.name ?? '').trim();
    const rawDetails = labelProvider?.getDetails(request) ?? request.arg;
    const subtitle = rawDetails?.trim() ? truncateContextDetail(rawDetails.trim()) : undefined;
    const iconFromProvider = labelProvider?.getIcon(request);
    const iconClasses = typeof iconFromProvider === 'string' && iconFromProvider.length > 0
        ? iconFromProvider
        : (variable.iconClasses?.join(' ') ?? 'codicon codicon-symbol-variable');
    return {
        title,
        subtitle,
        iconClasses,
        kind: variable.name ?? 'context',
    };
}

export function truncateContextDetail(text: string, maxLen = 40): string {
    if (text.length <= maxLen) {
        return text;
    }
    const slash = text.lastIndexOf('/');
    if (slash >= 0) {
        const file = text.slice(slash + 1);
        const prefix = text.slice(0, slash);
        if (file.length <= maxLen - 5) {
            const shortPrefix = prefix.length > 12 ? `…${prefix.slice(-10)}` : prefix;
            return `${shortPrefix}/${file}`;
        }
    }
    const head = Math.ceil((maxLen - 1) * 0.42);
    const tail = maxLen - 1 - head;
    return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function renderStickyComposerContextStrip(options: {
    items: readonly AIVariableResolutionRequest[];
    formatChip: (item: AIVariableResolutionRequest) => StickyComposerContextChipView;
    onRemoveItem: (index: number) => void;
    onClearAll: () => void;
    filesExpanded?: boolean;
    onFilesExpandedChange?: (expanded: boolean) => void;
}): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'theia-mobile-projects-sticky-composer-context-strip';

    const head = document.createElement('div');
    head.className = 'theia-mobile-projects-sticky-composer-context-head';

    const headMain = document.createElement('div');
    headMain.className = 'theia-mobile-projects-sticky-composer-context-head-main';

    const entries = options.items.map((item, index) => ({
        item,
        index,
        view: options.formatChip(item),
    }));
    const fileEntries = entries.filter(entry => entry.item.variable.name === 'file');
    const otherEntries = entries.filter(entry => entry.item.variable.name !== 'file');

    const filesOnly = fileEntries.length === options.items.length;
    let fileRowsHost: HTMLElement | undefined;
    let filesExpanded = options.filesExpanded ?? true;

    if (filesOnly) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-projects-sticky-composer-context-files-toggle';
        toggle.setAttribute('aria-expanded', filesExpanded ? 'true' : 'false');
        toggle.classList.toggle('theia-mod-collapsed', !filesExpanded);

        const chevron = document.createElement('span');
        chevron.className = 'codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.className = 'theia-mobile-projects-sticky-composer-context-head-label';
        text.textContent = nls.localize(
            'qaap/mobileProjects/stickyComposerFilesCount',
            '{0} Files',
            String(fileEntries.length),
        );

        toggle.append(chevron, text);
        toggle.addEventListener('click', ev => {
            ev.stopPropagation();
            filesExpanded = !filesExpanded;
            toggle.setAttribute('aria-expanded', filesExpanded ? 'true' : 'false');
            toggle.classList.toggle('theia-mod-collapsed', !filesExpanded);
            options.onFilesExpandedChange?.(filesExpanded);
            if (fileRowsHost) {
                fileRowsHost.hidden = !filesExpanded;
            }
        });
        headMain.append(toggle);
    } else {
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-sticky-composer-context-head-label';
        label.textContent = nls.localize('qaap/mobileProjects/stickyComposerContextHeading', 'Context');

        const count = document.createElement('span');
        count.className = 'theia-mobile-projects-sticky-composer-context-count';
        count.textContent = String(options.items.length);
        count.setAttribute('aria-label', nls.localize(
            'qaap/mobileProjects/stickyComposerContextCount',
            '{0} context item(s)',
            String(options.items.length),
        ));
        headMain.append(label, count);
    }

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'theia-mobile-projects-sticky-composer-context-clear-all';
    clearAll.textContent = nls.localize('qaap/mobileProjects/stickyComposerContextClear', 'Clear all');
    clearAll.addEventListener('click', ev => {
        ev.stopPropagation();
        options.onClearAll();
    });

    head.append(headMain, clearAll);

    if (fileEntries.length > 0) {
        const files = document.createElement('div');
        files.className = 'theia-mobile-projects-sticky-composer-context-files';
        files.setAttribute('role', 'list');
        fileRowsHost = files;
        for (const entry of fileEntries) {
            const fileRow = document.createElement('div');
            fileRow.className = 'theia-mobile-projects-sticky-composer-context-file';
            fileRow.setAttribute('role', 'listitem');

            const icon = document.createElement('span');
            icon.className = `theia-mobile-projects-sticky-composer-context-file-icon ${entry.view.iconClasses}`;
            icon.setAttribute('aria-hidden', 'true');

            const body = document.createElement('div');
            body.className = 'theia-mobile-projects-sticky-composer-context-file-body';

            const title = document.createElement('span');
            title.className = 'theia-mobile-projects-sticky-composer-context-file-title';
            title.textContent = entry.view.title;
            body.append(title);

            if (entry.view.subtitle) {
                const subtitle = document.createElement('span');
                subtitle.className = 'theia-mobile-projects-sticky-composer-context-file-subtitle';
                subtitle.textContent = entry.view.subtitle;
                body.append(subtitle);
                fileRow.title = `${entry.view.title} — ${entry.view.subtitle}`;
            } else {
                fileRow.title = entry.view.title;
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'theia-mobile-projects-sticky-composer-context-file-remove codicon codicon-close';
            remove.title = nls.localize('qaap/mobileProjects/stickyComposerContextRemove', 'Remove from context');
            remove.setAttribute('aria-label', remove.title);
            remove.addEventListener('click', ev => {
                ev.stopPropagation();
                options.onRemoveItem(entry.index);
            });

            fileRow.append(icon, body, remove);
            files.append(fileRow);
        }
        files.hidden = !filesExpanded;
        strip.append(files);
    }

    if (otherEntries.length > 0) {
        const chips = document.createElement('div');
        chips.className = 'theia-mobile-projects-sticky-composer-context-chips';
        chips.setAttribute('role', 'list');

        for (const entry of otherEntries) {
            const view = entry.view;
            const index = entry.index;
        const chip = document.createElement('div');
        chip.className = 'theia-mobile-projects-sticky-composer-context-chip';
        chip.classList.add(`theia-mod-kind-${sanitizeContextKindClass(view.kind)}`);
        chip.setAttribute('role', 'listitem');
        chip.title = view.subtitle ? `${view.title} — ${view.subtitle}` : view.title;

        const icon = document.createElement('span');
        icon.className = `theia-mobile-projects-sticky-composer-context-chip-icon ${view.iconClasses}`;
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-sticky-composer-context-chip-body';

        const title = document.createElement('span');
        title.className = 'theia-mobile-projects-sticky-composer-context-chip-title';
        title.textContent = view.title;

        body.append(title);
        if (view.subtitle) {
            const subtitle = document.createElement('span');
            subtitle.className = 'theia-mobile-projects-sticky-composer-context-chip-subtitle';
            subtitle.textContent = view.subtitle;
            body.append(subtitle);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'theia-mobile-projects-sticky-composer-context-chip-remove codicon codicon-close';
        remove.title = nls.localize('qaap/mobileProjects/stickyComposerContextRemove', 'Remove from context');
        remove.setAttribute('aria-label', remove.title);
        remove.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onRemoveItem(index);
        });

        chip.append(icon, body, remove);
        chips.append(chip);
    }

        installMobileHorizontalTouchScroll(chips);
        strip.append(chips);
    }

    strip.prepend(head);
    return strip;
}

function sanitizeContextKindClass(kind: string | undefined): string {
    return (kind ?? 'context').replace(/[^a-zA-Z0-9_-]+/g, '-');
}
