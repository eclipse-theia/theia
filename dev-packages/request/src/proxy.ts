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

import * as tls from 'tls';
import { ProxyAgent, Agent, Dispatcher } from 'undici';

function getSystemProxyURI(requestURL: URL, env: typeof process.env): string | undefined {
    if (requestURL.protocol === 'http:') {
        return env.HTTP_PROXY || env.http_proxy;
    } else if (requestURL.protocol === 'https:') {
        return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
    }

    return undefined;
}

function isLoopback(requestURL: URL): boolean {
    const hostname = requestURL.hostname.toLowerCase();
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

const secureContexts = new WeakMap<readonly string[], tls.SecureContext>();
const directAgents = new WeakMap<tls.SecureContext, Agent>();

/**
 * Returns a secure context that trusts exactly the given CA certificates.
 * The context is created once per array, so that the certificates aren't parsed again for every connection.
 */
function getSecureContext(ca: readonly string[]): tls.SecureContext {
    let context = secureContexts.get(ca);
    if (!context) {
        context = tls.createSecureContext({ ca: [...ca] });
        secureContexts.set(ca, context);
    }
    return context;
}

export interface ProxySettings {
    proxyUrl?: string;
    strictSSL?: boolean;
    /** Sent as `Proxy-Authorization` when the proxy URL carries no credentials of its own. */
    proxyAuthorization?: string;
    /**
     * The CA certificates to trust for TLS connections, in place of Node's default ones.
     * Reuse the same array across requests: a secure context is created once per array.
     */
    ca?: readonly string[];
}

export function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: ProxySettings = {}): Dispatcher | undefined {
    let requestURL: URL;
    try {
        requestURL = new URL(rawRequestURL);
    } catch {
        return undefined;
    }

    const proxyURL = isLoopback(requestURL) ? undefined : options.proxyUrl || getSystemProxyURI(requestURL, env);
    const secureContext = options.ca ? getSecureContext(options.ca) : undefined;
    const requestTls: tls.ConnectionOptions = {};
    if (secureContext) {
        requestTls.secureContext = secureContext;
    }
    if (options.strictSSL === false) {
        requestTls.rejectUnauthorized = false;
    }
    const hasRequestTls = Object.keys(requestTls).length > 0;

    if (!proxyURL) {
        if (options.strictSSL === false) {
            return new Agent({ connect: requestTls });
        }
        if (secureContext) {
            // shared, so that connections are reused as with the global dispatcher
            let agent = directAgents.get(secureContext);
            if (!agent) {
                agent = new Agent({ connect: requestTls });
                directAgents.set(secureContext, agent);
            }
            return agent;
        }
        return undefined;
    }

    let proxyEndpoint: URL;
    try {
        proxyEndpoint = new URL(proxyURL);
    } catch {
        return undefined;
    }

    if (!/^https?:$/.test(proxyEndpoint.protocol)) {
        return undefined;
    }

    const proxyAgentOptions: ProxyAgent.Options = {
        uri: proxyURL,
        token: proxyEndpoint.username
            ? `Basic ${Buffer.from(`${decodeURIComponent(proxyEndpoint.username)}:${decodeURIComponent(proxyEndpoint.password)}`).toString('base64')}`
            : options.proxyAuthorization,
    };

    if (hasRequestTls) {
        proxyAgentOptions.requestTls = requestTls;
    }
    if (secureContext && proxyEndpoint.protocol === 'https:') {
        proxyAgentOptions.proxyTls = { secureContext };
    }

    return new ProxyAgent(proxyAgentOptions);
}
