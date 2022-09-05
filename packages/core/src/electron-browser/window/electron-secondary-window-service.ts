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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { BrowserWindow } from '../../../electron-shared/electron';
import * as electronRemote from '../../../electron-shared/@electron/remote';
import { injectable } from 'inversify';
import { DefaultSecondaryWindowService } from '../../browser/window/default-secondary-window-service';

@injectable()
export class ElectronSecondaryWindowService extends DefaultSecondaryWindowService {
    protected electronWindows: Map<string, BrowserWindow> = new Map();

    protected override doCreateSecondaryWindow(onClose?: (closedWin: Window) => void): Window | undefined {
        const id = this.nextWindowId();
        electronRemote.getCurrentWindow().webContents.once('did-create-window', newElectronWindow => {
            newElectronWindow.setMenuBarVisibility(false);
            this.electronWindows.set(id, newElectronWindow);
            newElectronWindow.on('closed', () => {
                this.electronWindows.delete(id);
                const browserWin = this.secondaryWindows.find(w => w.name === id);
                if (browserWin) {
                    this.handleWindowClosed(browserWin, onClose);
                } else {
                    console.warn(`Could not execute proper close handling for secondary window '${id}' because its frontend window could not be found.`);
                };
            });
        });
        const win = window.open(DefaultSecondaryWindowService.SECONDARY_WINDOW_URL, id);
        return win ?? undefined;
    }

    override focus(win: Window): void {
        // window.name is the target name given to the window.open call as the second parameter.
        const electronWindow = this.electronWindows.get(win.name);
        if (electronWindow) {
            if (electronWindow.isMinimized()) {
                electronWindow.restore();
            }
            electronWindow.focus();
        } else {
            console.warn(`There is no known secondary window '${win.name}'. Thus, the window could not be focussed.`);
        }
    }
}
