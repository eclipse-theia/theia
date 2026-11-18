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

