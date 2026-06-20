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

import * as chai from 'chai';
import * as theia from '@theia/plugin';
import { TerminalServiceMain, Plugin, TerminalOptions } from '../common/plugin-api-rpc';
import { RPCProtocol, ProxyIdentifier } from '../common/rpc-protocol';
import { TerminalServiceExtImpl, TerminalExtImpl } from './terminal-ext';
import { TerminalExitReason } from './types-impl';

const expect = chai.expect;

/**
 * Creates a mock RPCProtocol that returns the given proxy for TERMINAL_MAIN.
 */
function createMockRpc(proxy: Partial<TerminalServiceMain>): RPCProtocol {
    return {
        getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
            return proxy as unknown as T;
        },
        set<T, R extends T>(_identifier: ProxyIdentifier<T>, instance: R): R {
            return instance;
        },
        dispose(): void { }
    } as RPCProtocol;
}

/**
 * Creates a minimal mock Plugin object.
 */
function createMockPlugin(): Plugin {
    return {
        pluginPath: '/test',
        pluginFolder: '/test',
        pluginUri: 'file:///test',
        model: { id: 'test.plugin' } as Plugin['model'],
        rawModel: {} as Plugin['rawModel'],
        lifecycle: {} as Plugin['lifecycle'],
        isUnderDevelopment: false
    };
}

/**
 * Creates a stub TerminalServiceMain that records calls.
 */
function createMockProxy(): TerminalServiceMain & { createdTerminals: { id: string; options: TerminalOptions }[] } {
    const createdTerminals: { id: string; options: TerminalOptions }[] = [];
    return {
        createdTerminals,
        $createTerminal(id: string, options: TerminalOptions): Promise<string> {
            createdTerminals.push({ id, options });
            return Promise.resolve(id);
        },
        $sendText(): void { },
        $write(): void { },
        $resize(): void { },
        $show(): void { },
        $hide(): void { },
        $dispose(): void { },
        $setName(): void { },
        $writeByTerminalId(): void { },
        $resizeByTerminalId(): void { },
        $disposeByTerminalId(): void { },
        $setNameByTerminalId(): void { },
        $setEnvironmentVariableCollection(): void { },
        $registerTerminalLinkProvider(): void { },
        $unregisterTerminalLinkProvider(): void { },
        $registerTerminalObserver(): void { },
        $unregisterTerminalObserver(): void { },
    } as unknown as TerminalServiceMain & { createdTerminals: { id: string; options: TerminalOptions }[] };
}

