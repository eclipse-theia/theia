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
import { WsRequestValidatorContribution } from '../ws-request-validators';
import { BackendApplicationHosts } from './backend-application-hosts';

@injectable()
export class WsOriginValidator implements WsRequestValidatorContribution {

    @inject(BackendApplicationHosts)
    protected readonly backendApplicationHosts: BackendApplicationHosts;

    allowWsUpgrade(request: http.IncomingMessage): boolean {
        if (!request.headers.origin) {
            // Browsers omit the Origin header for same-origin requests (e.g. Socket.IO polling).
            // Absent Origin is safe: cross-origin browser requests always include it.
            return true;
        }

        let originHost: string;
        try {
            originHost = new URL(request.headers.origin).host;
        } catch {
            return false;
        }

        if (this.backendApplicationHosts.hasKnownHosts()) {
            // When THEIA_HOSTS is configured, validate against the explicit allowlist.
            return this.backendApplicationHosts.hosts.has(originHost);
        }

        // When THEIA_HOSTS is not configured (the common development/default case),
        // enforce same-origin: the Origin's host must match the request's Host header.
        const hostHeader = request.headers.host;
        if (!hostHeader) {
            return false;
        }
        return originHost === hostHeader;
    }
}
