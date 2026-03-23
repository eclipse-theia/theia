// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { FrontendApplicationContribution, KeybindingRegistry, StatusBar, StatusBarAlignment } from '../../browser';
import { CommandRegistry, nls, PreferenceService } from '../../common';
import { PREF_WINDOW_ZOOM_LEVEL } from '../../electron-common/electron-window-preferences';
import { renderWindowZoomActionBar } from './window-zoom-action-bar';

@injectable()
export class WindowZoomStatusBarItem implements FrontendApplicationContribution {

    static readonly ID = 'window-zoom-status';

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    onStart(): void {
        this.preferenceService.ready.then(() => {
            this.updateZoomStatusBarItem();

            this.preferenceService.onPreferenceChanged(e => {
                if (e.preferenceName === PREF_WINDOW_ZOOM_LEVEL) {
                    this.updateZoomStatusBarItem();
                }
            });
        });
    }

    protected updateZoomStatusBarItem(): void {
        const zoomLevel = this.getZoomLevel();

        if (zoomLevel === 0) {
            // Hide the status bar item when zoom is at default level
            this.statusBar.removeElement(WindowZoomStatusBarItem.ID);
        } else {
            this.statusBar.setElement(WindowZoomStatusBarItem.ID, {
                name: nls.localizeByDefault('Window Zoom'),
                text: zoomLevel > 0 ? '$(codicon-zoom-in)' : '$(codicon-zoom-out)',
                alignment: StatusBarAlignment.RIGHT,
                priority: 110,
                tooltip: () => this.createTooltip(zoomLevel),
                backgroundColor: 'var(--theia-statusBarItem-prominentBackground)',
                color: 'var(--theia-statusBarItem-prominentForeground)'
            });
        }
    }

    protected getZoomLevel(): number {
        return this.preferenceService.get(PREF_WINDOW_ZOOM_LEVEL, 0);
    }

    protected createTooltip(zoomLevel: number): HTMLElement {
        const container = document.createElement('div');
        container.className = 'window-zoom-action-bar';
        renderWindowZoomActionBar(container, zoomLevel, this.commandRegistry, this.keybindingRegistry);
        return container;
    }
}
