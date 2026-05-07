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
import { AbstractPluginScanner, TheiaPluginScanner } from './scanner-theia';
import { PluginPackage, PluginEntryPoint } from '../../../common/plugin-protocol';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
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

describe('TheiaPluginScanner configuration default derivation', () => {
    let scanner: TheiaPluginScanner;
    let tmpDir: string;

    before(() => {
        scanner = new TheiaPluginScanner();
        (scanner as any).pluginUriFactory = {
            createUri: (_pkg: PluginPackage, _relativePath?: string) => new URI('file:///dummy')
        };
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-config-test-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    async function readProperties(properties: Record<string, any>): Promise<PreferenceSchema['properties']> {
        const pkg: PluginPackage = {
            name: 'test-plugin',
            publisher: 'test-publisher',
            version: '1.0.0',
            engines: { theiaPlugin: '1.0.0' },
            displayName: 'Test Plugin',
            description: 'A test plugin',
            packagePath: tmpDir,
            contributes: {
                configuration: { title: 'Test', properties }
            }
        } as PluginPackage;
        const contribution = await scanner.getContribution(pkg);
        expect(contribution?.configuration).to.have.lengthOf(1);
        return contribution!.configuration![0].properties;
    }

    it('derives "" for typed-but-defaultless string property (VS Code parity)', async () => {
        const props = await readProperties({ 'vue.server.path': { type: 'string' } });
        expect(props['vue.server.path'].default).to.equal('');
    });

    it('derives false for boolean type', async () => {
        const props = await readProperties({ 'ext.flag': { type: 'boolean' } });
        expect(props['ext.flag'].default).to.equal(false);
    });

    it('derives 0 for number and integer types', async () => {
        const props = await readProperties({
            'ext.size': { type: 'number' },
            'ext.count': { type: 'integer' }
        });
        expect(props['ext.size'].default).to.equal(0);
        expect(props['ext.count'].default).to.equal(0);
    });

    it('derives [] for array type', async () => {
        const props = await readProperties({ 'ext.list': { type: 'array' } });
        expect(props['ext.list'].default).to.deep.equal([]);
    });

    it('derives {} for object type', async () => {
        const props = await readProperties({ 'ext.map': { type: 'object' } });
        expect(props['ext.map'].default).to.deep.equal({});
    });

    it('derives null for properties without a type (e.g. enum-only)', async () => {
        const props = await readProperties({ 'ext.choice': { enum: ['a', 'b'] } });
        expect(props['ext.choice'].default).to.equal(null);
    });

    it('uses the first entry of a type array', async () => {
        const props = await readProperties({ 'ext.either': { type: ['string', 'null'] } });
        expect(props['ext.either'].default).to.equal('');
    });

    it('preserves an explicit default even when a type would derive a different value', async () => {
        const props = await readProperties({ 'ext.named': { type: 'string', default: 'foo' } });
        expect(props['ext.named'].default).to.equal('foo');
    });

    it('preserves an explicit falsy default such as false, 0, or empty string', async () => {
        const props = await readProperties({
            'ext.zero': { type: 'number', default: 0 },
            'ext.off': { type: 'boolean', default: false },
            'ext.blank': { type: 'string', default: '' }
        });
        expect(props['ext.zero'].default).to.equal(0);
        expect(props['ext.off'].default).to.equal(false);
        expect(props['ext.blank'].default).to.equal('');
    });

    it('preserves an explicit null default', async () => {
        const props = await readProperties({ 'ext.nullable': { type: 'string', default: null } });
        expect(props['ext.nullable'].default).to.equal(null);
    });
});
