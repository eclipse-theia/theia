// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import * as http from 'http';
import { inject, injectable } from 'inversify';
import { APP_ORIGIN } from '../../electron-common/app-scheme';
import { BackendRemoteService } from '../../node/remote/backend-remote-service';
import { WsRequestValidatorContribution } from '../../node/ws-request-validators';

@injectable()
export class ElectronWsOriginValidator implements WsRequestValidatorContribution {

    @inject(BackendRemoteService)
    protected readonly backendRemoteService: BackendRemoteService;

    allowWsUpgrade(request: http.IncomingMessage): boolean {
        // If we are running as a remote server, requests will come from an http endpoint
        if (this.backendRemoteService.isRemoteServer()) {
            return true;
        }
        const origin = request.headers.origin;
        // The frontend is loaded through the application scheme, whose origin the renderer sends as-is.
        // A page loaded from a `file:` URL sends "file://" or "null" (opaque origin), and Chromium omits
        // the header entirely for some request types (WebSocket upgrade vs HTTP polling).
        return !origin || origin === APP_ORIGIN || origin === 'file://' || origin === 'null';
    }
}
