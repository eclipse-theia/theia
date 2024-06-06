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
import { Event } from '@theia/core/lib/common';
export type LanguageModelChatActor = 'user' | 'ai';

export interface LanguageModelChatMessage {
    actor: LanguageModelChatActor;
    message: string;
}
export interface LanguageModelChatResponsePart {
    /**
     * for await (const value of stream) {
     *   console.log(value);
     * }
     */
    stream: AsyncIterable<string>; // move to specific part
    // type: 'string'
}
// TODO add specific parts

export const lmServicePath = '/services/lmService';

export const AgentDispatcher = Symbol('AgentDispatcher');
export interface AgentDispatcher {
    sendRequest(messages: LanguageModelChatMessage[]): Promise<void>;
    setClient(client: AgentDispatcherClient): void;
}
export const AgentDispatcherClient = Symbol('AgentDispatcherClient');
export interface AgentDispatcherClient {
    onNextQueryResultToken: Event<string>;
    onQueryResultFinished: Event<void>;
    nextQueryResultToken(value: string): void;
    queryResultFinished(): void;
}
export const LanguageModelProvider = Symbol('LanguageModelProvider');
export interface LanguageModelProvider {
    sendRequest(messages: LanguageModelChatMessage[]): Thenable<LanguageModelChatResponsePart>; // TODO make result an array
}
