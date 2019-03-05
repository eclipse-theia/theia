/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject, ContainerModule } from 'inversify';
import { FrontendConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
export default new ContainerModule(bind => {
    bind(ConnectionEvent).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConnectionEvent);
});

@injectable()
export class ConnectionEvent implements FrontendApplicationContribution {

    @inject(FrontendConnectionStatusService)
    protected readonly connectionStatusService: FrontendConnectionStatusService;

    constructor() {
    }

    private _onConnectionStatusChanged(): void {
        if (this.connectionStatusService.currentStatus === ConnectionStatus.OFFLINE) {
            const request = new XMLHttpRequest();

            request.onreadystatechange = function () {
                if (this.readyState === XMLHttpRequest.DONE) {
                    const code = this.status;
                    var msg = "";
                    if (code > 0 && code < 300 || code == 404) {
                        // connection is possible and ok - do nothing
                    } else if (code == 401 || code == 403) {
                        // connection is denied (due to permission)
                        msg = "Connection: SESSION_EXPIRED"
                    } else if (code == 500) {
                        // server error
                        msg = "Connection: SERVER_ERROR"
                    } else if (code == 502 || code == 503 || code == 0) {
                        msg = "Connection: SERVER_UNAVAILABLE"
                    }
                    if (msg.length > 0) {
                        if (window.parent) {
                            window.parent.postMessage(msg, '*');
                        }
                    }
                }
            };

            const url = window.location.href;
            request.open('GET', url, true);
            request.withCredentials = true;
            request.send();
        } else {
            if (window.parent) {
                window.parent.postMessage("Connection: OK", '*');
            }
        }
    }

    onWillStop() {
    }

    onStart() {
        this.connectionStatusService.onStatusChange(() => this._onConnectionStatusChanged());
    }
}
