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

import * as undici from 'undici';
import { shouldBypassProxy } from '../common/proxy-util';

/**
 * Creates a custom fetch function that routes requests through the given HTTP proxy.
 *
 * @param proxyUrl - The proxy URL to use, or `undefined` for no proxy.
 * @returns A custom fetch function using the proxy, when it is defined.
 */
export function createProxyFetch(proxyUrl: string | undefined, timeout?: number): typeof fetch | undefined {
    // Set timeouts for http responses to 3600000 (1h) by default
    const defaultTimeouts = (timeout !== undefined)
        ? { headersTimeout: timeout, bodyTimeout: timeout }
        : { headersTimeout: 3600000, bodyTimeout: 3600000 };

    const clientFactory = (origin: string | URL, opts: undici.Client.Options) =>
        new undici.Client(origin, { ...opts, ...defaultTimeouts });

    const dispatcher = proxyUrl
        ? new undici.ProxyAgent({ uri: proxyUrl, factory: clientFactory })
        : new undici.Agent({ factory: clientFactory });

    return ((input: string | URL | Request, init?: RequestInit) =>
        fetch(input, { ...init, dispatcher: dispatcher } as RequestInit)
    ) as typeof fetch;
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
