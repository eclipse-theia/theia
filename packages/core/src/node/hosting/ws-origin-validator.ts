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
import * as url from 'url';
import { WsRequestValidatorContribution } from '../ws-request-validators';
import { BackendApplicationHosts } from './backend-application-hosts';

@injectable()
export class WsOriginValidator implements WsRequestValidatorContribution {

    @inject(BackendApplicationHosts)
    protected readonly backendApplicationHosts: BackendApplicationHosts;

    allowWsUpgrade(request: http.IncomingMessage): boolean {
        if (!this.backendApplicationHosts.hasKnownHosts() || !request.headers.origin) {
            return true;
        }
        const origin = url.parse(request.headers.origin);
        return this.backendApplicationHosts.hosts.has(origin.host!);
    }
}
