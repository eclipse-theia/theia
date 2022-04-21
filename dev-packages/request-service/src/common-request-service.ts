/********************************************************************************
 * Copyright (C) 2022 TypeFox and others.
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

import { CancellationToken } from 'vscode-languageserver-protocol';

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : undefined;

export interface Headers {
    [header: string]: string;
}

export interface RequestOptions {
    type?: string;
    url: string;
    user?: string;
    password?: string;
    headers?: Headers;
    timeout?: number;
    data?: string;
    followRedirects?: number;
    proxyAuthorization?: string;
}

export interface RequestContext {
    url: string;
    res: {
        headers: Headers;
        statusCode?: number;
    };
    buffer: Uint8Array;
}

export namespace RequestContext {
    export function isSuccess(context: RequestContext): boolean {
        return (context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
    }

    function hasNoContent(context: RequestContext): boolean {
        return context.res.statusCode === 204;
    }

    export function asText(context: RequestContext): string {
        if (!isSuccess(context)) {
            throw new Error(`Server returned code ${context.res.statusCode} for request to '${context.url}'`);
        }
        if (hasNoContent(context)) {
            return '';
        }
        if (textDecoder) {
            return textDecoder.decode(context.buffer);
        } else {
            return context.buffer.toString();
        }
    }

    export function asJson<T = {}>(context: RequestContext): T {
        const str = asText(context);
        try {
            return JSON.parse(str);
        } catch (err) {
            err.message += ':\n' + str;
            throw err;
        }
    }

    /**
     * Convert the buffer to base64 before sending it to the frontend.
     * This reduces the amount of JSON data transferred massively.
     * Does nothing if the buffer is already compressed.
     */
    export function compress(context: RequestContext): RequestContext {
        if (context.buffer instanceof Uint8Array && Buffer !== undefined) {
            const base64Data = Buffer.from(context.buffer).toString('base64');
            Object.assign(context, {
                buffer: base64Data
            });
        }
        return context;
    }

    /**
     * Decompresses a base64 buffer into a normal array buffer
     * Does nothing if the buffer is not compressed.
     */
    export function decompress(context: RequestContext): RequestContext {
        const buffer = context.buffer;
        if (typeof buffer === 'string' && typeof atob === 'function') {
            context.buffer = Uint8Array.from(atob(buffer), c => c.charCodeAt(0));
        }
        return context;
    }
}

export interface RequestConfiguration {
    proxyUrl?: string;
    proxyAuthorization?: string;
    strictSSL?: boolean;
}
export interface RequestService {
    configure(config: RequestConfiguration): Promise<void>;
    request(options: RequestOptions, token?: CancellationToken): Promise<RequestContext>;
    resolveProxy(url: string): Promise<string | undefined>
}

export const RequestService = Symbol('RequestService');
export const BackendRequestService = Symbol('BackendRequestService');
export const REQUEST_SERVICE_PATH = '/services/request-service';
