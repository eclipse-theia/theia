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
import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc.js';
import { LogLevel } from '../types-impl.js';
import { LogOutputChannelImpl } from './log-output-channel.js';

describe('LogOutputChannelImpl', () => {

    const pluginInfo: PluginInfo = { id: 'test.plugin', name: 'Test Plugin' };
    let appended: string[];
    let channel: LogOutputChannelImpl;

    const proxy = {
        $append: async (_name: string, value: string) => { appended.push(value); },
        $clear: async () => { },
        $dispose: async () => { },
        $reveal: async () => { },
        $close: async () => { },
        $registerLogChannel: async () => { }
    } as OutputChannelRegistryMain;

    const logAllLevels = (): void => {
        channel.trace('trace');
        channel.debug('debug');
        channel.info('info');
        channel.warn('warning');
        channel.error('error');
    };

    const loggedLevels = (): string[] => appended.map(line => /\[(\w+)\]/.exec(line)![1]);

    beforeEach(() => {
        appended = [];
        channel = new LogOutputChannelImpl('test', proxy, pluginInfo);
    });

    it('should default to the info level', () => {
        expect(channel.logLevel).to.equal(LogLevel.Info);
        logAllLevels();
        expect(loggedLevels()).to.deep.equal(['Info', 'Warning', 'Error']);
    });

    it('should log all levels at the trace level', () => {
        channel.setLogLevel(LogLevel.Trace);
        logAllLevels();
        expect(loggedLevels()).to.deep.equal(['Trace', 'Debug', 'Info', 'Warning', 'Error']);
    });

    it('should only log errors at the error level', () => {
        channel.setLogLevel(LogLevel.Error);
        logAllLevels();
        expect(loggedLevels()).to.deep.equal(['Error']);
    });

    it('should log nothing when the level is off', () => {
        channel.setLogLevel(LogLevel.Off);
        logAllLevels();
        channel.appendLine('line');
        expect(appended).to.be.empty;
    });

    it('should start with the given log level', () => {
        const debugChannel = new LogOutputChannelImpl('test', proxy, pluginInfo, LogLevel.Debug);
        expect(debugChannel.logLevel).to.equal(LogLevel.Debug);
    });

    it('should fire onDidChangeLogLevel only when the level changes', () => {
        const events: LogLevel[] = [];
        channel.onDidChangeLogLevel(level => events.push(level));
        channel.setLogLevel(LogLevel.Debug);
        channel.setLogLevel(LogLevel.Debug);
        channel.setLogLevel(LogLevel.Off);
        expect(events).to.deep.equal([LogLevel.Debug, LogLevel.Off]);
    });

    it('should call the dispose callback when disposed', () => {
        let disposed = false;
        const disposableChannel = new LogOutputChannelImpl('test', proxy, pluginInfo, LogLevel.Info, () => disposed = true);
        disposableChannel.dispose();
        expect(disposed).to.be.true;
    });

});
