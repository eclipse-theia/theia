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

import { expect } from 'chai';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DeployedPlugin, PluginIdentifiers } from '../../common/plugin-protocol';
import { AbstractHostedPluginSupport, PluginContributions } from './hosted-plugin';
import { Measurement } from '@theia/core/lib/common/performance/measurement';

/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockDeployedPlugin(id: string, untrustedWorkspacesSupport?: boolean | 'limited'): DeployedPlugin {
    return {
        metadata: {
            host: 'main',
            model: {
                id,
                name: id.split('.')[1] || id,
                publisher: id.split('.')[0] || 'test',
                version: '1.0.0',
                displayName: id,
                description: '',
                engine: { type: 'theiaPlugin' as any, version: '1.0.0' },
                entryPoint: { backend: 'main.js' },
                packageUri: '',
                packagePath: '',
                untrustedWorkspacesSupport
            },
            lifecycle: { startMethod: 'activate', stopMethod: 'deactivate' } as any,
            outOfSync: false
        }
    };
}

function createNoopMeasurement(): Measurement {
    return {
        stop: () => 0,
        name: 'test',
        log: () => { },
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { }
    };
}

/**
 * Minimal concrete subclass of AbstractHostedPluginSupport for testing.
 * Overrides all abstract methods with no-ops/stubs.
 */
class TestHostedPluginSupport extends AbstractHostedPluginSupport<any, any> {
    constructor() {
        super('test-client');
    }

    protected createTheiaReadyPromise(): Promise<unknown> {
        return Promise.resolve();
    }

    protected acceptPlugin(_plugin: DeployedPlugin): boolean | DeployedPlugin {
        return true;
    }

    protected handleContributions(_plugin: DeployedPlugin): Disposable {
        return Disposable.NULL;
    }

    protected async obtainManager(
        _host: string, _hostContributions: PluginContributions[],
        _toDisconnect: DisposableCollection
    ): Promise<undefined> {
        return undefined;
    }

    protected async getStoragePath(): Promise<string | undefined> {
        return undefined;
    }

    protected async getHostGlobalStoragePath(): Promise<string> {
        return '';
    }

    protected override measure(_name: string): Measurement {
        return createNoopMeasurement();
    }

    /**
     * Populate the contributions map with mock deployed plugins in the given state.
     */
    addPlugin(plugin: DeployedPlugin, state = PluginContributions.State.INITIALIZING): void {
        const pluginId = PluginIdentifiers.componentsToUnversionedId(plugin.metadata.model);
        const contributions = new PluginContributions(plugin);
        contributions.state = state;
        this.contributions.set(pluginId, contributions);
    }

    /**
     * Expose the protected loadContributions for testing.
     */
    testLoadContributions(): Map<string, PluginContributions[]> {
        const toDisconnect = new DisposableCollection(Disposable.create(() => { }));
        return this.loadContributions(toDisconnect);
    }

    setWorkspaceTrusted(trusted: boolean): void {
        this.workspaceTrusted = trusted;
    }

    clearDisabledByTrust(): void {
        this._disabledByTrust.clear();
    }

    simulateLoadCycle(): Map<string, PluginContributions[]> {
        this._disabledByTrust.clear();
        const result = this.testLoadContributions();
        if (this._disabledByTrust.size > 0) {
            this.onDidChangePluginsEmitter.fire(undefined);
        }
        return result;
    }
}

