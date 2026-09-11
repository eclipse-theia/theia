// *****************************************************************************
// Copyright (C) 2026 robertjndw
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
import { HostedPluginServer, PluginServer } from './common/plugin-protocol';
import { BrowserOnlyHostedPluginServer } from './hosted/browser-only/browser-only-hosted-plugin-server';
import { PluginPathsService } from './main/common/plugin-paths-protocol';
import { BrowserOnlyPluginPathsService } from './hosted/browser-only/browser-only-plugin-paths-service';
import { BrowserOnlyPluginServer } from './hosted/browser-only/browser-only-plugin-server';
import { BrowserOnlyPluginFileServiceContribution, BrowserOnlyPluginFileSystemProvider } from './hosted/browser-only/browser-only-plugin-file-system-provider';
import { FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(HostedPluginServer).to(BrowserOnlyHostedPluginServer).inSingletonScope();
    rebind(PluginServer).to(BrowserOnlyPluginServer).inSingletonScope();
    rebind(PluginPathsService).to(BrowserOnlyPluginPathsService).inSingletonScope();

    bind(BrowserOnlyPluginFileSystemProvider).toSelf().inSingletonScope();
    bind(BrowserOnlyPluginFileServiceContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(BrowserOnlyPluginFileServiceContribution);
});
