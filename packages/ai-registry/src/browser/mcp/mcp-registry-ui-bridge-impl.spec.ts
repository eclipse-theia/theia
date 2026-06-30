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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The view contribution import chain pulls in browser-side modules, so a DOM is required at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';
import { VSXExtensionsSearchModel } from '@theia/vsx-registry/lib/browser/vsx-extensions-search-model';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { RegistrySearchFilter } from '../../common/registry-search-filter';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { MCPRegistryUiBridgeImpl } from './mcp-registry-ui-bridge-impl';

after(() => disableJSDOM());

class StubRegistryFetchService {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    constructor(public entries: ResolvedRegistryEntry[] = []) { }
    async getEntries(): Promise<ResolvedRegistryEntry[]> {
        return this.entries;
    }
}

const exampleRegistryEntry: ResolvedRegistryEntry = {
    serverId: 'io.github.ChromeDevTools/chrome-devtools-mcp',
    name: 'chrome-devtools',
    description: 'Chrome DevTools MCP server.',
    localName: 'chrome-devtools',
    config: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
    version: '^1.0.0',
    configHash: 'hash-v1',
    mcpRegistryVerified: true
};

function buildBridge(searchModel: { query: string }, entries: ResolvedRegistryEntry[]): MCPRegistryUiBridgeImpl {
    const container = new Container();
    container.bind(RegistryFetchService).toConstantValue(new StubRegistryFetchService(entries) as unknown as RegistryFetchService);
    container.bind(VSXExtensionsContribution).toConstantValue({ openView: async () => undefined } as unknown as VSXExtensionsContribution);
    container.bind(VSXExtensionsSearchModel).toConstantValue(searchModel as unknown as VSXExtensionsSearchModel);
    container.bind(RegistrySearchFilter).toSelf().inSingletonScope();
    container.bind(MCPRegistryUiBridgeImpl).toSelf().inSingletonScope();
    return container.get(MCPRegistryUiBridgeImpl);
}

describe('MCPRegistryUiBridgeImpl.openRegistry', () => {

    it('sets a search query that actually surfaces the linked registry entry', async () => {
        const searchModel = { query: '' };
        const bridge = buildBridge(searchModel, [exampleRegistryEntry]);
        await bridge.ready();

        await bridge.openRegistry(exampleRegistryEntry.serverId);

        const filter = new RegistrySearchFilter();
        const searchEntry = {
            name: exampleRegistryEntry.name,
            identifier: exampleRegistryEntry.serverId,
            description: exampleRegistryEntry.description
        };
        expect(searchModel.query).to.not.be.empty;
        // The query the bridge picks must match the entry in the Extensions search.
        expect(filter.matches(searchEntry, searchModel.query)).to.equal(true);
        // Regression guard: the raw serverId does not match, because the filter strips the
        // reverse-DNS labels (`io`, `github`) it would still require as query terms.
        expect(filter.matches(searchEntry, exampleRegistryEntry.serverId)).to.equal(false);
    });

    it('leaves the query untouched for an unknown server id', async () => {
        const searchModel = { query: 'unchanged' };
        const bridge = buildBridge(searchModel, [exampleRegistryEntry]);
        await bridge.ready();

        await bridge.openRegistry('io.github.unknown/not-installed');

        expect(searchModel.query).to.equal('unchanged');
    });
});
