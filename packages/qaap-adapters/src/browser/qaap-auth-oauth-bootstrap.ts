// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    completeQaapGithubOAuthReturn,
    consumeQaapOAuthReturnFromUrl,
    peekQaapOAuthReturnFromUrl,
} from './qaap-github-auth-client';

let oauthReturnHandling: Promise<'github' | 'error' | 'none'> | undefined;

/** Single-flight OAuth return handling shared by login and auth contributions. */
export async function ensureQaapGithubOAuthReturnHandled(): Promise<'github' | 'error' | 'none'> {
    const peek = peekQaapOAuthReturnFromUrl();
    if (!peek) {
        return 'none';
    }
    if (!oauthReturnHandling) {
        oauthReturnHandling = (async (): Promise<'github' | 'error' | 'none'> => {
            if (peekQaapOAuthReturnFromUrl() === 'github') {
                const ok = await completeQaapGithubOAuthReturn();
                return ok ? 'github' : 'error';
            }
            if (peekQaapOAuthReturnFromUrl() === 'error') {
                consumeQaapOAuthReturnFromUrl();
                return 'error';
            }
            return 'none';
        })();
    }
    return oauthReturnHandling;
}
