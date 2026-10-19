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
 * instead of a blank page with a spinner. Written at the end of a session and whenever the theme or the
 * layout changes; read by an inline script of the generated page, see `FrontendGenerator`.
 */
export interface StartupSkeletonRecord {
    version: 1;
    colors: {
        background?: string;
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
    /** The `localStorage` key of the {@link StartupSkeletonRecord}; the generated page reads the same key. */
    export const STORAGE_KEY = 'theia.startupSkeleton';
    export const VERSION = 1;
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
    protected storeTimeout: number | undefined;

    onStart(app: FrontendApplication): void {
        this.stateService.reachedState('ready').then(() => {
            this.store();
            this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.scheduleStore()));
            this.toDispose.push(this.shell.onDidChangeCurrentWidget(() => this.scheduleStore()));
            this.toDispose.push(this.shell.onDidAddWidget(() => this.scheduleStore()));
            this.toDispose.push(this.shell.onDidRemoveWidget(() => this.scheduleStore()));
            const onResize = () => this.scheduleStore();
            window.addEventListener('resize', onResize);
            this.toDispose.push({ dispose: () => window.removeEventListener('resize', onResize) });
        });
    }

    onStop(): void {
        this.toDispose.dispose();
        this.store();
    }

    protected scheduleStore(): void {
        if (this.storeTimeout !== undefined) {
            window.clearTimeout(this.storeTimeout);
        }
        this.storeTimeout = window.setTimeout(() => {
            this.storeTimeout = undefined;
            this.store();
        }, 1000);
    }

    protected store(): void {
        try {
            const record = this.collect();
            if (record) {
                window.localStorage.setItem(StartupSkeleton.STORAGE_KEY, JSON.stringify(record));
            }
        } catch {
            // Storage unavailable or full: the next start shows the plain loading indicator.
        }
    }

    /**
     * Measure the workbench as it is on screen. Hidden or collapsed parts measure 0.
     */
    protected collect(): StartupSkeletonRecord | undefined {
        if (!this.shell.isAttached || !this.shell.isVisible) {
            return undefined;
        }
        const style = window.getComputedStyle(document.documentElement);
        const color = (name: string): string | undefined => style.getPropertyValue(`--theia-${name}`).trim() || undefined;
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
                background: color('editor-background'),
                titleBar: color('titleBar-activeBackground'),
                activityBar: color('activityBar-background'),
                sideBar: color('sideBar-background'),
                panel: color('panel-background'),
                statusBar: color('statusBar-background')
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
