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

/** Public OpenAI API endpoint used with token-sharing credentials. */
export const CHATGPT_RESPONSES_BASE_URL = 'https://api.openai.com/v1';
export const CHATGPT_CODEX_RESPONSES_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export type ChatGptAuthenticationMode = 'codex' | 'oss';

/** Current sign in state of the ChatGPT subscription. */
export interface ChatGptAuthState {
    /** Whether an account has a connected token-sharing session. */
    isAuthenticated: boolean;
    /** The label of the verified signed in account, if available. */
    accountLabel?: string;
    /** The ChatGPT plan of the signed in account, e.g. `plus` or `pro`. */
    planType?: string;
    /** Login alone does not imply permission to use the ChatGPT plan. */
    canUseChatGptPlan?: boolean;
    clientId?: string;
}

/** Non-secret account registration retained even after disconnecting. */
export interface ChatGptAccount {
    clientId: string;
    accountLabel?: string;
    isAuthenticated: boolean;
    canUseChatGptPlan: boolean;
}

/** Information the user needs to complete the browser based sign in. */
export interface ChatGptLoginSession {
    /** Non-secret identity of this login attempt; required by all subsequent login RPC operations. */
    loginId: string;
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
    /** OAuth access token authorized for inference by the returned resource and direct-use scopes. */
    accessToken: string;
    authenticationMode?: ChatGptAuthenticationMode;
    /** Legacy Codex account routing; never sent to the public API. */
    accountId?: string;
    clientId: string;
    /** Backend session identity, stable through rotation and replaced on reconnect. */
    sessionId?: string;
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
     * Starts a new login or reconnects a saved client id. Cancels a login attempt that is still pending.
     * @returns the URL the user has to open and whether the local callback listener is available
     */
    startLogin(clientId?: string): Promise<ChatGptLoginSession>;

    getAccounts(): Promise<ChatGptAccount[]>;

    selectAccount(clientId: string): Promise<void>;

    /**
     * Waits for the browser to deliver the authorization code to the local callback listener.
     * @returns `true` if the sign in completed, `false` if it was cancelled or timed out
     */
    waitForLogin(loginId: string): Promise<boolean>;

    /**
     * Completes the pending login with the full callback URL, including its concrete client id.
     * @returns `true` if the sign in completed
     */
    completeLogin(codeOrRedirectUrl: string, loginId: string): Promise<boolean>;

    /** Cancels only the matching pending login attempt. Missing or stale ids have no effect. */
    cancelLogin(loginId: string): Promise<void>;

    /** Returns the current sign in state. */
    getAuthState(): Promise<ChatGptAuthState>;

    /** Revokes and removes the active token set, retaining the account registration. */
    signOut(): Promise<void>;

    /** Emitted whenever the sign in state changes. */
    readonly onAuthStateChanged: Event<ChatGptAuthState>;
}
