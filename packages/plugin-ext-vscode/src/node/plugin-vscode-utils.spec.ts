// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { ArchiveExtractor, ArchiveExtractorImpl } from '@theia/filesystem/lib/node/archive/archive-extractor';
import { createTestTar, createTestZip } from '@theia/filesystem/lib/node/archive/test/test-archives';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { decompressExtension, extractExtensionIdentityFromVsix, TMP_DIR_PREFIX, unpackToDeploymentDir } from './plugin-vscode-utils';

describe('plugin-vscode-utils', () => {

    let workspace: string;
    let deploymentDir: string;
    let environment: PluginVSCodeEnvironment;
    const originalConsole = { log: console.log, warn: console.warn, error: console.error };

    beforeEach(async () => {
        workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'plugin-vscode-utils-'));
        deploymentDir = path.join(workspace, 'deployedPlugins');
        environment = { getDeploymentDirUri: async () => FileUri.create(deploymentDir) } as PluginVSCodeEnvironment;
        // The functions under test report their progress on the console.
        console.log = console.warn = console.error = () => { };
    });

    afterEach(async () => {
        Object.assign(console, originalConsole);
        await fs.promises.rm(workspace, { recursive: true, force: true });
    });

    async function writeFile(name: string, content: Buffer): Promise<string> {
        const filePath = path.join(workspace, name);
        await fs.promises.writeFile(filePath, content);
        return filePath;
    }

    function createVsix(packageJson?: object): Buffer {
        return createTestZip([
            { name: 'extension.vsixmanifest', data: '<PackageManifest/>' },
            ...(packageJson ? [{ name: 'extension/package.json', data: JSON.stringify(packageJson) }] : []),
            { name: 'extension/out/main.js', data: 'exports.activate = () => { };' }
        ]);
    }

    describe('extractExtensionIdentityFromVsix', () => {

        it('reads the identity from the package.json of the extension', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ publisher: 'theia', name: 'test', version: '1.2.3' }));
            expect(await extractExtensionIdentityFromVsix(vsix)).to.deep.equal({ publisher: 'theia', name: 'test', version: '1.2.3' });
        });

        it('returns undefined if the package.json is missing', async () => {
            const vsix = await writeFile('test.vsix', createVsix());
            expect(await extractExtensionIdentityFromVsix(vsix)).to.be.undefined;
        });

        it('returns undefined if the package.json has no version', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ publisher: 'theia', name: 'test' }));
            expect(await extractExtensionIdentityFromVsix(vsix)).to.be.undefined;
        });

        it('returns undefined if the file is not an archive', async () => {
            const vsix = await writeFile('test.vsix', Buffer.from('not an archive'));
            expect(await extractExtensionIdentityFromVsix(vsix)).to.be.undefined;
        });

        it('uses the given extractor', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ publisher: 'theia', name: 'test', version: '1.2.3' }));
            const readSources: unknown[] = [];
            const extractor: ArchiveExtractor = {
                extract: () => Promise.reject(new Error('unexpected')),
                readFiles: source => {
                    readSources.push(source);
                    return new ArchiveExtractorImpl().readFiles(source);
                }
            };
            await extractExtensionIdentityFromVsix(vsix, extractor);
            expect(readSources).to.deep.equal([vsix]);
        });
    });

    describe('decompressExtension', () => {

        it('extracts a VSIX', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ name: 'test', version: '1.2.3' }));
            const target = path.join(workspace, 'target');
            expect(await decompressExtension(vsix, target)).to.be.true;
            expect(fs.existsSync(path.join(target, 'extension', 'out', 'main.js'))).to.be.true;
        });

        it('extracts the node_modules shipped with a built-in .tgz extension', async () => {
            const nodeModules = createTestZip([{ name: 'some-dependency/index.js', data: 'module.exports = 1;' }]);
            const tgz = await writeFile('builtin.tgz', await createTestTar([
                { name: 'package/package.json', data: '{"name":"builtin","version":"1.0.0"}' },
                { name: 'package/vscode_node_modules.zip', data: nodeModules }
            ], true));
            const target = path.join(workspace, 'target');
            await decompressExtension(tgz, target);
            expect(await fs.promises.readFile(path.join(target, 'package', 'node_modules', 'some-dependency', 'index.js'), 'utf8')).to.equal('module.exports = 1;');
        });

        it('rejects an archive with an entry that leaves the target', async () => {
            const vsix = await writeFile('evil.vsix', createTestZip([{ name: '../evil.txt', data: 'evil' }]));
            let error: unknown;
            try {
                await decompressExtension(vsix, path.join(workspace, 'target'));
            } catch (e) {
                error = e;
            }
            expect(String(error)).to.match(/invalid relative path|leaves the extraction directory/);
            expect(fs.existsSync(path.join(workspace, 'evil.txt'))).to.be.false;
        });
    });

    describe('unpackToDeploymentDir', () => {

        it('unpacks into the deployment directory of the extension', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ name: 'test', version: '1.2.3' }));
            const extensionDir = await unpackToDeploymentDir(environment, vsix, 'theia.test-1.2.3');
            expect(extensionDir).to.equal(path.join(deploymentDir, 'theia.test-1.2.3'));
            expect(fs.existsSync(path.join(extensionDir, 'extension', 'out', 'main.js'))).to.be.true;
        });

        it('removes the temporary directory if unpacking fails', async () => {
            const vsix = await writeFile('evil.vsix', createTestZip([
                { name: 'extension/package.json', data: '{}' },
                { name: '../evil.txt', data: 'evil' }
            ]));
            let rejected = false;
            try {
                await unpackToDeploymentDir(environment, vsix, 'theia.evil');
            } catch {
                rejected = true;
            }
            expect(rejected).to.be.true;
            expect((await fs.promises.readdir(deploymentDir)).filter(name => name.startsWith(TMP_DIR_PREFIX))).to.be.empty;
            expect(fs.existsSync(path.join(deploymentDir, 'theia.evil'))).to.be.false;
        });

        it('uses the given extractor', async () => {
            const vsix = await writeFile('test.vsix', createVsix({ name: 'test', version: '1.2.3' }));
            const extracted: unknown[] = [];
            const extractor: ArchiveExtractor = {
                extract: (source, destination) => {
                    extracted.push(source);
                    return new ArchiveExtractorImpl().extract(source, destination);
                },
                readFiles: () => Promise.reject(new Error('unexpected'))
            };
            await unpackToDeploymentDir(environment, vsix, 'theia.test-1.2.3', extractor);
            expect(extracted).to.deep.equal([vsix]);
        });
    });
});
