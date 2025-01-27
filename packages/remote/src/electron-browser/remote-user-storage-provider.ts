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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemProvider } from '@theia/filesystem/lib/common/files';
import { UserStorageContribution } from '@theia/userstorage/lib/browser/user-storage-contribution';
import { RemoteStatusService } from '../electron-common/remote-status-service';
import { LocalEnvVariablesServer, LocalRemoteFileSystemProvider } from './local-backend-services';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { URI } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { getCurrentPort } from '@theia/core/lib/electron-browser/messaging/electron-local-ws-connection-source';

/**
 * This overide is to have remote connections still use settings, keymaps, etc. from the local machine.
 */
@injectable()
export class RemoteUserStorageContribution extends UserStorageContribution {
    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    @inject(LocalRemoteFileSystemProvider)
    protected readonly localRemoteFileSystemProvider: LocalRemoteFileSystemProvider;

    @inject(LocalEnvVariablesServer)
    protected readonly localEnvironments: EnvVariablesServer;

    isRemoteConnection: Deferred<boolean> = new Deferred();

    @postConstruct()
    protected init(): void {
        const port = getCurrentPort();
        if (port) {
            this.remoteStatusService.getStatus(Number(port)).then(status => this.isRemoteConnection.resolve(status.alive));
        }
    }

    protected override async getDelegate(service: FileService): Promise<FileSystemProvider> {
        return await this.isRemoteConnection.promise ?
            this.localRemoteFileSystemProvider
            : service.activateProvider('file');
    }

    protected override async getCongigDirUri(): Promise<URI> {
        return await this.isRemoteConnection.promise ?
            new URI(await this.localEnvironments.getConfigDirUri())
            : super.getCongigDirUri();
    }

}
