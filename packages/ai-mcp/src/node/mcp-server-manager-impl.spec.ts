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
import { MCPServerManagerImpl } from './mcp-server-manager-impl';
import { MCPOAuthCredentialStore } from './mcp-oauth-credential-store';
import { MCPServer } from './mcp-server';

describe('MCPServerManagerImpl OAuth cleanup', () => {
    it('stops a running server before clearing OAuth credentials', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.signOut('asana');

        expect(calls).to.deep.equal(['stop', 'clear']);
    });

    it('stops the server and notifies clients on stopServer', async () => {
        // Cancellation of an in-flight OAuth flow is now MCPServer.stop()'s responsibility (via
        // authProvider.cancel()); the manager only orchestrates stop + notify.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            stop: async () => { calls.push('stop'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {};
        const client = { onDidUpdateMCPServers: () => ({ dispose: () => { } }), didUpdateMCPServers: () => { calls.push('notify'); } };
        manager.setClient(client as never);

        await manager.stopServer('asana');

        expect(calls).to.deep.equal(['stop', 'notify']);
    });

    it('still notifies clients when stopping a server fails', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            stop: async () => { calls.push('stop'); throw new Error('transport hung'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {};
        const client = { onDidUpdateMCPServers: () => ({ dispose: () => { } }), didUpdateMCPServers: () => { calls.push('notify'); } };
        manager.setClient(client as never);

        try {
            await manager.stopServer('asana');
            throw new Error('Expected stopServer to propagate stop failure');
        } catch (error) {
            expect((error as Error).message).to.equal('transport hung');
        }

        expect(calls).to.deep.equal(['stop', 'notify']);
    });

    it('stops every managed server when the frontend disconnects', async () => {
        // Server.stop() now cancels its own in-flight OAuth flow; the manager just iterates and stops.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const client = { onDidUpdateMCPServers: () => ({ dispose: () => { } }), didUpdateMCPServers: () => { } };
        const server = {
            stop: async () => { calls.push('stop'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {};

        manager.setClient(client as never);
        manager.disconnectClient(client as never);
        await Promise.resolve();

        expect(calls).to.deep.equal(['stop']);
    });

    it('clears OAuth credentials when removing a server after stopping it', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            stop: async () => { calls.push('stop'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.removeServer('asana');

        expect(calls).to.deep.equal(['stop', 'clear']);
    });

    it('still clears OAuth credentials and removes the server when stopping it fails', async () => {
        const calls: string[] = [];
        const originalConsoleError = console.error;
        console.error = () => { };
        try {
            const manager = new MCPServerManagerImpl();
            const server = {
                stop: async () => { calls.push('stop'); throw new Error('transport hung'); }
            };
            const servers = new Map<string, MCPServer>([
                ['asana', server as unknown as MCPServer]
            ]);
            (manager as unknown as { servers: Map<string, MCPServer> }).servers = servers;
            (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
                clear: async () => { calls.push('clear'); }
            };

            await manager.removeServer('asana');

            expect(calls).to.deep.equal(['stop', 'clear']);
            expect(servers.has('asana')).to.be.false;
        } finally {
            console.error = originalConsoleError;
        }
    });

    it('does not stop a running server for non-connection preference changes', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', autostart: true }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', autostart: false });

        expect(calls).to.deep.equal(['update']);
    });

    it('restarts a running server for connection preference changes', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', headers: { old: 'header' } }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', headers: { new: 'header' } });

        // cancel is now MCPServer.stop()'s responsibility; the manager only orchestrates stop + update.
        expect(calls).to.deep.equal(['stop', 'update']);
    });

    it('clears credentials when OAuth client scope changes for a stopped server', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => false,
            isStopped: () => true,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({
                name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true, clientId: 'old', scopes: ['old'] }
            }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.addOrUpdateServer({
            name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true, clientId: 'new', scopes: ['new'] }
        });

        expect(calls).to.deep.equal(['clear', 'update']);
    });

    it('clears credentials when OAuth client scope changes', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({
                name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true, clientId: 'old', scopes: ['old'] }
            }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.addOrUpdateServer({
            name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true, clientId: 'new', scopes: ['new'] }
        });

        expect(calls).to.deep.equal(['stop', 'clear', 'update']);
    });

    it('stops a running server and clears credentials before disabling OAuth', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp' });

        expect(calls).to.deep.equal(['stop', 'clear', 'update']);
    });

    it('clears OAuth credentials when a resolve() rewrites the credential scope on startServer', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const initialDescription = {
            name: 'asana',
            serverUrl: 'https://mcp.example.com/mcp',
            oauth: { enabled: true, clientId: 'old', scopes: ['old'] },
            // resolve mixed in by getDescription path; the rewrite changes the credential scope.
            resolve: async () => ({
                name: 'asana',
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { enabled: true, clientId: 'new', scopes: ['new'] }
            })
        };
        const server = {
            isRunning: () => false,
            stop: async () => { calls.push('stop'); },
            start: async () => { calls.push('start'); },
            getDescription: async () => initialDescription,
            update: () => { calls.push('update'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.startServer('asana');

        // clear must run before update so the previous scope's credentials are wiped before the new
        // scope-keyed credential lookups happen during server.start().
        expect(calls).to.deep.equal(['clear', 'update', 'start']);
    });

    it('does not re-update or clear when resolve() returns the same configuration during startServer', async () => {
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const sameConfiguration = {
            name: 'asana',
            serverUrl: 'https://mcp.example.com/mcp',
            oauth: { enabled: true, clientId: 'static' }
        };
        const server = {
            isRunning: () => false,
            stop: async () => { calls.push('stop'); },
            start: async () => { calls.push('start'); },
            // getDescription mixes in runtime status/tools/error fields; resolve() must still be considered
            // equivalent because only configuration fields are compared.
            getDescription: async () => ({
                ...sameConfiguration,
                status: 'Not Connected',
                tools: [],
                resolve: async () => ({ ...sameConfiguration })
            }),
            update: () => { calls.push('update'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.startServer('asana');

        expect(calls).to.deep.equal(['start']);
    });

    it('does not re-update when resolve() returns the same configuration with reordered properties', async () => {
        // Order-independent equality is the reason we use deepEqual instead of JSON.stringify in
        // haveSameConfiguration: a user-authored resolve() implementation should be free to construct
        // the returned object in any insertion order without triggering a needless update() that would
        // reset this.status and clear this.error.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => false,
            stop: async () => { calls.push('stop'); },
            start: async () => { calls.push('start'); },
            getDescription: async () => ({
                name: 'asana',
                serverUrl: 'https://mcp.example.com/mcp',
                autostart: true,
                oauth: { enabled: true, clientId: 'static' },
                resolve: async () => ({
                    // Same fields, different insertion order. JSON.stringify would compare unequal.
                    oauth: { clientId: 'static', enabled: true },
                    autostart: true,
                    serverUrl: 'https://mcp.example.com/mcp',
                    name: 'asana'
                })
            }),
            update: () => { calls.push('update'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.startServer('asana');

        expect(calls).to.deep.equal(['start']);
    });

    it('does not restart a running server when toggling oauth.enabled=false through the dialog (key dropped vs. retained)', async () => {
        // connectionDescription must normalize { oauth: { enabled: false, ... } } and a missing oauth key as
        // equivalent. Without this normalization, the dialog (which drops the oauth key entirely when the
        // checkbox is off) would compare unequal to a JSON edit that left `{ oauth: { enabled: false } }`
        // in place, triggering a needless restart for a no-op configuration change.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => true,
            isStopped: () => false,
            isInFlight: () => false,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({
                name: 'asana',
                serverUrl: 'https://mcp.example.com/mcp',
                oauth: { enabled: false, clientId: 'leftover' }
            }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        // Dialog edit: oauthEnabled was already false, dialog drops the oauth key entirely.
        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp' });

        expect(calls).to.deep.equal(['update']);
    });

    it('stops an in-flight server (AuthenticationRequired) before applying a connection-affecting update', async () => {
        // An edit landing while AuthenticationRequired must trigger cancel + stop, otherwise the in-flight
        // doStart continues on the OLD URL while reads see the NEW one. Only `!isStopped()` catches this state.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => false,
            isStopped: () => false,
            isInFlight: () => true,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        // The user changes serverUrl while mid sign-in. The connection projection differs (the URL
        // changed), so stop must run before update. cancel of the in-flight OAuth is now MCPServer.stop()'s
        // responsibility, observed at the unit level via authProvider.cancel() in the MCPServer spec.
        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/other', oauth: { enabled: true } });

        expect(calls).to.deep.equal(['stop', 'clear', 'update']);
    });

    it('does not stop an in-flight server when only non-connection fields change', async () => {
        // Companion case: leave the in-flight doStart alone; new description's non-connection fields apply next start.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => false,
            isStopped: () => false,
            isInFlight: () => true,
            stop: async () => { calls.push('stop'); },
            getCachedDescription: () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', autostart: true }),
            update: () => { calls.push('update'); },
            setWorkspaceRoots: () => { },
            onDidUpdateStatus: () => ({ dispose: () => { } })
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        // Only `autostart` changes — not a connection-projection field.
        await manager.addOrUpdateServer({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', autostart: false });

        expect(calls).to.deep.equal(['update']);
    });

    it('signOut isolates credential cleanup and client notification from a failing stop()', async () => {
        // A failing stop() must not block credential wipe or UI refresh.
        const calls: string[] = [];
        const originalConsoleError = console.error;
        console.error = () => { /* suppress expected diagnostic */ };
        try {
            const manager = new MCPServerManagerImpl();
            const server = {
                isRunning: () => true,
                isStopped: () => false,
                isInFlight: () => false,
                stop: async () => { calls.push('stop'); throw new Error('transport hung'); }
            };
            (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
                ['asana', server as unknown as MCPServer]
            ]);
            (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
                clear: async () => { calls.push('clear'); }
            };
            const client = { onDidUpdateMCPServers: () => ({ dispose: () => { } }), didUpdateMCPServers: () => { calls.push('notify'); } };
            manager.setClient(client as never);

            await manager.signOut('asana');

            expect(calls).to.deep.equal(['stop', 'clear', 'notify']);
        } finally {
            console.error = originalConsoleError;
        }
    });

    it('signOut stops an in-flight (AuthenticationRequired) server and clears credentials', async () => {
        // `!isStopped()` (rather than `isRunning()`) so an AuthenticationRequired sign-out drops the
        // in-flight handshake along with the stored tokens, not just the tokens.
        const calls: string[] = [];
        const manager = new MCPServerManagerImpl();
        const server = {
            isRunning: () => false,
            isStopped: () => false,
            isInFlight: () => true,
            stop: async () => { calls.push('stop'); }
        };
        (manager as unknown as { servers: Map<string, MCPServer> }).servers = new Map([
            ['asana', server as unknown as MCPServer]
        ]);
        (manager as unknown as { credentialStore: Partial<MCPOAuthCredentialStore> }).credentialStore = {
            clear: async () => { calls.push('clear'); }
        };

        await manager.signOut('asana');

        expect(calls).to.deep.equal(['stop', 'clear']);
    });
});
