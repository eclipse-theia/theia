// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { inject, injectable } from '@theia/core/shared/inversify';

const SPLASH_STUCK_MS = 45_000;

/**
 * Safety net: if startup hangs before {@link FrontendApplication.revealShell}, hide the preload
 * splash so the user is not stuck on the logo until the tab crashes (common on mobile).
 */
@injectable()
export class QaapSplashUnblockContribution implements FrontendApplicationContribution {

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    onStart(): void {
        window.setTimeout(() => this.forceHideSplashIfStuck(), SPLASH_STUCK_MS);
        this.appState.reachedState('ready').then(() => {
            this.forceHideSplashIfStuck();
        }).catch(() => undefined);
    }

    protected forceHideSplashIfStuck(): void {
        const state = this.appState.state;
        if (state === 'ready' || state === 'closing_window') {
            return;
        }
        for (const el of document.getElementsByClassName('theia-preload')) {
            const node = el as HTMLElement;
            node.classList.add('theia-hidden');
            window.setTimeout(() => node.remove(), 400);
        }
        console.warn('[qaap] Forced splash hide — frontend state was', state);
    }
}
