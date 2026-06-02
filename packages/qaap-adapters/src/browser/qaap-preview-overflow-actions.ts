// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { readPreviewInspectorPosition } from './qaap-preview-inspector-panel-size';

export type QaapPreviewOverflowActionId =
    | 'take-screenshot'
    | 'reload'
    | 'hard-reload'
    | 'copy-url'
    | 'bookmark-bar'
    | 'inspector-side'
    | 'inspector-bottom'
    | 'clear-history'
    | 'clear-cookies'
    | 'clear-cache'
    | 'open-external';

export const QAAP_PREVIEW_OVERFLOW_MENU_Z_INDEX = '2147483025';

export interface QaapPreviewOverflowActionContext {
    readonly getFrame: () => HTMLIFrameElement | undefined;
    readonly getCurrentUrl: () => string;
    readonly reload: () => void;
    readonly hardReload: () => void;
    readonly openExternal: () => void;
    readonly copyCurrentUrl: () => Promise<void>;
    readonly clipboard?: ClipboardService;
    readonly messageService?: MessageService;
    /** Optional toast (e.g. mobile snackbar) in addition to MessageService. */
    readonly notify?: (message: string, kind?: 'info' | 'warn') => void;
    readonly bookmarkBarVisible: () => boolean;
    readonly toggleBookmarkBar: () => void;
    readonly setInspectorPosition?: (position: 'side' | 'bottom') => void;
    readonly clearHistory: () => void;
}

export function previewNotify(ctx: Pick<QaapPreviewOverflowActionContext, 'messageService' | 'notify'>, message: string, kind: 'info' | 'warn' = 'info'): void {
    if (kind === 'warn') {
        ctx.messageService?.warn(message);
    } else {
        ctx.messageService?.info(message);
    }
    ctx.notify?.(message, kind);
}

export interface QaapPreviewOverflowMenuItem {
    readonly id: QaapPreviewOverflowActionId;
    readonly label: string;
    readonly toggle?: boolean;
    readonly checked?: boolean;
}

export function buildPreviewOverflowMenuItems(ctx: Pick<QaapPreviewOverflowActionContext, 'bookmarkBarVisible'>): QaapPreviewOverflowMenuItem[] {
    const bookmarkVisible = ctx.bookmarkBarVisible();
    const inspectorPosition = readPreviewInspectorPosition();
    return [
        {
            id: 'take-screenshot',
            label: nls.localize('qaap/preview/takeScreenshot', 'Take Screenshot'),
        },
        {
            id: 'hard-reload',
            label: nls.localize('qaap/preview/hardReload', 'Hard Reload'),
        },
        {
            id: 'copy-url',
            label: nls.localize('qaap/preview/copyUrl', 'Copy Current URL'),
        },
        {
            id: 'bookmark-bar',
            label: bookmarkVisible
                ? nls.localize('qaap/preview/hideBookmarkBar', 'Hide Bookmark Bar')
                : nls.localize('qaap/preview/showBookmarkBar', 'Show Bookmark Bar'),
            toggle: true,
            checked: bookmarkVisible,
        },
        {
            id: 'inspector-side',
            label: nls.localize('qaap/preview/inspectorSide', 'Element Inspector beside preview'),
            toggle: true,
            checked: inspectorPosition === 'side',
        },
        {
            id: 'inspector-bottom',
            label: nls.localize('qaap/preview/inspectorBottom', 'Element Inspector below preview'),
            toggle: true,
            checked: inspectorPosition === 'bottom',
        },
        {
            id: 'clear-history',
            label: nls.localize('qaap/preview/clearHistory', 'Clear Browsing History'),
        },
        {
            id: 'clear-cookies',
            label: nls.localize('qaap/preview/clearCookies', 'Clear Cookies'),
        },
        {
            id: 'clear-cache',
            label: nls.localize('qaap/preview/clearCache', 'Clear Cache'),
        },
    ];
}

