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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatParserTypes.ts

import { ChatAgentData } from './chat-agents';

export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatSubcommandLeader = '/';

/**********************
 * INTERFACES AND TYPE GUARDS
 **********************/

export interface ParsedChatRequest {
    readonly text: string;
    readonly parts: ParsedChatRequestPart[];
}

export interface ChatRequestBasePart {
    readonly kind: string;
    /**
     * The text as represented in the ChatRequest
     */
    readonly text: string;
    /**
     * The text as will be sent to the LLM
     */
    readonly promptText: string;
}

export interface ChatRequestTextPart extends ChatRequestBasePart {
    readonly kind: 'text';
}

export interface ChatRequestVariablePart extends ChatRequestBasePart {
    readonly kind: 'var';
    readonly variableName: string;
    readonly variableArg: string;
    readonly variableId: string;
}

export interface ChatRequestAgentPart extends ChatRequestBasePart {
    readonly kind: 'agent';
    readonly agent: ChatAgentData;
}

export type ParsedChatRequestPart = ChatRequestBasePart | ChatRequestTextPart | ChatRequestVariablePart | ChatRequestAgentPart;

/**********************
 * Implementations
 **********************/

