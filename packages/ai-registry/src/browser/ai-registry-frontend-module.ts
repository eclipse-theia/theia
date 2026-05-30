// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import '../../src/browser/style/mcp-entries.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ExtensionsSourceContribution } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { MCPRegistryUiBridge } from '@theia/ai-mcp/lib/browser/mcp-registry-ui-bridge';
import { AIRegistryConfiguration } from '../common/ai-registry-configuration';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from '../common/mcp/mcp-registry-entry-resolver';
import { RegistryFetchService, RegistryFetchServiceImpl } from '../common/registry-fetch-service';
import { MCPInstallService, MCPInstallServiceImpl } from './mcp/mcp-install-service';
import { MCPExtensionsContribution } from './mcp/mcp-extensions-contribution';
import { MCPRegistryUiBridgeImpl } from './mcp/mcp-registry-ui-bridge-impl';
import { AIRegistryToolbarContribution } from './ai-registry-toolbar-contribution';

export default new ContainerModule(bind => {
    bind(AIRegistryConfiguration).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
    bind(RegistryFetchServiceImpl).toSelf().inSingletonScope();
    bind(RegistryFetchService).toService(RegistryFetchServiceImpl);
    bind(MCPInstallServiceImpl).toSelf().inSingletonScope();
    bind(MCPInstallService).toService(MCPInstallServiceImpl);

    bind(MCPExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(MCPExtensionsContribution);

    bind(MCPRegistryUiBridgeImpl).toSelf().inSingletonScope();
    bind(MCPRegistryUiBridge).toService(MCPRegistryUiBridgeImpl);

    bind(AIRegistryToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(AIRegistryToolbarContribution);
});