describe('AbstractHostedPluginSupport - workspace trust filtering', () => {
    let support: TestHostedPluginSupport;

    beforeEach(() => {
        support = new TestHostedPluginSupport();
    });

    it('should skip plugin with untrustedWorkspacesSupport: false when workspace is untrusted', () => {
        support.setWorkspaceTrusted(false);
        const plugin = createMockDeployedPlugin('test.untrusted-false', false);
        support.addPlugin(plugin);

        const result = support.testLoadContributions();

        // Plugin should not be in the returned host contributions
        let pluginFound = false;
        for (const contributions of result.values()) {
            for (const c of contributions) {
                if (c.plugin.metadata.model.id === 'test.untrusted-false') {
                    pluginFound = true;
                }
            }
        }
        expect(pluginFound).to.equal(false);
        expect(support.disabledByTrust.has('test.untrusted-false')).to.equal(true);
    });

    it('should load plugin with untrustedWorkspacesSupport: true when workspace is untrusted', () => {
        support.setWorkspaceTrusted(false);
        const plugin = createMockDeployedPlugin('test.untrusted-true', true);
        support.addPlugin(plugin);

        const result = support.testLoadContributions();

        let pluginFound = false;
        for (const contributions of result.values()) {
            for (const c of contributions) {
                if (c.plugin.metadata.model.id === 'test.untrusted-true') {
                    pluginFound = true;
                }
            }
        }
        expect(pluginFound).to.equal(true);
        expect(support.disabledByTrust.has('test.untrusted-true')).to.equal(false);
    });

    it('should load plugin with untrustedWorkspacesSupport: "limited" when workspace is untrusted', () => {
        support.setWorkspaceTrusted(false);
        const plugin = createMockDeployedPlugin('test.untrusted-limited', 'limited');
        support.addPlugin(plugin);

        const result = support.testLoadContributions();

        let pluginFound = false;
        for (const contributions of result.values()) {
            for (const c of contributions) {
                if (c.plugin.metadata.model.id === 'test.untrusted-limited') {
                    pluginFound = true;
                }
            }
        }
        expect(pluginFound).to.equal(true);
        expect(support.disabledByTrust.has('test.untrusted-limited')).to.equal(false);
    });

    it('should load plugin with untrustedWorkspacesSupport: undefined when workspace is untrusted', () => {
        support.setWorkspaceTrusted(false);
        const plugin = createMockDeployedPlugin('test.untrusted-undefined', undefined);
        support.addPlugin(plugin);

        const result = support.testLoadContributions();

        let pluginFound = false;
        for (const contributions of result.values()) {
            for (const c of contributions) {
                if (c.plugin.metadata.model.id === 'test.untrusted-undefined') {
                    pluginFound = true;
                }
            }
        }
        expect(pluginFound).to.equal(true);
        expect(support.disabledByTrust.has('test.untrusted-undefined')).to.equal(false);
    });

    it('should load plugin with untrustedWorkspacesSupport: false when workspace is trusted', () => {
        support.setWorkspaceTrusted(true);
        const plugin = createMockDeployedPlugin('test.trusted-false', false);
        support.addPlugin(plugin);

        const result = support.testLoadContributions();

        let pluginFound = false;
        for (const contributions of result.values()) {
            for (const c of contributions) {
                if (c.plugin.metadata.model.id === 'test.trusted-false') {
                    pluginFound = true;
                }
            }
        }
        expect(pluginFound).to.equal(true);
        expect(support.disabledByTrust.has('test.trusted-false')).to.equal(false);
    });

    it('should clear disabledByTrust when workspace becomes trusted on re-load', () => {
        // First load: untrusted workspace, plugin should be disabled
        support.setWorkspaceTrusted(false);
        const plugin = createMockDeployedPlugin('test.reload-trust', false);
        support.addPlugin(plugin);

        support.testLoadContributions();
        expect(support.disabledByTrust.has('test.reload-trust')).to.equal(true);
        expect(support.disabledByTrust.size).to.equal(1);

        // Second load: simulate doLoad() which clears disabledByTrust before loadContributions
        support.setWorkspaceTrusted(true);
        support.clearDisabledByTrust();
        support.testLoadContributions();
        expect(support.disabledByTrust.size).to.equal(0);
    });

    it('should correctly populate disabledByTrust with only filtered plugins', () => {
        support.setWorkspaceTrusted(false);
        const blockedPlugin = createMockDeployedPlugin('test.blocked', false);
        const allowedPlugin = createMockDeployedPlugin('test.allowed', true);
        support.addPlugin(blockedPlugin);
        support.addPlugin(allowedPlugin);

        support.testLoadContributions();

        expect(support.disabledByTrust.size).to.equal(1);
        expect(support.disabledByTrust.has('test.blocked')).to.equal(true);
        expect(support.disabledByTrust.has('test.allowed')).to.equal(false);
    });

    describe('plugins deployed after initial load (re-load cycle)', () => {
        it('should disable a newly deployed plugin with untrustedWorkspacesSupport: false on re-load', () => {
            support.setWorkspaceTrusted(false);

            const initialPlugin = createMockDeployedPlugin('test.initial', false);
            support.addPlugin(initialPlugin);
            support.simulateLoadCycle();
            expect(support.disabledByTrust.has('test.initial')).to.equal(true);

            const newPlugin = createMockDeployedPlugin('test.new-deploy', false);
            support.addPlugin(newPlugin);
            support.simulateLoadCycle();

            expect(support.disabledByTrust.has('test.initial')).to.equal(true);
            expect(support.disabledByTrust.has('test.new-deploy')).to.equal(true);
            expect(support.disabledByTrust.size).to.equal(2);
        });

        it('should re-add previously disabled plugins to disabledByTrust on each re-load cycle', () => {
            support.setWorkspaceTrusted(false);
            const plugin = createMockDeployedPlugin('test.persistent', false);
            support.addPlugin(plugin);

            support.simulateLoadCycle();
            expect(support.disabledByTrust.has('test.persistent')).to.equal(true);

            support.simulateLoadCycle();
            expect(support.disabledByTrust.has('test.persistent')).to.equal(true);

            support.simulateLoadCycle();
            expect(support.disabledByTrust.has('test.persistent')).to.equal(true);
        });

        it('should not add already-started allowed plugins to disabledByTrust on re-load', () => {
            support.setWorkspaceTrusted(false);
            const startedAllowed = createMockDeployedPlugin('test.started-allowed', true);
            support.addPlugin(startedAllowed, PluginContributions.State.STARTED);
            const startedUndefined = createMockDeployedPlugin('test.started-undefined', undefined);
            support.addPlugin(startedUndefined, PluginContributions.State.STARTED);

            support.simulateLoadCycle();

            expect(support.disabledByTrust.has('test.started-allowed')).to.equal(false);
            expect(support.disabledByTrust.has('test.started-undefined')).to.equal(false);
            expect(support.disabledByTrust.size).to.equal(0);
        });

        it('should add already-started plugins with untrustedWorkspacesSupport: false to disabledByTrust on re-load', () => {
            support.setWorkspaceTrusted(false);
            const startedBlocked = createMockDeployedPlugin('test.started-blocked', false);
            support.addPlugin(startedBlocked, PluginContributions.State.STARTED);

            support.simulateLoadCycle();

            expect(support.disabledByTrust.has('test.started-blocked')).to.equal(true);
        });

        it('should fire onDidChangePlugins after loadContributions when a newly deployed plugin is disabled by trust', () => {
            support.setWorkspaceTrusted(false);
            const existingPlugin = createMockDeployedPlugin('test.existing', false);
            support.addPlugin(existingPlugin);
            support.simulateLoadCycle();

            const newPlugin = createMockDeployedPlugin('test.late-deploy', false);
            support.addPlugin(newPlugin);

            let eventFiredCount = 0;
            support.onDidChangePlugins(() => { eventFiredCount++; });

            support.simulateLoadCycle();

            expect(support.disabledByTrust.has('test.late-deploy')).to.equal(true);
            expect(eventFiredCount).to.equal(1);
        });

        it('should not fire onDidChangePlugins when no plugins are disabled by trust', () => {
            support.setWorkspaceTrusted(false);
            const allowedPlugin = createMockDeployedPlugin('test.allowed-nodeploy', true);
            support.addPlugin(allowedPlugin);

            let eventFiredCount = 0;
            support.onDidChangePlugins(() => { eventFiredCount++; });

            support.simulateLoadCycle();

            expect(support.disabledByTrust.size).to.equal(0);
            expect(eventFiredCount).to.equal(0);
        });

        it('should include both initial and newly deployed disabled plugins in disabledByTrust when workspace is untrusted', () => {
            support.setWorkspaceTrusted(false);

            const builtin = createMockDeployedPlugin('test.builtin', false);
            support.addPlugin(builtin);
            support.simulateLoadCycle();
            expect(support.disabledByTrust.size).to.equal(1);

            const userInstalled = createMockDeployedPlugin('test.user-installed', false);
            support.addPlugin(userInstalled);
            support.simulateLoadCycle();

            expect(support.disabledByTrust.size).to.equal(2);
            expect(support.disabledByTrust.has('test.builtin')).to.equal(true);
            expect(support.disabledByTrust.has('test.user-installed')).to.equal(true);
        });
    });

});
