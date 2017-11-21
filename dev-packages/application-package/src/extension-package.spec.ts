/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as semver from 'semver';
import * as assert from 'assert';
import { NpmRegistry } from './npm-registry';
import { RawExtensionPackage, ExtensionPackage } from './extension-package';

const testOutdated = (expectation: (extensionPackage: ExtensionPackage) => boolean | Promise<boolean>, name: string, version: string) =>
    it(name + '@' + version, async () => {
        const registry = new NpmRegistry();
        const rawExtension = await RawExtensionPackage.view(registry, name, version);
        assert.ok(rawExtension);

        const extensionPackage = new ExtensionPackage(rawExtension!, registry);
        const outdated = await extensionPackage.isOutdated();
        assert.equal(await expectation(extensionPackage), outdated);
    });

describe("extension-package", function () {

    this.timeout(10000);
    describe("isOutdated", () => {
        testOutdated(async extensionPackage => {
            const latestVersion = await extensionPackage.getLatestVersion();
            return latestVersion ? semver.gt(latestVersion, extensionPackage.raw.version) : false;
        }, '@theia/core', 'next');
        testOutdated(() => false, '@theia/core', 'latest');
        testOutdated(() => true, '@theia/core', '0.1.0');
    });

});
