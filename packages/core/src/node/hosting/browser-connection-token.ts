// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import * as cookie from 'cookie';
import * as crypto from 'crypto';
import * as http from 'http';
import express = require('express');
import { inject, injectable } from 'inversify';
import { environment } from '../../common/index';
import { MaybePromise } from '../../common';
import { BackendApplicationContribution, EarlyExpressMiddleware } from '../backend-application';
import { WsRequestValidatorContribution } from '../ws-request-validators';
import { generateUuid } from '../../common/uuid';

export const BrowserConnectionToken = Symbol('BrowserConnectionToken');

export const BROWSER_TOKEN_COOKIE_NAME = 'theia-connection-token';

export interface BrowserConnectionToken {
    value: string;
}

/**
 * Validates WebSocket and HTTP requests using a cookie-based connection token.
 *
 * In browser deployments, the server generates a random token at startup and sets it
 * as a `SameSite=Strict; HttpOnly` cookie on the first page load. Cross-origin pages
 * cannot obtain or send this cookie, so their requests are rejected.
 *
 * This complements the origin validator: non-browser callers that omit the Origin
 * header (e.g. Node.js scripts) still cannot reach the backend without the cookie.
 *
 * Skipped in Electron deployments (which use their own `ElectronSecurityToken`).
 */
@injectable()
export class BrowserConnectionTokenBackendContribution implements BackendApplicationContribution, WsRequestValidatorContribution {

    @inject(BrowserConnectionToken)
    protected readonly browserConnectionToken: BrowserConnectionToken;

    @inject(EarlyExpressMiddleware)
    protected readonly earlyMiddleware: EarlyExpressMiddleware;

    /**
     * Register the cookie middleware during `initialize()` via `EarlyExpressMiddleware`
     * so it runs before `express.static()` (which is registered later during `configure()`).
     * This ensures the browser receives the token cookie on the initial page load.
     */
    initialize(): void {
        if (environment.electron.is()) {
            return;
        }
        this.earlyMiddleware.handlers.push((req, res, next) => this.expressMiddleware(req, res, next));
    }

    /**
     * Validate the connection token cookie on WebSocket upgrade requests.
     * Non-browser callers that omit the Origin header (e.g. Node.js scripts)
     * cannot provide the `SameSite=Strict` cookie either, so they are rejected.
     */
    allowWsUpgrade(request: http.IncomingMessage): MaybePromise<boolean> {
        if (environment.electron.is()) {
            return true;
        }
        const token = this.getTokenFromCookie(request);
        if (token) {
            return this.isTokenValid(token);
        }
        // No cookie: reject. Legitimate browsers always have the cookie
        // because it is set on the initial page load.
        return false;
    }

    protected expressMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
        const existing = this.getTokenFromCookie(req);
        if (!existing || !this.isTokenValid(existing)) {
            // No cookie or stale cookie (e.g. after server restart) so (re-)issue it.
            // The browser will use the fresh token on subsequent requests.
            res.cookie(BROWSER_TOKEN_COOKIE_NAME, this.browserConnectionToken.value, {
                httpOnly: true,
                sameSite: 'strict',
                path: '/'
            });
        }
        next();
    }

    protected getTokenFromCookie(req: http.IncomingMessage): string | undefined {
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
            return cookie.parse(cookieHeader)[BROWSER_TOKEN_COOKIE_NAME];
        }
        return undefined;
    }

    protected isTokenValid(token: string): boolean {
        try {
            const received = Buffer.from(token, 'utf8');
            const expected = Buffer.from(this.browserConnectionToken.value, 'utf8');
            return received.byteLength === expected.byteLength && crypto.timingSafeEqual(received, expected);
        } catch (error) {
            console.error(error);
        }
        return false;
    }
}

/**
 * Creates a new browser connection token.
 */
export function createBrowserConnectionToken(): BrowserConnectionToken {
    return { value: generateUuid() };
}
