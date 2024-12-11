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

import * as sinon from 'sinon';
import { ChatAgentServiceImpl } from './chat-agent-service';
import { ChatRequestParserImpl } from './chat-request-parser';
import { ChatAgentLocation } from './chat-agents';
import { ChatRequest } from './chat-model';
import { expect } from 'chai';
import { DefaultAIVariableService, ToolInvocationRegistry, ToolInvocationRegistryImpl } from '@theia/ai-core';

describe('ChatRequestParserImpl', () => {
    const chatAgentService = sinon.createStubInstance(ChatAgentServiceImpl);
    const variableService = sinon.createStubInstance(DefaultAIVariableService);
    const toolInvocationRegistry: ToolInvocationRegistry = sinon.createStubInstance(ToolInvocationRegistryImpl);
    const parser = new ChatRequestParserImpl(chatAgentService, variableService, toolInvocationRegistry);

    it('parses simple text', () => {
        const req: ChatRequest = {
            text: 'What is the best pizza topping?'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result.parts).to.deep.contain({
            text: 'What is the best pizza topping?',
            range: { start: 0, endExclusive: 31 }
        });
    });

    it('parses text with variable name', () => {
        const req: ChatRequest = {
            text: 'What is the #best pizza topping?'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result).to.deep.contain({
            parts: [{
                text: 'What is the ',
                range: { start: 0, endExclusive: 12 }
            }, {
                variableName: 'best',
                variableArg: undefined,
                range: { start: 12, endExclusive: 17 }
            }, {
                text: ' pizza topping?',
                range: { start: 17, endExclusive: 32 }
            }]
        });
    });

    it('parses text with variable name with argument', () => {
        const req: ChatRequest = {
            text: 'What is the #best:by-poll pizza topping?'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result).to.deep.contain({
            parts: [{
                text: 'What is the ',
                range: { start: 0, endExclusive: 12 }
            }, {
                variableName: 'best',
                variableArg: 'by-poll',
                range: { start: 12, endExclusive: 25 }
            }, {
                text: ' pizza topping?',
                range: { start: 25, endExclusive: 40 }
            }]
        });
    });

    it('parses text with variable name with numeric argument', () => {
        const req: ChatRequest = {
            text: '#size-class:2'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'size-class',
                variableArg: '2'
            }
        );
    });

    it('parses text with variable name with POSIX path argument', () => {
        const req: ChatRequest = {
            text: '#file:/path/to/file.ext'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'file',
                variableArg: '/path/to/file.ext'
            }
        );
    });

    it('parses text with variable name with Win32 path argument', () => {
        const req: ChatRequest = {
            text: '#file:c:\\path\\to\\file.ext'
        };
        const result = parser.parseChatRequest(req, ChatAgentLocation.Panel);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'file',
                variableArg: 'c:\\path\\to\\file.ext'
            }
        );
    });
});
