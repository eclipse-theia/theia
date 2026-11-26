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

import { session } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { ElectronSecurityToken } from '../electron-common/electron-token.js';

@injectable()
export class ElectronSecurityTokenService {

    @inject(ElectronSecurityToken)
    protected readonly electronSecurityToken: ElectronSecurityToken;

    /**
     * Sets the token as a cookie for the given URL. Since Electron 45, Chromium does not send it from the `file://` frontend,
     * so `addElectronSecurityTokenHeader` authenticates the requests to the backend. The cookie is kept as a fallback,
     * e.g. for webview and mini-browser host patterns outside `localhost`.
     */
    async setElectronSecurityTokenCookie(url: string): Promise<void> {
        await session.defaultSession.cookies.set({
            url,
            name: ElectronSecurityToken,
            value: JSON.stringify(this.electronSecurityToken),
            httpOnly: true,
            sameSite: 'no_restriction'
        });
    }

    /**
     * Since Electron 45, Chromium no longer sends the cookie on requests from the `file://` frontend to the backend.
     * Adds the token to the requests to the backend and its `*.localhost` subdomains (webviews, mini-browser) instead,
     * if `isTrustedInitiator` accepts the request.
     */
    addElectronSecurityTokenHeader(port: number): void {
        const tokenCookie = `${ElectronSecurityToken}=${encodeURIComponent(JSON.stringify(this.electronSecurityToken))}`;
        session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://localhost/*', '*://*.localhost/*'] }, (details, callback) => {
            const requestHeaders = details.requestHeaders;
            const url = new URL(details.url);
            if (url.port === String(port) && this.isTrustedInitiator(details.initiatorOrigin, url)
                && !requestHeaders.Cookie?.includes(`${ElectronSecurityToken}=`)) {
                requestHeaders.Cookie = requestHeaders.Cookie ? `${requestHeaders.Cookie}; ${tokenCookie}` : tokenCookie;
            }
            callback({ requestHeaders });
        });
    }

    /**
     * Whether a request started by `initiatorOrigin` gets the token: requests of the `file://` frontend, same-origin requests
     * (a webview or mini-browser page loading its own resources) and requests without an initiator (started by Electron itself).
     * Other pages, e.g. an external page in the mini-browser, do not get it.
     */
    protected isTrustedInitiator(initiatorOrigin: string | undefined, url: URL): boolean {
        return !initiatorOrigin || initiatorOrigin === 'file://' || initiatorOrigin === url.origin;
    }
}
