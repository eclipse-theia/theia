// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { ILogger, QuickInputService } from '@theia/core';
import { AIVariableContext, AIVariableResolutionRequest } from '@theia/ai-core';
import { Container } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalBlock, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { AiTerminalCommandBlockVariableContribution } from './ai-terminal-command-block-variable';

function createMockTerminal(overrides: Partial<{
    bufferLines: string[];
    commandHistory: TerminalBlock[];
}>): TerminalWidget {
    const { bufferLines = [], commandHistory } = overrides;
    return {
        buffer: {
            length: bufferLines.length,
            getLines: (start: number, length: number) => bufferLines.slice(start, start + length),
        },
        commandHistoryState: commandHistory !== undefined
            ? { commandHistory }
            : undefined,
    } as unknown as TerminalWidget;
}

function createRequest(arg?: string): AIVariableResolutionRequest {
    return {
        variable: { id: 'ai-terminal:terminal-command-block', name: 'terminalCommand', description: '' },
        arg,
    };
}

const mockContext: AIVariableContext = {};

describe('AiTerminalCommandBlockVariableContribution.resolve()', () => {
    let mockTerminalService: { lastUsedTerminal: TerminalWidget | undefined };
    let contribution: AiTerminalCommandBlockVariableContribution;

    beforeEach(() => {
        const container = new Container();

        mockTerminalService = {
            lastUsedTerminal: createMockTerminal({
                commandHistory: [
                    { command: 'ls', output: 'file1\nfile2' },
                    { command: 'pwd', output: '/home/user' },
                    { command: 'echo hello world', output: 'hello world' },
                ]
            }),
        };

        container.bind(TerminalService).toConstantValue(mockTerminalService as unknown as TerminalService);
        container.bind(QuickInputService).toConstantValue({} as unknown as QuickInputService);
        container.bind(ILogger).toConstantValue({ warn: () => { } } as unknown as ILogger);
        container.bind(AiTerminalCommandBlockVariableContribution).toSelf();
        contribution = container.get(AiTerminalCommandBlockVariableContribution);
    });

    it('returns undefined when there is no last used terminal', async () => {
        mockTerminalService.lastUsedTerminal = undefined;
        const result = await contribution.resolve(createRequest(), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns the last command when no parameter is passed', async () => {
        const result = await contribution.resolve(createRequest(), mockContext);
        expect(result?.value).to.equal('### Terminal Command:\necho hello world\n\n### Terminal Output:\nhello world');
    });

    it('returns the correct command according to the argument', async () => {
        const result = await contribution.resolve(createRequest('1'), mockContext);
        expect(result?.value).to.equal('### Terminal Command:\npwd\n\n### Terminal Output:\n/home/user');
    });

    it('returns the last 50 lines of the terminal when terminal history is not enabled', async () => {
        mockTerminalService.lastUsedTerminal = createMockTerminal({
            bufferLines: ['ls', 'file1\nfile2', 'pwd', '/home/user']
        });
        const result = await contribution.resolve(createRequest(), mockContext);
        expect(result?.value).to.equal('ls\nfile1\nfile2\npwd\n/home/user');
    });

    it('returns undefined when the terminal history is empty', async () => {
        mockTerminalService.lastUsedTerminal = createMockTerminal({
            commandHistory: []
        });
        const result = await contribution.resolve(createRequest(), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when the input is not a number', async () => {
        const result = await contribution.resolve(createRequest('one'), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when the input is not an integer', async () => {
        const result = await contribution.resolve(createRequest('1.5'), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when the input is an empty string', async () => {
        const result = await contribution.resolve(createRequest(' '), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when terminal history is not enabled and the buffer is empty', async () => {
        mockTerminalService.lastUsedTerminal = createMockTerminal({});
        const result = await contribution.resolve(createRequest(), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when the input is a negative integer', async () => {
        const result = await contribution.resolve(createRequest('-1'), mockContext);
        expect(result).to.be.undefined;
    });

    it('returns undefined when the input index is out of bounds', async () => {
        const result = await contribution.resolve(createRequest('10'), mockContext);
        expect(result).to.be.undefined;
    });

});
