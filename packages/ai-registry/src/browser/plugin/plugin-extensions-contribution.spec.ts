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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The contribution reaches the Extensions view and the hover service at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { Emitter, ILogger, MessageService } from '@theia/core';
import { InstalledPluginInfo, ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { PluginInstallService } from './plugin-install-service';
import { PluginInstaller } from './plugin-installer';
import { PluginMcpRegistrar } from './plugin-mcp-registrar';
import { PluginExtensionsContribution } from './plugin-extensions-contribution';

after(() => disableJSDOM());

const DIRECTORY_NAME = 'io.github.acme_tools';

const entry: ResolvedPluginEntry = {
    pluginId: 'io.github.acme/tools',
    name: 'Acme Tools',
    description: 'Tools',
    sourceUrl: 'https://github.com/acme/tools',
    contentHash: 'hash-v1',
    endorsements: [{ organizationId: 'acme', date: '2026-08-07' }],
    containedSkills: [],
    containedMcpServers: []
};

function installed(): InstalledPluginInfo {
    return {
        directoryName: DIRECTORY_NAME,
        root: `/home/u/.agents/plugins/${DIRECTORY_NAME}`,
        dataRoot: `/home/u/.agents/plugin-data/${DIRECTORY_NAME}`,
        pluginId: entry.pluginId,
        contentHash: 'hash-v1',
        drifted: false,
        skills: [],
        servers: [],
        skipped: []
    };
}

/** Records what the contribution did, which is all these tests are about. */
interface Recorder {
    calls: string[];
    infos: string[];
    registered: InstalledPluginInfo[];
    changes: number;
}

function contribution(overrides: {
    install?: () => Promise<boolean>;
    link?: () => Promise<InstalledPluginInfo>;
} = {}): { instance: PluginExtensionsContribution; recorder: Recorder } {
    const recorder: Recorder = { calls: [], infos: [], registered: [], changes: 0 };
    const instance = new PluginExtensionsContribution();
    Object.assign(instance, {
        installService: {
            link: async () => {
                recorder.calls.push('link');
                return overrides.link ? overrides.link() : installed();
            },
            unlink: async () => { recorder.calls.push('unlink'); },
            uninstall: async () => { recorder.calls.push('uninstall'); }
        } as unknown as PluginInstallService,
        installer: {
            install: async () => {
                recorder.calls.push('install');
                return overrides.install ? overrides.install() : true;
            }
        } as unknown as PluginInstaller,
        mcpRegistrar: {
            register: async (info: InstalledPluginInfo) => {
                recorder.calls.push('register');
                recorder.registered.push(info);
            },
            unregister: async () => { recorder.calls.push('unregister'); }
        } as unknown as PluginMcpRegistrar,
        messageService: {
            info: (message: string) => { recorder.infos.push(message); },
            error: (message: string) => { recorder.calls.push(`error:${message}`); }
        } as unknown as MessageService,
        fetchService: { onDidChange: new Emitter<void>().event },
        installClient: {
            onDidChangeInstalledPlugins: new Emitter<void>().event,
            onDidStopWatching: new Emitter<void>().event
        },
        logger: { warn: () => undefined, error: () => undefined } as unknown as ILogger
    });
    // `init` is the @postConstruct hook that builds the handler bag.
    (instance as unknown as { init(): void }).init();
    instance.onDidChange(() => recorder.changes++);
    return { instance, recorder };
}

/** The handler bag the entries dispatch through; `protected` on the contribution. */
function handlers(instance: PluginExtensionsContribution): {
    install(entry: ResolvedPluginEntry): Promise<void>;
    link(target: { entry: ResolvedPluginEntry; directoryName: string }): Promise<void>;
    unlink(pluginId: string): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
} {
    return (instance as unknown as { handlers: ReturnType<typeof handlers> }).handlers;
}

describe('PluginExtensionsContribution link', () => {

    it("registers the adopted plugin's MCP servers, so a linked plugin's servers actually run", async () => {
        const { instance, recorder } = contribution();

        await handlers(instance).link({ entry, directoryName: DIRECTORY_NAME });

        expect(recorder.calls).to.deep.equal(['link', 'register']);
        expect(recorder.registered[0].pluginId).to.equal(entry.pluginId);
    });

    it('registers the record link returned rather than listing the plugins root again', async () => {
        const adopted = { ...installed(), name: 'Adopted From Link' };
        const { instance, recorder } = contribution({ link: async () => adopted });

        await handlers(instance).link({ entry, directoryName: DIRECTORY_NAME });

        expect(recorder.registered[0]).to.equal(adopted);
    });

    it('reports the failure and registers nothing when the adoption itself fails', async () => {
        const { instance, recorder } = contribution({
            link: async () => { throw new Error('no such directory'); }
        });

        await handlers(instance).link({ entry, directoryName: DIRECTORY_NAME });

        expect(recorder.calls).to.deep.equal(['link', 'error:no such directory']);
        expect(recorder.infos).to.be.empty;
    });

    it('unregisters before dropping the marker on unlink, the mirror of link', async () => {
        const { instance, recorder } = contribution();

        await handlers(instance).unlink(entry.pluginId);

        expect(recorder.calls).to.deep.equal(['unregister', 'unlink']);
    });

    it('unregisters before removing the root on uninstall', async () => {
        const { instance, recorder } = contribution();

        await handlers(instance).uninstall(entry.pluginId);

        expect(recorder.calls).to.deep.equal(['unregister', 'uninstall']);
    });
});

describe('PluginExtensionsContribution runAction', () => {

    it('reports success and refreshes the view when the action did something', async () => {
        const { instance, recorder } = contribution();

        await handlers(instance).install(entry);

        expect(recorder.infos).to.have.lengthOf(1);
        expect(recorder.infos[0]).to.contain('Acme Tools');
        expect(recorder.changes).to.equal(1);
    });

    it('stays silent when the user cancelled a dialog, but still refreshes the view', async () => {
        const { instance, recorder } = contribution({ install: async () => false });

        await handlers(instance).install(entry);

        expect(recorder.infos).to.be.empty;
        expect(recorder.changes).to.equal(1);
    });

    it('reports success for an action that returns nothing, which is not a cancellation', async () => {
        const { instance, recorder } = contribution();

        await handlers(instance).uninstall(entry.pluginId);

        expect(recorder.infos).to.have.lengthOf(1);
    });

    it('refreshes the view even when the action threw, so the UI matches what is on disk', async () => {
        const { instance, recorder } = contribution({ install: async () => { throw new Error('download failed'); } });

        await handlers(instance).install(entry);

        expect(recorder.infos).to.be.empty;
        expect(recorder.calls).to.contain('error:download failed');
        expect(recorder.changes).to.equal(1);
    });
});
