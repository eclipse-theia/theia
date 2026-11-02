// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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
import * as os from 'os';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { FileUri } from '@theia/core/lib/node';
import { DeployedPlugin, DuplicateExtensionError, PluginDeployerResolverContext, PluginDeployOptions, PluginType } from '@theia/plugin-ext';
import { LocalVSIXFilePluginDeployerResolver } from './local-vsix-file-plugin-deployer-resolver';

/** Writes a minimal archive with an `extension/package.json`. `decompress` detects the format from the content, so a tar is enough. */
async function writeVsix(file: string, version: string): Promise<void> {
    const content = Buffer.from(JSON.stringify({ publisher: 'foo', name: 'bar', version }));
    const header = Buffer.alloc(512);
    const write = (value: string, offset: number) => header.write(value, offset, 'ascii');
    write('extension/package.json', 0);
    write('0000644\0', 100);
    write('0000000\0', 108);
    write('0000000\0', 116);
    write(`${content.length.toString(8).padStart(11, '0')}\0`, 124);
    write('00000000000\0', 136);
    write('        ', 148);
    write('0', 156);
    write('ustar\x0000', 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    const padding = Buffer.alloc((512 - content.length % 512) % 512);
    await fs.writeFile(file, Buffer.concat([header, content, padding, Buffer.alloc(1024)]));
}

function deployed(version: string, type: PluginType = PluginType.User): DeployedPlugin {
    return { type, metadata: { model: { publisher: 'foo', name: 'bar', version } } } as unknown as DeployedPlugin;
}

describe('LocalVSIXFilePluginDeployerResolver', () => {

    let tmpDir: string;
    let deploymentDir: string;
    let vsix: string;
    let resolver: LocalVSIXFilePluginDeployerResolver;
    let plugins: DeployedPlugin[];
    let uninstalled: string[];
    let undeployed: string[];
    let added: Array<[string, string | undefined]>;

    const context = { getOriginId: () => 'local-file:test', addPlugin: (id: string, dir: string) => added.push([id, dir]) } as unknown as PluginDeployerResolverContext;
    const deploymentDirOf = (version: string) => path.join(deploymentDir, `foo.bar@${version}`);
    const resolve = (options?: PluginDeployOptions) => resolver.resolveFromLocalPath(context, vsix, options);

    async function resolveError(options?: PluginDeployOptions): Promise<unknown> {
        try {
            await resolve(options);
        } catch (e) {
            return e;
        }
        return undefined;
    }

    async function deployedVersionOnDisk(version: string): Promise<string> {
        return (await fs.readJson(path.join(deploymentDirOf(version), 'extension', 'package.json'))).version;
    }

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vsix-resolver-'));
        deploymentDir = path.join(tmpDir, 'deployed');
        await fs.ensureDir(deploymentDir);
        vsix = path.join(tmpDir, 'renamed.vsix');
        plugins = [];
        uninstalled = [];
        undeployed = [];
        added = [];
        resolver = new LocalVSIXFilePluginDeployerResolver();
        Object.assign(resolver, {
            logger: { warn: () => { }, info: () => { } },
            environment: { getDeploymentDirUri: async () => FileUri.create(deploymentDir) },
            uninstallationManager: { isUninstalled: (id: string) => uninstalled.includes(id) },
            pluginDeployerHandler: {
                getDeployedPluginsById: () => plugins,
                undeployPlugin: async (id: string) => {
                    undeployed.push(id);
                    return true;
                }
            }
        });
    });

    afterEach(() => fs.remove(tmpDir));

    describe('without the ifInstalled option', () => {
        it('rejects the version that is installed already', async () => {
            await writeVsix(vsix, '1.0.0');
            await fs.ensureDir(deploymentDirOf('1.0.0'));
            const error = await resolveError();
            expect(DuplicateExtensionError.getDetails(error)).to.deep.equal({ id: 'foo.bar', installedVersion: '1.0.0', version: '1.0.0' });
        });

        it('deploys a different version without an error', async () => {
            await writeVsix(vsix, '2.0.0');
            plugins = [deployed('1.0.0')];
            await resolve();
            expect(added).to.deep.equal([['foo.bar@2.0.0', deploymentDirOf('2.0.0')]]);
        });
    });

    describe('ifInstalled: fail', () => {
        const options: PluginDeployOptions = { ifInstalled: 'fail' };

        it('deploys an extension that is not installed', async () => {
            await writeVsix(vsix, '1.0.0');
            await resolve(options);
            expect(added).to.deep.equal([['foo.bar@1.0.0', deploymentDirOf('1.0.0')]]);
        });

        it('rejects the same version with its details', async () => {
            await writeVsix(vsix, '1.0.0');
            await fs.ensureDir(deploymentDirOf('1.0.0'));
            const error = await resolveError(options);
            expect(DuplicateExtensionError.is(error)).to.equal(true);
            expect(DuplicateExtensionError.getDetails(error)).to.deep.equal({ id: 'foo.bar', installedVersion: '1.0.0', version: '1.0.0' });
        });

        for (const [title, installed, requested] of [['a newer', '1.0.0', '2.0.0'], ['an older', '2.0.0', '1.0.0']]) {
            it(`rejects ${title} version with the installed version in the details`, async () => {
                await writeVsix(vsix, requested);
                plugins = [deployed(installed)];
                const error = await resolveError(options);
                expect(DuplicateExtensionError.getDetails(error)).to.deep.equal({ id: 'foo.bar', installedVersion: installed, version: requested });
                expect(added).to.be.empty;
                expect(await fs.pathExists(deploymentDirOf(requested))).to.equal(false);
            });
        }

        it('ignores a version that is uninstalled and waits for a restart', async () => {
            await writeVsix(vsix, '2.0.0');
            plugins = [deployed('1.0.0')];
            uninstalled = ['foo.bar@1.0.0'];
            await resolve(options);
            expect(added).to.have.lengthOf(1);
        });

        it('ignores a built-in extension', async () => {
            await writeVsix(vsix, '2.0.0');
            plugins = [deployed('1.0.0', PluginType.System)];
            await resolve(options);
            expect(added).to.have.lengthOf(1);
        });
    });

    describe('ifInstalled: replace', () => {
        const options: PluginDeployOptions = { ifInstalled: 'replace' };

        it('replaces the content of the same version and undeploys the old metadata', async () => {
            await writeVsix(vsix, '1.0.0');
            const staleFile = path.join(deploymentDirOf('1.0.0'), 'stale.txt');
            await fs.outputFile(staleFile, 'old');
            await resolve(options);
            expect(undeployed).to.deep.equal(['foo.bar@1.0.0']);
            expect(await fs.pathExists(staleFile)).to.equal(false);
            expect(await deployedVersionOnDisk('1.0.0')).to.equal('1.0.0');
            expect(added).to.deep.equal([['foo.bar@1.0.0', deploymentDirOf('1.0.0')]]);
            expect((await fs.readdir(deploymentDir)).filter(name => name.startsWith('tmp-'))).to.be.empty;
        });

        it('deploys a different version and leaves the removal of the old version to the handler', async () => {
            await writeVsix(vsix, '2.0.0');
            plugins = [deployed('1.0.0')];
            await fs.ensureDir(deploymentDirOf('1.0.0'));
            await resolve(options);
            expect(undeployed).to.deep.equal(['foo.bar@2.0.0']);
            expect(await deployedVersionOnDisk('2.0.0')).to.equal('2.0.0');
            expect(added).to.deep.equal([['foo.bar@2.0.0', deploymentDirOf('2.0.0')]]);
        });

        it('undeploys the old metadata of a version that the handler uninstalled before', async () => {
            await writeVsix(vsix, '1.0.0');
            plugins = [deployed('2.0.0'), deployed('1.0.0')];
            uninstalled = ['foo.bar@1.0.0'];
            await resolve(options);
            expect(undeployed).to.deep.equal(['foo.bar@1.0.0']);
            expect(await deployedVersionOnDisk('1.0.0')).to.equal('1.0.0');
            expect(added).to.deep.equal([['foo.bar@1.0.0', deploymentDirOf('1.0.0')]]);
        });

        it('keeps the installed content if the undeploy fails', async () => {
            await writeVsix(vsix, '1.0.0');
            const existingFile = path.join(deploymentDirOf('1.0.0'), 'existing.txt');
            await fs.outputFile(existingFile, 'old');
            Object.assign(resolver, { pluginDeployerHandler: { undeployPlugin: async () => { throw new Error('undeploy failed'); } } });
            const error = await resolveError(options);
            expect(error).to.be.instanceOf(Error).with.property('message', 'undeploy failed');
            expect(await fs.pathExists(existingFile)).to.equal(true);
            expect(added).to.be.empty;
            expect((await fs.readdir(deploymentDir)).filter(name => name.startsWith('tmp-'))).to.be.empty;
        });
    });
});
