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

import { createHash, randomBytes } from 'crypto';

export const CHATGPT_CLIENT_ID = 'dynamic_agent_client';
export const CHATGPT_AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const CHATGPT_TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1';
export const CHATGPT_SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const CHATGPT_CALLBACK_PORT = 1455;
export const CHATGPT_CALLBACK_HOST = '127.0.0.1';
export const CHATGPT_CALLBACK_PATH = '/auth/callback';
export const CHATGPT_REDIRECT_URI = `http://${CHATGPT_CALLBACK_HOST}:${CHATGPT_CALLBACK_PORT}${CHATGPT_CALLBACK_PATH}`;

export interface PkcePair {
    verifier: string;
    challenge: string;
}

export interface AuthorizationOptions {
    nonce: string;
    hostId: string;
    agentName: string;
    redirectUri?: string;
    clientId?: string;
    idTokenHint?: string;
}

export interface AuthorizationCode {
    code: string;
    clientId: string;
}

export function createPkcePair(): PkcePair {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function createLoginState(): string {
    return randomBytes(16).toString('hex');
}

export function isConcreteClientId(value: unknown): value is string {
    return typeof value === 'string' && value !== CHATGPT_CLIENT_ID && value !== 'dynamic' && /^[A-Za-z0-9._-]{1,256}$/.test(value);
}

export function buildAuthorizationUrl(challenge: string, state: string, options: AuthorizationOptions): string {
    const url = new URL(CHATGPT_AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId ?? CHATGPT_CLIENT_ID,
        redirect_uri: options.redirectUri ?? CHATGPT_REDIRECT_URI,
        scope: CHATGPT_SCOPE,
        ext_agent_host_id: options.hostId,
        resource: CHATGPT_RESOURCE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        nonce: options.nonce
    }).toString();
    if (!options.clientId) {
        url.searchParams.set('agent_name_hint', options.agentName);
    }
    if (options.idTokenHint) {
        url.searchParams.set('id_token_hint', options.idTokenHint);
    }
    return url.toString();
}

/** A bare code is insufficient. A state-verified access_denied callback returns undefined. */
export function parseAuthorizationInput(input: string, expectedState: string, redirectUri: string = CHATGPT_REDIRECT_URI,
    expectedClientId?: string): AuthorizationCode | undefined {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new Error('Provide the full authorization callback URL, not a bare authorization code.');
    }
    const expected = new URL(redirectUri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) {
        throw new Error('The provided URL is not the sign in callback URL.');
    }
    if (url.searchParams.getAll('state').length !== 1) {
        throw new Error('The authorization callback must contain exactly one state.');
    }
    if (url.searchParams.get('state') !== expectedState) {
        throw new Error('The state of the provided redirect URL does not match the pending sign in.');
    }
    if (url.searchParams.getAll('client_id').length > 1) {
        throw new Error('The authorization callback must not repeat client_id.');
    }
    const explicitClientId = url.searchParams.get('client_id');
    if (url.searchParams.has('client_id')
        && (!isConcreteClientId(explicitClientId) || (expectedClientId && expectedClientId !== explicitClientId))) {
        throw new Error('The callback client id does not match the pending sign in.');
    }
    if (url.searchParams.has('error')) {
        if (url.searchParams.getAll('error').length !== 1 || url.searchParams.has('code')
            || url.searchParams.get('error') !== 'access_denied') {
            throw new Error('The authorization callback contains an invalid error response.');
        }
        return undefined;
    }
    if (url.searchParams.getAll('code').length !== 1) {
        throw new Error('The authorization callback must contain exactly one code.');
    }
    const code = url.searchParams.get('code')?.trim();
    const clientId = explicitClientId ?? expectedClientId;
    if (!code) {
        throw new Error('The provided redirect URL does not contain an authorization code.');
    }
    if (!isConcreteClientId(clientId) || (expectedClientId && expectedClientId !== clientId)) {
        throw new Error('The callback client id does not match the pending sign in.');
    }
    return { code, clientId };
}
