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

/**
 * Result of a typed external API route handler: either a success with a status and an
 * optional JSON body, or an error with a status, a stable, machine-readable error code, and
 * optional human-readable details. Results are written to the HTTP response by the
 * `ExternalApiResponseWriter`, so that all external API endpoints share one wire format.
 *
 * Use the constructor functions of the {@link RestResult} namespace to create results.
 */
export type RestResult =
    | { kind: 'success'; status: number; body?: unknown }
    | { kind: 'error'; status: number; code: string; details?: string[] };

export namespace RestResult {
    /** `200 OK` with the given JSON body. */
    export function ok(body: unknown): RestResult {
        return success(200, body);
    }
    /** `201 Created` with the given JSON body. */
    export function created(body: unknown): RestResult {
        return success(201, body);
    }
    /** `202 Accepted` with the given JSON body. */
    export function accepted(body: unknown): RestResult {
        return success(202, body);
    }
    /** `204 No Content`. */
    export function noContent(): RestResult {
        return success(204);
    }
    /** A success response with the given status and optional JSON body. */
    export function success(status: number, body?: unknown): RestResult {
        return { kind: 'success', status, body };
    }
    /** `400 Bad Request` with the given error code and optional human-readable details. */
    export function badRequest(code: string = 'invalid request', details?: string[]): RestResult {
        return error(400, code, details);
    }
    /** `404 Not Found` with the given error code. */
    export function notFound(code: string = 'not found'): RestResult {
        return error(404, code);
    }
    /** `409 Conflict` with the given error code. */
    export function conflict(code: string): RestResult {
        return error(409, code);
    }
    /** An error response with the given status, stable, machine-readable error code, and optional human-readable details. */
    export function error(status: number, code: string, details?: string[]): RestResult {
        return { kind: 'error', status, code, details };
    }
}
