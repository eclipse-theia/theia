// *****************************************************************************
// Copyright (C) 2017-2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/index.css';

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ResourceResolver, CommandContribution, ProxyProvider, BackendAndFrontend } from '@theia/core/lib/common';
import { FrontendApplicationContribution, LabelProviderContribution, BreadcrumbsContribution } from '@theia/core/lib/browser';
import { FileResourceResolver } from './file-resource';
import { bindFileSystemPreferences } from './filesystem-preferences';
import { FileSystemFrontendContribution } from './filesystem-frontend-contribution';
import { FileUploadService } from './file-upload-service';
import { FileTreeDecoratorAdapter, FileTreeLabelProvider } from './file-tree';
import { FileService, FileServiceContribution } from './file-service';
import { RemoteFileSystemProvider, RemoteFileSystemServer, remoteFileSystemPath } from '../common/remote-file-system-provider';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { RemoteFileServiceContribution } from './remote-file-service-contribution';
import { FileSystemWatcherErrorHandler } from './filesystem-watcher-error-handler';
import { FilepathBreadcrumbsContribution } from './breadcrumbs/filepath-breadcrumbs-contribution';
import { BreadcrumbsFileTreeWidget, createFileTreeBreadcrumbsWidget } from './breadcrumbs/filepath-breadcrumbs-container';
import { FilesystemSaveResourceService } from './filesystem-save-resource-service';
import { SaveResourceService } from '@theia/core/lib/browser/save-resource-service';
import { NsfwFileSystemWatcherService } from './nsfw-filesystem-watcher-service';
import { FileSystemWatcherServer, FileSystemWatcherService, FILE_SYSTEM_WATCHER_SERVER_PATH } from '../common';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindFileSystemPreferences(bind);

    bindContributionProvider(bind, FileServiceContribution);
    bind(FileService).toSelf().inSingletonScope();

    bind(RemoteFileSystemServer)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(remoteFileSystemPath))
        .inSingletonScope();

    bind(FileSystemWatcherService).to(NsfwFileSystemWatcherService).inSingletonScope();
    bind(FileSystemWatcherServer)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(FILE_SYSTEM_WATCHER_SERVER_PATH))
        .inSingletonScope();

    bind(RemoteFileSystemProvider).toSelf().inSingletonScope();
    bind(RemoteFileServiceContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(RemoteFileServiceContribution);

    bind(FileSystemWatcherErrorHandler).toSelf().inSingletonScope();

    bindFileResource(bind);

    bind(FileUploadService).toSelf().inSingletonScope();

    bind(FileSystemFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(FileSystemFrontendContribution);
    bind(FrontendApplicationContribution).toService(FileSystemFrontendContribution);

    bind(FileTreeLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(FileTreeLabelProvider);
    bind(BreadcrumbsFileTreeWidget).toDynamicValue(ctx =>
        createFileTreeBreadcrumbsWidget(ctx.container)
    );
    bind(FilepathBreadcrumbsContribution).toSelf().inSingletonScope();
    bind(BreadcrumbsContribution).toService(FilepathBreadcrumbsContribution);

    bind(FilesystemSaveResourceService).toSelf().inSingletonScope();
    rebind(SaveResourceService).toService(FilesystemSaveResourceService);

    bind(FileTreeDecoratorAdapter).toSelf().inSingletonScope();
});

export function bindFileResource(bind: interfaces.Bind): void {
    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(FileResourceResolver);
}
