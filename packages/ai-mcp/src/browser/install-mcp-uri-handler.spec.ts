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
const disableJSDOM = enableJSDOM();
// Another spec in this package may have already set the configuration; mocha loads all
// specs into one process and `set` throws if called twice, so guard it.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { MessageService, PreferenceService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import { MCPFrontendService } from '../common/mcp-server-manager';
import { MCPServerEditor, MCPServerEditorImpl, MCPServerEditDialogFactory, MCPInstallEntry } from './mcp-server-editor';
import { MCPServerInstallDialogFactory } from './mcp-server-install-dialog';
import { MCPInstallUriConfiguration } from './mcp-install-uri-configuration';
import { MCPRegistryUiBridge } from './mcp-registry-ui-bridge';
import { InstallMcpUriHandler } from './install-mcp-uri-handler';

after(() => disableJSDOM());

class FakePreferenceService {
    private readonly store = new Map<string, unknown>();
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
    }
}

class FakeMessageService {
    public errors: string[] = [];
    public infos: string[] = [];
    error(message: string): void {
        this.errors.push(message);
    }
    info(message: string): void {
        this.infos.push(message);
    }
}

class FakeRegistryBridge implements MCPRegistryUiBridge {
    readonly onDidChange = () => ({ dispose: () => undefined });
    private readonly entries = new Map<string, MCPInstallEntry>();
    setEntry(serverId: string, entry: MCPInstallEntry): void {
        this.entries.set(serverId, entry);
    }
    async ready(): Promise<void> { /* immediate */ }
    hasServer(serverId: string): boolean {
        return this.entries.has(serverId);
    }
    getInstallEntry(serverId: string): MCPInstallEntry | undefined {
        return this.entries.get(serverId);
    }
    async openRegistry(): Promise<void> { /* no-op */ }
}

class FakeConfiguration extends MCPInstallUriConfiguration {
    constructor(private readonly scheme: string, private readonly authority: string = 'install-mcp') { super(); }
    override getScheme(): string { return this.scheme; }
    override getAuthority(): string { return this.authority; }
}

function buildHandler(options: {
    bridge?: FakeRegistryBridge;
    scheme?: string;
    prefs?: FakePreferenceService;
    messages?: FakeMessageService;
} = {}): { handler: InstallMcpUriHandler; messages: FakeMessageService; prefs: FakePreferenceService; bridge: FakeRegistryBridge | undefined } {
    const container = new Container();
    const prefs = options.prefs ?? new FakePreferenceService();
    const messages = options.messages ?? new FakeMessageService();
    container.bind(PreferenceService).toConstantValue(prefs as unknown as PreferenceService);
    container.bind(MessageService).toConstantValue(messages as unknown as MessageService);
    container.bind(MCPFrontendService).toConstantValue({} as unknown as MCPFrontendService);
    // The error-path tests never open a dialog; bind factories that fail loudly if used.
    container.bind(MCPServerEditDialogFactory).toConstantValue(() => {
        throw new Error('MCPServerEditDialogFactory should not be invoked in these tests');
    });
    container.bind(MCPServerInstallDialogFactory).toConstantValue(() => {
        throw new Error('MCPServerInstallDialogFactory should not be invoked in these tests');
    });
    container.bind(MCPServerEditorImpl).toSelf().inSingletonScope();
    container.bind(MCPServerEditor).toService(MCPServerEditorImpl);
    container.bind(MCPInstallUriConfiguration).toConstantValue(new FakeConfiguration(options.scheme ?? 'theia'));
    if (options.bridge) {
        container.bind(MCPRegistryUiBridge).toConstantValue(options.bridge);
    }
    container.bind(InstallMcpUriHandler).toSelf().inSingletonScope();
    return { handler: container.get(InstallMcpUriHandler), messages, prefs, bridge: options.bridge };
}

describe('InstallMcpUriHandler.canHandle', () => {

    it('claims URIs whose scheme and authority both match the configuration', () => {
        const { handler } = buildHandler();
        expect(handler.canHandle(new URI('theia://install-mcp?id=foo'))).to.equal(500);
    });

    it('does not claim URIs whose scheme does not match the configuration', () => {
        const { handler } = buildHandler({ scheme: 'theia-next' });
        // Configured scheme is `theia-next`; a `theia://` URI must not be claimed.
        expect(handler.canHandle(new URI('theia://install-mcp?id=foo'))).to.equal(0);
    });

    it('does not claim URIs whose authority does not match the configuration', () => {
        const { handler } = buildHandler();
        expect(handler.canHandle(new URI('theia://something-else?id=foo'))).to.equal(0);
    });
});

describe('InstallMcpUriHandler.open', () => {

    it('reports an error and does not write the preference when the URI carries no id', async () => {
        const { handler, messages, prefs } = buildHandler({ bridge: new FakeRegistryBridge() });

        await handler.open(new URI('theia://install-mcp'));

        expect(messages.errors).to.have.length(1);
        expect(messages.errors[0]).to.match(/missing the required "id"/i);
        expect(prefs.get(MCP_SERVERS_PREF)).to.be.undefined;
    });

    it('reports an error when no AI registry bridge is bound', async () => {
        const { handler, messages } = buildHandler(); // no bridge

        await handler.open(new URI('theia://install-mcp?id=io.example/foo'));

        expect(messages.errors).to.have.length(1);
        expect(messages.errors[0]).to.match(/no AI registry is configured/i);
    });

    it('reports an error when the registry has no entry for the given id', async () => {
        const bridge = new FakeRegistryBridge();
        // Bridge has no entries - `getInstallEntry` returns undefined.
        const { handler, messages } = buildHandler({ bridge });

        await handler.open(new URI('theia://install-mcp?id=io.example/unknown'));

        expect(messages.errors).to.have.length(1);
        expect(messages.errors[0]).to.match(/is not listed in your AI registry/i);
    });

    it('trims whitespace around the id parameter and treats an empty id as missing', async () => {
        const { handler, messages } = buildHandler({ bridge: new FakeRegistryBridge() });

        await handler.open(new URI('theia://install-mcp?id=%20%20'));

        expect(messages.errors[0]).to.match(/missing the required "id"/i);
    });
});
