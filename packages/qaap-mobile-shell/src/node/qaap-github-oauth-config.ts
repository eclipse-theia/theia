// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_GITHUB_OAUTH_CALLBACK_PATH } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

export interface QaapGithubOAuthConfig {
    clientId: string;
    clientSecret: string;
    /** e.g. http://localhost:3000 — no trailing slash */
    publicUrl: string;
    callbackUrl: string;
}

export function normalizeQaapPublicUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

export function buildQaapGithubCallbackUrl(publicUrl: string): string {
    return `${normalizeQaapPublicUrl(publicUrl)}${QAAP_GITHUB_OAUTH_CALLBACK_PATH}`;
}

/**
 * Reads QAAP_GITHUB_CLIENT_ID, QAAP_GITHUB_CLIENT_SECRET, QAAP_OAUTH_PUBLIC_URL from process.env.
 * Optional QAAP_GITHUB_WEBHOOK_SECRET verifies POST /qaap/api/github/webhook (GitHub App / repo hook).
 */
export function readQaapGithubOAuthConfig(): QaapGithubOAuthConfig | undefined {
    const clientId = process.env.QAAP_GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.QAAP_GITHUB_CLIENT_SECRET?.trim();
    const publicUrlRaw = process.env.QAAP_OAUTH_PUBLIC_URL?.trim();
    if (!clientId || !clientSecret || !publicUrlRaw) {
        return undefined;
    }
    const publicUrl = normalizeQaapPublicUrl(publicUrlRaw);
    return {
        clientId,
        clientSecret,
        publicUrl,
        callbackUrl: buildQaapGithubCallbackUrl(publicUrl),
    };
}
