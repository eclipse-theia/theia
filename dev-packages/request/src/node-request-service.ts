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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import type { Dispatcher } from 'undici';
import { getProxyAgent } from './proxy';
import { Headers, RequestConfiguration, RequestContext, RequestOptions, RequestService, CancellationToken } from './common-request-service';

export interface NodeRequestOptions extends RequestOptions {
    strictSSL?: boolean;
    dispatcher?: Dispatcher;
}

export class NodeRequestService implements RequestService {
    protected proxyUrl?: string;
    protected strictSSL?: boolean;
    protected authorization?: string;

    protected async getProxyUrl(url: string): Promise<string | undefined> {
        return this.proxyUrl;
    }

    async configure(config: RequestConfiguration): Promise<void> {
        if (config.proxyUrl !== undefined) {
            this.proxyUrl = config.proxyUrl;
        }
        if (config.strictSSL !== undefined) {
            this.strictSSL = config.strictSSL;
        }
        if (config.proxyAuthorization !== undefined) {
            this.authorization = config.proxyAuthorization;
        }
    }

    protected async processOptions(options: NodeRequestOptions): Promise<NodeRequestOptions> {
        const { strictSSL } = this;
        options.strictSSL = options.strictSSL ?? strictSSL;
        if (!options.dispatcher) {
            options.dispatcher = getProxyAgent(options.url || '', process.env, {
                proxyUrl: await this.getProxyUrl(options.url),
                strictSSL: options.strictSSL
            });
        }

        const authorization = options.proxyAuthorization || this.authorization;
        if (authorization) {
            options.headers = {
                ...(options.headers || {}),
                'Proxy-Authorization': authorization
            };
        }

        return options;
    }

    async request(options: NodeRequestOptions, token?: CancellationToken): Promise<RequestContext> {
        options = await this.processOptions(options);

        const headers: Record<string, string> = { ...(options.headers || {}) };

        if (options.user && options.password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(options.user + ':' + options.password).toString('base64');
        }

        const signals: AbortSignal[] = [];
        if (options.timeout) {
            signals.push(AbortSignal.timeout(options.timeout));
        }

        let tokenAbortController: AbortController | undefined;
        let cancellationListener: void | { dispose(): void } | undefined;
        if (token) {
            tokenAbortController = new AbortController();
            signals.push(tokenAbortController.signal);
            cancellationListener = token.onCancellationRequested(() => {
                tokenAbortController!.abort();
            });
        }

        const signal = signals.length > 0
            ? (signals.length === 1 ? signals[0] : AbortSignal.any(signals))
            : undefined;

        const fetchOptions: RequestInit & { dispatcher?: Dispatcher } = {
            method: options.type || 'GET',
            headers,
            redirect: options.followRedirects === 0 ? 'manual' : 'follow',
            signal,
        };

        if (options.dispatcher) {
            fetchOptions.dispatcher = options.dispatcher;
        }

        if (options.data) {
            fetchOptions.body = options.data;
        }

        try {
            const response = await fetch(options.url, fetchOptions);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const responseHeaders: Headers = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            return {
                url: options.url,
                res: {
                    headers: responseHeaders,
                    statusCode: response.status
                },
                buffer
            };
        } finally {
            if (cancellationListener) {
                cancellationListener.dispose();
            }
        }
    }

    async resolveProxy(url: string): Promise<string | undefined> {
        return undefined;
    }
}
