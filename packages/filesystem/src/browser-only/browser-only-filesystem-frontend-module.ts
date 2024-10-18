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

import { ContainerModule } from '@theia/core/shared/inversify';
import { FileSystemProvider } from '../common/files';
import { OPFSFileSystemProvider } from './opfs-filesystem-provider';
import { RemoteFileSystemProvider, RemoteFileSystemServer } from '../common/remote-file-system-provider';
import { OPFSInitialization, DefaultOPFSInitialization } from './opfs-filesystem-initialization';
import { BrowserOnlyFileSystemProviderServer } from './browser-only-filesystem-provider-server';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(DefaultOPFSInitialization).toSelf();
    bind(OPFSFileSystemProvider).toSelf();
    bind(OPFSInitialization).toService(DefaultOPFSInitialization);
    if (isBound(FileSystemProvider)) {
        rebind(FileSystemProvider).to(OPFSFileSystemProvider).inSingletonScope();
    } else {
        bind(FileSystemProvider).to(OPFSFileSystemProvider).inSingletonScope();
    }
    if (isBound(RemoteFileSystemProvider)) {
        rebind(RemoteFileSystemServer).to(BrowserOnlyFileSystemProviderServer).inSingletonScope();
    } else {
        bind(RemoteFileSystemServer).to(BrowserOnlyFileSystemProviderServer).inSingletonScope();
    }
});
