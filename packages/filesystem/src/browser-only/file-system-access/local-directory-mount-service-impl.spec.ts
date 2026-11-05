// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
import { ILogger, URI } from '@theia/core';
import { LocalDirectoryHandleRecord, LocalDirectoryHandleStore } from './local-directory-handle-store.js';
import { LocalDirectoryFileSystemProviderFactory } from './local-directory-file-system-provider.js';
import { LocalDirectoryMount } from './local-directory-mount-service.js';
import { LocalDirectoryMountServiceImpl } from './local-directory-mount-service-impl.js';
import { WindowWithFileSystemAccess } from './file-system-access-types.js';

class TestMountService extends LocalDirectoryMountServiceImpl {
    testWindow: Partial<WindowWithFileSystemAccess> = {};

    protected override getWindow(): WindowWithFileSystemAccess {
        return this.testWindow as WindowWithFileSystemAccess;
    }
}

class CustomRootMountService extends TestMountService {
    protected override readonly rootPath = '/custom';
}

const createHandle = (name: string): FileSystemDirectoryHandle => {
    const handle = { name, isSameEntry: async (other: unknown) => other === handle };
    return handle as unknown as FileSystemDirectoryHandle;
};

const createService = <T extends LocalDirectoryMountServiceImpl>(service: T, records: Promise<LocalDirectoryHandleRecord[]> = Promise.resolve([])): T => {
    const store: Partial<LocalDirectoryHandleStore> = { getAll: () => records, put: async () => { } };
    const providerFactory = (() => ({ dispose: () => { } })) as unknown as LocalDirectoryFileSystemProviderFactory;
    Object.assign(service, { store, providerFactory, logger: {} as ILogger });
    (service as unknown as { init(): void }).init();
    return service;
};

describe('LocalDirectoryMountServiceImpl', () => {

    describe('pickAndMount', () => {
        it('opens the picker without waiting for the restore of previous mounts', async () => {
            let finishRestore: (records: LocalDirectoryHandleRecord[]) => void = () => { };
            const service = new TestMountService();
            let pickerOpened = false;
            service.testWindow = {
                showDirectoryPicker: async () => {
                    pickerOpened = true;
                    return createHandle('picked');
                }
            };
            createService(service, new Promise(resolve => finishRestore = resolve));

            const result = service.pickAndMount();
            // Has to be open synchronously, awaiting anything first can lose the user gesture.
            expect(pickerOpened).to.be.true;

            finishRestore([]);
            expect((await result)?.toString()).to.equal(service.toUri('picked').toString());
        });

        it('compares the picked folder with the restored mounts', async () => {
            const handle = createHandle('picked');
            let finishRestore: (records: LocalDirectoryHandleRecord[]) => void = () => { };
            const service = new TestMountService();
            service.testWindow = { showDirectoryPicker: async () => handle };
            createService(service, new Promise(resolve => finishRestore = resolve));

            const result = service.pickAndMount();
            finishRestore([{ name: 'restored', handle }]);

            expect((await result)?.toString()).to.equal(service.toUri('restored').toString());
            expect(service.getMounts().map(mount => mount.name)).to.deep.equal(['restored']);
        });
    });

    describe('getMountPath', () => {
        const service = createService(new TestMountService());
        const root = LocalDirectoryMount.DEFAULT_ROOT;

        it('splits URIs into the mount name and the path inside of it', () => {
            const mountPath = service.getMountPath(new URI(`file://${root}/a/src/index.ts`));
            expect(mountPath?.name).to.equal('a');
            expect(mountPath?.relative.toString()).to.equal('src/index.ts');
            expect(service.getMountPath(new URI(`file://${root}/a`))?.relative.toString()).to.equal('');
        });

        it('ignores everything that is not inside of a mount', () => {
            expect(service.getMountPath(new URI(`file://${root}`))).to.be.undefined;
            expect(service.getMountPath(new URI('file:///local/a'))).to.be.undefined;
            expect(service.getMountPath(new URI(`untitled://${root}/a`))).to.be.undefined;
            expect(service.getMountPath(new URI(''))).to.be.undefined;
        });

        it('allows subclasses to change the root', () => {
            const custom = createService(new CustomRootMountService());
            expect(custom.rootUri.toString()).to.equal('file:///custom');
            expect(custom.toUri('a').toString()).to.equal('file:///custom/a');
            expect(custom.getMountPath(new URI('file:///custom/a/b'))?.name).to.equal('a');
            expect(custom.getMountPath(new URI(`file://${root}/a`))).to.be.undefined;
        });
    });
});
