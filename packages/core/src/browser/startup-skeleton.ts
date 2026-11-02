// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { DisposableCollection } from '../common/disposable';
import { FrontendApplication } from './frontend-application';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { FrontendApplicationStateService } from './frontend-application-state';
import { ApplicationShell } from './shell/application-shell';
import { BOTTOM_AREA_ID } from './shell/theia-dock-panel';
import { ThemeService } from './theming';

/**
 * What the generated `index.html` draws before the frontend bundle runs: the colours and sizes of the
 * workbench parts of the last session, so that the page looks like the workbench from the first paint
 * instead of a blank page with a spinner. Written once the application is ready, when the theme changes and
 * at the end of a session; read by an inline script of the generated page, see `FrontendGenerator`.
 */
export interface StartupSkeletonRecord {
    version: 1;
    /** The background colours of the parts as painted, i.e. computed from their elements. */
    colors: {
        titleBar?: string;
        activityBar?: string;
        sideBar?: string;
        panel?: string;
        statusBar?: string;
    };
    /** Sizes in CSS pixels; 0 or absent for a part that is hidden or collapsed. */
    layout: {
        top?: number;
        leftBar?: number;
        left?: number;
        rightBar?: number;
        right?: number;
        bottom?: number;
        statusBar?: number;
    };
}

export namespace StartupSkeleton {
    /** The `localStorage` key of the {@link StartupSkeletonRecord} of the last session of any workspace. */
    export const STORAGE_KEY = 'theia.startupSkeleton';
    export const VERSION = 1;
    /**
     * The key of the record of the workspace that the URL `hash` names, as the generated page reads it:
     * the layout is kept per workspace, so the record is too. Without a hash, the generic key.
     */
    export function storageKey(hash: string): string {
        return hash ? `${STORAGE_KEY}:${hash}` : STORAGE_KEY;
    }
}

/**
 * Keeps the {@link StartupSkeletonRecord} of this window up to date in `localStorage`.
 */
@injectable()
export class StartupSkeletonContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    protected readonly toDispose = new DisposableCollection();

    onStart(app: FrontendApplication): void {
        // Layout changes are picked up at the end of the session: the shell has no event for them, and the
        // skeleton only needs to be right for the next start.
        this.stateService.reachedState('ready').then(() => {
            this.store();
            this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.store()));
        });
    }

    onStop(): void {
        this.toDispose.dispose();
        this.store();
    }

    /**
     * Store the record for the current workspace and as the record of the last session of any workspace,
     * which a window without a workspace in its URL starts from.
     */
    protected store(): void {
        try {
            const record = this.collect();
            if (record) {
                const key = StartupSkeleton.storageKey(window.location.hash);
                const previous: StartupSkeletonRecord | undefined = JSON.parse(window.localStorage.getItem(key) ?? 'null') ?? undefined;
                if (previous?.version === StartupSkeleton.VERSION) {
                    // A colour not measured this time, such as the status bar while offline, keeps its last value.
                    for (const part of Object.keys(previous.colors) as (keyof StartupSkeletonRecord['colors'])[]) {
                        record.colors[part] ??= previous.colors[part];
                    }
                }
                const json = JSON.stringify(record);
                window.localStorage.setItem(StartupSkeleton.STORAGE_KEY, json);
                if (key !== StartupSkeleton.STORAGE_KEY) {
                    window.localStorage.setItem(key, json);
                }
            }
        } catch {
            // Storage unavailable or full: the next start shows the plain loading indicator.
        }
    }

    /**
     * Measure the workbench as it is on screen: the sizes of its parts, and their background colours as
     * painted, which may differ from the theme colours they are usually given, e.g. the status bar without
     * a workspace or while debugging. The status bar is not measured while the application is offline, which
     * it is at the end of a session: the next start should assume that the connection succeeds. Hidden or
     * collapsed parts measure 0, and a colour that is not measured is absent.
     */
    protected collect(): StartupSkeletonRecord | undefined {
        if (!this.shell.isAttached || !this.shell.isVisible) {
            return undefined;
        }
        const color = (selector: string): string | undefined => {
            const element = document.querySelector(selector);
            const value = element && window.getComputedStyle(element).backgroundColor;
            return value && value !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(value) ? value : undefined;
        };
        const size = (id: string, dimension: 'width' | 'height'): number => {
            const element = document.getElementById(id);
            return element ? Math.round(element.getBoundingClientRect()[dimension]) : 0;
        };
        const leftContent = size('theia-left-content-panel', 'width');
        const left = size('theia-left-side-panel', 'width');
        const rightContent = size('theia-right-content-panel', 'width');
        const right = size('theia-right-side-panel', 'width');
        return {
            version: StartupSkeleton.VERSION,
            colors: {
                titleBar: color('#theia-top-panel'),
                activityBar: color('#theia-left-content-panel .theia-app-sidebar-container')
                    ?? color('#theia-right-content-panel .theia-app-sidebar-container'),
                sideBar: color('#theia-left-side-panel') ?? color('#theia-right-side-panel'),
                panel: color(`#${BOTTOM_AREA_ID}`),
                statusBar: document.body.classList.contains('theia-mod-offline') ? undefined : color('#theia-statusBar')
            },
            layout: {
                top: size('theia-top-panel', 'height'),
                leftBar: Math.max(0, leftContent - left),
                left,
                rightBar: Math.max(0, rightContent - right),
                right,
                bottom: size(BOTTOM_AREA_ID, 'height'),
                statusBar: size('theia-statusBar', 'height')
            }
        };
    }
}
