/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as assert from 'assert';
import { NpmRegistry } from './npm-registry';
import { RawExtensionPackage, ExtensionPackage } from './extension-package';

const testOutdated = (expectation: boolean, name: string, version: string) =>
    it.skip(name + '@' + version, async () => {
        const registry = new NpmRegistry();
        const rawExtension = await RawExtensionPackage.view(registry, name, version);
        assert.ok(rawExtension);

        const extensionPackage = new ExtensionPackage(rawExtension!, registry);
        const outdated = await extensionPackage.isOutdated();
        assert.equal(expectation, outdated);
    });

describe("extension-package", () => {

    describe("isOutdated", () => {
        testOutdated(false, '@theia/core', 'next');
        testOutdated(false, '@theia/core', 'latest');
        testOutdated(true, '@theia/core', '0.1.0');
    });

});
