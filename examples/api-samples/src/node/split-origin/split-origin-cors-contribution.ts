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
import { BackendApplicationContribution, EarlyExpressMiddleware } from '@theia/core/lib/node';
import { BackendApplicationHosts } from '@theia/core/lib/node/hosting/backend-application-hosts';
import { Request, Response, NextFunction } from '@theia/core/shared/express';

/**
 * Reflects CORS for Origins whose host is listed in `THEIA_HOSTS`.
 * Must run as early middleware so 404s (SPA is not served here) still get CORS headers.
 */
@injectable()
export class SplitOriginCorsContribution implements BackendApplicationContribution {

    @inject(BackendApplicationHosts)
    protected readonly backendApplicationHosts: BackendApplicationHosts;

    @inject(EarlyExpressMiddleware)
    protected readonly earlyMiddleware: EarlyExpressMiddleware;

    initialize(): void {
        this.earlyMiddleware.handlers.push((req: Request, res: Response, next: NextFunction) => this.handle(req, res, next));
    }

    protected handle(req: Request, res: Response, next: NextFunction): void {
        const origin = req.headers.origin;
        if (origin && this.isAllowedOrigin(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization, content-type');
            res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
        }
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        next();
    }

    protected isAllowedOrigin(origin: string): boolean {
        if (!this.backendApplicationHosts.hasKnownHosts()) {
            return false;
        }
        try {
            return this.backendApplicationHosts.hosts.has(new URL(origin).host);
        } catch {
            return false;
        }
    }
}
