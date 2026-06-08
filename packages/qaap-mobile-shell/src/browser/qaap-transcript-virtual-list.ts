// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import {
    buildVirtualListLayouts,
    resolveVirtualListVisibleRange,
} from '../common/qaap-transcript-virtual-list-math';

export const TRANSCRIPT_VIRTUAL_DEFAULT_ITEM_HEIGHT = 128;
export const TRANSCRIPT_VIRTUAL_OVERSCAN_PX = 480;
/** Virtualize once the thread is long enough to hurt scroll paint on real devices. */
export const TRANSCRIPT_VIRTUAL_MIN_MESSAGES = 12;

export type TranscriptVirtualListRenderFn = (index: number) => HTMLElement;

export interface TranscriptVirtualListOptions {
    readonly scrollHost: HTMLElement;
    readonly defaultItemHeight?: number;
    readonly overscanPx?: number;
    readonly renderItem: TranscriptVirtualListRenderFn;
}

/**
 * Windowed transcript renderer — only mounts rows in (or near) the viewport.
 * The scroll host keeps native overflow so touch scroll and scroll-pin still work.
 */
export class TranscriptVirtualList implements Disposable {
    protected readonly defaultItemHeight: number;
    protected readonly overscanPx: number;
    protected readonly renderItem: TranscriptVirtualListRenderFn;
    protected readonly root: HTMLElement;
    protected readonly spacer: HTMLElement;
    protected readonly window: HTMLElement;
    protected readonly footerHost: HTMLElement;
    protected readonly scrollHost: HTMLElement;
    protected readonly mounted = new Map<number, HTMLElement>();
    protected sizes: number[] = [];
    protected itemCount = 0;
    protected disposed = false;
    protected rafId = 0;
    protected scrollListener: () => void;
    protected resizeObserver: ResizeObserver | undefined;

    constructor(options: TranscriptVirtualListOptions) {
        this.scrollHost = options.scrollHost;
        this.defaultItemHeight = options.defaultItemHeight ?? TRANSCRIPT_VIRTUAL_DEFAULT_ITEM_HEIGHT;
        this.overscanPx = options.overscanPx ?? TRANSCRIPT_VIRTUAL_OVERSCAN_PX;
        this.renderItem = options.renderItem;

        this.root = document.createElement('div');
        this.root.className = 'theia-transcript-virtual-root';

        this.spacer = document.createElement('div');
        this.spacer.className = 'theia-transcript-virtual-spacer';

        this.window = document.createElement('div');
        this.window.className = 'theia-transcript-virtual-window';

        this.footerHost = document.createElement('div');
        this.footerHost.className = 'theia-transcript-virtual-footer';

        this.spacer.append(this.window, this.footerHost);
        this.root.append(this.spacer);
        this.scrollHost.replaceChildren(this.root);

        this.scrollListener = () => this.scheduleUpdate();
        this.scrollHost.addEventListener('scroll', this.scrollListener, { passive: true });

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
            this.resizeObserver.observe(this.window);
        }
    }

    get active(): boolean {
        return !this.disposed && this.itemCount > 0;
    }

    setItemCount(count: number, resetSizes = false): void {
        this.itemCount = Math.max(0, count);
        if (resetSizes || this.sizes.length !== count) {
            this.sizes = Array.from({ length: count }, (_, index) => this.sizes[index] ?? 0);
        }
        this.scheduleUpdate();
    }

    setFooter(children: readonly HTMLElement[]): void {
        this.footerHost.replaceChildren(...children);
        this.scheduleUpdate();
    }

    scrollToEnd(): void {
        this.scrollHost.scrollTop = this.scrollHost.scrollHeight;
    }

    isNearBottom(thresholdPx = 48): boolean {
        const distance = this.scrollHost.scrollHeight - this.scrollHost.scrollTop - this.scrollHost.clientHeight;
        return distance <= thresholdPx;
    }

    findRowByAttribute(attr: string, value: string): HTMLElement | undefined {
        return this.window.querySelector<HTMLElement>(`[${attr}="${CSS.escape(value)}"]`) ?? undefined;
    }

    replaceRowByAttribute(attr: string, value: string, row: HTMLElement): boolean {
        const existing = this.findRowByAttribute(attr, value);
        if (!existing) {
            return false;
        }
        const parent = existing.parentElement;
        const indexAttr = existing.getAttribute('data-virtual-index');
        existing.replaceWith(row);
        if (indexAttr !== null) {
            const index = Number(indexAttr);
            if (!Number.isNaN(index)) {
                this.mounted.set(index, row);
                row.setAttribute('data-virtual-index', String(index));
                this.scheduleMeasure();
            }
        }
        if (parent) {
            this.scheduleUpdate();
        }
        return true;
    }

    appendRow(row: HTMLElement, index: number): void {
        row.setAttribute('data-virtual-index', String(index));
        this.window.append(row);
        this.mounted.set(index, row);
        this.itemCount = Math.max(this.itemCount, index + 1);
        if (this.sizes.length < this.itemCount) {
            this.sizes = [...this.sizes, ...Array.from({ length: this.itemCount - this.sizes.length }, () => 0)];
        }
        this.scheduleMeasure();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.scrollHost.removeEventListener('scroll', this.scrollListener);
        this.resizeObserver?.disconnect();
        this.mounted.clear();
    }

    protected scheduleUpdate(): void {
        if (this.disposed || this.rafId) {
            return;
        }
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.update();
        });
    }

    protected scheduleMeasure(): void {
        this.scheduleUpdate();
    }

    protected update(): void {
        if (this.disposed) {
            return;
        }
        const layouts = buildVirtualListLayouts(this.sizes, this.defaultItemHeight);
        const range = resolveVirtualListVisibleRange(
            this.scrollHost.scrollTop,
            this.scrollHost.clientHeight,
            layouts,
            this.overscanPx,
        );
        this.window.style.transform = `translateY(${range.windowOffset}px)`;
        this.footerHost.style.transform = `translateY(${range.totalHeight}px)`;

        const nextMounted = new Set<number>();
        for (let index = range.startIndex; index <= range.endIndex; index++) {
            nextMounted.add(index);
            let row = this.mounted.get(index);
            if (!row || !row.isConnected) {
                row = this.renderItem(index);
                row.setAttribute('data-virtual-index', String(index));
                this.mounted.set(index, row);
            }
            if (!row.parentElement) {
                this.window.append(row);
            }
        }

        for (const [index, row] of this.mounted) {
            if (!nextMounted.has(index)) {
                row.remove();
                this.mounted.delete(index);
            }
        }

        const footerHeight = this.footerHost.offsetHeight;
        this.spacer.style.height = `${range.totalHeight + footerHeight}px`;
        requestAnimationFrame(() => this.measureVisible(range.startIndex, range.endIndex));
    }

    protected measureVisible(startIndex: number, endIndex: number): void {
        if (this.disposed) {
            return;
        }
        let changed = false;
        for (let index = startIndex; index <= endIndex; index++) {
            const row = this.mounted.get(index);
            if (!row) {
                continue;
            }
            const height = Math.ceil(row.getBoundingClientRect().height);
            if (height > 0 && this.sizes[index] !== height) {
                this.sizes[index] = height;
                changed = true;
            }
        }
        if (changed) {
            this.update();
        }
    }
}
