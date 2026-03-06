// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AbstractPluginScanner } from './scanner-theia';
import { PluginPackage, PluginEntryPoint } from '../../../common/plugin-protocol';
import URI from '@theia/core/lib/common/uri';

class TestPluginScanner extends AbstractPluginScanner {
    constructor() {
        // Use a dummy api type; no backend init path needed
        super('theiaPlugin' as any);
    }

    protected getEntryPoint(_plugin: PluginPackage): PluginEntryPoint {
        return { backend: 'main.js' };
    }
}

function createMinimalPluginPackage(
    capabilities?: PluginPackage['capabilities'],
    packagePath?: string
): PluginPackage {
    return {
        name: 'test-plugin',
        publisher: 'test-publisher',
        version: '1.0.0',
        engines: { theiaPlugin: '1.0.0' },
        displayName: 'Test Plugin',
        description: 'A test plugin',
        packagePath: packagePath ?? os.tmpdir(),
        capabilities
    } as PluginPackage;
}

describe('AbstractPluginScanner', () => {
    let scanner: TestPluginScanner;
    let tmpDir: string;

    before(() => {
        scanner = new TestPluginScanner();
        // Inject a mock pluginUriFactory
        (scanner as any).pluginUriFactory = {
            createUri: (_pkg: PluginPackage, _relativePath?: string) => new URI('file:///dummy')
        };
        // Create a real temp directory so readdirSync in getLicenseUrl/getReadmeUrl works
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should set untrustedWorkspacesSupport to false when capabilities.untrustedWorkspaces.supported is false', () => {
        const pkg = createMinimalPluginPackage({
            untrustedWorkspaces: { supported: false }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(false);
    });

    it('should set untrustedWorkspacesSupport to true when capabilities.untrustedWorkspaces.supported is true', () => {
        const pkg = createMinimalPluginPackage({
            untrustedWorkspaces: { supported: true }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(true);
    });

    it('should set untrustedWorkspacesSupport to "limited" when capabilities.untrustedWorkspaces.supported is "limited"', () => {
        const pkg = createMinimalPluginPackage({
            untrustedWorkspaces: { supported: 'limited' }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal('limited');
    });

    it('should leave untrustedWorkspacesSupport undefined when no capabilities field is present', () => {
        const pkg = createMinimalPluginPackage(undefined, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(undefined);
    });

    it('should leave untrustedWorkspacesSupport undefined when capabilities has no untrustedWorkspaces', () => {
        const pkg = createMinimalPluginPackage({} as any, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(undefined);
    });
});