export async function runPreviewOverflowAction(
    id: QaapPreviewOverflowActionId,
    ctx: QaapPreviewOverflowActionContext,
): Promise<void> {
    switch (id) {
        case 'take-screenshot':
            await runPreviewTakeScreenshot(ctx);
            return;
        case 'reload':
            ctx.reload();
            previewNotify(ctx, nls.localize('qaap/preview/reloaded', 'Preview reloaded'));
            return;
        case 'hard-reload':
            ctx.hardReload();
            previewNotify(ctx, nls.localize('qaap/preview/hardReloaded', 'Preview hard reloaded'));
            return;
        case 'copy-url':
            await runPreviewCopyCurrentUrl(ctx);
            return;
        case 'open-external':
            ctx.openExternal();
            return;
        case 'bookmark-bar':
            ctx.toggleBookmarkBar();
            return;
        case 'inspector-side':
            ctx.setInspectorPosition?.('side');
            return;
        case 'inspector-bottom':
            ctx.setInspectorPosition?.('bottom');
            return;
        case 'clear-history':
            ctx.clearHistory();
            return;
        case 'clear-cookies':
            clearSameOriginPreviewCookies(ctx);
            return;
        case 'clear-cache':
            await clearSameOriginPreviewCache(ctx);
            return;
    }
}

export interface MountPreviewOverflowMenuOptions {
    readonly anchor: HTMLElement;
    readonly bookmarkBarVisible: () => boolean;
    readonly getContext: () => QaapPreviewOverflowActionContext;
    readonly onClose: () => void;
}

/** Portal overflow menu to `document.body` with per-item click handlers (mobile-safe). */
export function mountPreviewOverflowMenu(options: MountPreviewOverflowMenuOptions): { menu: HTMLElement; dispose: () => void } {
    const menu = document.createElement('div');
    menu.className = 'qaap-agent-preview-overflow-menu';
    menu.setAttribute('role', 'menu');

    const items = buildPreviewOverflowMenuItems({ bookmarkBarVisible: options.bookmarkBarVisible });
    for (const item of items) {
        menu.append(createPreviewOverflowMenuRow(item));
    }

    const activate = (actionId: QaapPreviewOverflowActionId): void => {
        void runPreviewOverflowAction(actionId, options.getContext()).catch(() => {
            previewNotify(
                options.getContext(),
                nls.localize('qaap/preview/actionFailed', 'Could not run that action'),
                'warn',
            );
        });
        options.onClose();
    };

    for (const row of menu.querySelectorAll<HTMLButtonElement>('[data-action]')) {
        const actionId = row.getAttribute('data-action') as QaapPreviewOverflowActionId | null;
        if (!actionId) {
            continue;
        }
        const onActivate = (e: Event): void => {
            e.preventDefault();
            e.stopPropagation();
            activate(actionId);
        };
        row.addEventListener('click', onActivate);
        row.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                onActivate(e);
            }
        });
    }

    document.body.append(menu);
    positionPreviewOverflowMenu(menu, options.anchor);
    menu.style.zIndex = QAAP_PREVIEW_OVERFLOW_MENU_Z_INDEX;

    const closeOnOutside = (e: MouseEvent): void => {
        const target = e.target as Node;
        if (menu.contains(target) || options.anchor.contains(target)) {
            return;
        }
        options.onClose();
    };

    const dispose = (): void => {
        document.removeEventListener('click', closeOnOutside, true);
        menu.remove();
    };

    requestAnimationFrame(() => document.addEventListener('click', closeOnOutside, true));

    return { menu, dispose };
}

function createPreviewOverflowMenuRow(item: QaapPreviewOverflowMenuItem): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'qaap-agent-preview-overflow-item';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('data-action', item.id);
    if (item.toggle) {
        row.classList.add('qaap-agent-preview-overflow-toggle');
        row.setAttribute('aria-checked', item.checked ? 'true' : 'false');
        const label = document.createElement('span');
        label.className = 'qaap-agent-preview-overflow-item-label';
        label.textContent = item.label;
        const toggle = document.createElement('span');
        toggle.className = 'qaap-agent-preview-overflow-toggle-switch';
        toggle.setAttribute('aria-hidden', 'true');
        row.append(label, toggle);
    } else {
        row.textContent = item.label;
    }
    return row;
}

function positionPreviewOverflowMenu(menu: HTMLElement, anchor: HTMLElement): void {
    const margin = 8;
    const gap = 4;
    const anchorRect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    menu.style.pointerEvents = 'auto';
    const menuHeight = menu.offsetHeight || 1;
    let top = anchorRect.bottom + gap;
    const maxBottom = window.innerHeight - margin;
    if (top + menuHeight > maxBottom) {
        const aboveTop = anchorRect.top - gap - menuHeight;
        top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
    }
    let right = window.innerWidth - anchorRect.right;
    right = Math.max(margin, right);
    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;
    menu.style.left = 'auto';
    menu.style.visibility = '';
}

