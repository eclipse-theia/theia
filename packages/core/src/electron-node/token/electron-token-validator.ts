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

import * as http from 'http';
import * as cookie from 'cookie';
import { injectable } from 'inversify';
import { ElectronSecurityToken } from '../../electron-common/electron-token';

/**
 * On Electron, we want to make sure that only Electron's browser-windows access the backend services.
 */
@injectable()
export class ElectronTokenValidator {

    protected electronSecurityToken: ElectronSecurityToken = this.getToken();

    /**
     * Expects the token to be passed via cookies by default.
     */
    allowRequest(request: http.IncomingMessage): boolean {
        const cookieHeader = request.headers.cookie;
        if (typeof cookieHeader === 'string') {
            const token = cookie.parse(cookieHeader)[ElectronSecurityToken];
            if (typeof token === 'string') {
                return this.isTokenValid(JSON.parse(token));
            }
        }
        return false;
    }

    isTokenValid(token: ElectronSecurityToken): boolean {
        return typeof token === 'object' && token.value === this.electronSecurityToken!.value;
    }

    /**
     * Returns the token to compare to when authorizing requests.
     */
    protected getToken(): ElectronSecurityToken {
        return JSON.parse(process.env[ElectronSecurityToken]!);
    }

}
