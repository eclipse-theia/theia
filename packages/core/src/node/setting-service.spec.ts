// *****************************************************************************
// Copyright (C) 2025 and others.
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
import { promises as fs } from 'fs';
import { Container } from 'inversify';
import * as sinon from 'sinon';
import { EnvVariablesServer } from '../common/env-variables';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';
import { URI } from '../common/uri';
import { SettingServiceImpl } from './setting-service';

describe('SettingServiceImpl', () => {
    const mockConfigDirUri = new URI('mock');

    const setup = (): Container => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(SettingServiceImpl).toSelf();
        container.bind(MockLogger).toSelf();
        container.bind(ILogger).toService(MockLogger);
        container.bind(EnvVariablesServer).toConstantValue({
            getConfigDirUri: () => Promise.resolve(mockConfigDirUri.toString()),
        } as unknown as EnvVariablesServer);
        return container;
    };

    afterEach(() => {
        sinon.restore();
    });

    it('should initialize and read settings file', async () => {
        const container = setup();
        const settingService = container.get(SettingServiceImpl);
        const mockLogger = container.get(MockLogger);

        const readFileStub = sinon.stub(fs, 'readFile').resolves(JSON.stringify({ key: 'value' }));
        const infoSpy = sinon.spy(mockLogger, 'info');
        const warnSpy = sinon.spy(mockLogger, 'warn');

        const actual = await settingService.get('key');
        expect(actual).to.be.equal('value');

        expect(readFileStub.calledWith(mockConfigDirUri.resolve('backend-settings.json').path.fsPath())).to.be.true;
        expect(infoSpy.callCount).to.be.equal(0);
        expect(warnSpy.callCount).to.be.equal(0);
    });

    it('should fallback to default and log info when errors with ENOENT', async () => {
        const container = setup();
        const settingService = container.get(SettingServiceImpl);
        const mockLogger = container.get(MockLogger);

        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        sinon.stub(fs, 'readFile').rejects(enoent);
        const infoSpy = sinon.spy(mockLogger, 'info');
        const warnSpy = sinon.spy(mockLogger, 'warn');

        const actual = await settingService.get('key');
        expect(actual).to.be.undefined;

        expect(infoSpy.callCount).to.be.equal(1);
        expect(infoSpy.firstCall.args[0]).to.include('Falling back to defaults');
        expect(warnSpy.callCount).to.be.equal(0);
    });

    it('should fallback to default and log warn when errors', async () => {
        const container = setup();
        const settingService = container.get(SettingServiceImpl);
        const mockLogger = container.get(MockLogger);

        const enoent = Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
        sinon.stub(fs, 'readFile').rejects(enoent);
        const infoSpy = sinon.spy(mockLogger, 'info');
        const warnSpy = sinon.spy(mockLogger, 'warn');

        const actual = await settingService.get('key');
        expect(actual).to.be.undefined;

        expect(infoSpy.callCount).to.be.equal(0);
        expect(warnSpy.callCount).to.be.equal(1);
        expect(warnSpy.firstCall.args[0]).to.include('Falling back to defaults');
    });
});
