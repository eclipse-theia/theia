// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { DefaultSecondaryWindowService } from '../../browser/window/default-secondary-window-service';
import { ApplicationShell, ExtractableWidget } from '../../browser';
import { ElectronWindowService } from './electron-window-service';
import { ElectronWindowTitleBarService } from '../menu/electron-window-title-bar-service';
import { Deferred, timeout } from '../../common/promise-util';
import { isOSX } from '../../common/os';
import { ElectronWindowPreferences, PREF_WINDOW_ZOOM_LEVEL } from '../../electron-common/electron-window-preferences';

@injectable()
export class ElectronSecondaryWindowService extends DefaultSecondaryWindowService {

    @inject(ElectronWindowPreferences)
    protected readonly electronWindowPreferences: ElectronWindowPreferences;

    @inject(ElectronWindowTitleBarService)
    protected readonly titleBarService: ElectronWindowTitleBarService;

    @postConstruct()
    override init(): void {
        super.init();
        this.electronWindowPreferences.ready.then(() => {
            const initialZoomLevel = this.electronWindowPreferences.get(PREF_WINDOW_ZOOM_LEVEL);
            this.updateWindowZoomLevel(initialZoomLevel);

            this.electronWindowPreferences.onPreferenceChanged(e => {
                if (e.preferenceName === PREF_WINDOW_ZOOM_LEVEL) {
                    const zoomLevel = this.electronWindowPreferences.get(PREF_WINDOW_ZOOM_LEVEL, 0);
                    this.updateWindowZoomLevel(zoomLevel);
                }
            });
        });
    }

    protected async updateWindowZoomLevel(zoomLevel: number): Promise<void> {
        this.secondaryWindows.forEach((win: Window) => {
            window.electronTheiaCore.setZoomLevel(zoomLevel, win.name);
        });
    }

    override focus(win: Window): void {
        window.electronTheiaCore.focusWindow(win.name);
    }

    override registerShutdownListeners(): void {
        // Close all open windows when the main window is closed.
        (this.windowService as ElectronWindowService).onWillShutDown(() => {
            this.shuttingDown = true;
            const promises = [];
            // Iterate backwards because calling window.close might remove the window from the array
            for (let i = this.secondaryWindows.length - 1; i >= 0; i--) {
                const windowClosed = new Deferred<void>();
                const win = this.secondaryWindows[i];
                win.addEventListener('pagehide', () => {
                    windowClosed.resolve();
                });
                promises.push(windowClosed.promise);
            }
            for (let i = this.secondaryWindows.length - 1; i >= 0; i--) {
                this.secondaryWindows[i].close();
            }
            return Promise.race([timeout(2000), Promise.all(promises).then(() => { })]);
        });
    }

    protected override windowCreated(newWindow: Window, widget: ExtractableWidget, shell: ApplicationShell): void {
        window.electronTheiaCore.setMenuBarVisible(false, newWindow.name);
        window.electronTheiaCore.setSecondaryWindowCloseRequestHandler(newWindow.name, () => this.canClose(widget, shell, newWindow));

        // Apply current zoom level to newly created secondary window
        const currentZoomLevel = this.electronWindowPreferences.get(PREF_WINDOW_ZOOM_LEVEL, 0);
        window.electronTheiaCore.setZoomLevel(currentZoomLevel, newWindow.name);

        this.createCustomTitleBarForSecondaryWindow(newWindow, widget);
    }

    protected async createCustomTitleBarForSecondaryWindow(newWindow: Window, widget: ExtractableWidget): Promise<void> {
        if (isOSX) {
            return;
        }
        const titleBarStyle = await window.electronTheiaCore.getTitleBarStyleAtStartup();
        if (titleBarStyle !== 'custom') {
            return;
        }

        const topPanel = newWindow.document.getElementById('theia-top-panel');
        if (!topPanel) {
            return;
        }

        const doc = newWindow.document;
        const windowName = newWindow.name;

        topPanel.appendChild(this.titleBarService.createDragPanel(doc));
        topPanel.appendChild(this.titleBarService.createTitleElement(doc, widget.title.label));
        topPanel.appendChild(this.titleBarService.createWindowControlsContainer(doc, windowName));

        this.titleBarService.setupMaximizeRestoreToggle(doc.body, windowName);
    }
    private async canClose(extractableWidget: ExtractableWidget, shell: ApplicationShell, newWindow: Window): Promise<boolean> {
        return this.restoreWidgets(newWindow, extractableWidget, shell);
    }

}
