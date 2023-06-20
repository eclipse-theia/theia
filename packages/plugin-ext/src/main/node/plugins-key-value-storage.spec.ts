/********************************************************************************
 * Copyright (C) 2023 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import 'reflect-metadata';
import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PluginsKeyValueStorage } from './plugins-key-value-storage';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { PluginPathsServiceImpl } from './paths/plugin-paths-service';
import { PluginCliContribution } from './plugin-cli-contribution';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import { FileSystemLocking, FileUri } from '@theia/core/lib/node';
import { FileSystemLockingImpl } from '@theia/core/lib/node/filesystem-locking';
import { WorkspaceFileService } from '@theia/workspace/lib/common';
import { UntitledWorkspaceService } from '@theia/workspace/lib/common/untitled-workspace-service';
import * as temp from 'temp';

const GlobalStorageKind = undefined;

describe('Plugins Key Value Storage', () => {

    let container: Container;

    beforeEach(async () => {
        container = new Container();
        container.bind(PluginsKeyValueStorage).toSelf().inSingletonScope();
        container.bind(PluginCliContribution).toSelf().inSingletonScope();
        container.bind(UntitledWorkspaceService).toSelf().inSingletonScope();
        container.bind(WorkspaceFileService).toSelf().inSingletonScope();
        container.bind(FileSystemLocking).to(FileSystemLockingImpl).inSingletonScope();
        container.bind(EnvVariablesServer).toConstantValue(new MockEnvVariablesServerImpl(FileUri.create(temp.track().mkdirSync())));
        container.bind(PluginPathsService).to(PluginPathsServiceImpl).inSingletonScope();
        container.bind(ILogger).toConstantValue(MockLogger);
        const storage = container.get(PluginsKeyValueStorage);
        expect(await getNumEntries(storage), 'Expected that storage should initially be empty').to.equal(0);
    });

    afterEach(() => {
        container.get(PluginsKeyValueStorage)['dispose']();
    });

    it('Should be able to set and overwrite a storage entry', async () => {
        const aKey = 'akey';
        const aValue = { 'this is a test': 'abc' };
        const anotherValue = { 'this is an updated value': 'def' };
        const storage = container.get(PluginsKeyValueStorage);
        await storage.set(aKey, aValue, GlobalStorageKind);
        expect(await getNumEntries(storage), 'Expected 1 storage entry').to.be.equal(1);
        expect(await storage.get(aKey, GlobalStorageKind), 'Expected storage entry to have initially set value')
            .to.be.deep.equal(aValue);
        await storage.set(aKey, anotherValue, GlobalStorageKind);
        expect(await getNumEntries(storage), 'Expected 1 storage entry').to.be.equal(1);
        expect(await storage.get(aKey, GlobalStorageKind), 'Expected storage entry to have updated value')
            .to.be.deep.equal(anotherValue);
    });

    // This test should fail if the storage does not protect itself against concurrent accesses
    it('Should be able to save several entries to storage and retrieve them as set', async () => {
        const n = 100;
        const key = 'test';
        const valuePropName = 'test-value';
        const storage = container.get(PluginsKeyValueStorage);
        await populateStorage(storage, key, valuePropName, n);
        await checkStorageContent(storage, key, valuePropName, n);
    });

});

const populateStorage = async (storage: PluginsKeyValueStorage, keyPrefix: string, valuePropName: string, num: number) => {
    const tasks: Promise<boolean>[] = [];
    for (let i = 0; i < num; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value: { [key: string]: any } = {};
        value[valuePropName] = i;
        tasks.push(storage.set(keyPrefix + i, value, GlobalStorageKind));
    }
    await Promise.allSettled(tasks);
};

const getNumEntries = async (storage: PluginsKeyValueStorage) => {
    const all = await storage.getAll(GlobalStorageKind);
    return Object.keys(all).length;
};

const checkStorageContent = async (storage: PluginsKeyValueStorage, keyPrefix: string, valuePropName: string, num: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expectedValue: { [key: string]: any } = {};
    const all = await storage.getAll(GlobalStorageKind);
    for (let i = 0; i < num; i++) {
        expectedValue[valuePropName] = i;
        expect(all[keyPrefix + i], 'Expected storage entry ' + i + ' to have kept previously set value')
            .to.be.deep.equal(expectedValue);
    }
};
