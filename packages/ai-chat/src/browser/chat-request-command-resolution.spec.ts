// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import 'reflect-metadata';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { CommandService, ILogger, Logger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DefaultAIVariableService, PromptService, PromptServiceImpl, ToolInvocationRegistryImpl } from '@theia/ai-core';
import { PromptVariableContribution } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { ChatAgentServiceImpl } from '../common/chat-agent-service';
import { ChatAgentLocation } from '../common/chat-agents';
import { ChatRequestParserImpl } from '../common/chat-request-parser';

disableJSDOM();

/**
 * End-to-end coverage for slash commands: a request is parsed into parts and those parts are
 * resolved by the real prompt variable resolver, so that the text finally sent to the language
 * model is asserted rather than just the intermediate `#prompt:command|args` representation.
 */
describe('slash command parsing and resolution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let promptService: PromptService;
    let parser: ChatRequestParserImpl;

    beforeEach(() => {
        promptService = new PromptServiceImpl();
        promptService.addBuiltInPromptFragment({
            id: 'command-hello',
            template: 'Greet $ARGUMENTS warmly.',
            isCommand: true,
            commandName: 'hello'
        });

        const variableService = new DefaultAIVariableService({ getContributions: () => [] });
        (variableService as unknown as Record<string, unknown>)['logger'] = new MockLogger();

        const promptVariableContribution = new PromptVariableContribution();
        (promptVariableContribution as unknown as Record<string, unknown>)['promptService'] = promptService;
        (promptVariableContribution as unknown as Record<string, unknown>)['logger'] = new MockLogger();
        (promptVariableContribution as unknown as Record<string, unknown>)['commandService'] = {} as CommandService;
        promptVariableContribution.registerVariables(variableService);

        parser = new ChatRequestParserImpl(
            sinon.createStubInstance(ChatAgentServiceImpl),
            variableService,
            sinon.createStubInstance(ToolInvocationRegistryImpl),
            sinon.createStubInstance(Logger) as ILogger
        );
        (parser as unknown as { promptService: PromptService }).promptService = promptService;
    });

    /** The text that is finally sent to the language model. */
    const resolve = async (text: string): Promise<string> => {
        const parsed = await parser.parseChatRequest({ text }, ChatAgentLocation.Panel, { variables: [] });
        return parsed.parts.map(part => part.promptText).join('');
    };

    it('resolves a single command with an argument', async () => {
        expect(await resolve('/hello Klaus')).to.equal('Greet Klaus warmly.');
    });

    it('resolves the same command twice on one line, keeping the arguments apart', async () => {
        expect(await resolve('/hello Klaus /hello Maria')).to.equal('Greet Klaus warmly. Greet Maria warmly.');
    });

    it('resolves the same command on two lines, preserving the line break', async () => {
        expect(await resolve('/hello Klaus\n/hello Maria')).to.equal('Greet Klaus warmly.\nGreet Maria warmly.');
    });

    it('resolves a command repeated three times', async () => {
        expect(await resolve('/hello Klaus /hello Maria /hello Bob')).to.equal('Greet Klaus warmly. Greet Maria warmly. Greet Bob warmly.');
    });

    it('does not let a command consume the next line', async () => {
        expect(await resolve('/hello Klaus\nand please be brief')).to.equal('Greet Klaus warmly.\nand please be brief');
    });

    it('keeps surrounding text around a command', async () => {
        expect(await resolve('please /hello Klaus now')).to.equal('please Greet Klaus now warmly.');
    });

    it('does not resolve a path as a command and keeps the message intact', async () => {
        const text = 'please look at /home/user/notes.txt and fix the bug';
        expect(await resolve(text)).to.equal(text);
    });

    it('does not resolve an unknown command and keeps the message intact', async () => {
        const text = '/goodbye Klaus';
        expect(await resolve(text)).to.equal(text);
    });

    it('uses a path argument of a known command without dropping it', async () => {
        expect(await resolve('/hello /home/user/notes.txt')).to.equal('Greet /home/user/notes.txt warmly.');
    });
});
