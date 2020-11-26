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

import { injectable, inject } from 'inversify';
import { remote } from 'electron';
import { NewWindowOptions } from '../../browser/window/window-service';
import { DefaultWindowService } from '../../browser/window/default-window-service';
import { ElectronMainWindowService } from '../../electron-common/electron-main-window-service';

@injectable()
export class ElectronWindowService extends DefaultWindowService {

    @inject(ElectronMainWindowService)
    protected readonly delegate: ElectronMainWindowService;

    openNewWindow(url: string, { external }: NewWindowOptions = {}): undefined {
        this.delegate.openNewWindow(url, { external });
        return undefined;
    }

    registerUnloadListeners(): void {
        window.addEventListener('beforeunload', event => {
            // Either we can unload, or the user confirms that he wants to quit
            if (this.canUnload() || this.shouldUnload()) {
                // We are unloading
                delete event.returnValue;
                this.onUnloadEmitter.fire();
            } else {
                // The user wants to stay, let's prevent unloading
                return this.preventUnload(event);
            }
        });
    }

    /**
     * When preventing `beforeunload` on Electron, no popup is shown.
     * This method implements a modal to ask the user if he wants to quit the page.
     */
    protected shouldUnload(): boolean {
        const electronWindow = remote.getCurrentWindow();
        const response = remote.dialog.showMessageBoxSync(electronWindow, {
            type: 'question',
            buttons: ['Yes', 'No'],
            title: 'Confirm',
            message: 'Are you sure you want to quit?',
            detail: 'Any unsaved changes will not be saved.'
        });
        return response === 0; // 'Yes', close the window.
    }
}
