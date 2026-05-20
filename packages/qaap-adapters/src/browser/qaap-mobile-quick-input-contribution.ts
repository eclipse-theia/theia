// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS, matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MonacoQuickInputImplementation } from '@theia/monaco/lib/browser/monaco-quick-input-service';
import { IQuickInputOptions } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickInput';

/** Monaco keeps `options` private on {@link QuickInputController}; patch via structural typing. */
type QuickInputControllerOptionsHost = { options: IQuickInputOptions };

/**
 * Mobile browsers fire a transient blur on Quick Input filter fields when the virtual
 * keyboard opens (viewport resize / scroll). Monaco hides the widget on blur unless
 * `ignoreFocusOut` is true. iOS also blocks per-instance `ignoreFocusOut` on {@link QuickInput},
 * but the controller-level `options.ignoreFocusOut()` callback still applies.
 */
@injectable()
export class QaapMobileQuickInputContribution implements FrontendApplicationContribution {

    @inject(MonacoQuickInputImplementation)
    protected readonly quickInput: MonacoQuickInputImplementation;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    onStart(): void {
        this.patchControllerIgnoreFocusOut();
        this.quickInput.onShow(() => this.applyMobileQuickInputFocusOut());
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

    protected isMobileQuickInputContext(): boolean {
        return matchesMobileNarrowViewport()
            || this.shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }
}
