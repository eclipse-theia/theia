/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from "inversify";
import { expect } from 'chai';
import { FileSystem } from "@theia/filesystem/lib/common";
import { StorageService } from "@theia/core/lib/browser/storage-service";
import { MockStorageService } from "@theia/core/lib/browser/test/mock-storage-service";
import sinon = require("sinon");
import { CppBuildConfigurationManager, CppBuildConfiguration } from "./cpp-build-configurations";
import { FileSystemNode } from "@theia/filesystem/lib/node/node-filesystem";
import { bindCppPreferences } from "./cpp-preferences";
import { PreferenceService } from "@theia/core/lib/browser/preferences/preference-service";
import { MockPreferenceService } from "@theia/core/lib/browser/preferences/test/mock-preference-service";

let container: Container;

beforeEach(function() {
    const m = new ContainerModule(bind => {
        bind(CppBuildConfigurationManager).toSelf().inSingletonScope();
        bind(StorageService).to(MockStorageService).inSingletonScope();
        bind(FileSystem).to(FileSystemNode).inSingletonScope();
        bindCppPreferences(bind);
        bind(PreferenceService).to(MockPreferenceService).inSingletonScope();
    });

    container = new Container();
    container.load(m);
});

/**
 * Create the .theia/builds.json file with `buildsJsonContent` as its content
 * and create/return an instance of the build configuration service.  If
 * `buildsJsonContent` is undefined, don't create .theia/builds.json.
 * If `activeBuildConfigName` is not undefined, also create an entrty in the
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
        storage.setData('cpp.active-build-configuration', {
            configName: activeBuildConfigName,
        });
    }

    const configs = container.get<CppBuildConfigurationManager>(CppBuildConfigurationManager);
    await configs.ready;
    return configs;
}

describe("build-configurations", function() {
    it("should work with no preferences", async function() {
        const cppBuildConfigurations = await initializeTest(undefined, undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig();

        expect(active).eq(undefined);
        expect(configs).lengthOf(0);
    });

    it("should work with an empty list of builds", async function() {
        const cppBuildConfigurations = await initializeTest([], undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig();

        expect(active).eq(undefined);
        expect(configs).lengthOf(0);
    });

    it("should work with a simple list of builds", async function() {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, undefined);

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig();

        expect(active).eq(undefined);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });

    it("should work with a simple list of builds and an active config", async function() {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, 'Debug');

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig();

        expect(active).to.be.deep.eq(builds[1]);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });

    it("should ignore an active config that doesn't exist", async function() {
        const builds = [{
            name: 'Release',
            directory: '/tmp/builds/release',
        }, {
            name: 'Debug',
            directory: '/tmp/builds/debug',
        }];
        const cppBuildConfigurations = await initializeTest(builds, 'foobar');

        const configs = cppBuildConfigurations.getConfigs();
        const active = cppBuildConfigurations.getActiveConfig();

        expect(active).to.be.eq(undefined);
        expect(configs).to.be.an('array').of.lengthOf(2);
        expect(configs).to.have.deep.members(builds);
    });
});
