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

import 'reflect-metadata';
import { decorate, injectable } from 'inversify';
import { NodeRequestService } from '@theia/request-service/lib/node-request-service';

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
}
