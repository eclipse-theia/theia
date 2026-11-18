// *****************************************************************************
// Copyright (C) 2026 Kevin Gruber and others.
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
import { OutputChannelRegistryMain, PluginInfo } from '../common/plugin-api-rpc.js';
import { ProxyIdentifier, RPCProtocol } from '../common/rpc-protocol.js';
import { OutputChannelRegistryExtImpl } from './output-channel-registry.js';
import { LogLevel } from './types-impl.js';

describe('OutputChannelRegistryExtImpl', () => {

    const pluginInfo: PluginInfo = { id: 'test.plugin', name: 'Test Plugin' };
    let registeredLogChannels: string[];
    let registry: OutputChannelRegistryExtImpl;

    const proxy = {
        $append: async () => { },
        $clear: async () => { },
        $dispose: async () => { },
        $reveal: async () => { },
        $close: async () => { },
        $registerLogChannel: async (name: string) => { registeredLogChannels.push(name); }
    } as OutputChannelRegistryMain;

    const rpc = {
        getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
            return proxy as unknown as T;
        }
    } as RPCProtocol;

    beforeEach(() => {
        registeredLogChannels = [];
        registry = new OutputChannelRegistryExtImpl(rpc);
    });

    it('should register log channels with the main side', () => {
        registry.createOutputChannel('plain', pluginInfo);
        registry.createOutputChannel('log', pluginInfo, { log: true });
        expect(registeredLogChannels).to.deep.equal(['log']);
    });

    it('should return the existing log channel when created again with the same name', () => {
        const first = registry.createOutputChannel('log', pluginInfo, { log: true });
        const second = registry.createOutputChannel('log', pluginInfo, { log: true });
        expect(second).to.equal(first);
        expect(registeredLogChannels).to.deep.equal(['log']);
    });

    it('should create log channels with the global log level', () => {
        registry.$setGlobalLogLevel(LogLevel.Debug);
        const channel = registry.createOutputChannel('log', pluginInfo, { log: true });
        expect(channel.logLevel).to.equal(LogLevel.Debug);
    });

    it('should fire onDidChangeGlobalLogLevel only when the level changes', () => {
        const events: LogLevel[] = [];
        registry.onDidChangeGlobalLogLevel(level => events.push(level));
        registry.$setGlobalLogLevel(LogLevel.Info);
        registry.$setGlobalLogLevel(LogLevel.Trace);
        expect(events).to.deep.equal([LogLevel.Trace]);
        expect(registry.globalLogLevel).to.equal(LogLevel.Trace);
    });

    it('should set the log level of a channel by name', () => {
        const channel = registry.createOutputChannel('log', pluginInfo, { log: true });
        registry.$setLogLevel('log', LogLevel.Error);
        expect(channel.logLevel).to.equal(LogLevel.Error);
    });

    it('should no longer update a disposed channel', () => {
        const channel = registry.createOutputChannel('log', pluginInfo, { log: true });
        channel.dispose();
        registry.$setLogLevel('log', LogLevel.Error);
        expect(channel.logLevel).to.equal(LogLevel.Info);
    });

});
