/********************************************************************************
 * Copyright (C) 2018-2019 Ericsson and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { ContainerModule, Container } from 'inversify';
import { expect } from 'chai';
import { FileSystem } from '@theia/filesystem/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { MockStorageService } from '@theia/core/lib/browser/test/mock-storage-service';
import sinon = require('sinon');
import { CppBuildConfigurationManager, CppBuildConfigurationManagerImpl } from './cpp-build-configurations';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { bindCppPreferences } from './cpp-preferences';
import { PreferenceService } from '@theia/core/lib/browser/preferences/preference-service';
import { MockPreferenceService } from '@theia/core/lib/browser/preferences/test/mock-preference-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { CppBuildConfiguration, CppBuildConfigurationServer, MockCppBuildConfigurationServer } from '../common/cpp-build-configuration-protocol';

let container: Container;

disableJSDOM();

before(() => {
    disableJSDOM = enableJSDOM();
});
after(() => {
    disableJSDOM();
});

beforeEach(function () {
    const m = new ContainerModule(bind => {
        bind(CppBuildConfigurationManager).to(CppBuildConfigurationManagerImpl).inSingletonScope();
        bind(StorageService).to(MockStorageService).inSingletonScope();
        bind(FileSystem).to(FileSystemNode).inSingletonScope();
        bindCppPreferences(bind);
        bind(PreferenceService).to(MockPreferenceService).inSingletonScope();
        bind(CppBuildConfigurationServer).to(MockCppBuildConfigurationServer).inSingletonScope();
    });

    container = new Container();
    container.bind(WorkspaceService).toConstantValue(sinon.createStubInstance(WorkspaceService));
    container.load(m);
});

/**
 * Get an instance of the `CppBuildConfigurationManager`.
 */
function getManager(): CppBuildConfigurationManager {
    return container.get<CppBuildConfigurationManager>(CppBuildConfigurationManager);
}

/**
 * Create the .theia/builds.json file with `buildsJsonContent` as its content
 * and create/return an instance of the build configuration service.  If
 * `buildsJsonContent` is undefined, don't create .theia/builds.json.
 * If `activeBuildConfigName` is not undefined, also create an entry in the
 * storage service representing the saved active build config.
 */
async function initializeTest(buildConfigurations: CppBuildConfiguration[] | undefined,
    activeBuildConfigName: string | undefined)
    : Promise<CppBuildConfigurationManager> {

    if (buildConfigurations !== undefined) {
        const prefService = container.get<PreferenceService>(PreferenceService);
        sinon.stub(prefService, 'get').callsFake((preferenceName: string) => {
            if (preferenceName === 'cpp.buildConfigurations') {
                return buildConfigurations;
            }

            return undefined;
        });
    }

    // Save active build config
    if (activeBuildConfigName !== undefined) {
        const storage = container.get<StorageService>(StorageService);
        storage.setData('cpp.active-build-configurations-map', {
            configs: [[
                '/tmp',
                {
                    name: 'Release',
                    directory: '/tmp/builds/release',
                }
            ]],
        });
    }

    const configs = container.get<CppBuildConfigurationManager>(CppBuildConfigurationManager);
    await configs.ready;
    return configs;
}

describe('build-configurations', function () {
    it('should work with no preferences', async function () {
        const cppBuildConfigurations = await initializeTest(undefined, undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig('/tmp');

        expect(active).eq(undefined);
        expect(configs).lengthOf(0);
    });

    it('should work with an empty list of builds', async function () {
        const cppBuildConfigurations = await initializeTest([], undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig('/tmp');

        expect(active).eq(undefined);
        expect(configs).lengthOf(0);
    });

    it('should work with a simple list of builds', async function () {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig('/tmp');

        expect(active).eq(undefined);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });

    it('should work with a simple list of builds and an active config', async function () {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, 'Debug');

        const manager = getManager();
        manager.setActiveConfig(builds[1], '/tmp');

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig('/tmp');

        expect(active).to.be.deep.eq(builds[1]);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });

    it("should ignore an active config that doesn't exist", async function () {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, 'foobar');

        const manager = getManager();
        manager.setActiveConfig(undefined, '/tmp');

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig('/tmp');

        expect(active).to.be.eq(undefined);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });
});
