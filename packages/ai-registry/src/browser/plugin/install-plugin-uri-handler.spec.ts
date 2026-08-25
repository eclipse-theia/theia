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

// The handler imports the install service, which pulls in the DOM-touching install dialogs, so a
// DOM has to exist while those modules are evaluated.
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { MessageService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { PluginInstaller, PluginInstallOptions } from './plugin-installer';
import { InstallPluginUriConfiguration } from './install-plugin-uri-configuration';
import { InstallPluginUriHandler } from './install-plugin-uri-handler';

disableJSDOM();

// Stubbed rather than instantiated: the real configuration reads the frontend application config off
// the window, which no longer exists once the DOM used for the imports is torn down.
const configuration: InstallPluginUriConfiguration = {
    getScheme: () => 'theia',
    getAuthority: () => 'install-plugin'
} as InstallPluginUriConfiguration;

const entry: ResolvedPluginEntry = {
    pluginId: 'io.github.acme/bigquery-data-analytics',
    name: 'BigQuery Data Analytics',
    description: 'Query and explore BigQuery',
    sourceUrl: 'https://github.com/acme/bigquery-plugin',
    contentHash: 'hash-v1',
    endorsements: [{ organizationId: 'acme', date: '2026-08-07' }],
    containedSkills: [],
    containedMcpServers: []
};

interface RecordedInstall {
    readonly entry: ResolvedPluginEntry;
    readonly options: PluginInstallOptions;
}

class TestInstallPluginUriHandler extends InstallPluginUriHandler {

    readonly errors: string[] = [];
    readonly infos: string[] = [];
    readonly installs: RecordedInstall[] = [];

    constructor(entries: ResolvedPluginEntry[] | Error) {
        super();
        Object.assign(this, {
            configuration,
            messageService: {
                error: (message: string) => this.errors.push(message),
                info: (message: string) => this.infos.push(message)
            } as unknown as MessageService,
            fetchService: {
                getPluginEntries: async () => {
                    if (entries instanceof Error) {
                        throw entries;
                    }
                    return entries;
                }
            } as unknown as RegistryFetchService,
            installer: {
                install: async (installEntry: ResolvedPluginEntry, options: PluginInstallOptions) => {
                    this.installs.push({ entry: installEntry, options });
                    return true;
                }
            } as PluginInstaller
        });
    }
}

describe('InstallPluginUriHandler', () => {

    it('handles theia://install-plugin links and nothing else', () => {
        const handler = new TestInstallPluginUriHandler([entry]);

        expect(handler.canHandle(new URI('theia://install-plugin?id=io.github.acme/bigquery-data-analytics'))).to.equal(500);
        expect(handler.canHandle(new URI('theia://install-skill?id=io.github.acme/some-skill'))).to.equal(0);
        expect(handler.canHandle(new URI('file:///tmp/plugin'))).to.equal(0);
    });

    it('refuses an id the registry does not list, naming it, and installs nothing', async () => {
        const handler = new TestInstallPluginUriHandler([entry]);

        await handler.open(new URI('theia://install-plugin?id=io.github.acme/absent'));

        expect(handler.installs).to.be.empty;
        expect(handler.errors).to.have.length(1);
        expect(handler.errors[0]).to.contain('io.github.acme/absent');
    });

    it('reports a missing id parameter instead of guessing a plugin', async () => {
        const handler = new TestInstallPluginUriHandler([entry]);

        await handler.open(new URI('theia://install-plugin'));

        expect(handler.installs).to.be.empty;
        expect(handler.errors).to.have.length(1);
    });

    it('reports a failed registry fetch, naming the requested plugin, and installs nothing', async () => {
        const handler = new TestInstallPluginUriHandler(new Error('offline'));

        await handler.open(new URI('theia://install-plugin?id=io.github.acme/bigquery-data-analytics'));

        expect(handler.installs).to.be.empty;
        expect(handler.errors[0]).to.contain('io.github.acme/bigquery-data-analytics');
    });

    it('installs the registry entry the id resolves to, always with the pre-install confirmation', async () => {
        const handler = new TestInstallPluginUriHandler([entry]);

        await handler.open(new URI('theia://install-plugin?id=io.github.acme/bigquery-data-analytics'));

        expect(handler.installs).to.have.length(1);
        expect(handler.installs[0].entry).to.equal(entry);
        expect(handler.installs[0].options).to.deep.equal({ replaceExisting: false, confirm: true });
        expect(handler.infos).to.have.length(1);
    });
});
