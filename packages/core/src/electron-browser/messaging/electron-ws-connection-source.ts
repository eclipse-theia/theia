// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { WebSocketConnectionSource } from '../../browser/messaging/ws-connection-source';

/**
 * Customized connection provider between the frontend and the backend in electron environment.
 * This customized connection provider makes sure the websocket connection does not try to reconnect
 * once the electron-browser window is refreshed. Otherwise, backend resources are not disposed.
 */
@injectable()
export class ElectronWebSocketConnectionSource extends WebSocketConnectionSource implements FrontendApplicationContribution {
    constructor() {
        super();
    }

    onStop(): void {
        // Manually close the websocket connections `onStop`. Otherwise, the channels will be closed with 30 sec (`MessagingContribution#checkAliveTimeout`) delay.
        // https://github.com/eclipse-theia/theia/issues/6499
        // `1001` indicates that an endpoint is "going away", such as a server going down or a browser having navigated away from a page.
        this.socket.close();
    }
}
