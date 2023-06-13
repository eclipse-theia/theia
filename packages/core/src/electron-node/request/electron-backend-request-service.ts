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

import { decorate, injectable } from 'inversify';
import { NodeRequestOptions, NodeRequestService } from '@theia/request/lib/node-request-service';
import { ElectronSecurityToken } from '../../electron-common/electron-token';

decorate(injectable(), NodeRequestService);

@injectable()
export class ElectronBackendRequestService extends NodeRequestService {

    override async getProxyUrl(url: string): Promise<string | undefined> {
        if (this.proxyUrl) {
            return this.proxyUrl;
        }
        try {
            const proxy = await this.resolveProxy(url);
            if (proxy && proxy !== 'DIRECT') {
                const proxyHost = proxy.split(' ')[1];
                return this.buildProxyUrl(url, proxyHost);
            }
        } catch (e) {
            console.error('Could not resolve electron proxy.', e);
        }
        return super.getProxyUrl(url);
    }

    override async resolveProxy(url: string): Promise<string | undefined> {
        // TODO: Implement IPC to the backend to access the Electron proxy resolver
        return undefined;
    }

    protected buildProxyUrl(url: string, proxyHost: string): string {
        if (proxyHost.startsWith('http://') || proxyHost.startsWith('https://')) {
            return proxyHost;
        }
        if (url.startsWith('http://')) {
            return 'http://' + proxyHost;
        } else if (url.startsWith('https://')) {
            return 'https://' + proxyHost;
        }
        return proxyHost;
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
