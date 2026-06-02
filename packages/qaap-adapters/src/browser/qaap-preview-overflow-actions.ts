// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';

export type QaapPreviewOverflowActionId =
    | 'take-screenshot'
    | 'reload'
    | 'hard-reload'
    | 'copy-url'
    | 'bookmark-bar'
    | 'clear-history'
    | 'clear-cookies'
    | 'clear-cache'
    | 'open-external';

export interface QaapPreviewOverflowActionContext {
    readonly getFrame: () => HTMLIFrameElement | undefined;
    readonly getCurrentUrl: () => string;
    readonly reload: () => void;
    readonly hardReload: () => void;
    readonly openExternal: () => void;
    readonly copyCurrentUrl: () => Promise<void>;
    readonly clipboard?: ClipboardService;
    readonly messageService?: MessageService;
    readonly bookmarkBarVisible: () => boolean;
    readonly toggleBookmarkBar: () => void;
    readonly clearHistory: () => void;
}

export interface QaapPreviewOverflowMenuItem {
    readonly id: QaapPreviewOverflowActionId;
    readonly label: string;
    readonly toggle?: boolean;
    readonly checked?: boolean;
}

export function buildPreviewOverflowMenuItems(ctx: Pick<QaapPreviewOverflowActionContext, 'bookmarkBarVisible'>): QaapPreviewOverflowMenuItem[] {
    const bookmarkVisible = ctx.bookmarkBarVisible();
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
            ctx.messageService?.info(nls.localize('qaap/preview/reloaded', 'Preview reloaded'));
            return;
        case 'hard-reload':
            ctx.hardReload();
            ctx.messageService?.info(nls.localize('qaap/preview/hardReloaded', 'Preview hard reloaded'));
            return;
        case 'copy-url':
            await ctx.copyCurrentUrl();
            return;
        case 'open-external':
            ctx.openExternal();
            return;
        case 'bookmark-bar':
            ctx.toggleBookmarkBar();
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
        ctx.messageService?.warn(nls.localize(
            'qaap/preview/screenshotUnavailable',
            'Screenshots only work for same-origin previews. Open in browser to capture cross-origin pages.',
        ));
        return;
    }
    try {
        const blob = await captureSameOriginPreview(doc, frame);
        if (!blob) {
            throw new Error('capture failed');
        }
        if (ctx.clipboard && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            ctx.messageService?.info(nls.localize('qaap/preview/screenshotCopied', 'Screenshot copied to clipboard'));
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'preview-screenshot.png';
        link.click();
        URL.revokeObjectURL(url);
        ctx.messageService?.info(nls.localize('qaap/preview/screenshotDownloaded', 'Screenshot downloaded'));
    } catch {
        ctx.messageService?.warn(nls.localize(
            'qaap/preview/screenshotFailed',
            'Could not capture a screenshot for this page.',
        ));
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
        ctx.messageService?.info(nls.localize('qaap/preview/cookiesCleared', 'Preview cookies cleared'));
        ctx.reload();
    } catch {
        ctx.messageService?.warn(nls.localize(
            'qaap/preview/cookiesUnavailable',
            'Cookies cannot be cleared for cross-origin previews.',
        ));
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
    ctx.messageService?.info(cleared
        ? nls.localize('qaap/preview/cacheCleared', 'Preview cache cleared')
        : nls.localize('qaap/preview/cacheReloaded', 'Preview reloaded (cache API unavailable for this page)'));
}
