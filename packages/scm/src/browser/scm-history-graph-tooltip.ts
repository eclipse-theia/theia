// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { nls } from '@theia/core/lib/common/nls';
import { ScmHistoryItemRef } from './scm-provider';
import { HistoryGraphEntry } from './scm-history-graph-model';
import { laneColor, getRefBadgeClass, deduplicateRefs, isTagRef, isRemoteRef } from './scm-history-graph-helpers';

export function formatRelativeTime(ms: number): string {
    const now = Date.now();
    const diffMs = now - ms;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 30) {
        return new Date(ms).toLocaleDateString();
    }
    if (diffDay >= 1) {
        return diffDay === 1
            ? nls.localizeByDefault('{0} day ago', diffDay)
            : nls.localizeByDefault('{0} days ago', diffDay);
    }
    if (diffHour >= 1) {
        return diffHour === 1
            ? nls.localize('theia/scm/1HourAgo', '1 hour ago')
            : nls.localizeByDefault('{0} hours ago', diffHour);
    }
    if (diffMin >= 1) {
        return diffMin === 1
            ? nls.localize('theia/scm/1MinuteAgo', '1 minute ago')
            : nls.localizeByDefault('{0} minutes ago', diffMin);
    }
    return nls.localize('theia/scm/justNow', 'just now');
}

export function formatAbsoluteDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Appends a theme icon `<i>` element followed by a text node into a container.
 */
export function appendIconText(container: HTMLElement, iconName: string, text: string): void {
    const icon = document.createElement('i');
    icon.className = codicon(iconName) + ' icon-inline';
    container.appendChild(icon);
    container.appendChild(document.createTextNode(` ${text}`));
}

export function createHoverHr(): HTMLElement {
    return document.createElement('hr');
}

/** Creates a ref badge element for the HTML tooltip. */
export function buildTooltipRefBadge(
    ref: ScmHistoryItemRef,
    iconClass: string,
    showText: boolean,
    bgColor: string,
    extraClass?: string
): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `scm-history-ref-badge ${getRefBadgeClass(ref)} tooltip-badge${extraClass ? ' ' + extraClass : ''}`;
    badge.title = ref.description ?? ref.name;
    badge.style.backgroundColor = bgColor;
    badge.style.color = 'var(--theia-scmGraph-historyItemRefForeground, var(--theia-badge-foreground))';
    const icon = document.createElement('i');
    icon.className = `codicon ${iconClass} scm-history-ref-icon`;
    badge.appendChild(icon);
    if (showText) {
        const text = document.createElement('span');
        text.className = 'scm-history-ref-text';
        text.textContent = ref.name;
        badge.appendChild(text);
    }
    return badge;
}

export function buildHtmlTooltip(entry: HistoryGraphEntry, markdownRenderer: MarkdownRenderer): HTMLElement {
    const { item } = entry;
    const badgeColor = laneColor(entry.graphRow.color);
    const container = document.createElement('div');
    container.className = 'scm-history-tooltip';

    // Header
    if (item.author || item.timestamp !== undefined) {
        const header = document.createElement('div');
        header.className = 'scm-history-tooltip-header';
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '4px';

        if (item.author) {
            appendIconText(header, 'account', item.author);
        }
        if (item.timestamp !== undefined) {
            if (item.author) {
                header.appendChild(document.createTextNode('\u00a0\u00a0'));
            }
            const timeSpan = document.createElement('span');
            appendIconText(timeSpan, 'clock', `${formatRelativeTime(item.timestamp)} (${formatAbsoluteDate(item.timestamp)})`);
            header.appendChild(timeSpan);
        }

        container.appendChild(header);
        container.appendChild(createHoverHr());
    }

    // Body
    const subject = item.subject ?? '';
    const message = item.message?.trim();
    const bodyText = (message && message !== subject.trim())
        ? message
        : subject;
    const bodyMd = new MarkdownStringImpl(bodyText);
    const rendered = markdownRenderer.render(bodyMd);
    container.appendChild(rendered.element);

    // Stats
    if (item.statistics) {
        const s = item.statistics;
        container.appendChild(createHoverHr());

        const stats = document.createElement('div');
        stats.className = 'scm-history-tooltip-stats';

        const fileCount = s.files === 1 ? '1 file changed' : `${s.files} files changed`;
        const filesStrong = document.createElement('strong');
        filesStrong.textContent = fileCount;
        stats.appendChild(filesStrong);

        if (s.insertions > 0) {
            stats.appendChild(document.createTextNode(', '));
            const ins = document.createElement('span');
            ins.className = 'scm-history-stat-added';
            ins.textContent = `${s.insertions} insertion${s.insertions === 1 ? '' : 's'}(+)`;
            stats.appendChild(ins);
        }

        if (s.deletions > 0) {
            stats.appendChild(document.createTextNode(', '));
            const del = document.createElement('span');
            del.className = 'scm-history-stat-deleted';
            del.textContent = `${s.deletions} deletion${s.deletions === 1 ? '' : 's'}(-)`;
            stats.appendChild(del);
        }

        container.appendChild(stats);
    }

    // Refs + hash
    const hasRefs = item.references && item.references.length > 0;
    if (hasRefs || item.displayId) {
        container.appendChild(createHoverHr());

        const refsRow = document.createElement('div');
        refsRow.className = 'scm-history-tooltip-refs';
        refsRow.style.display = 'flex';
        refsRow.style.flexWrap = 'wrap';
        refsRow.style.gap = '4px';
        refsRow.style.alignItems = 'center';

        if (hasRefs) {
            const deduplicated = deduplicateRefs(item.references!);
            for (const { ref, hasBoth } of deduplicated) {
                const isTag = isTagRef(ref);
                const isRemote = isRemoteRef(ref);

                if (isTag) {
                    refsRow.appendChild(buildTooltipRefBadge(ref, 'codicon-tag', true, badgeColor));
                } else if (isRemote) {
                    refsRow.appendChild(buildTooltipRefBadge(ref, 'codicon-cloud', true, badgeColor));
                } else {
                    refsRow.appendChild(buildTooltipRefBadge(ref, 'codicon-git-branch', true, badgeColor));
                    if (hasBoth) {
                        refsRow.appendChild(buildTooltipRefBadge(ref, 'codicon-cloud', false, badgeColor, 'scm-history-ref-badge-cloud'));
                    }
                }
            }
        }

        if (item.displayId) {
            const hash = document.createElement('code');
            hash.textContent = item.displayId;
            refsRow.appendChild(hash);
        }

        container.appendChild(refsRow);
    }

    return container;
}
