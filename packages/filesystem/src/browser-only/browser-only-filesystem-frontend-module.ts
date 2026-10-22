// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { FileSystemProvider } from '../common/files';
import { OPFSFileSystemProvider } from './opfs-filesystem-provider';
import { RemoteFileSystemProvider, RemoteFileSystemServer } from '../common/remote-file-system-provider';
import { OPFSInitialization, DefaultOPFSInitialization } from './opfs-filesystem-initialization';
import { BrowserOnlyFileSystemProviderServer } from './browser-only-filesystem-provider-server';
import { FileUploadService } from '../common/upload/file-upload';
import { FileUploadServiceImpl } from './upload/file-upload-service-impl';
import { LocalDirectoryHandleStore, LocalDirectoryHandleStoreImpl } from './file-system-access/local-directory-handle-store';
import { LocalDirectoryMountService } from './file-system-access/local-directory-mount-service';
import { LocalDirectoryMountServiceImpl } from './file-system-access/local-directory-mount-service-impl';
import {
    LocalDirectoryFileSystemProvider, LocalDirectoryFileSystemProviderFactory, LocalDirectoryFileSystemProviderOptions
} from './file-system-access/local-directory-file-system-provider';
import { BrowserOnlyCompositeFileSystemProvider } from './file-system-access/browser-only-composite-file-system-provider';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(DefaultOPFSInitialization).toSelf();
    bind(OPFSFileSystemProvider).toSelf().inSingletonScope();
    bind(LocalDirectoryHandleStoreImpl).toSelf().inSingletonScope();
    bind(LocalDirectoryHandleStore).toService(LocalDirectoryHandleStoreImpl);
    bind(LocalDirectoryMountServiceImpl).toSelf().inSingletonScope();
    bind(LocalDirectoryMountService).toService(LocalDirectoryMountServiceImpl);
    bind(LocalDirectoryFileSystemProvider).toSelf();
    bind(LocalDirectoryFileSystemProviderFactory).toFactory(ctx => (options: LocalDirectoryFileSystemProviderOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(LocalDirectoryFileSystemProviderOptions).toConstantValue(options);
        return child.get(LocalDirectoryFileSystemProvider);
    });
    bind(BrowserOnlyCompositeFileSystemProvider).toSelf().inSingletonScope();
    bind(OPFSInitialization).toService(DefaultOPFSInitialization);

    if (isBound(FileUploadService)) {
        rebind(FileUploadService).to(FileUploadServiceImpl).inSingletonScope();
    } else {
        bind(FileUploadService).to(FileUploadServiceImpl).inSingletonScope();
    }

    if (isBound(FileSystemProvider)) {
        rebind(FileSystemProvider).toService(BrowserOnlyCompositeFileSystemProvider);
    } else {
        bind(FileSystemProvider).toService(BrowserOnlyCompositeFileSystemProvider);
    }

    if (isBound(RemoteFileSystemProvider)) {
        rebind(RemoteFileSystemServer).to(BrowserOnlyFileSystemProviderServer).inSingletonScope();
    } else {
        bind(RemoteFileSystemServer).to(BrowserOnlyFileSystemProviderServer).inSingletonScope();
    }
});
