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

import { inject, injectable } from '@theia/core/shared/inversify';
import { BackendApplicationContribution, EarlyExpressMiddleware, HttpConnectionValidator } from '@theia/core/lib/node';
import { MiniBrowserEndpoint } from '@theia/mini-browser/lib/common/mini-browser-endpoint';
import { Request, Response, NextFunction } from '@theia/core/shared/express';

/**
 * Mini-browser serves workspace files from `GET /mini-browser/<fs-path>` with no
 * cookie check in core. The split-origin demo also sets
 * `THEIA_MINI_BROWSER_HOST_PATTERN={{hostname}}`, so that route is on the
 * backend origin and readable without a session.
 *
 * Require the connection cookie (issued only after `POST /split-origin/session`).
 * Must run as early middleware so it is registered before the vhost handler.
 *
 * Cookie is host-only: this works while the mini-browser shares the backend
 * host. A `{{uuid}}.mini-browser.{{hostname}}` vhost will not receive the
 * cookie unless `Domain` is set on it.
 */
@injectable()
export class SplitOriginMiniBrowserGuard implements BackendApplicationContribution {

    @inject(HttpConnectionValidator)
    protected readonly connectionValidator: HttpConnectionValidator;

    @inject(EarlyExpressMiddleware)
    protected readonly earlyMiddleware: EarlyExpressMiddleware;

    initialize(): void {
        this.earlyMiddleware.handlers.push((req: Request, res: Response, next: NextFunction) => this.handle(req, res, next));
    }

    protected handle(req: Request, res: Response, next: NextFunction): void {
        if (req.method === 'OPTIONS' || !this.isMiniBrowserPath(req.path)) {
            next();
            return;
        }
        this.connectionValidator.validateRequest(req, res, next);
    }

    protected isMiniBrowserPath(path: string): boolean {
        const prefix = MiniBrowserEndpoint.PATH;
        return path === prefix || path.startsWith(`${prefix}/`);
    }
}
