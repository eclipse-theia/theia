/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import * as url from 'url';
import * as http from 'http';
import * as querystring from 'querystring';
import { injectable, inject } from 'inversify';
import { ElectronSecurityToken } from '../../electron-common/electron-token';

/**
 * On Electron, we want to make sure that only electron windows access the backend services.
 */
@injectable()
export class ElectronTokenValidator {

    @inject(ElectronSecurityToken)
    protected readonly electronSecurityToken: ElectronSecurityToken;

    allowRequest(request: http.IncomingMessage): boolean {
        const token = this.extractTokenFromRequest(request);
        return typeof token !== 'undefined' && this.isTokenValid(token);
    }

    isTokenValid(token: ElectronSecurityToken): boolean {
        return token.value === this.electronSecurityToken.value;
    }

    /**
     * Expects the token to be passed via url query.
     */
    protected extractTokenFromRequest(request: http.IncomingMessage): ElectronSecurityToken | undefined {
        const query = request.url ? url.parse(request.url).query : undefined;
        const token = query && querystring.parse(query)[ElectronSecurityToken];
        return this.parseToken(token);
    }

    /**
     * Expects raw token data to be the actual token.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected parseToken(data: any): ElectronSecurityToken | undefined {
        return typeof data === 'string' ? {
            value: data,
        } : undefined;
    }

}
