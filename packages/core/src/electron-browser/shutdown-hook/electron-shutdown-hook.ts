/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { ipcRenderer, remote, Event } from 'electron';
import { WindowService } from '../../browser/window/window-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application';

@injectable()
export class ElectronShutdownHook implements FrontendApplicationContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    onStart(): void {
        ipcRenderer.on(ElectronShutdownHook.PreventStop.Channels.REQUEST, (event: Event) => {
            const preventStop = !this.windowService.canUnload() && 0 !== remote.dialog.showMessageBox(remote.getCurrentWindow(), {
                type: 'question',
                buttons: ['Yes', 'No'],
                title: 'Confirm',
                message: 'Are you sure you want to quit?',
                detail: 'Changes you made may not be saved.'
            });
            event.sender.send(ElectronShutdownHook.PreventStop.Channels.RESPONSE, { preventStop });
        });
    }

}

export namespace ElectronShutdownHook {
    export namespace PreventStop {
        export namespace Channels {
            export const REQUEST = 'prevent-stop-request';
            export const RESPONSE = 'prevent-stop-response';
        }
        export interface Message {
            readonly preventStop: boolean;
        }
    }
}
