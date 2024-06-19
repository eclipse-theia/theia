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
export interface BaseChatResponsePart {
    type: string;
}

export interface TextChatResponsePart {
    type: 'text';
    message: string;
    format?: string;
}

export interface TextStreamChatResponsePart {
    type: 'text-stream';
    stream: AsyncIterable<string>;
    format?: string
}

export const isChatResponsePart = (obj: unknown): obj is BaseChatResponsePart =>
    !!(obj && typeof obj === 'object' && 'type' in obj && typeof (obj as { type: unknown }).type === 'string');
export const isTextChatResponsePart = (obj: unknown): obj is TextChatResponsePart =>
    !!(isChatResponsePart(obj) && obj.type === 'text' && 'message' in obj && typeof (obj as { message: unknown }).message === 'string');
export const isTextStreamChatResponsePart = (obj: unknown): obj is TextStreamChatResponsePart =>
    !!(isChatResponsePart(obj) && obj.type === 'text-stream' && 'stream' in obj && (obj as { stream: unknown }).stream !== undefined);

export type ChatResponsePart = BaseChatResponsePart | TextChatResponsePart | TextStreamChatResponsePart;
export interface ChatResponse {
    parts: ChatResponsePart[];
}
