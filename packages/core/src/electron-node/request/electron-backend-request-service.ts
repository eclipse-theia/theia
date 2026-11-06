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

import { decorate, injectable, inject, named } from 'inversify';
import { NodeRequestOptions, NodeRequestService } from '@theia/request/lib/node-request-service';
import { ElectronSecurityToken } from '../../electron-common/electron-token.js';
import { ILogger } from '../../common/index.js';

decorate(injectable(), NodeRequestService);

type ProxyResponseHandler = (result: string | undefined) => void;

@injectable()
export class ElectronBackendRequestService extends NodeRequestService {

    @inject(ILogger) @named('core:ElectronBackendRequestService')
    protected readonly logger: ILogger;

    private static readonly pendingProxyRequests = new Map<string, ProxyResponseHandler>();
    private static proxyResponseListenerAttached = false;

    private static attachProxyResponseListener(): void {
        if (this.proxyResponseListenerAttached || !process.send) {
            return;
        }
        this.proxyResponseListenerAttached = true;
        process.on('message', (msg: unknown) => {
            const response = msg as { type: string, id: string, result: string };
            if (response?.type === 'resolve-proxy-response' && response.id) {
                const handler = this.pendingProxyRequests.get(response.id);
                if (handler) {
                    this.pendingProxyRequests.delete(response.id);
                    handler(response.result);
                }
            }
        });
    }

    override async getProxyUrl(url: string): Promise<string | undefined> {
        if (this.proxyUrl) {
            return this.proxyUrl;
        }
        try {
            const proxy = await this.resolveProxy(url);
            if (proxy && proxy !== 'DIRECT') {
                // Handle fallback proxies separated by semicolons, e.g., "PROXY proxy:8080; DIRECT"
                const firstProxy = proxy.split(';')[0].trim();
                const proxyType = firstProxy.split(' ')[0];  // e.g., "PROXY", "HTTPS"
                const proxyHost = firstProxy.split(' ')[1];
                if (!proxyHost) {
                    // Malformed proxy string, fall back
                    return super.getProxyUrl(url);
                }
                return this.buildProxyUrl(proxyHost, proxyType);
            }
        } catch (e) {
            this.logger.error('Could not resolve electron proxy.', e);
        }
        return super.getProxyUrl(url);
    }

    override async resolveProxy(url: string): Promise<string | undefined> {
        if (!process.send) {
            // Running in --no-cluster mode (in the Electron main process): call session directly.
            const { session } = await import('../../../electron-shared/electron/index.cjs');
            return session.defaultSession.resolveProxy(url);
        }
        // Running as a forked child process: ask the main process via Node IPC.
        return new Promise<string | undefined>(resolve => {
            const id = Math.random().toString(36).slice(2);
            ElectronBackendRequestService.attachProxyResponseListener();
            const timer = setTimeout(() => {
                ElectronBackendRequestService.pendingProxyRequests.delete(id);
                resolve(undefined);
            }, 5000);
            ElectronBackendRequestService.pendingProxyRequests.set(id, (result: string | undefined) => {
                clearTimeout(timer);
                resolve(result);
            });
            process.send!({ type: 'resolve-proxy', id, url });
        });
    }

    protected buildProxyUrl(proxyHost: string, proxyType: string): string | undefined {
        if (proxyType !== 'HTTPS' && proxyType !== 'PROXY') {
            return undefined;
        }

        if (proxyHost.startsWith('http://') || proxyHost.startsWith('https://')) {
            return proxyHost;
        }

        return proxyType === 'HTTPS'
            ? 'https://' + proxyHost
            : 'http://' + proxyHost;
    }

    protected override async processOptions(options: NodeRequestOptions): Promise<NodeRequestOptions> {
        options = await super.processOptions(options);
        const endpoint = new URL(options.url);
        if (endpoint.hostname === 'localhost') {
            const securityToken = process.env[ElectronSecurityToken];
            if (securityToken) {
                let cookie = options.headers?.['Cookie'] ?? '';
                if (cookie) {
                    cookie += '; ';
                }
                cookie += `${ElectronSecurityToken}=${securityToken}`;
                options.headers = {
                    ...(options.headers || {}),
                    'Cookie': cookie
                };
            }
        }
        return options;
    }
}
