// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentService, ChatAgentServiceFactory } from '../common';
import { ListAgentsTool } from './list-agents-tool';

describe('ListAgentsTool', () => {
    let agents: Partial<ChatAgent>[];
    let tool: ListAgentsTool;

    beforeEach(() => {
        agents = [
            { id: 'Coder', description: 'Writes code.' },
            { id: 'code-reviewer', description: 'Reviews   code\nchanges.' }
        ];
        const container = new Container();
        container.bind(ChatAgentServiceFactory).toConstantValue(() => ({ getAgents: () => agents }) as unknown as ChatAgentService);
        container.bind(ListAgentsTool).toSelf();
        tool = container.get(ListAgentsTool);
    });

    const call = async (args: object | undefined): Promise<string> =>
        await tool.getTool().handler(args === undefined ? '' : JSON.stringify(args)) as string;

    it('lists all agents by id without a query, and ignores a non-string query', async () => {
        const expected = '- Coder: Writes code.\n- code-reviewer: Reviews code changes.';
        expect(await call(undefined)).to.equal(expected);
        expect(await call({ query: 42 })).to.equal(expected);
    });

    it('filters by keyword', async () => {
        expect(await call({ query: 'review' })).to.equal('- code-reviewer: Reviews code changes.');
    });

    it('reports no match and no agents distinctly', async () => {
        expect(await call({ query: 'calendar' })).to.contain('No agent matches \'calendar\'');
        agents = [];
        expect(await call(undefined)).to.equal('No agents available.');
    });
});
