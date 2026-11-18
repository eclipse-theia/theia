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
import { Agent, Dispatcher, EnvHttpProxyAgent, getGlobalDispatcher } from 'undici';

/**
 * Returns the proxy URL if it is a valid `http:` or `https:` URL, other proxies are not supported.
 */
function validateProxyURL(proxyURL: string | undefined): URL | undefined {
    if (!proxyURL || !URL.canParse(proxyURL)) {
        return undefined;
    }
    const url = new URL(proxyURL);
    return /^https?:$/.test(url.protocol) ? url : undefined;
}

/**
 * Joins the `noProxy` rules with the rules of the `no_proxy` or `NO_PROXY` environment variable.
 */
function getNoProxy(env: typeof process.env, noProxy: string[] = []): string {
    const rules = [...noProxy, ...(env.no_proxy || env.NO_PROXY || '').split(',')]
        .map(rule => rule.trim())
        .filter(rule => rule);
    // undici only bypasses all hosts if `*` is the whole value
    return rules.includes('*') ? '*' : rules.join(',');
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

/**
 * Returns the dispatcher for requests that don't go through a proxy, or `undefined` if the global dispatcher fits.
 */
function getDirectAgent(requestTls: tls.ConnectionOptions): Agent | undefined {
    if (requestTls.rejectUnauthorized === false) {
        return new Agent({ connect: requestTls });
    }
    const secureContext = requestTls.secureContext;
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

export interface ProxySettings {
    proxyUrl?: string;
    strictSSL?: boolean;
    /** Hosts that bypass the proxy, in addition to those of the `no_proxy` or `NO_PROXY` environment variable. */
    noProxy?: string[];
    /** Sent as `Proxy-Authorization` when the proxy URL carries no credentials of its own. */
    proxyAuthorization?: string;
    /**
     * The CA certificates to trust for TLS connections, in place of Node's default ones.
     * Reuse the same array across requests: a secure context is created once per array.
     */
    ca?: readonly string[];
}

/**
 * @deprecated The request URL has no effect, use {@link createProxyDispatcher} instead.
 */
export function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: ProxySettings = {}): Dispatcher | undefined {
    if (!URL.canParse(rawRequestURL)) {
        return undefined;
    }
    return createProxyDispatcher(env, options);
}

/**
 * Creates a dispatcher that decides per request whether it goes through the proxy, so that redirects are covered as well.
 * The proxy is `proxyUrl` or, without it, the proxy of the `HTTP_PROXY` or `HTTPS_PROXY` environment variable.
 * Requests to loopback hosts, and to the hosts of `noProxy` and of the `no_proxy` environment variable bypass the proxy.
 *
 * @returns `undefined` if neither a proxy, `strictSSL` nor `ca` require a custom dispatcher.
 */
export function createProxyDispatcher(env: typeof process.env, options: ProxySettings = {}): Dispatcher | undefined {
    const httpProxy = options.proxyUrl || env.http_proxy || env.HTTP_PROXY;
    const httpsProxy = options.proxyUrl || env.https_proxy || env.HTTPS_PROXY || httpProxy;
    const httpProxyURL = validateProxyURL(httpProxy);
    const httpsProxyURL = validateProxyURL(httpsProxy);

    const secureContext = options.ca ? getSecureContext(options.ca) : undefined;
    const requestTls: tls.ConnectionOptions = {};
    if (secureContext) {
        requestTls.secureContext = secureContext;
    }
    if (options.strictSSL === false) {
        requestTls.rejectUnauthorized = false;
    }
    const hasRequestTls = Object.keys(requestTls).length > 0;
    const directAgent = getDirectAgent(requestTls);

    if (!httpProxyURL && !httpsProxyURL) {
        return directAgent;
    }

    // undici's ProxyAgent prefers the token over the credentials of the proxy URL.
    // EnvHttpProxyAgent takes a single token for both proxies, so credentials in either URL drop it for both.
    const hasCredentials = !!httpProxyURL?.username || !!httpsProxyURL?.username;
    // Empty values keep undici from falling back to `process.env`
    const proxyAgent = new EnvHttpProxyAgent({
        httpProxy: httpProxyURL ? httpProxy : '',
        httpsProxy: httpsProxyURL ? httpsProxy : '',
        noProxy: getNoProxy(env, options.noProxy),
        token: hasCredentials ? undefined : options.proxyAuthorization,
        connect: hasRequestTls ? requestTls : undefined,
        requestTls: hasRequestTls ? requestTls : undefined,
        // Only used to connect to an HTTPS proxy
        proxyTls: secureContext ? { secureContext } : undefined
    });
    // The `no_proxy` rules of undici can't express the `127.0.0.0/8` range, so loopback hosts are checked here
    return proxyAgent.compose(dispatch => (dispatchOptions, handler) => {
        if (dispatchOptions.origin && isLoopback(new URL(dispatchOptions.origin.toString()))) {
            return (directAgent ?? getGlobalDispatcher()).dispatch(dispatchOptions, handler);
        }
        return dispatch(dispatchOptions, handler);
    });
}
