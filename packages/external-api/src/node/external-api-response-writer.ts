// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as express from '@theia/core/shared/express';
import { injectable } from '@theia/core/shared/inversify';
import { RestResult } from './rest-result';

/**
 * Writes {@link RestResult}s and error responses of the external API to HTTP responses.
 *
 * All responses of the external API go through this class: the results of typed routes,
 * request body validation failures, the token verification, and the fallback error handling.
 * Rebind it to change the wire format of the external API consistently.
 */
@injectable()
export class ExternalApiResponseWriter {

    /** Writes the result of a typed route handler to the response. */
    write(result: RestResult, response: express.Response): void {
        if (result.kind === 'error') {
            this.writeError(result.status, result.code, response, result.details);
        } else if (result.body !== undefined) {
            response.status(result.status).json(result.body);
        } else {
            response.status(result.status).end();
        }
    }

    /**
     * Writes an error response with the given status, stable machine-readable error code,
     * and optional human-readable details, e.g. body validation errors. Unlike the code,
     * the details make no stability promise.
     */
    writeError(status: number, code: string, response: express.Response, details?: string[]): void {
        response.status(status).json(details?.length ? { error: code, details } : { error: code });
    }
}
