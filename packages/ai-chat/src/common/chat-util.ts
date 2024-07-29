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
import { ChatModel } from './chat-model';

export type ChatActor = 'user' | 'ai';

export interface ChatMessage {
    actor: ChatActor;
    type: 'text';
    query: string;
}

export const getMessages = (model: ChatModel, includeResponseInProgress = false): ChatMessage[] =>
    model.getRequests().flatMap(request => {
        const messages: ChatMessage[] = [];
        messages.push({
            actor: 'user',
            type: 'text',
            query: request.request.text,
        });
        if (request.response.isComplete || includeResponseInProgress) {
            messages.push({
                actor: 'ai',
                type: 'text',
                query: request.message.text,
            });
        }
        return messages;
    });
