// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';

export type StickyComposerPopoverAlign = 'start' | 'end';

export function shouldUseStickyComposerDesktopPopover(anchor?: HTMLElement): anchor is HTMLElement {
    return !matchesMobileNarrowViewport() && anchor instanceof HTMLElement;
}

export function positionStickyComposerPopover(
    popover: HTMLElement,
    anchor: HTMLElement,
    align: StickyComposerPopoverAlign = 'start',
): void {
    const margin = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverWidth = Math.max(popover.offsetWidth, 280);
    const popoverHeight = popover.offsetHeight;
    let top = anchorRect.bottom + gap;
    const maxBottom = window.innerHeight - margin;
    if (top + popoverHeight > maxBottom) {
        const aboveTop = anchorRect.top - gap - popoverHeight;
        top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - popoverHeight);
    }
    let left = align === 'end' ? anchorRect.right - popoverWidth : anchorRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverWidth - margin));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
}

export function scheduleStickyComposerPopoverPosition(
    popover: HTMLElement,
    anchor: HTMLElement,
    align: StickyComposerPopoverAlign = 'start',
): void {
    window.requestAnimationFrame(() => positionStickyComposerPopover(popover, anchor, align));
}

export function wireStickyComposerPopoverDismiss(
    popover: HTMLElement,
    anchor: HTMLElement,
    onClose: () => void,
    align: StickyComposerPopoverAlign = 'start',
): () => void {
    const controller = new AbortController();
    const { signal } = controller;
    const reposition = (): void => {
        positionStickyComposerPopover(popover, anchor, align);
    };
    const onPointerDown = (event: PointerEvent): void => {
        const target = event.target as Node | null;
        if (target && (popover.contains(target) || anchor.contains(target))) {
            return;
        }
        onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            anchor.focus();
        }
    };
    window.requestAnimationFrame(() => {
        reposition();
        document.addEventListener('pointerdown', onPointerDown, { capture: true, signal });
        document.addEventListener('keydown', onKeyDown, { capture: true, signal });
        window.addEventListener('resize', reposition, { signal });
        window.addEventListener('scroll', reposition, { capture: true, signal });
    });
    return () => controller.abort();
}

export function markStickyComposerPopoverAnchor(anchor: HTMLElement, open: boolean): void {
    anchor.setAttribute('aria-expanded', open ? 'true' : 'false');
    anchor.classList.toggle('theia-mod-active', open);
}

export function mountStickyComposerSheetPopover(
    panel: HTMLElement,
    options: {
        readonly anchor: HTMLElement;
        readonly onClose: () => void;
        readonly align?: StickyComposerPopoverAlign;
        readonly transcriptOverlay?: boolean;
        readonly modifierClasses?: readonly string[];
    },
): { readonly root: HTMLElement; readonly cleanup: () => void } {
    const popover = document.createElement('div');
    popover.className = options.transcriptOverlay
        ? 'qaap-sticky-composer-sheet-popover theia-mod-transcript-overlay'
        : 'qaap-sticky-composer-sheet-popover';
    for (const modifierClass of options.modifierClasses ?? []) {
        popover.classList.add(modifierClass);
        panel.classList.add(modifierClass);
    }
    popover.setAttribute('role', 'dialog');
    popover.append(panel);
    markStickyComposerPopoverAnchor(options.anchor, true);
    const align = options.align ?? 'start';
    const cleanup = wireStickyComposerPopoverDismiss(popover, options.anchor, options.onClose, align);
    return { root: popover, cleanup };
}

export function mountStickyComposerBottomSheet(
    panel: HTMLElement,
    options: {
        readonly sheetClassName: string;
        readonly onClose: () => void;
    },
): HTMLElement {
    const sheet = document.createElement('div');
    sheet.className = options.sheetClassName;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    const backdrop = document.createElement('div');
    backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
    backdrop.addEventListener('click', options.onClose);
    sheet.append(backdrop, panel);
    return sheet;
}
