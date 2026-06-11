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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { MessageService, PreferenceService } from '@theia/core';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import { MCPFrontendService } from '../common/mcp-server-manager';
import { MCPInstallEntry, MCPServerEditDialogFactory, MCPServerEditorImpl } from './mcp-server-editor';

class FakePreferenceService {
    private readonly store = new Map<string, unknown>();
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
    }
    snapshot<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }
}

describe('MCPServerEditor.installFromEntry', () => {

    let prefs: FakePreferenceService;
    let editor: MCPServerEditorImpl;

    beforeEach(() => {
        const container = new Container();
        prefs = new FakePreferenceService();
        container.bind(PreferenceService).toConstantValue(prefs as unknown as PreferenceService);
        container.bind(MessageService).toConstantValue({ error: () => undefined } as unknown as MessageService);
        container.bind(MCPFrontendService).toConstantValue({} as unknown as MCPFrontendService);
        // installFromEntry never opens a dialog; bind a factory that fails loudly if it is used.
        container.bind(MCPServerEditDialogFactory).toConstantValue(() => {
            throw new Error('MCPServerEditDialogFactory should not be invoked in these tests');
        });
        container.bind(MCPServerEditorImpl).toSelf().inSingletonScope();
        editor = container.get(MCPServerEditorImpl);
    });

    it('writes the config blob under entry.localName and tags it with registry metadata', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] },
            serverId: 'io.github.example/example-mcp',
            version: '^1.0.0',
            configHash: 'hash-v1'
        };

        await editor.installFromEntry(entry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });
    });

    it('omits registryMetadata when the entry carries no serverId - keeps the preference free of registry-link traces for URL-driven installs', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] }
        };

        await editor.installFromEntry(entry);

        const stored = prefs.snapshot<Record<string, Record<string, unknown>>>(MCP_SERVERS_PREF)!.example;
        expect(stored).to.not.have.property('registryMetadata');
    });

    it('omits optional metadata fields the entry does not carry while keeping the required serverId', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] },
            serverId: 'io.github.example/example-mcp'
        };

        await editor.installFromEntry(entry);

        const stored = prefs.snapshot<Record<string, { registryMetadata?: Record<string, unknown> }>>(MCP_SERVERS_PREF)!.example;
        expect(stored.registryMetadata).to.deep.equal({ serverId: 'io.github.example/example-mcp' });
    });

    it('applies the autostart override the dialog collected', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] }
        };

        await editor.installFromEntry(entry, { autostart: false });

        expect(prefs.snapshot<Record<string, { autostart?: boolean }>>(MCP_SERVERS_PREF)!.example.autostart).to.equal(false);
    });

    it('fills serverAuthToken when the entry config advertises the slot - even if the slot was empty', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { serverUrl: 'https://example.com/mcp', serverAuthToken: '' }
        };

        await editor.installFromEntry(entry, { serverAuthToken: 'secret-123' });

        expect(prefs.snapshot<Record<string, { serverAuthToken?: string }>>(MCP_SERVERS_PREF)!.example.serverAuthToken).to.equal('secret-123');
    });

    it('ignores serverAuthToken when the entry config does not advertise the slot - avoids leaking it onto local entries', async () => {
        const entry: MCPInstallEntry = {
            localName: 'example',
            // No `serverAuthToken` key - entry is local stdio.
            config: { command: 'npx', args: ['-y', 'example-mcp'] }
        };

        await editor.installFromEntry(entry, { serverAuthToken: 'should-be-ignored' });

        expect(prefs.snapshot<Record<string, Record<string, unknown>>>(MCP_SERVERS_PREF)!.example).to.not.have.property('serverAuthToken');
    });

    it('preserves unrelated servers already in the preference', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            other: { command: 'node', args: ['unrelated.js'] }
        });
        const entry: MCPInstallEntry = {
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] }
        };

        await editor.installFromEntry(entry);

        const all = prefs.snapshot<Record<string, unknown>>(MCP_SERVERS_PREF)!;
        expect(Object.keys(all).sort()).to.deep.equal(['example', 'other']);
        expect(all.other).to.deep.equal({ command: 'node', args: ['unrelated.js'] });
    });
});
