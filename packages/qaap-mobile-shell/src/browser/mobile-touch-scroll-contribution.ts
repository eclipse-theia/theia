// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY } from '@theia/core/lib/browser/shell/mobile-layout-state';
import {
    installMobileVerticalTouchScroll,
    MOBILE_VERTICAL_SCROLL_SELECTOR,
} from './mobile-vertical-touch-scroll';

/**
 * Wires {@link installMobileVerticalTouchScroll} onto dynamically created scroll
 * hosts (file tree, AI chat, terminal viewport, output, …) on narrow / touch UIs.
 */
@injectable()
export class MobileTouchScrollContribution implements FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly patched = new WeakSet<HTMLElement>();
    protected scrollPatches = new DisposableCollection();
    protected observer: MutationObserver | undefined;
    protected mobileMq: MediaQueryList | undefined;
    protected coarseMq: MediaQueryList | undefined;
    protected active = false;

    onStart(_app: FrontendApplication): void {
        if (typeof window === 'undefined') {
            return;
        }
        this.mobileMq = window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY);
        this.coarseMq = window.matchMedia('(pointer: coarse)');
        this.mobileMq.addEventListener('change', this.refresh);
        this.coarseMq.addEventListener('change', this.refresh);
        this.toDispose.push(
            Disposable.create(() => {
                this.mobileMq?.removeEventListener('change', this.refresh);
                this.coarseMq?.removeEventListener('change', this.refresh);
            }),
        );
        this.refresh();
    }

    onStop(_app: FrontendApplication): void {
        this.deactivate();
        this.toDispose.dispose();
    }

    protected readonly refresh = (): void => {
        const shouldActivate = !!this.mobileMq?.matches || !!this.coarseMq?.matches;
        if (shouldActivate && !this.active) {
            this.activate();
        } else if (!shouldActivate && this.active) {
            this.deactivate();
        }
    };

    protected activate(): void {
        if (typeof document === 'undefined' || this.active) {
            return;
        }
        this.active = true;
        this.scrollPatches = new DisposableCollection();
        const root = document.getElementById('theia-app-shell') ?? document.body;
        this.patchExisting(root);
        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLElement) {
                        this.patchExisting(node);
                    }
                }
            }
        });
        this.observer.observe(root, { childList: true, subtree: true });
    }

    protected deactivate(): void {
        this.active = false;
        this.observer?.disconnect();
        this.observer = undefined;
        this.scrollPatches.dispose();
    }

    protected patchExisting(root: ParentNode): void {
        // Only patch known scroll hosts. Do not call patchElement on every inserted node — otherwise
        // controls such as the inline mic toggle get touch-scroll handlers and break taps on iOS.
        if (root instanceof HTMLElement && root.matches(MOBILE_VERTICAL_SCROLL_SELECTOR)) {
            this.patchElement(root);
        }
        root.querySelectorAll<HTMLElement>(MOBILE_VERTICAL_SCROLL_SELECTOR).forEach(el => this.patchElement(el));
    }

    protected patchElement(element: HTMLElement): void {
        if (this.patched.has(element)) {
            return;
        }
        if (!element.isConnected) {
            return;
        }
        this.patched.add(element);
        this.scrollPatches.push(installMobileVerticalTouchScroll(element));
    }
}
