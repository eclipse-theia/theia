// *****************************************************************************
// Copyright (C) 2023 Arduino SA and others.
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

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { IPCConnectionProvider } from '@theia/core/lib/node/messaging/ipc-connection-provider';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { equal, fail } from 'assert';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as temp from 'temp';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { FilePermission, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode } from '../common/files';
import { DiskFileSystemProvider } from './disk-file-system-provider';
import { bindFileSystemWatcherServer } from './filesystem-backend-module';

const tracked = temp.track();

describe('disk-file-system-provider', () => {
    let toDisposeAfter: DisposableCollection;
    let fsProvider: DiskFileSystemProvider;

    before(() => {
        fsProvider = createContainer().get<DiskFileSystemProvider>(
            DiskFileSystemProvider
        );
        toDisposeAfter = new DisposableCollection(
            fsProvider,
            Disposable.create(() => tracked.cleanupSync())
        );
    });

    after(() => {
        toDisposeAfter.dispose();
    });

    describe('stat', () => {
        it("should omit the 'permissions' property of the stat if the file can be both read and write", async () => {
            const tempDirPath = tracked.mkdirSync();
            const tempFilePath = join(tempDirPath, `${generateUuid()}.txt`);
            await fs.writeFile(tempFilePath, 'some content', { encoding: 'utf8' });

            let content = await fs.readFile(tempFilePath, { encoding: 'utf8' });
            equal(content, 'some content');

            await fs.writeFile(tempFilePath, 'other content', { encoding: 'utf8' });

            content = await fs.readFile(tempFilePath, { encoding: 'utf8' });
            equal(content, 'other content');

            const stat = await fsProvider.stat(FileUri.create(tempFilePath));
            equal(stat.permissions, undefined);
        });

        it("should set the 'permissions' property to `Readonly` if the file can be read but not write", async () => {
            const tempDirPath = tracked.mkdirSync();
            const tempFilePath = join(tempDirPath, `${generateUuid()}.txt`);
            await fs.writeFile(tempFilePath, 'readonly content', {
                encoding: 'utf8',
            });

            await fs.chmod(tempFilePath, '444'); // read-only for owner/group/world

            try {
                await fsProvider.writeFile(FileUri.create(tempFilePath), new Uint8Array(), { create: false, overwrite: true });
                fail('Expected an EACCES error for readonly (chmod 444) files');
            } catch (err) {
                equal(err instanceof FileSystemProviderError, true);
                equal((<FileSystemProviderError>err).code, FileSystemProviderErrorCode.NoPermissions);
            }

            const content = await fs.readFile(tempFilePath, { encoding: 'utf8' });
            equal(content, 'readonly content');

            const stat = await fsProvider.stat(FileUri.create(tempFilePath));
            equal(stat.permissions, FilePermission.Readonly);
        });
    });

    describe('delete', () => {
        it('delete is able to delete folder', async () => {
            const tempDirPath = tracked.mkdirSync();
            const testFolder = join(tempDirPath, 'test');
            const folderUri = FileUri.create(testFolder);
            for (const recursive of [true, false]) {
                // Note: useTrash = true fails on Linux
                const useTrash = false;
                if ((fsProvider.capabilities & FileSystemProviderCapabilities.Access) === 0 && useTrash) {
                    continue;
                }
                await fsProvider.mkdir(folderUri);
                if (recursive) {
                    await fsProvider.writeFile(FileUri.create(join(testFolder, 'test.file')), Buffer.from('test'), { overwrite: false, create: true });
                    await fsProvider.mkdir(FileUri.create(join(testFolder, 'subFolder')));
                }
                await fsProvider.delete(folderUri, { recursive, useTrash });
            }
        });

        it('delete is able to delete file', async () => {
            const tempDirPath = tracked.mkdirSync();
            const testFile = join(tempDirPath, 'test.file');
            const testFileUri = FileUri.create(testFile);
            for (const recursive of [true, false]) {
                for (const useTrash of [true, false]) {
                    await fsProvider.writeFile(testFileUri, Buffer.from('test'), { overwrite: false, create: true });
                    await fsProvider.delete(testFileUri, { recursive, useTrash });
                }
            }
        });
    });

    function createContainer(): Container {
        const container = new Container({ defaultScope: 'Singleton' });
        const module = new ContainerModule(bind => {
            bind(DiskFileSystemProvider).toSelf().inSingletonScope();
            bind(EncodingService).toSelf().inSingletonScope();
            bindFileSystemWatcherServer(bind);
            bind(MockLogger).toSelf().inSingletonScope();
            bind(ILogger).toService(MockLogger);
            bind(IPCConnectionProvider).toSelf().inSingletonScope();
        });
        container.load(module);
        return container;
    }
});
