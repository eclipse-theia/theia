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
import { VsCodePluginScanner } from './scanner-vscode';
import { PluginPackage } from '@theia/plugin-ext';
import URI from '@theia/core/lib/common/uri';

function createVsCodePluginPackage(
    capabilities?: PluginPackage['capabilities'],
    packagePath?: string
): PluginPackage {
    return {
        name: 'test-vscode-plugin',
        publisher: 'test-publisher',
        version: '1.0.0',
        engines: { vscode: '^1.5.0' },
        displayName: 'Test VSCode Plugin',
        description: 'A test vscode plugin',
        packagePath: packagePath ?? os.tmpdir(),
        main: 'extension.js',
        capabilities
    } as PluginPackage;
}

describe('VsCodePluginScanner', () => {
    let scanner: VsCodePluginScanner;
    let tmpDir: string;

    before(() => {
        scanner = new VsCodePluginScanner();
        // Inject a mock pluginUriFactory
        (scanner as any).pluginUriFactory = {
            createUri: (_pkg: PluginPackage, _relativePath?: string) => new URI('file:///dummy')
        };
        // Create a real temp directory so readdirSync in getLicenseUrl/getReadmeUrl works
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-vscode-test-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should set untrustedWorkspacesSupport to true when capabilities.untrustedWorkspaces.supported is true', () => {
        const pkg = createVsCodePluginPackage({
            untrustedWorkspaces: { supported: true }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(true);
    });

    it('should set untrustedWorkspacesSupport to false when capabilities.untrustedWorkspaces.supported is false', () => {
        const pkg = createVsCodePluginPackage({
            untrustedWorkspaces: { supported: false }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(false);
    });

    it('should set untrustedWorkspacesSupport to "limited" when capabilities.untrustedWorkspaces.supported is "limited"', () => {
        const pkg = createVsCodePluginPackage({
            untrustedWorkspaces: { supported: 'limited' }
        }, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal('limited');
    });

    it('should leave untrustedWorkspacesSupport undefined when no capabilities field is present', () => {
        const pkg = createVsCodePluginPackage(undefined, tmpDir);

        const model = scanner.getModel(pkg);
        expect(model.untrustedWorkspacesSupport).to.equal(undefined);
    });
});
