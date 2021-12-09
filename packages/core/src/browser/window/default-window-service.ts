/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named } from 'inversify';
import { Event, Emitter } from '../../common';
import { CorePreferences } from '../core-preferences';
import { ContributionProvider } from '../../common/contribution-provider';
import { FrontendApplicationContribution, FrontendApplication, OnWillStopAction } from '../frontend-application';
import { WindowService } from './window-service';
import { DEFAULT_WINDOW_HASH } from '../../common/window';
import { confirmExit } from '../dialogs';

@injectable()
export class DefaultWindowService implements WindowService, FrontendApplicationContribution {

    protected frontendApplication: FrontendApplication;
    protected allowVetoes = true;

    protected onUnloadEmitter = new Emitter<void>();
    get onUnload(): Event<void> {
        return this.onUnloadEmitter.event;
    }

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(ContributionProvider)
    @named(FrontendApplicationContribution)
    protected readonly contributions: ContributionProvider<FrontendApplicationContribution>;

    onStart(app: FrontendApplication): void {
        this.frontendApplication = app;
        this.registerUnloadListeners();
    }

    openNewWindow(url: string): undefined {
        window.open(url, undefined, 'noopener');
        return undefined;
    }

    openNewDefaultWindow(): void {
        this.openNewWindow(`#${DEFAULT_WINDOW_HASH}`);
    }

    /**
     * Returns a list of actions that {@link FrontendApplicationContribution}s would like to take before shutdown
     * It is expected that this will succeed - i.e. return an empty array - at most once per session. If no vetoes are received
     * during any cycle, no further checks will be made. In that case, shutdown should proceed unconditionally.
     */
    protected collectContributionUnloadVetoes(): OnWillStopAction[] {
        const vetoes = [];
        if (this.allowVetoes) {
            const shouldConfirmExit = this.corePreferences['application.confirmExit'];
            for (const contribution of this.contributions.getContributions()) {
                const veto = contribution.onWillStop?.(this.frontendApplication);
                if (veto && shouldConfirmExit !== 'never') { // Ignore vetoes if we should not prompt the user on exit.
                    if (OnWillStopAction.is(veto)) {
                        vetoes.push(veto);
                    } else {
                        vetoes.push({ reason: 'No reason given', action: () => false });
                    }
                }
            }
            if (vetoes.length === 0 && shouldConfirmExit === 'always') {
                vetoes.push({ reason: 'application.confirmExit preference', action: () => confirmExit() });
            }
            if (vetoes.length === 0) {
                this.allowVetoes = false;
            }
        }
        return vetoes;
    }

    /**
     * Implement the mechanism to detect unloading of the page.
     */
    protected registerUnloadListeners(): void {
        window.addEventListener('beforeunload', event => this.handleBeforeUnloadEvent(event));
        // In a browser, `unload` is correctly fired when the page unloads, unlike Electron.
        // If `beforeunload` is cancelled, the user will be prompted to leave or stay.
        // If the user stays, the page won't be unloaded, so `unload` is not fired.
        // If the user leaves, the page will be unloaded, so `unload` is fired.
        window.addEventListener('unload', () => this.onUnloadEmitter.fire());
    }

    async isSafeToShutDown(): Promise<boolean> {
        const vetoes = this.collectContributionUnloadVetoes();
        if (vetoes.length === 0) {
            return true;
        }
        console.debug('Shutdown prevented by', vetoes.map(({ reason }) => reason).join(', '));
        const resolvedVetoes = await Promise.allSettled(vetoes.map(({ action }) => action()));
        if (resolvedVetoes.every(resolution => resolution.status === 'rejected' || resolution.value === true)) {
            console.debug('OnWillStop actions resolved; allowing shutdown');
            this.allowVetoes = false;
            return true;
        } else {
            return false;
        }
    }

    setSafeToShutDown(): void {
        this.allowVetoes = false;
    }

    /**
     * Called when the `window` is about to `unload` its resources.
     * At this point, the `document` is still visible and the [`BeforeUnloadEvent`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
     * event will be canceled if the return value of this method is `false`.
     *
     * In Electron, handleCloseRequestEvent is is run instead.
     */
    protected handleBeforeUnloadEvent(event: BeforeUnloadEvent): string | void {
        const vetoes = this.collectContributionUnloadVetoes();
        if (vetoes.length) {
            // In the browser, we don't call the functions because this has to finish in a single tick, so we treat any desired action as a veto.
            console.debug('Shutdown prevented by', vetoes.map(({ reason }) => reason).join(', '));
            return this.preventUnload(event);
        }
        console.debug('Shutdown will proceed.');
    }

    /**
     * Notify the browser that we do not want to unload.
     *
     * Notes:
     *  - Shows a confirmation popup in browsers.
     *  - Prevents the window from closing without confirmation in electron.
     *
     * @param event The beforeunload event
     */
    protected preventUnload(event: BeforeUnloadEvent): string | void {
        event.returnValue = '';
        event.preventDefault();
        return '';
    }

    reload(): void {
        window.location.reload();
    }
}
