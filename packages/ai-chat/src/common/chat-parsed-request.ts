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
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/editor/common/core/offsetRange.ts

import { AIVariable, ResolvedAIVariable } from '@theia/ai-core';
import { ChatAgentData } from './chat-agents';
import { ChatRequest } from './chat-model';

export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatSubcommandLeader = '/';

/**********************
 * INTERFACES AND TYPE GUARDS
 **********************/

export interface OffsetRange {
    readonly start: number;
    readonly endExclusive: number;
}
export class OffsetRangeImpl implements OffsetRange {
    constructor(public readonly start: number, public readonly endExclusive: number) {
        if (start > endExclusive) {
            throw new Error(`Invalid range: ${this.toString()}`);
        }
    }
}

export interface ParsedChatRequest {
    readonly request: ChatRequest;
    readonly parts: ParsedChatRequestPart[];
    readonly variables: Map<string, AIVariable>;
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

    readonly range: OffsetRange;
}

export class ChatRequestTextPart implements ChatRequestBasePart {
    readonly kind: 'text';

    constructor(readonly range: OffsetRange, readonly text: string) { }

    get promptText(): string {
        return this.text;
    }
}

export class ChatRequestVariablePart implements ChatRequestBasePart {
    readonly kind: 'var';

    protected _resolution: ResolvedAIVariable;

    constructor(readonly range: OffsetRange, readonly variableName: string, readonly variableArg: string | undefined) { }

    get text(): string {
        const argPart = this.variableArg ? `:${this.variableArg}` : '';
        return `${chatVariableLeader}${this.variableName}${argPart}`;
    }

    get promptText(): string {
        return this._resolution?.value ?? this.text;
    }

    resolve(resolution: ResolvedAIVariable): void {
        this._resolution = resolution;
    }

    get resolution(): ResolvedAIVariable | undefined {
        return this._resolution;
    }
}

export class ChatRequestAgentPart implements ChatRequestBasePart {
    readonly kind: 'agent';
    constructor(readonly range: OffsetRange, readonly agent: ChatAgentData) { }

    get text(): string {
        return `${chatAgentLeader}${this.agent.name}`;
    }

    get promptText(): string {
        return '';
    }
}

export type ParsedChatRequestPart = ChatRequestBasePart | ChatRequestTextPart | ChatRequestVariablePart | ChatRequestAgentPart;

/**********************
 * Implementations
 **********************/

