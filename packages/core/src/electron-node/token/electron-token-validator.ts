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
import * as cookie from 'cookie';
import * as crypto from 'crypto';
import { injectable, postConstruct } from 'inversify';
import { isObject, isString, MaybePromise } from '../../common';
import { ElectronSecurityToken } from '../../electron-common/electron-token';
import { WsRequestValidatorContribution } from '../../node/ws-request-validators';

/**
 * On Electron, we want to make sure that only Electron's browser-windows access the backend services.
 */
@injectable()
export class ElectronTokenValidator implements WsRequestValidatorContribution {

    protected electronSecurityToken?: ElectronSecurityToken;

    @postConstruct()
    protected init(): void {
        this.electronSecurityToken = this.getToken();
    }

    allowWsUpgrade(request: http.IncomingMessage): MaybePromise<boolean> {
        return this.allowRequest(request);
    }

    /**
     * Expects the token to be passed via cookies by default.
     */
    allowRequest(request: http.IncomingMessage): boolean {
        if (!this.electronSecurityToken) {
            return true;
        }
        const cookieHeader = request.headers.cookie;
        if (isString(cookieHeader)) {
            const token = cookie.parse(cookieHeader)[ElectronSecurityToken];
            if (isString(token)) {
                return this.isTokenValid(JSON.parse(token));
            }
        }
        return false;
    }

    /**
     * Validates a token.
     *
     * This method both checks the shape of the parsed token data and its actual value.
     *
     * @param token Parsed object sent by the client as the token.
     */
    isTokenValid(token: unknown): boolean {
        if (isObject(token) && isString(token.value)) {
            try {
                const received = Buffer.from(token.value, 'utf8');
                const expected = Buffer.from(this.electronSecurityToken!.value, 'utf8');
                return received.byteLength === expected.byteLength && crypto.timingSafeEqual(received, expected);
            } catch (error) {
                console.error(error);
            }
        }
        return false;
    }

    /**
     * Returns the token to compare to when authorizing requests.
     */
    protected getToken(): ElectronSecurityToken | undefined {
        const token = process.env[ElectronSecurityToken];
        if (token) {
            return JSON.parse(token);
        } else {
            // No token has been passed to the backend server
            // That indicates we're running without a local frontend
            return undefined;
        }
    }

}
