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

import * as http from 'http';
import * as https from 'https';
import { getProxyAgent, ProxyAgent } from './proxy';
import { Headers, RequestConfiguration, RequestContext, RequestOptions, RequestService } from './common-request-service';
import { CancellationToken } from 'vscode-languageserver-protocol';

export interface RawRequestFunction {
    (options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
}

export interface NodeRequestOptions extends RequestOptions {
    agent?: ProxyAgent;
    strictSSL?: boolean;
    getRawRequest?(options: NodeRequestOptions): RawRequestFunction;
};

export class NodeRequestService implements RequestService {

    protected proxyUrl?: string;
    protected strictSSL?: boolean;
    protected authorization?: string;

    protected getNodeRequest(options: RequestOptions): RawRequestFunction {
        const endpoint = new URL(options.url);
        const module = endpoint.protocol === 'https:' ? https : http;
        return module.request;
    }

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
        const agent = options.agent ? options.agent : getProxyAgent(options.url || '', process.env, {
            proxyUrl: await this.getProxyUrl(options.url),
            strictSSL: options.strictSSL
        });
        options.agent = agent;

        const authorization = options.proxyAuthorization || this.authorization;
        if (authorization) {
            options.headers = {
                ...(options.headers || {}),
                'Proxy-Authorization': authorization
            };
        }

        return options;
    }

    request(options: NodeRequestOptions, token = CancellationToken.None): Promise<RequestContext> {
        return new Promise(async (resolve, reject) => {
            options = await this.processOptions(options);

            const endpoint = new URL(options.url);
            const rawRequest = options.getRawRequest
                ? options.getRawRequest(options)
                : this.getNodeRequest(options);

            const opts: https.RequestOptions = {
                hostname: endpoint.hostname,
                port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
                protocol: endpoint.protocol,
                path: endpoint.pathname + endpoint.search,
                method: options.type || 'GET',
                headers: options.headers,
                agent: options.agent,
                rejectUnauthorized: !!options.strictSSL
            };

            if (options.user && options.password) {
                opts.auth = options.user + ':' + options.password;
            }

            const req = rawRequest(opts, async res => {
                const followRedirects = options.followRedirects ?? 3;
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers.location) {
                    this.request({
                        ...options,
                        url: res.headers.location,
                        followRedirects: followRedirects - 1
                    }, token).then(resolve, reject);
                } else {
                    const chunks: Uint8Array[] = [];

                    res.on('data', chunk => {
                        chunks.push(chunk);
                    });

                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        resolve({
                            url: options.url,
                            res: {
                                headers: res.headers as Headers,
                                statusCode: res.statusCode
                            },
                            buffer
                        });
                    });

                    res.on('error', reject);
                }
            });

            req.on('error', reject);

            if (options.timeout) {
                req.setTimeout(options.timeout);
            }

            if (options.data) {
                req.write(options.data);
            }

            req.end();

            token.onCancellationRequested(() => {
                req.abort();
                reject();
            });
        });
    }

    async resolveProxy(url: string): Promise<string | undefined> {
        return undefined;
    }
}
