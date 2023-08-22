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

import type { FSModule } from 'browserfs/dist/node/core/FS';
import type { BrowserFSFileSystemProvider } from './browserfs-filesystem-provider';
import { injectable } from '@theia/core/shared/inversify';
import { FileSystem, initialize } from 'browserfs';
import MountableFileSystem from 'browserfs/dist/node/backend/MountableFileSystem';

export const BrowserFSInitialization = Symbol('BrowserFSInitialization');
export interface BrowserFSInitialization {
    createMountableFileSystem(): Promise<MountableFileSystem>
    initializeFS: (fs: FSModule, provider: BrowserFSFileSystemProvider) => Promise<void>;
}

@injectable()
export class DefaultBrowserFSInitialization implements BrowserFSInitialization {

    createMountableFileSystem(): Promise<MountableFileSystem> {
        return new Promise(resolve => {
            FileSystem.IndexedDB.Create({}, (e, persistedFS) => {
                if (e) {
                    throw e;
                }
                if (!persistedFS) {
                    throw Error('Could not create filesystem');
                }
                FileSystem.MountableFileSystem.Create({
                    '/home': persistedFS

                }, (error, mountableFS) => {
                    if (error) {
                        throw error;
                    }
                    if (!mountableFS) {
                        throw Error('Could not create filesystem');
                    }
                    initialize(mountableFS);
                    resolve(mountableFS);
                });
            });
        });
    }

    async initializeFS(fs: FSModule, provider: BrowserFSFileSystemProvider): Promise<void> {

    }
}
