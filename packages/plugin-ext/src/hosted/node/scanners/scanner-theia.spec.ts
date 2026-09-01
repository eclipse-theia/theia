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
import { PluginPackage, PluginEntryPoint, PluginPackageWalkthrough, WalkthroughContribution } from '../../../common/plugin-protocol';
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

describe('TheiaPluginScanner - readWalkthroughs', () => {
    let scannerInstance: TheiaPluginScanner;

    before(() => {
        scannerInstance = new (TheiaPluginScanner as any)();
        (scannerInstance as any).logger = { error: () => { }, warn: () => { }, info: () => { }, debug: () => { } };
    });

    function callReadWalkthroughs(
        walkthroughs: PluginPackageWalkthrough[],
        publisher = 'test-publisher',
        name = 'test-plugin',
        icon?: string
    ): WalkthroughContribution[] | undefined {
        const pkg = {
            name,
            publisher,
            version: '1.0.0',
            icon,
            contributes: { walkthroughs }
        } as any;
        return (scannerInstance as any).readWalkthroughs(pkg);
    }

    it('should resolve the icon of the contributing extension', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{ id: 's1', title: 'S1', description: 'd1' }]
        }], 'test-publisher', 'test-plugin', 'images/icon.png');

        expect(result![0].pluginIcon).to.equal('hostedPlugin/test_publisher_test_plugin/images/icon.png');
    });

    it('should leave the extension icon undefined when the package declares none', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{ id: 's1', title: 'S1', description: 'd1' }]
        }]);

        expect(result![0].pluginIcon).to.be.undefined;
    });

    it('should read a valid walkthrough contribution', () => {
        const result = callReadWalkthroughs([{
            id: 'my-walkthrough',
            title: 'My Walkthrough',
            description: 'A test walkthrough',
            steps: [{
                id: 'step1',
                title: 'Step 1',
                description: 'First step',
                completionEvents: ['onCommand:my.command']
            }]
        }]);

        expect(result).to.not.be.undefined;
        expect(result).to.have.lengthOf(1);
        expect(result![0].id).to.equal('my-walkthrough');
        expect(result![0].title).to.equal('My Walkthrough');
        expect(result![0].pluginId).to.equal('test-publisher.test-plugin');
        expect(result![0].steps).to.have.lengthOf(1);
        expect(result![0].steps[0].id).to.equal('step1');
        expect(result![0].steps[0].completionEvents).to.deep.equal(['onCommand:my.command']);
    });

    it('should skip walkthroughs with missing id', () => {
        const result = callReadWalkthroughs([{
            id: '',
            title: 'No ID Walkthrough',
            description: 'Missing id',
            steps: []
        }]);

        expect(result).to.be.undefined;
    });

    it('should skip walkthroughs with missing title', () => {
        const result = callReadWalkthroughs([{
            id: 'valid-id',
            title: '',
            description: 'Missing title',
            steps: []
        }]);

        expect(result).to.be.undefined;
    });

    it('should skip walkthrough steps with missing id', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT1',
            description: 'desc',
            steps: [
                { id: '', title: 'Step', description: 'desc' },
                { id: 'valid-step', title: 'Valid Step', description: 'desc' }
            ]
        }]);

        expect(result).to.have.lengthOf(1);
        expect(result![0].steps).to.have.lengthOf(1);
        expect(result![0].steps[0].id).to.equal('valid-step');
    });

    it('should return undefined when no walkthroughs are contributed', () => {
        const pkg = { name: 'test', publisher: 'pub', contributes: {} } as any;
        const result = (scannerInstance as any).readWalkthroughs(pkg);
        expect(result).to.be.undefined;
    });

    it('should read multiple walkthroughs', () => {
        const result = callReadWalkthroughs([
            {
                id: 'wt1',
                title: 'Walkthrough 1',
                description: 'First',
                steps: [{ id: 's1', title: 'S1', description: 'd1' }]
            },
            {
                id: 'wt2',
                title: 'Walkthrough 2',
                description: 'Second',
                steps: [{ id: 's2', title: 'S2', description: 'd2' }]
            }
        ]);

        expect(result).to.have.lengthOf(2);
        expect(result![0].id).to.equal('wt1');
        expect(result![1].id).to.equal('wt2');
    });

    it('should preserve walkthrough optional fields', () => {
        const result = callReadWalkthroughs([{
            id: 'wt-full',
            title: 'Full Walkthrough',
            description: 'Full desc',
            steps: [{
                id: 's1',
                title: 'S1',
                description: 'step desc',
                when: 'isLinux',
                media: { markdown: 'content.md' },
                completionEvents: ['onCommand:test']
            }],
            when: 'workspacePlatform == linux',
            icon: 'book'
        }]);

        expect(result).to.have.lengthOf(1);
        expect(result![0].when).to.equal('workspacePlatform == linux');
        expect(result![0].icon).to.equal('book');
        expect(result![0].steps[0].when).to.equal('isLinux');
        expect(result![0].steps[0].media).to.deep.equal({ markdown: 'hostedPlugin/test_publisher_test_plugin/content.md' });
    });

    it('should lowercase pluginId', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{ id: 's1', title: 'S1', description: 'd1' }]
        }], 'MyPublisher', 'MyPlugin');

        expect(result).to.have.lengthOf(1);
        expect(result![0].pluginId).to.equal('mypublisher.myplugin');
    });

    it('should resolve media image paths through toPluginUrl', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{
                id: 's1',
                title: 'S1',
                description: 'd1',
                media: { image: 'media/image.png' }
            }]
        }]);

        expect(result).to.have.lengthOf(1);
        expect(result![0].steps[0].media).to.deep.equal({ image: 'hostedPlugin/test_publisher_test_plugin/media/image.png' });
    });

    it('should keep the alt text of svg media', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{
                id: 's1',
                title: 'S1',
                description: 'd1',
                media: { svg: 'media/icon.svg', altText: 'An icon' }
            }]
        }]);

        expect(result![0].steps[0].media).to.deep.equal({
            svg: 'hostedPlugin/test_publisher_test_plugin/media/icon.svg',
            altText: 'An icon'
        });
    });

    it('should resolve media svg paths through toPluginUrl', () => {
        const result = callReadWalkthroughs([{
            id: 'wt1',
            title: 'WT',
            description: 'desc',
            steps: [{
                id: 's1',
                title: 'S1',
                description: 'd1',
                media: { svg: 'media/icon.svg' }
            }]
        }]);

        expect(result).to.have.lengthOf(1);
        expect(result![0].steps[0].media).to.deep.equal({ svg: 'hostedPlugin/test_publisher_test_plugin/media/icon.svg' });
    });
});
