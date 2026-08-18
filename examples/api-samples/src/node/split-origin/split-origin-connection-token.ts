// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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
import { injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response, NextFunction } from '@theia/core/shared/express';
import {
    BrowserConnectionTokenBackendContribution,
    BROWSER_TOKEN_COOKIE_NAME
} from '@theia/core/lib/node/hosting/browser-connection-token';
import { SPLIT_ORIGIN_SESSION_PATH } from '../../common/split-origin/remote-backend';

/**
 * Do not mint the connection cookie on anonymous GETs. Issue it only after
 * `POST /split-origin/session` with `Authorization: Bearer` matching
 * `THEIA_SPLIT_ORIGIN_TOKEN` (demo default `S3Cr3t`).
 */
@injectable()
export class SplitOriginConnectionTokenBackendContribution extends BrowserConnectionTokenBackendContribution {

    protected override expressMiddleware(_req: Request, _res: Response, next: NextFunction): void {
        next();
    }

    configure(app: Application): void {
        app.post(SPLIT_ORIGIN_SESSION_PATH, (req, res) => {
            const header = req.headers.authorization;
            const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
            const expected = process.env.THEIA_SPLIT_ORIGIN_TOKEN || 'S3Cr3t';
            if (!presented || presented !== expected) {
                res.sendStatus(401);
                return;
            }
            this.issueConnectionCookie(req, res);
            res.sendStatus(204);
        });
    }

    protected issueConnectionCookie(req: http.IncomingMessage, res: Response): void {
        const origin = req.headers.origin;
        const hostHeader = req.headers.host;
        let crossSite = false;
        if (origin && hostHeader) {
            try {
                crossSite = new URL(origin).hostname !== hostHeader.split(':')[0];
            } catch {
                crossSite = false;
            }
        }
        res.cookie(BROWSER_TOKEN_COOKIE_NAME, this.browserConnectionToken.value, {
            httpOnly: true,
            path: '/',
            sameSite: crossSite ? 'none' : 'strict',
            secure: crossSite
        });
    }
}
