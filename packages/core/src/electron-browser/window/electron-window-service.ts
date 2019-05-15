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

import { injectable } from 'inversify';
import { ipcRenderer } from 'electron';
import { NewWindowOptions } from '../../browser/window/window-service';
import { FrontendApplication } from '../../browser/frontend-application';
import { DefaultWindowService } from '../../browser/window/default-window-service';

@injectable()
export class ElectronWindowService extends DefaultWindowService {

    onStart(app: FrontendApplication): void {
        this.frontendApplication = app;
        // We do not want to add a `beforeunload` listener to the `window`.
        // Why? Because by the time we get into the unload handler, it is already too late. Our application has quit.
        // _Emitted when the `window` is going to be closed. It's emitted before the `beforeunload` and `unload` event of the DOM._
        // https://github.com/electron/electron/blob/master/docs/api/browser-window.md#event-close
    }

    openNewWindow(url: string, { external }: NewWindowOptions = {}): undefined {
        if (external) {
            ipcRenderer.send('open-external', url);
        } else {
            ipcRenderer.send('create-new-window', url);
        }
        return undefined;
    }

}