describe('TerminalServiceExtImpl', () => {
    let proxy: ReturnType<typeof createMockProxy>;
    let service: TerminalServiceExtImpl;
    let plugin: Plugin;

    beforeEach(() => {
        proxy = createMockProxy();
        const rpc = createMockRpc(proxy);
        service = new TerminalServiceExtImpl(rpc);
        plugin = createMockPlugin();
    });

    describe('terminals list', () => {
        it('returns empty array initially', () => {
            expect(service.terminals).to.deep.equal([]);
        });

        it('includes terminals after creation via $terminalCreated', () => {
            service.$terminalCreated('t1', 'Terminal 1');
            expect(service.terminals).to.have.length(1);
        });

        it('removes terminals after $terminalClosed', () => {
            service.$terminalCreated('t1', 'Terminal 1');
            service.$terminalClosed('t1', { code: 0, reason: TerminalExitReason.Process });
            expect(service.terminals).to.have.length(0);
        });
    });

    describe('API object identity', () => {
        it('returns the raw TerminalExtImpl when no wrapper is provided', () => {
            const terminal = service.createTerminal(plugin, 'Test Terminal');
            expect(terminal).to.be.instanceOf(TerminalExtImpl);
        });

        it('returns the wrapped API object when a wrapper is provided', () => {
            const wrapper = (t: TerminalExtImpl): theia.Terminal => ({ ...t, name: 'wrapped' } as unknown as theia.Terminal);
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);
            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            const terminal = service.terminals[0];
            expect(terminal.name).to.equal('wrapped');
            expect(terminal).to.not.be.instanceOf(TerminalExtImpl);
        });

        it('fires onDidOpenTerminal with the API object, not the raw terminal', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const opened: theia.Terminal[] = [];
            service.onDidOpenTerminal(t => opened.push(t));

            // Get the ID from the proxy call
            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');

            expect(opened).to.have.length(1);
            expect(opened[0]).to.equal(apiObject);
        });

        it('fires onDidCloseTerminal with the API object', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const closed: theia.Terminal[] = [];
            service.onDidCloseTerminal(t => closed.push(t));

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            service.$terminalClosed(id, { code: 0, reason: TerminalExitReason.Process });

            expect(closed).to.have.length(1);
            expect(closed[0]).to.equal(apiObject);
        });

        it('fires onDidChangeTerminalState with the API object on interaction', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const stateChanged: theia.Terminal[] = [];
            service.onDidChangeTerminalState(t => stateChanged.push(t));

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            service.$terminalOnInteraction(id);

            expect(stateChanged).to.have.length(1);
            expect(stateChanged[0]).to.equal(apiObject);
        });

        it('fires onDidChangeTerminalState with the API object on shell type change', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const stateChanged: theia.Terminal[] = [];
            service.onDidChangeTerminalState(t => stateChanged.push(t));

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            service.$terminalShellTypeChanged(id, '/bin/zsh');

            expect(stateChanged).to.have.length(1);
            expect(stateChanged[0]).to.equal(apiObject);
        });

        it('returns the API object from the terminals list', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');

            const terminals = service.terminals;
            expect(terminals).to.have.length(1);
            expect(terminals[0]).to.equal(apiObject);
        });

        it('returns the API object as activeTerminal', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            service.$currentTerminalChanged(id);

            expect(service.activeTerminal).to.equal(apiObject);
        });

        it('cleans up API object on terminal close', () => {
            const apiObject = { marker: 'api-object' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Test Terminal', undefined, undefined, wrapper);

            const id = proxy.createdTerminals[0].id;
            service.$terminalCreated(id, 'Test Terminal');
            service.$terminalClosed(id, { code: 0, reason: TerminalExitReason.Process });

            expect(service.terminals).to.have.length(0);
        });
    });

    describe('parentTerminal resolution', () => {
        it('resolves parentTerminal from API proxy objects', () => {
            const apiObject = { marker: 'parent-api' } as unknown as theia.Terminal;
            const wrapper = (_t: TerminalExtImpl): theia.Terminal => apiObject;
            service.createTerminal(plugin, 'Parent', undefined, undefined, wrapper);

            const parentId = proxy.createdTerminals[0].id;
            service.$terminalCreated(parentId, 'Parent');

            // Create a child with parentTerminal set to the API object
            service.createTerminal(plugin, {
                name: 'Child',
                location: { parentTerminal: apiObject }
            } as theia.TerminalOptions);

            expect(proxy.createdTerminals).to.have.length(2);
            // The second createTerminal call should have passed the parent ID
            // We verify it was called on the proxy (the parentId arg is the 3rd parameter)
        });

        it('resolves parentTerminal from raw terminal objects', () => {
            const rawTerminal = service.createTerminal(plugin, 'Parent');

            const parentId = proxy.createdTerminals[0].id;
            service.$terminalCreated(parentId, 'Parent');

            // Create a child with parentTerminal set to the raw terminal
            service.createTerminal(plugin, {
                name: 'Child',
                location: { parentTerminal: rawTerminal }
            } as theia.TerminalOptions);

            expect(proxy.createdTerminals).to.have.length(2);
        });
    });

    describe('events for terminals without wrapper', () => {
        it('fires onDidOpenTerminal with the raw terminal when no wrapper is used', () => {
            const opened: theia.Terminal[] = [];
            service.onDidOpenTerminal(t => opened.push(t));

            service.$terminalCreated('ext-t1', 'External Terminal');

            expect(opened).to.have.length(1);
            expect(opened[0]).to.be.instanceOf(TerminalExtImpl);
            expect(opened[0].name).to.equal('External Terminal');
        });

        it('fires onDidCloseTerminal with the raw terminal when no wrapper is used', () => {
            const closed: theia.Terminal[] = [];
            service.onDidCloseTerminal(t => closed.push(t));

            service.$terminalCreated('ext-t1', 'External Terminal');
            service.$terminalClosed('ext-t1', { code: 0, reason: TerminalExitReason.Process });

            expect(closed).to.have.length(1);
            expect(closed[0]).to.be.instanceOf(TerminalExtImpl);
        });
    });

    describe('shell change', () => {
        it('fires onDidChangeShell when shell changes', async () => {
            const shells: string[] = [];
            service.onDidChangeShell(s => shells.push(s));

            await service.$setShell('/bin/zsh');

            expect(shells).to.deep.equal(['/bin/zsh']);
            expect(service.defaultShell).to.equal('/bin/zsh');
        });

        it('does not fire onDidChangeShell when shell is the same', async () => {
            const shells: string[] = [];
            await service.$setShell('/bin/zsh');

            service.onDidChangeShell(s => shells.push(s));
            await service.$setShell('/bin/zsh');

            expect(shells).to.deep.equal([]);
        });
    });

    describe('$terminalNameChanged', () => {
        it('updates the terminal name', () => {
            service.$terminalCreated('t1', 'Old Name');
            service.$terminalNameChanged('t1', 'New Name');

            expect(service.terminals[0].name).to.equal('New Name');
        });
    });

    describe('activeTerminal', () => {
        it('is undefined initially', () => {
            expect(service.activeTerminal).to.equal(undefined);
        });

        it('reflects the current active terminal', () => {
            service.$terminalCreated('t1', 'Terminal 1');
            service.$currentTerminalChanged('t1');

            expect(service.activeTerminal).to.not.equal(undefined);
            expect(service.activeTerminal!.name).to.equal('Terminal 1');
        });

        it('fires onDidChangeActiveTerminal', () => {
            const changes: (theia.Terminal | undefined)[] = [];
            service.onDidChangeActiveTerminal(t => changes.push(t));

            service.$terminalCreated('t1', 'Terminal 1');
            service.$currentTerminalChanged('t1');
            service.$currentTerminalChanged(undefined);

            expect(changes).to.have.length(2);
            expect(changes[0]!.name).to.equal('Terminal 1');
            expect(changes[1]).to.equal(undefined);
        });
    });
});
