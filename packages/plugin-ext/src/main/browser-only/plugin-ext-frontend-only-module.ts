// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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
import { HostedPluginServer, PluginServer } from '../../common/plugin-protocol';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { LanguagePackService } from '../../common/language-pack-service';
import { BrowserOnlyPluginsProvider, BrowserOnlyPluginsProviderImpl } from './browser-only-plugins-provider';
import { FrontendOnlyHostedPluginServer } from './frontend-only-hosted-plugin-server';
import { FrontendOnlyPluginServer } from './frontend-only-plugin-server';
import { FrontendOnlyPluginPathsService } from './frontend-only-plugin-paths-service';
import { FrontendOnlyLanguagePackService } from './frontend-only-language-pack-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(BrowserOnlyPluginsProvider).to(BrowserOnlyPluginsProviderImpl).inSingletonScope();

    rebind(HostedPluginServer).to(FrontendOnlyHostedPluginServer).inSingletonScope();
    rebind(PluginServer).to(FrontendOnlyPluginServer).inSingletonScope();
    rebind(PluginPathsService).to(FrontendOnlyPluginPathsService).inSingletonScope();
    rebind(LanguagePackService).to(FrontendOnlyLanguagePackService).inSingletonScope();
});
