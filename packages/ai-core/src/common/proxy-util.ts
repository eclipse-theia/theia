// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Checks whether the given target URL should bypass the proxy based on `no_proxy` rules.
 *
 * @param targetUrl - The URL to check against the no_proxy rules.
 * @param noProxyValue - A comma-separated list of no_proxy rules.
 * @returns `true` if the target URL should bypass the proxy, `false` otherwise.
 */
export function shouldBypassProxy(targetUrl: string | undefined, noProxyValue: string | undefined): boolean {
    if (!targetUrl || !noProxyValue) {
        return false;
    }

    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port;

    const rules = noProxyValue.split(',');
    for (const rawRule of rules) {
        const rule = rawRule.trim().toLowerCase();
        if (!rule) {
            continue;
        }

        if (rule === '*') {
            return true;
        }

        let ruleHost: string;
        let rulePort: string | undefined;
        const portSeparatorIndex = rule.lastIndexOf(':');
        // Check if there's a port in the rule (only if the part after ':' is numeric)
        if (portSeparatorIndex !== -1) {
            const possiblePort = rule.substring(portSeparatorIndex + 1);
            if (/^\d+$/.test(possiblePort)) {
                ruleHost = rule.substring(0, portSeparatorIndex);
                rulePort = possiblePort;
            } else {
                ruleHost = rule;
            }
        } else {
            ruleHost = rule;
        }

        // If the rule specifies a port, the target must match it
        if (rulePort !== undefined && port !== rulePort) {
            continue;
        }

        if (ruleHost.startsWith('.')) {
            // Domain suffix match: .example.com matches *.example.com
            if (hostname.endsWith(ruleHost) || hostname === ruleHost.substring(1)) {
                return true;
            }
        } else {
            // Exact match or suffix match (without leading dot)
            if (hostname === ruleHost || hostname.endsWith('.' + ruleHost)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Resolves the proxy URL to use for a given target URL.
 *
 * Resolution order:
 * 1. If `settingsProxy` is provided (e.g., from Theia `http.proxy` preference), use it.
 * 2. Otherwise check environment variables based on the target URL scheme.
 * 3. If a proxy is resolved, check `no_proxy`/`NO_PROXY` — if bypass, return `undefined`.
 * 4. Return the resolved proxy URL or `undefined` if none found.
 *
 * @param targetUrl - The URL for which to resolve a proxy.
 * @param settingsProxy - An optional proxy URL from application settings.
 * @returns The proxy URL to use, or `undefined` if no proxy should be used.
 */
export function getProxyUrl(targetUrl: string | undefined, settingsProxy?: string): string | undefined {
    let proxyUrl: string | undefined;

    if (settingsProxy) {
        proxyUrl = settingsProxy;
    } else if (targetUrl) {
        let scheme: string;
        try {
            scheme = new URL(targetUrl).protocol;
        } catch {
            return undefined;
        }

        if (scheme === 'https:') {
            proxyUrl = process.env.https_proxy
                || process.env.HTTPS_PROXY
                || process.env.http_proxy
                || process.env.HTTP_PROXY;
        } else if (scheme === 'http:') {
            proxyUrl = process.env.http_proxy
                || process.env.HTTP_PROXY;
        }
    }

    if (!proxyUrl) {
        return undefined;
    }

    // Check no_proxy / NO_PROXY
    const noProxy = process.env.no_proxy ?? process.env.NO_PROXY;
    if (shouldBypassProxy(targetUrl, noProxy)) {
        return undefined;
    }

    return proxyUrl;
}
