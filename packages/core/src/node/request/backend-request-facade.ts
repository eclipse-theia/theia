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

import { inject, injectable, named, optional } from 'inversify';
import { RequestConfiguration, RequestContext, RequestOptions, RequestService } from '@theia/request';
import { ContributionProvider, MaybePromise } from '../../common';
import { BackendApplicationConfigProvider } from '../backend-application-config-provider';

export const BackendRequestAllowedContribution = Symbol('BackendRequestAllowedContribution');
export interface BackendRequestAllowedContribution {
    /**
     * Returns URL patterns that should be allowed through the backend request facade.
     * Patterns are matched against request URLs.
     *
     * Supports:
     * - Exact base URLs: `https://open-vsx.org` (allows any path under this origin)
     * - Wildcard subdomains: `https://*.github.com` (allows any subdomain)
     *
     * Only `http:` and `https:` schemes are permitted.
     */
    getAllowedUrlPatterns(): MaybePromise<string[]>;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export function isUrlAllowed(url: string, allowedPatterns: string[]): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        return false;
    }
    for (const pattern of allowedPatterns) {
        if (matchesPattern(parsed, pattern)) {
            return true;
        }
    }
    return false;
}

function matchesPattern(target: URL, pattern: string): boolean {
    let patternUrl: URL;
    try {
        patternUrl = new URL(pattern);
    } catch {
        return false;
    }
    if (!ALLOWED_SCHEMES.has(patternUrl.protocol)) {
        return false;
    }
    if (target.protocol !== patternUrl.protocol) {
        return false;
    }
    const targetPort = getEffectivePort(target);
    const patternPort = getEffectivePort(patternUrl);
    if (targetPort !== patternPort) {
        return false;
    }
    return matchesHost(target.hostname, patternUrl.hostname);
}

function getEffectivePort(url: URL): string {
    if (url.port) {
        return url.port;
    }
    if (url.protocol === 'https:') {
        return '443';
    }
    if (url.protocol === 'http:') {
        return '80';
    }
    return '';
}

function matchesHost(targetHost: string, patternHost: string): boolean {
    if (patternHost.startsWith('*.')) {
        const suffix = patternHost.substring(1); // e.g. ".example.com"
        return targetHost.endsWith(suffix) && targetHost.length > suffix.length;
    }
    return targetHost === patternHost;
}

@injectable()
export class BackendRequestFacade implements RequestService {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(ContributionProvider) @named(BackendRequestAllowedContribution) @optional()
    protected readonly allowedContributions?: ContributionProvider<BackendRequestAllowedContribution>;

    protected cachedAllowedPatterns: string[] | undefined;

    async configure(config: RequestConfiguration): Promise<void> {
        if (BackendApplicationConfigProvider.get().configureProxyFromPreferences) {
            return this.requestService.configure(config);
        }
    }

    async request(options: RequestOptions): Promise<RequestContext> {
        const patterns = await this.getAllowedPatterns();
        const url = options.url;
        if (!url || !isUrlAllowed(url, patterns)) {
            throw new Error(`Request to URL '${url}' is not allowed. The URL does not match any allowed pattern.`);
        }
        const context = await this.requestService.request(options);
        return RequestContext.compress(context);
    }

    resolveProxy(url: string): Promise<string | undefined> {
        return this.requestService.resolveProxy(url);
    }

    protected async getAllowedPatterns(): Promise<string[]> {
        if (this.cachedAllowedPatterns) {
            return this.cachedAllowedPatterns;
        }
        const patterns: string[] = [];
        if (this.allowedContributions) {
            for (const contribution of this.allowedContributions.getContributions()) {
                const contributed = await contribution.getAllowedUrlPatterns();
                patterns.push(...contributed);
            }
        }
        this.cachedAllowedPatterns = patterns;
        return patterns;
    }
}
