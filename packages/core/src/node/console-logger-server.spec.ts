/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Container, injectable, postConstruct } from 'inversify';
import { ConsoleLoggerServer } from './console-logger-server';
import { LogLevel } from '../common/logger-protocol';
import { LoggerWatcher } from '../common/logger-watcher';
import { LogLevelCliContribution } from './logger-cli-contribution';
import { expect } from 'chai';

let server: ConsoleLoggerServer;
let logLevelCliContribution: MockLogLevelCliContribution;

@injectable()
class MockLogLevelCliContribution extends LogLevelCliContribution {

    @postConstruct()
    init() {
        this._logLevels['test-logger'] = LogLevel.DEBUG;
    }

    changeLogLevel(newLevel: LogLevel) {
        this._logLevels['test-logger'] = newLevel;
    }
}

beforeEach(() => {
    const container = new Container;
    container.bind(ConsoleLoggerServer).toSelf().inSingletonScope();
    container.bind(LoggerWatcher).toSelf().inSingletonScope();
    container.bind(MockLogLevelCliContribution).toSelf().inSingletonScope();
    container.bind(LogLevelCliContribution).toService(MockLogLevelCliContribution);

    logLevelCliContribution = container.get<MockLogLevelCliContribution>(MockLogLevelCliContribution);
    server = container.get<ConsoleLoggerServer>(ConsoleLoggerServer);
});

describe('ConsoleLoggerServer', function () {
    it('should respect log level config', async function () {
        expect(await server.getLogLevel('test-logger')).eq(LogLevel.DEBUG);
        await server.child('test-logger');
        expect(await server.getLogLevel('test-logger')).eq(LogLevel.DEBUG);
        logLevelCliContribution.changeLogLevel(LogLevel.WARN);
        expect(await server.getLogLevel('test-logger')).eq(LogLevel.WARN);
    });
});
