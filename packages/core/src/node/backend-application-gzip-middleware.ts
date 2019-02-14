/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import * as express from 'express';
import * as fs from 'fs-extra';
import * as mimeType from 'mime-types';

export const serveGzip = function (req: express.Request, res: express.Response, next: express.NextFunction) {

    // check if browser supports it/we have the .gz equivalent of the file.
    const acceptsEncodings  = req.acceptsEncodings();

    if (acceptsEncodings.indexOf('gzip') === -1 || !fs.existsSync(`${req.url}.gz`)) {
        next();
        return;
    }

    // grab MIME before rewriting request
    // that way, we get correct Content-Type
    const contentType = mimeType.lookup(req.url);

    req.url = `${req.url}.gz`;

    res.set('Content-Encoding', 'gzip');
    res.set('Content-Type', `${contentType}`);
    next();
};