async function runPreviewCopyCurrentUrl(ctx: QaapPreviewOverflowActionContext): Promise<void> {
    const url = ctx.getCurrentUrl().trim();
    if (!url) {
        previewNotify(ctx, nls.localize('qaap/preview/noUrlToCopy', 'No URL to copy'), 'warn');
        return;
    }
    try {
        if (ctx.clipboard) {
            await ctx.clipboard.writeText(url);
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
        } else {
            throw new Error('clipboard unavailable');
        }
        previewNotify(ctx, nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
    } catch {
        previewNotify(ctx, nls.localize('qaap/preview/urlCopyFailed', 'Could not copy URL to clipboard'), 'warn');
    }
}

export async function captureSameOriginPreview(doc: Document, frame: HTMLIFrameElement): Promise<Blob | undefined> {
    const width = Math.max(doc.documentElement.scrollWidth, frame.clientWidth);
    const height = Math.max(doc.documentElement.scrollHeight, frame.clientHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return undefined;
    }
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    ${new XMLSerializer().serializeToString(doc.documentElement)}
  </foreignObject>
</svg>`;
    const img = new Image();
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg render failed'));
        img.src = url;
    });
    ctx.drawImage(img, 0, 0);
    return new Promise<Blob | undefined>(resolve => {
        canvas.toBlob(blob => resolve(blob ?? undefined), 'image/png');
    });
}

async function runPreviewTakeScreenshot(ctx: QaapPreviewOverflowActionContext): Promise<void> {
    const frame = ctx.getFrame();
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) {
        previewNotify(ctx, nls.localize(
            'qaap/preview/screenshotUnavailable',
            'Screenshots only work for same-origin previews. Open in browser to capture cross-origin pages.',
        ), 'warn');
        return;
    }
    try {
        const blob = await captureSameOriginPreview(doc, frame);
        if (!blob) {
            throw new Error('capture failed');
        }
        if (ctx.clipboard && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            previewNotify(ctx, nls.localize('qaap/preview/screenshotCopied', 'Screenshot copied to clipboard'));
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'preview-screenshot.png';
        link.click();
        URL.revokeObjectURL(url);
        previewNotify(ctx, nls.localize('qaap/preview/screenshotDownloaded', 'Screenshot downloaded'));
    } catch {
        previewNotify(ctx, nls.localize(
            'qaap/preview/screenshotFailed',
            'Could not capture a screenshot for this page.',
        ), 'warn');
    }
}

function clearSameOriginPreviewCookies(ctx: QaapPreviewOverflowActionContext): void {
    try {
        const frame = ctx.getFrame();
        const doc = frame?.contentDocument;
        if (!doc) {
            throw new Error('cross-origin');
        }
        const cookies = doc.cookie.split(';');
        for (const chunk of cookies) {
            const name = chunk.split('=')[0]?.trim();
            if (!name) {
                continue;
            }
            const paths = ['/', window.location.pathname].filter(Boolean);
            for (const path of paths) {
                doc.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${path}`;
            }
            doc.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
        previewNotify(ctx, nls.localize('qaap/preview/cookiesCleared', 'Preview cookies cleared'));
        ctx.reload();
    } catch {
        previewNotify(ctx, nls.localize(
            'qaap/preview/cookiesUnavailable',
            'Cookies cannot be cleared for cross-origin previews.',
        ), 'warn');
    }
}

async function clearSameOriginPreviewCache(ctx: QaapPreviewOverflowActionContext): Promise<void> {
    const frame = ctx.getFrame();
    let cleared = false;
    try {
        const win = frame?.contentWindow;
        if (win && 'caches' in win) {
            const cacheStorage = (win as Window & { caches: CacheStorage }).caches;
            const keys = await cacheStorage.keys();
            await Promise.all(keys.map(key => cacheStorage.delete(key)));
            cleared = keys.length > 0;
        }
    } catch {
        /* cross-origin or unsupported */
    }
    ctx.hardReload();
    previewNotify(ctx, cleared
        ? nls.localize('qaap/preview/cacheCleared', 'Preview cache cleared')
        : nls.localize('qaap/preview/cacheReloaded', 'Preview reloaded (cache API unavailable for this page)'));
}
