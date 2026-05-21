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
 * Mobile Quick Input: transient blur when the OS keyboard opens must not close the widget;
 * taps outside must dismiss. No programmatic refocus (that loops the keyboard on iOS/Android).
 */
@injectable()
export class QaapMobileQuickInputContribution implements FrontendApplicationContribution {

    @inject(MonacoQuickInputImplementation)
    protected readonly quickInput: MonacoQuickInputImplementation;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(QaapMonacoQuickInputAdapter)
    protected readonly quickInputAdapter: QaapMonacoQuickInputAdapter;

    protected sessionDispose = new DisposableCollection();
    protected quickInputSessionOpen = false;
    protected dismissRequested = false;
    protected layoutStabilizeRaf = 0;
    protected backdrop: HTMLElement | undefined;
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
        this.dismissRequested = false;
        this.sessionDispose.dispose();
        this.sessionDispose = new DisposableCollection();
        this.applyMobileQuickInputFocusOut();
        this.ensureBackdrop();
        this.installSessionListeners();
    }

    protected onQuickInputHide(): void {
        this.quickInputSessionOpen = false;
        this.dismissRequested = false;
        this.removeBackdrop();
        this.sessionDispose.dispose();
        this.sessionDispose = new DisposableCollection();
    }

    protected installSessionListeners(): void {
        const container = document.getElementById('quick-input-container');
        if (!container) {
            return;
        }
        this.installLayoutStabilizer(container);
        const onOutsidePointer = (e: PointerEvent): void => this.onOutsidePointer(e);
        document.addEventListener('pointerdown', onOutsidePointer, true);
        this.sessionDispose.push(Disposable.create(() => document.removeEventListener('pointerdown', onOutsidePointer, true)));
        this.sessionDispose.push(Disposable.create(() => {
            if (this.layoutStabilizeRaf) {
                cancelAnimationFrame(this.layoutStabilizeRaf);
                this.layoutStabilizeRaf = 0;
            }
            this.layoutObserver?.disconnect();
            this.layoutObserver = undefined;
        }));
    }

    protected onOutsidePointer(event: PointerEvent): void {
        if (!this.quickInputSessionOpen) {
            return;
        }
        const container = document.getElementById('quick-input-container');
        if (!container) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && container.contains(target)) {
            this.dismissRequested = false;
            return;
        }
        this.requestDismiss();
    }

    protected requestDismiss(): void {
        if (!this.quickInputSessionOpen) {
            return;
        }
        this.dismissRequested = true;
        this.quickInput.hide();
    }

    protected ensureBackdrop(): void {
        this.removeBackdrop();
        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-quick-input-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        const dismiss = (): void => this.requestDismiss();
        backdrop.addEventListener('pointerdown', dismiss);
        backdrop.addEventListener('click', dismiss);
        const container = document.getElementById('quick-input-container');
        if (container?.parentElement) {
            container.parentElement.insertBefore(backdrop, container);
        } else {
            document.body.appendChild(backdrop);
        }
        this.backdrop = backdrop;
        requestAnimationFrame(() => backdrop.classList.add('theia-mod-visible'));
    }

    protected removeBackdrop(): void {
        if (this.backdrop?.parentElement) {
            this.backdrop.parentElement.removeChild(this.backdrop);
        }
        this.backdrop = undefined;
    }

    /**
     * Monaco `QuickInputController#updateLayout` runs on every window resize (keyboard) and
     * re-applies desktop geometry. Clear it on the next frame without refocusing the filter.
     */
    protected installLayoutStabilizer(container: HTMLElement): void {
        const scheduleStabilize = (): void => {
            if (!this.quickInputSessionOpen || !this.isMobileQuickInputContext()) {
                return;
            }
            if (this.layoutStabilizeRaf) {
                cancelAnimationFrame(this.layoutStabilizeRaf);
            }
            this.layoutStabilizeRaf = requestAnimationFrame(() => {
                this.layoutStabilizeRaf = 0;
                this.quickInputAdapter.stabilizeMobileLayout(container);
            });
        };
        scheduleStabilize();
        this.layoutObserver = new MutationObserver(scheduleStabilize);
        this.layoutObserver.observe(container, { attributes: true, attributeFilter: ['style'] });
        const inner = container.querySelector('.quick-input-widget');
        if (inner) {
            this.layoutObserver.observe(inner, { attributes: true, attributeFilter: ['style'] });
        }
        const onResize = (): void => scheduleStabilize();
        window.addEventListener('resize', onResize);
        const vv = window.visualViewport;
        if (vv) {
            vv.addEventListener('resize', onResize);
            this.sessionDispose.push(Disposable.create(() => vv.removeEventListener('resize', onResize)));
        }
        this.sessionDispose.push(Disposable.create(() => window.removeEventListener('resize', onResize)));
    }

    protected patchControllerIgnoreFocusOut(): void {
        const host = this.quickInput.controller as unknown as QuickInputControllerOptionsHost;
        const original = host.options.ignoreFocusOut;
        host.options.ignoreFocusOut = () => {
            if (!this.isMobileQuickInputContext()) {
                return original();
            }
            if (this.dismissRequested) {
                return false;
            }
            return this.quickInputSessionOpen;
        };
    }

    protected applyMobileQuickInputFocusOut(): void {
        if (!this.isMobileQuickInputContext()) {
            return;
        }
        const ui = (this.quickInput.controller as unknown as { getUI?: () => { ignoreFocusOut: boolean } }).getUI?.();
        if (ui) {
            ui.ignoreFocusOut = true;
        }
    }

    protected isMobileQuickInputContext(): boolean {
        return matchesMobileNarrowViewport()
            || this.shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }
}
