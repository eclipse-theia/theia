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

import { parse as parseUrl, Url } from 'url';
import * as httpAgent from 'http-proxy-agent';
import * as httpsAgent from 'https-proxy-agent';

export type ProxyAgent = httpAgent.HttpProxyAgent | httpsAgent.HttpsProxyAgent;

function getSystemProxyURI(requestURL: Url, env: typeof process.env): string | undefined {
    if (requestURL.protocol === 'http:') {
        return env.HTTP_PROXY || env.http_proxy;
    } else if (requestURL.protocol === 'https:') {
        return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
    }

    return undefined;
}

export interface ProxySettings {
    proxyUrl?: string;
    strictSSL?: boolean;
}

export function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: ProxySettings = {}): ProxyAgent | undefined {
    const requestURL = parseUrl(rawRequestURL);
    const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL, env);

    if (!proxyURL) {
        return undefined;
    }

    const proxyEndpoint = parseUrl(proxyURL);

    if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
        return undefined;
    }

    const opts = {
        host: proxyEndpoint.hostname || '',
        port: proxyEndpoint.port || (proxyEndpoint.protocol === 'https' ? '443' : '80'),
        auth: proxyEndpoint.auth,
        rejectUnauthorized: !!options.strictSSL,
    };

    const createAgent = requestURL.protocol === 'http:' ? httpAgent : httpsAgent;
    return createAgent(opts);
}
