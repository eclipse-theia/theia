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

/** Public client id OpenAI registered for clients authenticating with a ChatGPT subscription. */
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CHATGPT_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
export const CHATGPT_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const CHATGPT_SCOPE = 'openid profile email offline_access';
/**
 * The port and path are registered with the OAuth application and cannot be chosen freely.
 */
export const CHATGPT_CALLBACK_PORT = 1455;
export const CHATGPT_CALLBACK_HOST = 'localhost';
export const CHATGPT_CALLBACK_PATH = '/auth/callback';
export const CHATGPT_REDIRECT_URI = `http://${CHATGPT_CALLBACK_HOST}:${CHATGPT_CALLBACK_PORT}${CHATGPT_CALLBACK_PATH}`;
/** Identifies Theia as the client of the ChatGPT endpoint. */
export const CHATGPT_ORIGINATOR = 'theia';
/** Version of this client. The endpoint requires the model listing to state one, the completion endpoint does not. */
export const CHATGPT_CLIENT_VERSION = '1.0.0';

/** Claim namespaces used by OpenAI to convey the ChatGPT account of the signed in user. */
const AUTH_CLAIM = 'https://api.openai.com/auth';
const PROFILE_CLAIM = 'https://api.openai.com/profile';

export interface PkcePair {
    verifier: string;
    challenge: string;
}

export interface ChatGptIdentity {
    accountId?: string;
    planType?: string;
    email?: string;
    /** Expiration of the token in epoch milliseconds. */
    expiresAt?: number;
}

export function createPkcePair(): PkcePair {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function createLoginState(): string {
    return randomBytes(16).toString('hex');
}

export function buildAuthorizationUrl(challenge: string, state: string, redirectUri: string = CHATGPT_REDIRECT_URI): string {
    const url = new URL(CHATGPT_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', CHATGPT_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', CHATGPT_SCOPE);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('id_token_add_organizations', 'true');
    url.searchParams.set('originator', CHATGPT_ORIGINATOR);
    return url.toString();
}

/**
 * Extracts the authorization code from user input, which is either the bare code or the full redirect URL
 * the browser was sent to.
 *
 * @throws if no code can be extracted, if the redirect URL is not the sign in callback or if its state does not match
 */
export function parseAuthorizationInput(input: string, expectedState: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('No authorization code provided.');
    }
    if (/^https?:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        if (url.pathname !== CHATGPT_CALLBACK_PATH) {
            throw new Error('The provided URL is not the sign in callback URL.');
        }
        // The state correlates the redirect with this login attempt, so it is required rather than merely compared.
        if (url.searchParams.get('state') !== expectedState) {
            throw new Error('The state of the provided redirect URL does not match the pending sign in.');
        }
        const code = url.searchParams.get('code');
        if (!code) {
            throw new Error('The provided redirect URL does not contain an authorization code.');
        }
        return code;
    }
    return trimmed;
}

/**
 * Reads the ChatGPT account information from the claims of an OpenAI access token.
 * Returns an empty identity if the token is not a readable JWT.
 */
export function decodeChatGptIdentity(accessToken: string): ChatGptIdentity {
    const payload = decodeJwtPayload(accessToken);
    if (!payload) {
        return {};
    }
    const auth = asRecord(payload[AUTH_CLAIM]);
    const profile = asRecord(payload[PROFILE_CLAIM]);
    const expiration = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
    return {
        accountId: asNonEmptyString(auth?.chatgpt_account_id),
        planType: asNonEmptyString(auth?.chatgpt_plan_type),
        email: asNonEmptyString(profile?.email) ?? asNonEmptyString(payload.email),
        expiresAt: expiration
    };
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return undefined;
    }
    try {
        return asRecord(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
    } catch {
        return undefined;
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value ? value as Record<string, unknown> : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
