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

import { inject, injectable, postConstruct } from 'inversify';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { BackendRequestService, RequestConfiguration, RequestContext, RequestOptions, RequestService } from '@theia/request-service';
import { PreferenceService } from '../preferences/preference-service';

@injectable()
export class DefaultBrowserRequestService implements RequestService {

    @inject(BackendRequestService)
    protected readonly backendRequestService: RequestService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected configurePromise: Promise<void> = Promise.resolve();

    @postConstruct()
    protected init(): void {
        this.configurePromise = this.preferenceService.ready.then(() => {
            const proxyUrl = this.preferenceService.get('http.proxy') as string;
            const proxyAuthorization = this.preferenceService.get('http.proxyAuthorization') as string;
            const strictSSL = this.preferenceService.get('http.proxyStrictSSL') as boolean;
            return this.configure({
                proxyUrl,
                proxyAuthorization,
                strictSSL
            });
        });
        this.preferenceService.onPreferencesChanged(e => {
            const config: RequestConfiguration = {};
            if ('http.proxy' in e) {
                config.proxyUrl = e['http.proxy'].newValue;
            }
            if ('http.proxyAuthorization' in e) {
                config.proxyAuthorization = e['http.proxyAuthorization'].newValue;
            }
            if ('http.proxyStrictSSL' in e) {
                config.strictSSL = e['http.proxyStrictSSL'].newValue;
            }
            this.configure(config);
        });
    }

    configure(config: RequestConfiguration): Promise<void> {
        return this.backendRequestService.configure(config);
    }

    resolveProxy(url: string): Promise<string | undefined> {
        return this.backendRequestService.resolveProxy(url);
    }

    protected transformBackendResponse(context: RequestContext): RequestContext {
        // In the `backend-request-facade` we transform the binary buffer into a base64 string to save space
        // We need to tranform it back into a binary buffer here
        const transferedBuffer = context.buffer as unknown as string;
        context.buffer = Uint8Array.from(atob(transferedBuffer), c => c.charCodeAt(0));
        return context;
    }

    async request(options: RequestOptions): Promise<RequestContext> {
        // Wait for both the preferences and the configuration of the backend service
        await this.configurePromise;
        const backendResult = await this.backendRequestService.request(options);
        return this.transformBackendResponse(backendResult);
    }
}

@injectable()
export class XHRBrowserRequestService extends DefaultBrowserRequestService {

    protected authorization?: string;

    override configure(config: RequestConfiguration): Promise<void> {
        if ('proxyAuthorization' in config) {
            this.authorization = config.proxyAuthorization;
        }
        return super.configure(config);
    }

    override async request(options: RequestOptions, token = CancellationToken.None): Promise<RequestContext> {
        try {
            const xhrResult = await this.xhrRequest(options, token);
            const statusCode = xhrResult.res.statusCode ?? 200;
            if (statusCode >= 400) {
                return super.request(options);
            }
            return xhrResult;
        } catch {
            return super.request(options);
        }
    }

    protected xhrRequest(options: RequestOptions, token: CancellationToken): Promise<RequestContext> {
        const authorization = this.authorization || options.proxyAuthorization;
        if (authorization) {
            options.headers = {
                ...(options.headers || {}),
                'Proxy-Authorization': authorization
            };
        }

        const xhr = new XMLHttpRequest();
        return new Promise<RequestContext>((resolve, reject) => {

            xhr.open(options.type || 'GET', options.url || '', true, options.user, options.password);
            this.setRequestHeaders(xhr, options);

            xhr.responseType = 'arraybuffer';
            xhr.onerror = () => reject(new Error(xhr.statusText && ('XHR failed: ' + xhr.statusText) || 'XHR failed'));
            xhr.onload = () => {
                resolve({
                    url: options.url,
                    res: {
                        statusCode: xhr.status,
                        headers: this.getResponseHeaders(xhr)
                    },
                    buffer: new Uint8Array(xhr.response)
                });
            };
            xhr.ontimeout = e => reject(new Error(`XHR timeout: ${options.timeout}ms`));

            if (options.timeout) {
                xhr.timeout = options.timeout;
            }

            xhr.send(options.data);

            // cancel
            token.onCancellationRequested(() => {
                xhr.abort();
                reject();
            });
        });
    }

    protected setRequestHeaders(xhr: XMLHttpRequest, options: RequestOptions): void {
        if (options.headers) {
            for (const k of Object.keys(options.headers)) {
                switch (k) {
                    case 'User-Agent':
                    case 'Accept-Encoding':
                    case 'Content-Length':
                        // unsafe headers
                        continue;
                }
                xhr.setRequestHeader(k, options.headers[k]);
            }
        }
    }

    protected getResponseHeaders(xhr: XMLHttpRequest): { [name: string]: string } {
        const headers: { [name: string]: string } = {};
        for (const line of xhr.getAllResponseHeaders().split(/\r\n|\n|\r/g)) {
            if (line) {
                const idx = line.indexOf(':');
                headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
            }
        }
        return headers;
    }
}
