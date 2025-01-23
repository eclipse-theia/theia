// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { Event, InMemoryResources } from '@theia/core';
import { FileSystemProviderCapabilities, FileType } from '../common/files';
import { FileService, FileServiceContribution } from './file-service';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class VSCodeFileServiceContribution implements FileServiceContribution {

    @inject(InMemoryResources)
    protected readonly resources: InMemoryResources;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider('vscode', {
            capabilities: FileSystemProviderCapabilities.FileReadWrite,
            readFile: async uri => {
                const resource = this.resources.resolve(uri);
                return new TextEncoder().encode(await resource.readContents());
            },
            delete: async () => { },
            mkdir: async () => { },
            onDidChangeCapabilities: Event.None,
            onDidChangeFile: Event.None,
            onFileWatchError: Event.None,
            readdir: async () => [],
            rename: async () => { },
            stat: async () => ({
                type: FileType.File,
                ctime: 0,
                mtime: 0,
                size: 0,
            }),
            watch: () => ({ dispose: () => { } }),
        });
    }
}

