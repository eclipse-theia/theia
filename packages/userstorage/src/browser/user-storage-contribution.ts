/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileSystemProvider } from '@theia/filesystem/lib/common/files';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { DelegatingFileSystemProvider } from '@theia/filesystem/lib/common/delegating-file-system-provider';
import { UserStorageUri } from './user-storage-uri';

@injectable()
export class UserStorageContribution implements FileServiceContribution {

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    registerFileSystemProviders(service: FileService): void {
        service.onWillActivateFileSystemProvider(event => {
            if (event.scheme === UserStorageUri.scheme) {
                event.waitUntil((async () => {
                    const provider = await this.createProvider(service);
                    service.registerProvider(UserStorageUri.scheme, provider);
                })());
            }
        });
    }

    protected async createProvider(service: FileService): Promise<FileSystemProvider> {
        const delegate = await service.activateProvider('file');
        const configDirUri = new URI(await this.environments.getConfigDirUri());
        return new DelegatingFileSystemProvider(delegate, {
            uriConverter: {
                to: resource => {
                    const relativePath = UserStorageUri.relative(resource);
                    if (relativePath) {
                        return configDirUri.resolve(relativePath).normalizePath();
                    }
                    return undefined;
                },
                from: resource => {
                    const relativePath = configDirUri.relative(resource);
                    if (relativePath) {
                        return UserStorageUri.resolve(relativePath);
                    }
                    return undefined;
                }
            }
        }, new DisposableCollection(
            delegate.watch(configDirUri, { excludes: [], recursive: true })
        ));
    }

}
