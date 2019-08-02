/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

describe('extension-package', function (): void {

    this.timeout(10000);
    describe('isOutdated', () => {
        testOutdated(async extensionPackage => {
            const latestVersion = await extensionPackage.getLatestVersion();
            return latestVersion ? semver.gt(latestVersion, extensionPackage.raw.version) : false;
        }, '@theia/core', 'next');
        testOutdated(() => false, '@theia/core', 'latest');
        testOutdated(() => true, '@theia/core', '0.1.0');
    });

});
