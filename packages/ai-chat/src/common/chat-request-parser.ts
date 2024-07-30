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
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatRequestParser.ts

import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from './chat-agent-service';
import { ChatAgentLocation } from './chat-agents';
import { ChatRequest } from './chat-model';
import {
    chatAgentLeader,
    ChatRequestAgentPart,
    ChatRequestTextPart,
    ChatRequestVariablePart,
    chatVariableLeader,
    OffsetRangeImpl,
    ParsedChatRequest,
    ParsedChatRequestPart,
} from './chat-parsed-request';
import { AIVariable, AIVariableService } from '@theia/ai-core';

const agentReg = /^@([\w_\-\.]+)(?=(\s|$|\b))/i; // An @-agent
const variableReg = /^#([\w_\-]+)(?::([\w_\-_\/\\.:]+))?(?=(\s|$|\b))/i; // A #-variable with an optional : arg (#file:workspace/path/name.ext)
// const slashReg = /\/([\w_\-]+)(?=(\s|$|\b))/i; // A / command

export const ChatRequestParser = Symbol('ChatRequestParser');
export interface ChatRequestParser {
    parseChatRequest(request: ChatRequest, location: ChatAgentLocation): ParsedChatRequest;
}

@injectable()
export class ChatRequestParserImpl {
    constructor(
        @inject(ChatAgentService) private readonly agentService: ChatAgentService,
        @inject(AIVariableService) private readonly variableService: AIVariableService
    ) { }

    parseChatRequest(request: ChatRequest, location: ChatAgentLocation): ParsedChatRequest {
        const parts: ParsedChatRequestPart[] = [];
        const variables = new Map<string, AIVariable>();
        const message = request.text;
        for (let i = 0; i < message.length; i++) {
            const previousChar = message.charAt(i - 1);
            const char = message.charAt(i);
            let newPart: ParsedChatRequestPart | undefined;
            if (previousChar.match(/\s/) || i === 0) {
                if (char === chatVariableLeader) {
                    const variablePart = this.tryToParseVariable(
                        message.slice(i),
                        i,
                        parts
                    );
                    newPart = variablePart;
                    if (variablePart) {
                        const variable = this.variableService.getVariable(variablePart.variableName);
                        if (variable) {
                            variables.set(variable.name, variable);
                        }
                    }
                } else if (char === chatAgentLeader) {
                    newPart = this.tryToParseAgent(
                        message.slice(i),
                        i,
                        parts,
                        location
                    );
                }
            }

            if (newPart) {
                if (i !== 0) {
                    // Insert a part for all the text we passed over, then insert the new parsed part
                    const previousPart = parts.at(-1);
                    const previousPartEnd =
                        previousPart?.range.endExclusive ?? 0;
                    parts.push(
                        new ChatRequestTextPart(
                            new OffsetRangeImpl(previousPartEnd, i),
                            message.slice(previousPartEnd, i)
                        )
                    );
                }

                parts.push(newPart);
            }
        }

        const lastPart = parts.at(-1);
        const lastPartEnd = lastPart?.range.endExclusive ?? 0;
        if (lastPartEnd < message.length) {
            parts.push(
                new ChatRequestTextPart(
                    new OffsetRangeImpl(lastPartEnd, message.length),
                    message.slice(lastPartEnd, message.length)
                )
            );
        }

        return { request, parts, variables };
    }

    private tryToParseAgent(
        message: string,
        offset: number,
        parts: ReadonlyArray<ParsedChatRequestPart>,
        location: ChatAgentLocation
    ): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
        const nextAgentMatch = message.match(agentReg);
        if (!nextAgentMatch) {
            return;
        }

        const [full, name] = nextAgentMatch;
        const agentRange = new OffsetRangeImpl(offset, offset + full.length);

        let agents = this.agentService.getAgentsByName(name);
        if (!agents.length) {
            // TODO changed to use simple id for now instead of fullyQualifiedId
            const fqAgent = this.agentService.getAgent(name);
            if (fqAgent) {
                agents = [fqAgent];
            }
        }

        // If there is more than one agent with this name, and the user picked it from the suggest widget, then the selected agent should be in the
        // context and we use that one. Otherwise just pick the first.
        const agent = agents[0];
        if (!agent || !agent.locations.includes(location)) {
            return;
        }

        if (parts.some(p => p instanceof ChatRequestAgentPart)) {
            // Only one agent allowed
            return;
        }

        // The agent must come first
        if (
            parts.some(
                p =>
                    (p instanceof ChatRequestTextPart &&
                        p.text.trim() !== '') ||
                    !(p instanceof ChatRequestAgentPart)
            )
        ) {
            return;
        }

        return new ChatRequestAgentPart(agentRange, agent);
    }

    private tryToParseVariable(
        message: string,
        offset: number,
        _parts: ReadonlyArray<ParsedChatRequestPart>
    ): ChatRequestVariablePart | undefined {
        const nextVariableMatch = message.match(variableReg);
        if (!nextVariableMatch) {
            return;
        }

        const [full, name] = nextVariableMatch;
        const variableArg = nextVariableMatch[2];
        const varRange = new OffsetRangeImpl(offset, offset + full.length);

        return new ChatRequestVariablePart(varRange, name, variableArg);
    }
}
