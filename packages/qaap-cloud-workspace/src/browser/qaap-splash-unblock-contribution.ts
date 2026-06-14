// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

/** Hard cap from DI instantiation: fires even if onStart() of an earlier contribution hangs. */
const HARD_CAP_MS = 20_000;
/** Shorter window once onStart() confirms contributions are running. */
const STUCK_MS = 10_000;

/**
 * Safety net: if startup hangs before {@link FrontendApplication.revealShell}, hide the preload
 * splash so the user is not stuck on the logo until the tab crashes (common on mobile).
 *
 * Two-layer protection:
 *  - `@postConstruct` arms a hard cap (20 s) from DI instantiation time, before any `onStart`
 *    runs — catches hangs in earlier contributions.
 *  - `onStart` arms a shorter window (10 s) once we know contributions are actually executing.
 */
@injectable()
export class QaapSplashUnblockContribution implements FrontendApplicationContribution {

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    private hardCapHandle: number | undefined;

    @postConstruct()
    protected init(): void {
        this.hardCapHandle = window.setTimeout(() => {
            this.hardCapHandle = undefined;
            this.forceHideSplashIfStuck();
        }, HARD_CAP_MS);
    }

    onStart(): void {
        // onStart running means contributions have started — cancel the hard cap and use a
        // tighter window now that we know the DI container is alive.
        if (this.hardCapHandle !== undefined) {
            window.clearTimeout(this.hardCapHandle);
            this.hardCapHandle = undefined;
        }
        window.setTimeout(() => this.forceHideSplashIfStuck(), STUCK_MS);
        this.appState.reachedState('initialized_layout').then(() => {
            window.setTimeout(() => this.forceHideSplashIfStuck(), 3000);
        }).catch(() => undefined);
        this.appState.reachedState('ready').then(() => {
            this.forceHideSplashIfStuck();
        }).catch(() => undefined);
    }

    protected forceHideSplashIfStuck(): void {
        const state = this.appState.state;
        if (state === 'ready' || state === 'closing_window') {
            return;
        }
        if (state === 'initialized_layout' || state === 'attached_shell' || state === 'started_contributions') {
            /* still starting — hide splash so the workbench is usable */
        }
        for (const el of document.getElementsByClassName('theia-preload')) {
            const node = el as HTMLElement;
            node.classList.add('theia-hidden');
            window.setTimeout(() => node.remove(), 400);
        }
        console.warn('[qaap] Forced splash hide — frontend state was', state);
    }
}
