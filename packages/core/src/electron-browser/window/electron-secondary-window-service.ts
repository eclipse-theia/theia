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

import { injectable } from 'inversify';
import { DefaultSecondaryWindowService } from '../../browser/window/default-secondary-window-service';
import { ApplicationShell, ExtractableWidget } from '../../browser';
import { ElectronWindowService } from './electron-window-service';
import { Deferred, timeout } from '../../common/promise-util';

@injectable()
export class ElectronSecondaryWindowService extends DefaultSecondaryWindowService {
    override focus(win: Window): void {
        window.electronTheiaCore.focusWindow(win.name);
    }

    override registerShutdownListeners(): void {
        // Close all open windows when the main window is closed.
        (this.windowService as ElectronWindowService).onWillShutDown(() => {
            const promises = [];
            // Iterate backwards because calling window.close might remove the window from the array
            for (let i = this.secondaryWindows.length - 1; i >= 0; i--) {
                const windowClosed = new Deferred<void>();
                const win = this.secondaryWindows[i];
                win.addEventListener('unload', () => {
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

        // Below code may be used to debug contents of secondary window
        // window.electronTheiaCore.openDevToolsForWindow(newWindow.name);
    }
    private async canClose(extractableWidget: ExtractableWidget, shell: ApplicationShell, newWindow: Window): Promise<boolean> {
        return this.restoreWidgets(newWindow, extractableWidget, shell);
    }

}
