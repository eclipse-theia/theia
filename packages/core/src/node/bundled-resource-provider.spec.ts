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

import 'reflect-metadata';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as temp from 'temp';
import { Container } from 'inversify';
import { EnvVariablesServer } from '../common/env-variables';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';
import { FileUri } from '../common/file-uri';
import { BundledResourceProvider, BundledResourceProviderImpl } from './bundled-resource-provider';
import { FileSystemLocking, FileSystemLockingImpl } from './filesystem-locking';

/**
 * The provider recognizes archives by their `.asar` path segment and reads them through `fs`, which Electron
 * patches to transparently read from the archive. Plain directories named `*.asar` therefore behave like
 * archives from the point of view of the provider and let us test it outside of Electron.
 */
describe('BundledResourceProvider', () => {

    const track = temp.track();

    let configDir: string;
    let appDir: string;
    let provider: BundledResourceProvider;

    beforeEach(() => {
        const root = track.mkdirSync();
        configDir = path.join(root, 'config');
        appDir = path.join(root, 'app');
        fs.mkdirSync(configDir);
        fs.mkdirSync(appDir);
        provider = createProvider();
    });

    /** Each provider instance stands for one run of the application, as resolved paths are cached. */
    function createProvider(): BundledResourceProvider {
        const container = new Container();
        container.bind(ILogger).toConstantValue(new MockLogger());
        container.bind(FileSystemLocking).to(FileSystemLockingImpl).inSingletonScope();
        container.bind(EnvVariablesServer).toConstantValue({
            getConfigDirUri: async () => FileUri.create(configDir).toString()
        } as unknown as EnvVariablesServer);
        container.bind(BundledResourceProviderImpl).toSelf().inSingletonScope();
        container.bind(BundledResourceProvider).toService(BundledResourceProviderImpl);
        return container.get(BundledResourceProvider);
    }

    afterEach(() => track.cleanupSync());

    /**
     * Assert that the given path is nested in the given directory. The provider derives the configuration
     * directory from a URI, which on Windows yields a lower-case drive letter, so the paths cannot simply be
     * compared by prefix. `path.relative` ignores the case of a path on Windows.
     */
    function expectNestedIn(directoryPath: string, nestedPath: string): void {
        const relativePath = path.relative(directoryPath, nestedPath);
        expect(relativePath).to.not.be.empty;
        expect(relativePath.split(path.sep)).to.not.contain('..');
    }

    function writeResources(rootPath: string, files: Record<string, string>): string {
        for (const [relativePath, content] of Object.entries(files)) {
            const filePath = path.join(rootPath, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        }
        return rootPath;
    }

    it('returns the path of a resource that is not packaged into an archive', async () => {
        const resourcePath = path.join(writeResources(appDir, { 'scripts/greet.sh': 'echo hello' }), 'scripts');
        expect(await provider.resolveExternalPath(resourcePath)).to.equal(resourcePath);
    });

    it('rejects for a resource that does not exist', async () => {
        const resourcePath = path.join(appDir, 'scripts');
        await provider.resolveExternalPath(resourcePath).then(
            () => expect.fail('should have been rejected'),
            error => expect(String(error)).to.contain(resourcePath)
        );
    });

    it('extracts a packaged resource into the configuration directory', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello', 'scripts/nested/.hidden': 'secret' });

        const resolvedPath = await provider.resolveExternalPath(path.join(archivePath, 'scripts'));

        expect(resolvedPath).to.not.contain('.asar');
        expectNestedIn(configDir, resolvedPath);
        expect(fs.readFileSync(path.join(resolvedPath, 'greet.sh'), 'utf8')).to.equal('echo hello');
        expect(fs.readFileSync(path.join(resolvedPath, 'nested', '.hidden'), 'utf8')).to.equal('secret');
    });

    it('extracts a packaged resource that is a plain file', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello' });

        const resolvedPath = await provider.resolveExternalPath(path.join(archivePath, 'scripts', 'greet.sh'));

        expectNestedIn(configDir, resolvedPath);
        expect(fs.readFileSync(resolvedPath, 'utf8')).to.equal('echo hello');
    });

    it('prefers the copy that the packaging step has left outside of the archive', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello' });
        const unpackedPath = writeResources(`${archivePath}.unpacked`, { 'scripts/greet.sh': 'echo hello' });

        const resolvedPath = await provider.resolveExternalPath(path.join(archivePath, 'scripts'));

        expect(resolvedPath).to.equal(path.join(unpackedPath, 'scripts'));
    });

    it('extracts a packaged resource that was only unpacked partially', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello', 'scripts/farewell.sh': 'echo bye' });
        writeResources(`${archivePath}.unpacked`, { 'scripts/greet.sh': 'echo hello' });

        const resolvedPath = await provider.resolveExternalPath(path.join(archivePath, 'scripts'));

        expectNestedIn(configDir, resolvedPath);
        expect(fs.readFileSync(path.join(resolvedPath, 'farewell.sh'), 'utf8')).to.equal('echo bye');
    });

    it('re-extracts a resource that was removed from the configuration directory', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello' });
        const resourcePath = path.join(archivePath, 'scripts');

        const resolvedPath = await provider.resolveExternalPath(resourcePath);
        fs.rmSync(resolvedPath, { recursive: true });

        expect(await provider.resolveExternalPath(resourcePath)).to.equal(resolvedPath);
        expect(fs.readFileSync(path.join(resolvedPath, 'greet.sh'), 'utf8')).to.equal('echo hello');
    });

    it('extracts into a temporary directory if the configuration directory cannot be written to', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello' });
        // a configuration directory that is a regular file cannot hold the extracted resources
        configDir = path.join(appDir, 'not-a-directory');
        fs.writeFileSync(configDir, '');

        const resolvedPath = await createProvider().resolveExternalPath(path.join(archivePath, 'scripts'));

        expectNestedIn(os.tmpdir(), resolvedPath);
        expect(fs.readFileSync(path.join(resolvedPath, 'greet.sh'), 'utf8')).to.equal('echo hello');
        fs.rmSync(resolvedPath, { recursive: true, force: true });
    });

    it('updates an extracted resource when the application has been updated', async () => {
        const archivePath = path.join(appDir, 'app.asar');
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello' });
        const resourcePath = path.join(archivePath, 'scripts');

        await provider.resolveExternalPath(resourcePath);
        writeResources(archivePath, { 'scripts/greet.sh': 'echo hello again' });
        const resolvedPath = await createProvider().resolveExternalPath(resourcePath);

        expect(fs.readFileSync(path.join(resolvedPath, 'greet.sh'), 'utf8')).to.equal('echo hello again');
    });

});
