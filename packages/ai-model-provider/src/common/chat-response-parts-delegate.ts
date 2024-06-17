// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ChatRequestPart } from './chat-request-part';
import { BaseChatResponsePart, TextChatResponsePart } from './chat-response-parts';

export interface TextStreamChatResponsePartDelegate {
    type: 'text-stream-delegate';
    id: string;
    format?: string
}
export const isTextStreamChatResponsePartDelegate = (obj: unknown): obj is TextStreamChatResponsePartDelegate =>
    !!(obj && typeof obj === 'object' && 'type' in obj && (obj as { type: unknown }).type === 'text-stream-delegate');

export type ChatResponsePartDelegate = BaseChatResponsePart | TextChatResponsePart | TextStreamChatResponsePartDelegate;
export type ChatResponseDelegate = ChatResponsePartDelegate[];

export const FrontendChatDelegateClient = Symbol('FrontendChatDelegateClient');
export interface FrontendChatDelegateClient {
    send(id: string, token: string | undefined): void;
}

export const ModelProviderFrontendDelegate = Symbol('ModelProviderFrontendDelegate');
export interface ModelProviderFrontendDelegate {
    setClient(client: FrontendChatDelegateClient): void
    sendRequest(messages: ChatRequestPart[]): Promise<ChatResponseDelegate>;
}

export const frontendChatDelegatePath = '/services/frontendChatDelegate';
