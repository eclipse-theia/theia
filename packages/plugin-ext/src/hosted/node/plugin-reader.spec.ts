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

import { expect } from 'chai';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import express from '@theia/core/shared/express';
import { PLUGINS_BASE_PATH } from '@theia/plugin-utils/lib/common/constants';
import { HostedPluginReader } from './plugin-reader.js';

class TestHostedPluginReader extends HostedPluginReader {
    resolve(localPath: string, filePath: string): Promise<string | undefined> {
        return this.resolveFile(localPath, filePath);
    }

    registerPlugin(pluginId: string, localPath: string): void {
        this.pluginsIdsFiles.set(pluginId, localPath);
    }
}

describe('HostedPluginReader#resolveFile', () => {

    let pluginDir: string;
    let nearSiblingFile: string;
    let farSiblingFile: string;
    const reader = new TestHostedPluginReader();

    before(() => {
        // Layout:
        //   <root>/far-sibling.txt        (reachable via `../../far-sibling.txt`)
        //   <root>/wrapper/sibling.txt    (reachable via `../sibling.txt`)
        //   <root>/wrapper/plugin/        (pluginDir)
        //     ├── main.js
        //     └── media/icon.png
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-plugin-reader-'));
        const wrapper = path.join(root, 'wrapper');
        pluginDir = path.join(wrapper, 'plugin');
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'main.js'), 'console.log("ok");');
        fs.mkdirSync(path.join(pluginDir, 'media'));
        fs.writeFileSync(path.join(pluginDir, 'media', 'icon.png'), 'png');
        nearSiblingFile = path.join(wrapper, 'sibling.txt');
        fs.writeFileSync(nearSiblingFile, 'near');
        farSiblingFile = path.join(root, 'far-sibling.txt');
        fs.writeFileSync(farSiblingFile, 'far');
    });

    it('serves a file inside the plugin directory', async () => {
        expect(await reader.resolve(pluginDir, 'main.js')).to.equal(path.join(pluginDir, 'main.js'));
        expect(await reader.resolve(pluginDir, 'media/icon.png')).to.equal(path.join(pluginDir, 'media', 'icon.png'));
    });

    it('resolves extensionless references with the .js fallback', async () => {
        expect(await reader.resolve(pluginDir, 'main')).to.equal(path.join(pluginDir, 'main.js'));
    });

    it('returns undefined for a relative path pointing outside the plugin directory', async () => {
        expect(await reader.resolve(pluginDir, '../sibling.txt')).to.be.undefined;
    });

    it('returns undefined for a relative path composed of parent-directory segments', async () => {
        expect(await reader.resolve(pluginDir, '../../far-sibling.txt')).to.be.undefined;
    });

    it('returns undefined for an absolute path outside the plugin directory', async () => {
        expect(await reader.resolve(pluginDir, nearSiblingFile)).to.be.undefined;
    });

    it('returns undefined for a missing file inside the plugin directory', async () => {
        expect(await reader.resolve(pluginDir, 'does-not-exist.js')).to.be.undefined;
    });
});

describe('HostedPluginReader#configure', () => {

    let tempRoot: string;
    let server: http.Server;
    let baseUrl: string;

    before(async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-plugin-reader-http-'));
        const dotPluginDir = path.join(tempRoot, '.theia', 'deployedPlugins', 'my-plugin');
        fs.mkdirSync(path.join(dotPluginDir, 'a', 'b'), { recursive: true });
        fs.writeFileSync(path.join(dotPluginDir, 'a', 'b', 'c.js'), 'export const value = 42;');
        fs.writeFileSync(path.join(tempRoot, '.theia', 'deployedPlugins', 'secret.txt'), 'secret');

        const reader = new TestHostedPluginReader();
        reader.registerPlugin('my-plugin', dotPluginDir);

        const app = express();
        reader.configure(app);
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unexpected server address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('serves nested plugin files inside a hidden dot-directory', async () => {
        const response = await fetch(`${baseUrl}/${PLUGINS_BASE_PATH}/my-plugin/a/b/c.js`);
        expect(response.status).to.equal(200);
        expect(await response.text()).to.equal('export const value = 42;');
    });

    it('rejects path traversal attempts outside the plugin directory', async () => {
        const response = await fetch(`${baseUrl}/${PLUGINS_BASE_PATH}/my-plugin/%2e%2e/secret.txt`);
        expect(response.status).to.equal(404);
    });

    it('returns 404 for unknown plugin ids', async () => {
        const response = await fetch(`${baseUrl}/${PLUGINS_BASE_PATH}/unknown-plugin/main.js`);
        expect(response.status).to.equal(404);
    });
});
