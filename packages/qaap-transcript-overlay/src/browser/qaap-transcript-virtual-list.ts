// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import { isTranscriptDocumentVisible } from '../common/qaap-transcript-document-visibility';
import {
    buildVirtualListOffsets,
    resolveVirtualListVisibleRange,
} from '../common/qaap-transcript-virtual-list-math';

export {
    TRANSCRIPT_VIRTUAL_MIN_MESSAGES,
    TRANSCRIPT_VIRTUAL_MIN_MESSAGES_NARROW,
} from '../common/qaap-transcript-virtual-list-policy';

export const TRANSCRIPT_VIRTUAL_DEFAULT_ITEM_HEIGHT = 128;
export const TRANSCRIPT_VIRTUAL_OVERSCAN_PX = 480;
/**
 * Coalescing window for height remeasurements. During token streaming, content reflows
 * fire ResizeObserver many times per second; without throttling, each fires a
 * `getBoundingClientRect()` over every visible row and a relayout, forcing layout
 * thrash. 100ms keeps the perceived scroll-pin smooth without backlogging measurements.
 */
export const TRANSCRIPT_VIRTUAL_MEASURE_THROTTLE_MS = 100;

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
 *
 * Scroll frames are O(log n): prefix offsets are cached and rebuilt only when a
 * size actually changes, and row remeasurement (forced layout reads) runs only
 * when rows were just mounted or content reflowed — never on plain scrolling.
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
    protected offsets: readonly number[] = [0];
    protected offsetsDirty = false;
    protected footerHeight = 0;
    protected itemCount = 0;
    protected disposed = false;
    protected rafId = 0;
    protected measureRafId = 0;
    protected measureRequested = true;
    protected measureTimeoutId: ReturnType<typeof setTimeout> | undefined;
    protected lastMeasureRanAt = 0;
    protected pendingWhileHidden = false;
    protected scrollListener: () => void;
    protected resizeObserver: ResizeObserver | undefined;
    protected visibilityListener: (() => void) | undefined;

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

        if (typeof document !== 'undefined') {
            this.visibilityListener = () => {
                if (isTranscriptDocumentVisible() && this.pendingWhileHidden) {
                    this.pendingWhileHidden = false;
                    this.scheduleUpdate();
                }
            };
            document.addEventListener('visibilitychange', this.visibilityListener);
        }
    }

    get active(): boolean {
        return !this.disposed && this.itemCount > 0;
    }

    setItemCount(count: number, resetSizes = false): void {
        this.itemCount = Math.max(0, count);
        if (resetSizes || this.sizes.length !== count) {
            this.sizes = Array.from({ length: count }, (_, index) => resetSizes ? 0 : this.sizes[index] ?? 0);
            this.offsetsDirty = true;
            this.measureRequested = true;
        }
        this.scheduleUpdate();
    }

    setFooter(children: readonly HTMLElement[]): void {
        this.footerHost.replaceChildren(...children);
        this.measureRequested = true;
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
            this.offsetsDirty = true;
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
        if (this.measureRafId) {
            cancelAnimationFrame(this.measureRafId);
            this.measureRafId = 0;
        }
        if (this.measureTimeoutId !== undefined) {
            clearTimeout(this.measureTimeoutId);
            this.measureTimeoutId = undefined;
        }
        this.scrollHost.removeEventListener('scroll', this.scrollListener);
        this.resizeObserver?.disconnect();
        if (this.visibilityListener) {
            document.removeEventListener('visibilitychange', this.visibilityListener);
            this.visibilityListener = undefined;
        }
        this.mounted.clear();
    }

    protected shouldPauseBackgroundWork(): boolean {
        return !isTranscriptDocumentVisible();
    }

    protected scheduleUpdate(): void {
        if (this.disposed || this.rafId) {
            return;
        }
        if (this.shouldPauseBackgroundWork()) {
            this.pendingWhileHidden = true;
            return;
        }
        this.pendingWhileHidden = false;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.update();
        });
    }

    /**
     * Throttled remeasure path used by ResizeObserver and content swaps during streaming.
     * Bursts of reflow events coalesce into one `scheduleUpdate()` per
     * `TRANSCRIPT_VIRTUAL_MEASURE_THROTTLE_MS` window, avoiding layout thrash on every
     * token delta. Scroll handling stays on its own RAF path and remains snappy.
     */
    protected scheduleMeasure(): void {
        if (this.disposed) {
            return;
        }
        if (this.shouldPauseBackgroundWork()) {
            this.measureRequested = true;
            this.pendingWhileHidden = true;
            return;
        }
        this.measureRequested = true;
        if (this.measureTimeoutId !== undefined) {
            return;
        }
        const now = Date.now();
        const elapsed = now - this.lastMeasureRanAt;
        const delay = elapsed >= TRANSCRIPT_VIRTUAL_MEASURE_THROTTLE_MS
            ? 0
            : TRANSCRIPT_VIRTUAL_MEASURE_THROTTLE_MS - elapsed;
        this.measureTimeoutId = setTimeout(() => {
            this.measureTimeoutId = undefined;
            this.lastMeasureRanAt = Date.now();
            this.scheduleUpdate();
        }, delay);
    }

    protected update(): void {
        if (this.disposed) {
            return;
        }
        if (this.shouldPauseBackgroundWork()) {
            this.pendingWhileHidden = true;
            return;
        }
        this.pendingWhileHidden = false;
        if (this.offsetsDirty || this.offsets.length !== this.sizes.length + 1) {
            this.offsets = buildVirtualListOffsets(this.sizes, this.defaultItemHeight);
            this.offsetsDirty = false;
        }
        const range = resolveVirtualListVisibleRange(
            this.scrollHost.scrollTop,
            this.scrollHost.clientHeight,
            this.offsets,
            this.overscanPx,
        );
        this.window.style.transform = `translateY(${range.windowOffset}px)`;
        this.footerHost.style.transform = `translateY(${range.totalHeight}px)`;

        let mountedNew = false;
        const nextMounted = new Set<number>();
        for (let index = range.startIndex; index <= range.endIndex; index++) {
            nextMounted.add(index);
            let row = this.mounted.get(index);
            if (!row || !row.isConnected) {
                row = this.renderItem(index);
                row.setAttribute('data-virtual-index', String(index));
                this.mounted.set(index, row);
                mountedNew = true;
            }
            if (!row.parentElement) {
                this.window.append(row);
                mountedNew = true;
            }
        }

        for (const [index, row] of this.mounted) {
            if (!nextMounted.has(index)) {
                row.remove();
                this.mounted.delete(index);
            }
        }

        this.spacer.style.height = `${range.totalHeight + this.footerHeight}px`;

        // Forced layout reads only when row content may have changed — plain
        // scroll frames stay write-only and never trigger a synchronous reflow.
        // A pending measure RAF covers rows mounted afterwards too, because the
        // measure pass walks whatever is mounted when it runs.
        if (mountedNew || this.measureRequested) {
            this.measureRequested = false;
            if (!this.measureRafId) {
                this.measureRafId = requestAnimationFrame(() => {
                    this.measureRafId = 0;
                    this.measureMounted();
                });
            }
        }
    }

    protected measureMounted(): void {
        if (this.disposed) {
            return;
        }
        if (this.shouldPauseBackgroundWork()) {
            this.measureRequested = true;
            this.pendingWhileHidden = true;
            return;
        }
        const scrollTop = this.scrollHost.scrollTop;
        let changed = false;
        let deltaAboveViewport = 0;
        const streamingTailActive = [...this.mounted.values()].some(row =>
            row.classList.contains('theia-mod-streaming'),
        );
        for (const [index, row] of this.mounted) {
            if (streamingTailActive && !row.classList.contains('theia-mod-streaming')) {
                continue;
            }
            const height = Math.ceil(row.getBoundingClientRect().height);
            if (height > 0 && this.sizes[index] !== height) {
                // Rows fully above the viewport shift everything below them when
                // corrected; track the delta so the scroll position can be anchored.
                if ((this.offsets[index + 1] ?? 0) <= scrollTop) {
                    const previous = this.sizes[index] > 0 ? this.sizes[index] : this.defaultItemHeight;
                    deltaAboveViewport += height - previous;
                }
                this.sizes[index] = height;
                this.offsetsDirty = true;
                changed = true;
            }
        }
        const footerHeight = this.footerHost.offsetHeight;
        if (footerHeight !== this.footerHeight) {
            this.footerHeight = footerHeight;
            changed = true;
        }
        if (!changed) {
            return;
        }
        this.update();
        if (deltaAboveViewport !== 0) {
            // Keep the content the user is looking at fixed in place: apply the
            // correction after update() so the spacer is already resized and the
            // new scrollTop cannot be clamped against a stale scrollHeight.
            this.scrollHost.scrollTop = scrollTop + deltaAboveViewport;
        }
    }
}
