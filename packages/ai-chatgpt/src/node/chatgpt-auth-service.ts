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

import { Disposable } from '@theia/core';
import { ChatGptAuthService, ChatGptAuthServiceClient, ChatGptCredentials } from '../common';
import { CHATGPT_CALLBACK_HOST, CHATGPT_CALLBACK_PATH, CHATGPT_CALLBACK_PORT, CHATGPT_CLIENT_ID } from './chatgpt-oauth';

export const ChatGptBackendAuthService = Symbol('ChatGptBackendAuthService');

/** Backend-only service. Credentials and client registration must never be exposed through RPC. */
export interface ChatGptBackendAuthService extends ChatGptAuthService {
    getCredentials(): Promise<ChatGptCredentials | undefined>;
    addClient(client: ChatGptAuthServiceClient): Disposable;
}

export const ChatGptAuthServiceConfig = Symbol('ChatGptAuthServiceConfig');

/** Application-level backend configuration, not user preferences. */
export interface ChatGptAuthServiceConfig {
    readonly clientId: string;
    readonly callbackHost: string;
    readonly callbackPort: number;
    readonly callbackPath: string;
    readonly keyStoreService: string;
    readonly keyStoreAccount: string;
}

export const DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG: ChatGptAuthServiceConfig = {
    clientId: CHATGPT_CLIENT_ID,
    callbackHost: CHATGPT_CALLBACK_HOST,
    callbackPort: CHATGPT_CALLBACK_PORT,
    callbackPath: CHATGPT_CALLBACK_PATH,
    keyStoreService: 'theia-chatgpt',
    keyStoreAccount: 'default'
};
