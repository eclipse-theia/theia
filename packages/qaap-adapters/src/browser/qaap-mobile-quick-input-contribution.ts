// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS, matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MonacoQuickInputImplementation } from '@theia/monaco/lib/browser/monaco-quick-input-service';
import { IQuickInputOptions } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickInput';
import { QaapMonacoQuickInputAdapter } from './qaap-monaco-quick-input-adapter';

/** Monaco keeps `options` private on {@link QuickInputController}; patch via structural typing. */
type QuickInputControllerOptionsHost = { options: IQuickInputOptions };

/**
 * Mobile Quick Input: keep the palette open on transient blur, preserve top-sheet layout when
 * the virtual keyboard resizes the viewport, and restore filter focus via Monaco (not raw
 * `input.focus()`, which fights the OS and loops the keyboard).
 */
@injectable()
export class QaapMobileQuickInputContribution implements FrontendApplicationContribution {

    /** Debounced refocus after visualViewport settles (ms). */
    protected static readonly FILTER_FOCUS_QUIET_MS = 160;
    /** Min gap between programmatic refocus calls (ms). */
    protected static readonly FILTER_FOCUS_COOLDOWN_MS = 400;

    @inject(MonacoQuickInputImplementation)
    protected readonly quickInput: MonacoQuickInputImplementation;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(QaapMonacoQuickInputAdapter)
    protected readonly quickInputAdapter: QaapMonacoQuickInputAdapter;

    protected sessionDispose = new DisposableCollection();
    protected quickInputSessionOpen = false;
    protected viewportQuietHandle = 0;
    protected lastFilterRefocusAt = 0;
    protected layoutObserver: MutationObserver | undefined;

    onStart(): void {
        this.patchControllerIgnoreFocusOut();
        this.quickInput.onShow(() => this.onQuickInputShow());
        this.quickInput.onHide(() => this.onQuickInputHide());
    }

    protected onQuickInputShow(): void {
        if (!this.isMobileQuickInputContext()) {
            return;
        }
        this.quickInputSessionOpen = true;
        this.sessionDispose.dispose();
        this.sessionDispose = new DisposableCollection();
        this.applyMobileQuickInputFocusOut();
        this.installSessionListeners();
        this.scheduleInitialFilterFocus();
    }

    protected onQuickInputHide(): void {
        this.quickInputSessionOpen = false;
        if (this.viewportQuietHandle) {
            window.clearTimeout(this.viewportQuietHandle);
            this.viewportQuietHandle = 0;
        }
        this.sessionDispose.dispose();
        this.sessionDispose = new DisposableCollection();
    }

    protected installSessionListeners(): void {
        const container = document.getElementById('quick-input-container');
        if (!container) {
            return;
        }
        this.installLayoutStabilizer(container);
        this.installViewportFocusGuard();
        this.sessionDispose.push(Disposable.create(() => {
            this.layoutObserver?.disconnect();
            this.layoutObserver = undefined;
        }));
    }

    /**
     * Monaco `QuickInputController#updateLayout` runs on every window resize (keyboard open/close)
     * and re-applies desktop `top` / `left` / `width`. Clear them immediately on mobile.
     */
    protected installLayoutStabilizer(container: HTMLElement): void {
        const stabilize = (): void => {
            if (this.quickInputSessionOpen && this.isMobileQuickInputContext()) {
                this.quickInputAdapter.stabilizeMobileLayout(container);
            }
        };
        stabilize();
        this.layoutObserver = new MutationObserver(stabilize);
        this.layoutObserver.observe(container, { attributes: true, attributeFilter: ['style'] });
        const inner = container.querySelector('.quick-input-widget');
        if (inner) {
            this.layoutObserver.observe(inner, { attributes: true, attributeFilter: ['style'] });
        }
        const onResize = (): void => stabilize();
        window.addEventListener('resize', onResize);
        const vv = window.visualViewport;
        if (vv) {
            vv.addEventListener('resize', onResize);
            vv.addEventListener('scroll', onResize);
            this.sessionDispose.push(Disposable.create(() => {
                vv.removeEventListener('resize', onResize);
                vv.removeEventListener('scroll', onResize);
            }));
        }
        this.sessionDispose.push(Disposable.create(() => window.removeEventListener('resize', onResize)));
    }

    protected installViewportFocusGuard(): void {
        const onViewportChange = (): void => {
            if (!this.quickInputSessionOpen) {
                return;
            }
            if (this.viewportQuietHandle) {
                window.clearTimeout(this.viewportQuietHandle);
            }
            this.viewportQuietHandle = window.setTimeout(() => {
                this.viewportQuietHandle = 0;
                this.ensureFilterFocusAfterViewportChange();
            }, QaapMobileQuickInputContribution.FILTER_FOCUS_QUIET_MS);
        };
        window.addEventListener('resize', onViewportChange);
        const vv = window.visualViewport;
        if (vv) {
            vv.addEventListener('resize', onViewportChange);
            vv.addEventListener('scroll', onViewportChange);
            this.sessionDispose.pushAll([
                Disposable.create(() => vv.removeEventListener('resize', onViewportChange)),
                Disposable.create(() => vv.removeEventListener('scroll', onViewportChange)),
            ]);
        }
        this.sessionDispose.push(Disposable.create(() => window.removeEventListener('resize', onViewportChange)));
    }

    protected scheduleInitialFilterFocus(): void {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!this.quickInputSessionOpen || !this.isMobileQuickInputContext()) {
                    return;
                }
                this.applyMobileQuickInputFocusOut();
                this.quickInputAdapter.stabilizeMobileLayout(
                    document.getElementById('quick-input-container') ?? document.body
                );
                this.quickInput.focus();
            });
        });
    }

    protected ensureFilterFocusAfterViewportChange(): void {
        if (!this.quickInputSessionOpen || !this.isMobileQuickInputContext()) {
            return;
        }
        const container = document.getElementById('quick-input-container');
        if (!container || !this.isQuickInputVisible()) {
            return;
        }
        this.quickInputAdapter.stabilizeMobileLayout(container);
        const active = document.activeElement;
        if (active instanceof HTMLElement && container.contains(active)) {
            return;
        }
        const now = Date.now();
        if (now - this.lastFilterRefocusAt < QaapMobileQuickInputContribution.FILTER_FOCUS_COOLDOWN_MS) {
            return;
        }
        this.lastFilterRefocusAt = now;
        this.applyMobileQuickInputFocusOut();
        this.quickInput.focus();
    }

    protected patchControllerIgnoreFocusOut(): void {
        const host = this.quickInput.controller as unknown as QuickInputControllerOptionsHost;
        const original = host.options.ignoreFocusOut;
        host.options.ignoreFocusOut = () => this.isMobileQuickInputContext() || original();
    }

    /** `QuickInputController#pick` resets `ui.ignoreFocusOut` on each show; re-apply on mobile. */
    protected applyMobileQuickInputFocusOut(): void {
        if (!this.isMobileQuickInputContext()) {
            return;
        }
        const ui = (this.quickInput.controller as unknown as { getUI?: () => { ignoreFocusOut: boolean } }).getUI?.();
        if (ui) {
            ui.ignoreFocusOut = true;
        }
    }

    protected isQuickInputVisible(): boolean {
        const container = document.getElementById('quick-input-container');
        if (!container) {
            return false;
        }
        const widget = container.querySelector<HTMLElement>('.quick-input-widget');
        return Boolean(widget && widget.style.display !== 'none');
    }

    protected isMobileQuickInputContext(): boolean {
        return matchesMobileNarrowViewport()
            || this.shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }
}
