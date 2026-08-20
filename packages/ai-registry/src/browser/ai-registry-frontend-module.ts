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
import '../../src/browser/style/skill-entries.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution, PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ExtensionsSourceContribution } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { MCPRegistryUiBridge } from '@theia/ai-mcp/lib/browser/mcp-registry-ui-bridge';
import { AIRegistryConfiguration } from '../common/ai-registry-configuration';
import { AIRegistryPreferencesSchema } from '../common/ai-registry-preferences';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from '../common/mcp/mcp-registry-entry-resolver';
import { RegistryFetchService, RegistryFetchServiceImpl } from '../common/registry-fetch-service';
import { RegistrySearchFilter } from '../common/registry-search-filter';
import { SkillRegistryEntryResolver, SkillRegistryEntryResolverImpl } from '../common/skill/skill-registry-entry-resolver';
import { SkillInstallBackendService, SkillInstallBackendServicePath, SkillInstallClient } from '../common/skill/skill-install-protocol';
import { SkillRegistryPreferencesSchema } from '../common/skill/skill-registry-preferences';
import { MCPInstallService, MCPInstallServiceImpl } from './mcp/mcp-install-service';
import { MCPExtensionsContribution } from './mcp/mcp-extensions-contribution';
import { MCPRegistryUiBridgeImpl } from './mcp/mcp-registry-ui-bridge-impl';
import { SkillInstallService, SkillInstallServiceImpl } from './skill/skill-install-service';
import { SkillInstallClientImpl } from './skill/skill-install-client';
import { SkillExtensionsContribution } from './skill/skill-extensions-contribution';
import { InstallSkillUriConfiguration } from './skill/install-skill-uri-configuration';
import { InstallSkillUriHandler } from './skill/install-skill-uri-handler';
import { AIRegistryToolbarContribution } from './ai-registry-toolbar-contribution';
import { AIRegistryMenuContribution } from './ai-registry-menu-contribution';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from './auto-update/registry-auto-update-policy';
import { RegistryAutoUpdateService } from './auto-update/registry-auto-update-service';
import { RegistryAutoUpdateContribution } from './auto-update/registry-auto-update-contribution';

export default new ContainerModule(bind => {
    bind(AIRegistryConfiguration).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
    bind(SkillRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(SkillRegistryEntryResolver).toService(SkillRegistryEntryResolverImpl);
    bind(RegistryFetchServiceImpl).toSelf().inSingletonScope();
    bind(RegistryFetchService).toService(RegistryFetchServiceImpl);
    bind(RegistrySearchFilter).toSelf().inSingletonScope();
    bind(MCPInstallServiceImpl).toSelf().inSingletonScope();
    bind(MCPInstallService).toService(MCPInstallServiceImpl);

    bind(MCPExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(MCPExtensionsContribution);

    bind(MCPRegistryUiBridgeImpl).toSelf().inSingletonScope();
    bind(MCPRegistryUiBridge).toService(MCPRegistryUiBridgeImpl);

    bind(PreferenceContribution).toConstantValue({ schema: SkillRegistryPreferencesSchema });
    bind(SkillInstallClientImpl).toSelf().inSingletonScope();
    bind(SkillInstallClient).toService(SkillInstallClientImpl);
    bind(SkillInstallBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<SkillInstallBackendService>(SkillInstallBackendServicePath, ctx.container.get(SkillInstallClientImpl));
    }).inSingletonScope();
    bind(SkillInstallServiceImpl).toSelf().inSingletonScope();
    bind(SkillInstallService).toService(SkillInstallServiceImpl);

    bind(SkillExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(SkillExtensionsContribution);

    bind(InstallSkillUriConfiguration).toSelf().inSingletonScope();
    bind(InstallSkillUriHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(InstallSkillUriHandler);

    bind(AIRegistryToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(AIRegistryToolbarContribution);

    bind(PreferenceContribution).toConstantValue({ schema: AIRegistryPreferencesSchema });
    bind(RegistryAutoUpdatePolicyImpl).toSelf().inSingletonScope();
    bind(RegistryAutoUpdatePolicy).toService(RegistryAutoUpdatePolicyImpl);
    bind(RegistryAutoUpdateService).toSelf().inSingletonScope();
    bind(RegistryAutoUpdateContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RegistryAutoUpdateContribution);

    bind(AIRegistryMenuContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AIRegistryMenuContribution);
    bind(MenuContribution).toService(AIRegistryMenuContribution);
});
