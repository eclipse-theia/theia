/********************************************************************************
 * Copyright (C) 2026 Kevin Gruber and others.
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

/**
 * Checks whether the request URL matches one of the given `no_proxy` rules.
 * A rule is `*`, or a host name with an optional leading dot and port, e.g. `example.com`, `.example.com` or `example.com:8080`.
 * A host name matches itself and all of its subdomains. A rule without port matches any port,
 * a rule with port matches the port of the URL, or the default port of its protocol.
 *
 * @param requestURL the URL of the request.
 * @param noProxy the `no_proxy` rules, e.g. from the `http.noProxy` preference or the split `no_proxy` environment variable.
 * @returns `true` if the request should not go through a proxy.
 */
export function shouldBypassProxy(requestURL: URL, noProxy: string[]): boolean {
    const hostname = requestURL.hostname.toLowerCase();
    const port = requestURL.port || (requestURL.protocol === 'https:' ? '443' : '80');
    return noProxy.some(rawRule => {
        const rule = rawRule.trim().toLowerCase();
        if (!rule) {
            return false;
        }
        if (rule === '*') {
            return true;
        }
        // Only a trailing numeric part is a port, so IPv6 rules like `[::1]` stay intact
        const match = /^(.*):(\d+)$/.exec(rule);
        const ruleHost = match ? match[1] : rule;
        const rulePort = match ? match[2] : undefined;
        if (rulePort && rulePort !== port) {
            return false;
        }
        const domain = ruleHost.startsWith('.') ? ruleHost.substring(1) : ruleHost;
        return hostname === domain || hostname.endsWith('.' + domain);
    });
}

/**
 * Returns the rules of the `no_proxy` or `NO_PROXY` environment variable.
 */
function getSystemNoProxy(env: Record<string, string | undefined>): string[] {
    return (env.no_proxy || env.NO_PROXY || '').split(',').filter(rule => rule.trim());
}

/**
 * Checks whether the request URL matches the given `no_proxy` rules or the rules of the `no_proxy` or `NO_PROXY` environment variable.
 *
 * @param requestURL the URL of the request.
 * @param env the environment to read `no_proxy` and `NO_PROXY` from.
 * @param noProxy additional `no_proxy` rules, e.g. from the `http.noProxy` preference.
 * @returns `true` if the request should not go through a proxy.
 */
export function shouldBypassProxyForEnv(requestURL: URL, env: Record<string, string | undefined>, noProxy: string[] = []): boolean {
    return shouldBypassProxy(requestURL, [...noProxy, ...getSystemNoProxy(env)]);
}
