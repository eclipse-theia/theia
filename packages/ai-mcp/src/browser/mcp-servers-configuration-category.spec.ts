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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { MCPServerDescription, MCPServerStatus } from '../common/mcp-server-manager';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { McpServersConfigurationCategory } from './mcp-servers-configuration-category';

disableJSDOM();

function server(name: string, status?: MCPServerStatus, tools: { name: string; description?: string }[] = []): MCPServerDescription {
    return { name, command: 'run', status, tools } as unknown as MCPServerDescription;
}

function createCategory(servers: MCPServerDescription[]): McpServersConfigurationCategory {
    const category = new McpServersConfigurationCategory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).servers = servers;
    return category;
}

describe('McpServersConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the mcp-servers collection metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.MCP_SERVERS);
        expect(category.kind).to.equal('collection');
    });

    it('maps server status to a tree-item status kind', () => {
        const category = createCategory([
            server('running', MCPServerStatus.Running),
            server('auth', MCPServerStatus.AuthenticationRequired),
            server('errored', MCPServerStatus.Errored),
            server('idle', MCPServerStatus.NotRunning)
        ]);
        const children = category.getTreeChildren();
        expect(children.map(c => c.status?.kind)).to.deep.equal(['on', 'warn', 'error', 'off']);
    });

    it('indexes each server and its tools for search, all navigating to the server', () => {
        const category = createCategory([server('git', MCPServerStatus.Running, [{ name: 'commit', description: 'make a commit' }])]);
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(2);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.MCP_SERVERS, itemId: 'git' });
        expect(items[1].label).to.equal('commit');
        expect(items[1].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.MCP_SERVERS, itemId: 'git' });
    });

    it('summarizes a server by type and tool count rather than command/url', () => {
        const category = createCategory([
            server('git', MCPServerStatus.Running, [{ name: 'a' }, { name: 'b' }]),
            server('empty', MCPServerStatus.NotRunning)
        ]);
        const children = category.getTreeChildren();
        expect(children[0].description).to.equal('Local · 2 tools');
        expect(children[1].description).to.equal('Local');
    });

    it('summarizes a remote server as Remote', () => {
        const remote = { name: 'r', serverUrl: 'https://example.com', status: MCPServerStatus.Connected, tools: [] } as unknown as MCPServerDescription;
        expect(createCategory([remote]).getTreeChildren()[0].description).to.equal('Remote');
    });

    it('labels the server type (Local / Remote / Remote (OAuth))', () => {
        const category = createCategory([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeLabel = (server_: MCPServerDescription) => (category as any).getServerTypeLabel(server_) as string;
        expect(typeLabel(server('local'))).to.equal('Local');
        expect(typeLabel({ name: 'r', serverUrl: 'https://x' } as unknown as MCPServerDescription)).to.equal('Remote');
        expect(typeLabel({ name: 'o', serverUrl: 'https://x', oauth: {} } as unknown as MCPServerDescription)).to.equal('Remote (OAuth)');
    });

    it('persists an inline field edit by patching the form and re-saving it', () => {
        const category = createCategory([server('git', MCPServerStatus.Running)]);
        const saved: Array<{ name: string; command: string; serverType: string }> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).serverEditor = {
            toFormData: (description: MCPServerDescription) => ({
                name: description.name, serverType: 'local', command: 'old', args: '', env: '', autostart: true, deferLoading: false
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            save: (form: any) => { saved.push(form); return Promise.resolve(); }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).updateServer(server('git'), { command: 'npx server' });
        expect(saved).to.have.lengthOf(1);
        expect(saved[0]).to.include({ name: 'git', command: 'npx server', serverType: 'local' });
    });
});
