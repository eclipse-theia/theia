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

import { Event } from '@theia/core';

export const CHATGPT_AUTH_SERVICE_PATH = '/services/chatgpt/auth';
export const ChatGptAuthService = Symbol('ChatGptAuthService');
export const ChatGptAuthServiceClient = Symbol('ChatGptAuthServiceClient');

/** Endpoint serving OpenAI models to ChatGPT subscribers. It only implements the Response API. */
export const CHATGPT_RESPONSES_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/** Current sign in state of the ChatGPT subscription. */
export interface ChatGptAuthState {
    /** Whether credentials for a ChatGPT subscription are available. */
    isAuthenticated: boolean;
    /** The email of the signed in account, if it is part of the token claims. */
    accountLabel?: string;
    /** The ChatGPT plan of the signed in account, e.g. `plus` or `pro`. */
    planType?: string;
}

/** Information the user needs to complete the browser based sign in. */
export interface ChatGptLoginSession {
    /** The URL the user has to open to authorize Theia. */
    authorizationUrl: string;
    /**
     * Whether the local callback listener was started successfully. If `false`, the browser cannot deliver the
     * authorization code and the user has to paste the redirect URL via {@link ChatGptAuthService.completeLogin}.
     */
    callbackListening: boolean;
}

/** Credentials used to talk to the ChatGPT endpoint on behalf of the signed in user. */
export interface ChatGptCredentials {
    accessToken: string;
    /** Sent as the `chatgpt-account-id` header, which the endpoint requires. */
    accountId: string;
}

export interface ChatGptAuthServiceClient {
    onAuthStateChanged(state: ChatGptAuthState): void;
}

/**
 * Service handling the OAuth 2.0 authorization code flow (with PKCE) used to access OpenAI models
 * with a ChatGPT subscription instead of an API key.
 */
export interface ChatGptAuthService {
    /**
     * Starts a new login attempt. Cancels a login attempt that is still pending.
     * @returns the URL the user has to open and whether the local callback listener is available
     */
    startLogin(): Promise<ChatGptLoginSession>;

    /**
     * Waits for the browser to deliver the authorization code to the local callback listener.
     * @returns `true` if the sign in completed, `false` if it was cancelled or timed out
     */
    waitForLogin(): Promise<boolean>;

    /**
     * Completes the pending login with a manually provided authorization code or the full redirect URL.
     * @returns `true` if the sign in completed
     */
    completeLogin(codeOrRedirectUrl: string): Promise<boolean>;

    /** Cancels the pending login attempt, if any. */
    cancelLogin(): Promise<void>;

    /** Returns the current sign in state. */
    getAuthState(): Promise<ChatGptAuthState>;

    /** Removes the stored credentials. */
    signOut(): Promise<void>;

    /** Emitted whenever the sign in state changes. */
    readonly onAuthStateChanged: Event<ChatGptAuthState>;
}
