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
import '../../src/browser/style/plugin-entries.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution, PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ExtensionsSourceContribution } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { MCPRegistryUiBridge } from '@theia/ai-mcp/lib/browser/mcp-registry-ui-bridge';
import { AgentPluginUiBridge } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { SkillRegistryUiBridge } from '@theia/ai-core/lib/browser/skill-registry-ui-bridge';
import { SkillDirectoryContribution } from '@theia/ai-core/lib/browser/skill-service';
import { AIRegistryConfiguration } from '../common/ai-registry-configuration';
import { AIRegistryPreferencesSchema } from '../common/ai-registry-preferences';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from '../common/mcp/mcp-registry-entry-resolver';
import { RegistryFetchService, RegistryFetchServiceImpl } from '../common/registry-fetch-service';
import { RegistrySearchFilter } from '../common/registry-search-filter';
import { SkillRegistryEntryResolver, SkillRegistryEntryResolverImpl } from '../common/skill/skill-registry-entry-resolver';
import { PluginRegistryEntryResolver, PluginRegistryEntryResolverImpl } from '../common/plugin/plugin-registry-entry-resolver';
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
import {
    PluginInstallBackendService,
    PluginInstallBackendServicePath,
    PluginInstallClient
} from '../common/plugin/plugin-install-protocol';
import { PluginDirectoryNaming, PluginDirectoryNamingImpl } from '../common/plugin/plugin-directory-naming';
import { PluginInstallService, PluginInstallServiceImpl } from './plugin/plugin-install-service';
import { PluginInstallClientImpl } from './plugin/plugin-install-client';
import { PluginExtensionsContribution } from './plugin/plugin-extensions-contribution';
import {
    PluginHashMismatchDialog,
    PluginHashMismatchDialogFactory,
    PluginHashMismatchDialogOptions,
    PluginInstallDialog,
    PluginInstallDialogFactory,
    PluginInstallDialogOptions
} from './plugin/plugin-install-dialog';
import { PluginInstaller, PluginInstallerImpl } from './plugin/plugin-installer';
import { PluginMcpRegistrar, PluginMcpRegistrarImpl } from './plugin/plugin-mcp-registrar';
import { PluginMcpReconciler } from './plugin/plugin-mcp-reconciler';
import { PluginSkillDirectoryContribution } from './plugin/plugin-skill-directory-contribution';
import { AgentPluginUiBridgeImpl } from './plugin/agent-plugin-ui-bridge-impl';
import { SkillRegistryUiBridgeImpl } from './skill/skill-registry-ui-bridge-impl';
import { InstallPluginUriConfiguration } from './plugin/install-plugin-uri-configuration';
import { InstallPluginUriHandler } from './plugin/install-plugin-uri-handler';
import { AIRegistryToolbarContribution } from './ai-registry-toolbar-contribution';
import { AIRegistryMenuContribution } from './ai-registry-menu-contribution';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from './auto-update/registry-auto-update-policy';
import { RegistryAutoUpdateService } from './auto-update/registry-auto-update-service';
import { RegistryAutoUpdateContribution } from './auto-update/registry-auto-update-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(AIRegistryConfiguration).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
    bind(SkillRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(SkillRegistryEntryResolver).toService(SkillRegistryEntryResolverImpl);
    bind(PluginRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(PluginRegistryEntryResolver).toService(PluginRegistryEntryResolverImpl);
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

    bind(PluginInstallClientImpl).toSelf().inSingletonScope();
    bind(PluginInstallClient).toService(PluginInstallClientImpl);
    bind(PluginInstallBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<PluginInstallBackendService>(PluginInstallBackendServicePath, ctx.container.get(PluginInstallClientImpl));
    }).inSingletonScope();
    // Shared with the backend, so that the directory a plugin may be adopted under is the same one an
    // install would have created.
    bind(PluginDirectoryNamingImpl).toSelf().inSingletonScope();
    bind(PluginDirectoryNaming).toService(PluginDirectoryNamingImpl);
    bind(PluginInstallServiceImpl).toSelf().inSingletonScope();
    bind(PluginInstallService).toService(PluginInstallServiceImpl);
    bind(PluginInstallDialogFactory).toFactory(() => (options: PluginInstallDialogOptions) => new PluginInstallDialog(options));
    bind(PluginHashMismatchDialogFactory).toFactory(() => (options: PluginHashMismatchDialogOptions) => new PluginHashMismatchDialog(options));

    bind(PluginSkillDirectoryContribution).toSelf().inSingletonScope();
    bind(SkillDirectoryContribution).toService(PluginSkillDirectoryContribution);
    bind(PluginMcpRegistrarImpl).toSelf().inSingletonScope();
    bind(PluginMcpRegistrar).toService(PluginMcpRegistrarImpl);
    bind(PluginMcpReconciler).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(PluginMcpReconciler);
    // Sits above the install service rather than inside it: the install flow registers the plugin's
    // components once the download is committed, and the registrar has to be able to list the
    // installed plugins to do that, so folding the flow into the install service would close a cycle.
    bind(PluginInstallerImpl).toSelf().inSingletonScope();
    bind(PluginInstaller).toService(PluginInstallerImpl);

    bind(PluginExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(PluginExtensionsContribution);

    bind(AgentPluginUiBridgeImpl).toSelf().inSingletonScope();
    // Nothing binds the bridge without this package, which is what makes every Agent Plugin
    // affordance disappear from the AI configuration widgets there.
    bind(AgentPluginUiBridge).toService(AgentPluginUiBridgeImpl);

    bind(SkillRegistryUiBridgeImpl).toSelf().inSingletonScope();
    // As above, for skills this package installs or links directly rather than through a plugin.
    bind(SkillRegistryUiBridge).toService(SkillRegistryUiBridgeImpl);

    bind(InstallPluginUriConfiguration).toSelf().inSingletonScope();
    bind(InstallPluginUriHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(InstallPluginUriHandler);

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
