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

import { ResolvedAIVariable, ToolRequest, toolRequestToPromptText } from '@theia/ai-core';
import { ChatRequest } from './chat-model';
import {
    SerializableTextPart,
    SerializableVariablePart,
    SerializableFunctionPart,
    SerializableAgentPart,
    SerializableParsedRequest,
} from './chat-model-serialization';

export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatFunctionLeader = '~';
export const chatSubcommandLeader = '/';

/**********************
 * CLASSES, INTERFACES AND TYPE GUARDS
 **********************/

export interface OffsetRange {
    readonly start: number;
    readonly endExclusive: number;
}

export interface ParsedChatRequest {
    readonly request: ChatRequest;
    readonly parts: ParsedChatRequestPart[];
    readonly toolRequests: Map<string, ToolRequest>;
    readonly variables: ResolvedAIVariable[];
}

export interface ParsedChatRequestPart {
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

export class ParsedChatRequestTextPart implements ParsedChatRequestPart {
    readonly kind = 'text';

    constructor(readonly range: OffsetRange, readonly text: string) { }

    get promptText(): string {
        return this.text;
    }

    toSerializable(): SerializableTextPart {
        return {
            kind: 'text',
            range: this.range,
            text: this.text
        };
    }
}

export class ParsedChatRequestVariablePart implements ParsedChatRequestPart {
    readonly kind = 'var';

    public resolution: ResolvedAIVariable;

    constructor(readonly range: OffsetRange, readonly variableName: string, readonly variableArg: string | undefined) { }

    get text(): string {
        const argPart = this.variableArg ? `:${this.variableArg}` : '';
        return `${chatVariableLeader}${this.variableName}${argPart}`;
    }

    get promptText(): string {
        return this.resolution?.value ?? this.text;
    }

    toSerializable(): SerializableVariablePart {
        return {
            kind: 'var',
            range: this.range,
            variableId: this.resolution?.variable.id,
            variableName: this.variableName,
            variableArg: this.variableArg,
            variableValue: this.resolution?.value,
            variableDescription: this.resolution?.variable.description ?? 'unresolved variable'
        };
    }
}

export class ParsedChatRequestFunctionPart implements ParsedChatRequestPart {
    readonly kind = 'function';
    constructor(readonly range: OffsetRange, readonly toolRequest: ToolRequest) { }

    get text(): string {
        return `${chatFunctionLeader}${this.toolRequest.id}`;
    }

    get promptText(): string {
        return toolRequestToPromptText(this.toolRequest);
    }

    toSerializable(): SerializableFunctionPart {
        return {
            kind: 'function',
            range: this.range,
            toolRequestId: this.toolRequest.id
        };
    }
}

export class ParsedChatRequestAgentPart implements ParsedChatRequestPart {
    readonly kind = 'agent';
    constructor(readonly range: OffsetRange, readonly agentId: string, readonly agentName: string) { }

    get text(): string {
        return `${chatAgentLeader}${this.agentName}`;
    }

    get promptText(): string {
        return '';
    }

    toSerializable(): SerializableAgentPart {
        return {
            kind: 'agent',
            range: this.range,
            agentId: this.agentId,
            agentName: this.agentName
        };
    }
}

export namespace ParsedChatRequest {
    export function toSerializable(parsed: ParsedChatRequest): SerializableParsedRequest {
        return {
            parts: parsed.parts.map(part => {
                if (part instanceof ParsedChatRequestTextPart ||
                    part instanceof ParsedChatRequestVariablePart ||
                    part instanceof ParsedChatRequestFunctionPart ||
                    part instanceof ParsedChatRequestAgentPart) {
                    return part.toSerializable();
                }
                throw new Error(`Unknown part type: ${part.kind}`);
            }),
            toolRequests: Array.from(parsed.toolRequests.keys()).map(toolId => ({
                id: toolId
            })),
            variables: parsed.variables.map(variable => ({
                variableId: variable.variable.id,
                variableName: variable.variable.name,
                variableDescription: variable.variable.description,
                arg: variable.arg,
                value: variable.value
            }))
        };
    }
}
